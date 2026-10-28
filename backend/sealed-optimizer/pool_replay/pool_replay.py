"""
Les choix de l'optimizer, juges sur de vraies victoires.

Le data dump public 17Lands (game_data Sealed) donne, pour chaque partie, le
deck ET le sideboard : en Sealed sur Arena, deck + sideboard = le pool complet.
On peut donc rejouer l'optimizer sur des pools reels et comparer ses builds a
ceux des joueurs.

Comparer les deux avec notre score ne prouverait rien : l'optimizer maximise ce
score, il gagne par construction. Le juge est le resultat reel des parties :

  potentiel du pool = score du meilleur build de l'optimizer
  ecart du joueur   = potentiel - score du deck joue (combien il a laisse)

Si l'optimizer construit mieux que les joueurs, alors a potentiel de pool egal
et a niveau de joueur egal, les joueurs qui ont laisse le plus de points
gagnent le moins. Le test est une regression logistique sur les parties
(victoire ~ niveau du joueur + potentiel + ecart), IC par bootstrap sur les
pools. En complement, une lecture par tranche de WR du deck et par niveau.

Etapes :
  1. game_data Sealed (cache partage avec outcome_calibration)
  2. decks avec au moins --min-games parties, echantillon reparti a parts
     egales sur 5 tranches de WR du deck
  3. optimizer sur chaque pool (local_bench/bench.mjs, reproductible)
  4. analyse + fiche dans backend/reports/benchmarks/pool_replay/

Usage :
  python backend/sealed-optimizer/pool_replay/pool_replay.py --set FRA --pools 400
  python ... --set FRA --reuse-run   # reanalyse le dernier run sans relancer l'optimizer
"""

import argparse
import json
import random
import subprocess
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE.parent / "outcome_calibration"))
import outcome_calibration as oc  # noqa: E402

RUN_DIR = REPO_ROOT / "backend" / "tmp" / "pool_replay"
REPORT_DIR = REPO_ROOT / "backend" / "reports" / "benchmarks" / "pool_replay"
BENCH = REPO_ROOT / "backend" / "sealed-optimizer" / "local_bench" / "bench.mjs"
N_BINS = 5
N_BOOT = 300


# ─── 1-2. Pools ──────────────────────────────────────────────────────────────

def sample_pools(decks: list[dict], n_pools: int, min_games: int, seed: int) -> list[dict]:
    """Echantillon reparti a parts egales sur N_BINS tranches de WR du deck."""
    rng = random.Random(seed)
    eligible = []
    for d in decks:
        pool = defaultdict(int)
        for part in (d["deck"], d["sideboard"]):
            for name, q in part.items():
                pool[name] += q
        spells = sum(q for n, q in pool.items() if n not in oc_basics())
        # Un pool Sealed Arena fait 84 cartes ; en dessous de ~75 hors basiques,
        # il manque des cartes (sideboard incomplet) : on l'ecarte.
        if d["games"] >= min_games and spells >= 75:
            eligible.append({**d, "pool": dict(pool), "wr": d["wins"] / d["games"]})
    rng.shuffle(eligible)  # departage aleatoire des WR egaux
    eligible.sort(key=lambda d: d["wr"])
    per_bin = n_pools // N_BINS
    size = len(eligible) // N_BINS
    chosen = []
    for b in range(N_BINS):
        chunk = eligible[b * size:(b + 1) * size]
        for d in rng.sample(chunk, min(per_bin, len(chunk))):
            chosen.append({**d, "wr_bin": b + 1})
    print(f"    {len(eligible)} decks eligibles (>= {min_games} parties), {len(chosen)} pools tires")
    return chosen


def oc_basics():
    return {"Plains", "Island", "Swamp", "Mountain", "Forest"}


def write_bench_input(pools: list[dict], path: Path) -> None:
    records = [{
        "aggregate_id": f"{p['draft_id']}:{p['build_index']}",
        "pool_cardlist": p["pool"],
        "player_deck_cardlist": p["deck"],
        "wins": p["wins"],
        "losses": p["games"] - p["wins"],
    } for p in pools]
    path.write_text(json.dumps(records), encoding="utf-8")


# ─── 3. Optimizer ────────────────────────────────────────────────────────────

def run_bench(set_code: str, inp: Path, out: Path, max_evals: int) -> None:
    cmd = oc.node_command() + [str(BENCH), "--set", set_code, "--input", str(inp), "--out", str(out),
                               "--max-evals", str(max_evals)]
    print(f"    {' '.join(cmd[-8:])}")
    result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
    for line in result.stderr.splitlines():
        if "ExperimentalWarning" not in line and "--trace-warnings" not in line:
            print(f"  [node] {line}")
    if result.returncode != 0:
        sys.exit("Echec du run de l'optimizer.")


# ─── 4. Analyse ──────────────────────────────────────────────────────────────

def build_table(pools: list[dict], run: dict) -> list[dict]:
    by_id = {f"{p['draft_id']}:{p['build_index']}": p for p in pools}
    rows = []
    for r in run["results"]:
        p = by_id.get(r["aggregate_id"])
        if not p or not r.get("builds") or not r.get("player"):
            continue
        top = r["builds"][0]
        player_colors = "".join(sorted(c for c in r["player"]["archetype"] if c in "WUBRG"))
        rows.append({
            "id": r["aggregate_id"],
            "wins": p["wins"], "games": p["games"], "wr": p["wr"], "wr_bin": p["wr_bin"],
            "skill": p["skill_bucket"],
            "potential": top["score"],
            "player_score": r["player"]["score"],
            "gap": top["score"] - r["player"]["score"],
            "jaccard_best": max(b["jaccard"] for b in r["builds"]),
            "color_match": float(any(
                "".join(sorted(c for c in b["archetype"] if c in "WUBRG")) == player_colors for b in r["builds"])),
        })
    return rows


def design(rows: list[dict], feature: str):
    """X = indicatrices de niveau + potentiel + feature ; une ligne par issue de partie."""
    levels = sorted({r["skill"] for r in rows})
    X = np.array([[float(r["skill"] == lv) for lv in levels[1:]] + [r["potential"], r[feature]] for r in rows])
    y = np.concatenate([np.ones(len(rows)), np.zeros(len(rows))])
    w = np.concatenate([[r["wins"] for r in rows], [r["games"] - r["wins"] for r in rows]])
    Xw = np.vstack([X, X])
    keep = w > 0
    return Xw[keep], y[keep], w[keep]


def feature_effect(rows: list[dict], feature: str, step: float, seed: int) -> dict:
    """Effet de `feature` sur le WR, a niveau et potentiel egaux, IC bootstrap sur les pools."""
    def coef(sample):
        X, y, w = design(sample, feature)
        return oc.fit_logit(X, y, w).coef_[0][-1]

    base = coef(rows)
    rng = np.random.default_rng(seed)
    boots = []
    for _ in range(N_BOOT):
        idx = rng.integers(0, len(rows), len(rows))
        try:
            boots.append(coef([rows[i] for i in idx]))
        except ValueError:  # echantillon degenere (une seule classe)
            continue
    lo, hi = np.percentile(boots, [2.5, 97.5])
    mean_wr = sum(r["wins"] for r in rows) / sum(r["games"] for r in rows)
    return {
        "coef": float(base), "ci95": [float(lo), float(hi)],
        "wr_at_step": oc.wr_shift(mean_wr, base, step), "mean_wr": mean_wr, "step": step,
        "significant": bool(lo > 0 or hi < 0),
    }


def group_means(rows: list[dict], key: str) -> list[dict]:
    groups = defaultdict(list)
    for r in rows:
        groups[r[key]].append(r)
    out = []
    for k in sorted(groups):
        g = groups[k]
        out.append({
            "group": k, "n": len(g),
            "wr": sum(r["wins"] for r in g) / sum(r["games"] for r in g),
            "potential": float(np.mean([r["potential"] for r in g])),
            "gap": float(np.mean([r["gap"] for r in g])),
            "jaccard_best": float(np.mean([r["jaccard_best"] for r in g])),
            "color_match": float(np.mean([r["color_match"] for r in g])),
        })
    return out


def write_report(set_code: str, meta: dict, rows: list[dict], gap: dict, jac: dict,
                 by_bin: list[dict], by_skill: list[dict]) -> Path:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    path = REPORT_DIR / f"{set_code}_{date}.md"

    def verdict(e, expected_sign):
        if not e["significant"]:
            return "pas d'effet distinguable du bruit"
        return "dans le sens attendu" if np.sign(e["coef"]) == expected_sign else "**a contre-sens**"

    lines = [
        f"# Choix de l'optimizer juges sur de vraies victoires : {set_code}",
        "",
        f"- Date : {date} — data dump `game_data_public.{set_code}.Sealed` (maj {meta.get('data_updated') or '?'})",
        f"- {len(rows)} pools reels (deck + sideboard), >= {meta['min_games']} parties par deck, "
        f"repartis a parts egales sur {N_BINS} tranches de WR du deck ; {meta['max_evals']} evaluations par shard",
        "- Optimizer : coeur de production, contexte ArenaDirect_Sealed.",
        "",
        "## Le test",
        "",
        "Potentiel du pool = score du meilleur build de l'optimizer. Ecart du joueur = potentiel - score du deck joue.",
        "Regression logistique sur les parties : victoire ~ niveau du joueur + potentiel + ecart. "
        "Si l'optimizer construit mieux que les joueurs, l'ecart doit faire perdre (coefficient negatif).",
        "",
        "| Mesure | Effet | IC 95 % | Lecture |",
        "|---|---:|---|---|",
        f"| Ecart au build de l'optimizer, +{gap['step']:.0f} pts | WR {gap['mean_wr']*100:.1f} % -> "
        f"**{gap['wr_at_step']*100:.1f} %** | [{gap['ci95'][0]:+.4f} ; {gap['ci95'][1]:+.4f}] | {verdict(gap, -1)} |",
        f"| Ressemblance au meilleur des 3 builds (Jaccard), +{jac['step']:.1f} | WR {jac['mean_wr']*100:.1f} % -> "
        f"**{jac['wr_at_step']*100:.1f} %** | [{jac['ci95'][0]:+.3f} ; {jac['ci95'][1]:+.3f}] | {verdict(jac, +1)} |",
        "",
        "(IC sur le coefficient logistique, bootstrap sur les pools.)",
        "",
        "## Par tranche de WR du deck (1 = plus bas)",
        "",
        "| Tranche | Pools | WR reel | Potentiel | Ecart joueur | Jaccard best3 | Couleurs dans le top 3 |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]
    for g in by_bin:
        lines.append(f"| {g['group']} | {g['n']} | {g['wr']*100:.1f} % | {g['potential']:.1f} | {g['gap']:.1f} | "
                     f"{g['jaccard_best']:.2f} | {g['color_match']*100:.0f} % |")
    lines += [
        "",
        "Un WR de deck sur 3-7 parties est surtout de la chance : cette lecture est descriptive, le test est la regression.",
        "",
        "## Par niveau du joueur (`user_game_win_rate_bucket`)",
        "",
        "| Niveau | Pools | WR reel | Potentiel | Ecart joueur | Jaccard best3 | Couleurs dans le top 3 |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]
    for g in by_skill:
        lines.append(f"| {g['group'] or '?'} | {g['n']} | {g['wr']*100:.1f} % | {g['potential']:.1f} | {g['gap']:.1f} | "
                     f"{g['jaccard_best']:.2f} | {g['color_match']*100:.0f} % |")
    lines += [
        "",
        "## Limites",
        "",
        "- Proxy : Sealed n'est pas ArenaDirect_Sealed (17Lands ne publie pas les parties ArenaDirect).",
        "- Le deck de l'optimizer n'a jamais ete joue : on mesure si s'en ecarter coute des victoires, "
        "pas le WR qu'aurait eu son build.",
        "- Le niveau du joueur est un controle grossier ; l'ecart peut aussi refleter le pilotage.",
    ]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    path.with_suffix(".json").write_text(json.dumps(
        {"meta": meta, "gap_effect": gap, "jaccard_effect": jac, "by_wr_bin": by_bin, "by_skill": by_skill,
         "rows": rows}, indent=1), encoding="utf-8")
    return path


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--set", required=True)
    ap.add_argument("--event", default="Sealed")
    ap.add_argument("--pools", type=int, default=400)
    ap.add_argument("--min-games", type=int, default=4)
    ap.add_argument("--max-evals", type=int, default=15000)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--reuse-run", action="store_true", help="Reanalyse le dernier run sans relancer l'optimizer")
    args = ap.parse_args()
    set_code = args.set.upper()
    RUN_DIR.mkdir(parents=True, exist_ok=True)
    pools_path = RUN_DIR / f"{set_code}_pools.json"
    sample_path = RUN_DIR / f"{set_code}_sample.json"
    run_path = RUN_DIR / f"{set_code}_run.json"

    print(f"1/4 game_data {set_code}/{args.event}")
    gz, updated = oc.download_game_data(set_code, args.event)
    if args.reuse_run and sample_path.exists() and run_path.exists():
        pools = json.loads(sample_path.read_text(encoding="utf-8"))
        print(f"2/4 echantillon reutilise ({len(pools)} pools)")
        print("3/4 run de l'optimizer reutilise")
    else:
        print("2/4 Reconstitution des pools")
        pools = sample_pools(oc.build_decks(gz), args.pools, args.min_games, args.seed)
        sample_path.write_text(json.dumps(pools), encoding="utf-8")
        write_bench_input(pools, pools_path)
        print(f"3/4 Optimizer sur {len(pools)} pools (~10 s par pool)")
        run_bench(set_code, pools_path, run_path, args.max_evals)

    print("4/4 Analyse")
    run = json.loads(run_path.read_text(encoding="utf-8"))
    rows = build_table(pools, run)
    gap = feature_effect(rows, "gap", 10.0, args.seed)
    jac = feature_effect(rows, "jaccard_best", 0.2, args.seed)
    meta = {"set": set_code, "event": args.event, "data_updated": updated, "min_games": args.min_games,
            "max_evals": args.max_evals, "seed": args.seed, "pools": len(rows)}
    path = write_report(set_code, meta, rows, gap, jac, group_means(rows, "wr_bin"), group_means(rows, "skill"))
    print(f"Fiche : {path.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
