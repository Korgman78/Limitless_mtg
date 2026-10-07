"""Comparaison appariee de deux runs du banc local (bench.mjs) sur les memes pools.

Pour chaque metrique, l'ecart B - A est calcule pool par pool, puis un
intervalle de confiance a 95 % est estime par bootstrap sur les pools. Un ecart
dont l'intervalle contient 0 n'est pas distinguable du bruit.

"Beats player" n'est pas calcule : le deck joueur est note avec le score meme que
l'optimizer maximise, le resultat est acquis par construction.

Usage :
  python compare.py run_A.json run_B.json [--out fiche.md] [--label-a prod] [--label-b candidat]
"""

import argparse
import json
from pathlib import Path

import numpy as np

N_BOOT = 10_000


def arch_key(arch: str) -> str:
    """Couleurs principales triees + splash : 'UW' == 'WU'."""
    main = "".join(sorted(c for c in arch if c in "WUBRG"))
    splash = "".join(sorted(c for c in arch if c in "wubrg"))
    return f"{main}|{splash}"


def color_key(arch: str) -> str:
    return "".join(sorted(c for c in arch.upper() if c in "WUBRG"))


def cards_jaccard(a: list[dict], b: list[dict]) -> float:
    ma = {c["name"]: c["qty"] for c in a}
    mb = {c["name"]: c["qty"] for c in b}
    keys = set(ma) | set(mb)
    inter = sum(min(ma.get(k, 0), mb.get(k, 0)) for k in keys)
    union = sum(max(ma.get(k, 0), mb.get(k, 0)) for k in keys)
    return inter / union if union else 0.0


def pool_metrics(row: dict) -> dict[str, float] | None:
    builds, player = row.get("builds") or [], row.get("player")
    if not builds or not player:
        return None
    p_arch = player["archetype"]
    archs = [b["archetype"] for b in builds]
    return {
        "jaccard_top1": builds[0]["jaccard"],
        "jaccard_best3": max(b["jaccard"] for b in builds),
        "color_match_top1": float(color_key(archs[0]) == color_key(p_arch)),
        "color_match_top3": float(any(color_key(a) == color_key(p_arch) for a in archs)),
        "strict_match_top1": float(arch_key(archs[0]) == arch_key(p_arch)),
        "strict_match_top3": float(any(arch_key(a) == arch_key(p_arch) for a in archs)),
        "distinct_archetypes_top3": float(len({arch_key(a) for a in archs})),
        # Similarite moyenne des builds 2 et 3 avec le build 1 (plus bas = plus divers)
        "builds_similarity": float(np.mean([cards_jaccard(builds[0]["cards"], b["cards"]) for b in builds[1:]]))
        if len(builds) > 1 else 0.0,
        "top1_score": builds[0]["score"],
        "top1_minus_player": builds[0]["score"] - player["score"],
    }


METRICS = [
    ("jaccard_top1", "Jaccard top1", False),
    ("jaccard_best3", "Jaccard best3", False),
    ("color_match_top1", "Color match top1", True),
    ("color_match_top3", "Color match top3", True),
    ("strict_match_top1", "Strict match top1", True),
    ("strict_match_top3", "Strict match top3", True),
    ("distinct_archetypes_top3", "Archetypes distincts top3", False),
    ("builds_similarity", "Similarite builds 2-3 / build 1", False),
    ("top1_score", "Score top1", False),
    ("top1_minus_player", "Score top1 - joueur", False),
]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("run_a")
    ap.add_argument("run_b")
    ap.add_argument("--out")
    ap.add_argument("--label-a", default="A")
    ap.add_argument("--label-b", default="B")
    args = ap.parse_args()

    a, b = json.loads(Path(args.run_a).read_text()), json.loads(Path(args.run_b).read_text())
    by_id_a = {r["aggregate_id"]: pool_metrics(r) for r in a["results"]}
    by_id_b = {r["aggregate_id"]: pool_metrics(r) for r in b["results"]}
    ids = [i for i in by_id_a if by_id_a[i] and by_id_b.get(i)]
    n = len(ids)
    rng = np.random.default_rng(0)
    boot_idx = rng.integers(0, n, size=(N_BOOT, n))

    same_weights = a["meta"]["weights"] == b["meta"]["weights"]
    changed = sum(
        1 for i in ids
        if [x["cards"] for x in next(r for r in a["results"] if r["aggregate_id"] == i)["builds"][:1]]
        != [x["cards"] for x in next(r for r in b["results"] if r["aggregate_id"] == i)["builds"][:1]]
    )

    lines = [
        f"# Comparaison appariee : {args.label_b} vs {args.label_a}",
        "",
        f"- Set : {a['meta']['set']}, {n} pools communs",
        f"- {args.label_a} : poids {a['meta']['weights']}, graine {a['meta']['seed']}, budget {a['meta']['max_evals_per_shard']} evals/shard",
        f"- {args.label_b} : poids {b['meta']['weights']}, graine {b['meta']['seed']}, budget {b['meta']['max_evals_per_shard']} evals/shard",
        f"- Build top1 different sur {changed}/{n} pools",
        "",
        f"| Metrique | {args.label_a} | {args.label_b} | Ecart | IC 95 % | Significatif |",
        "|---|---:|---:|---:|---|---|",
    ]
    for key, label, is_rate in METRICS:
        if key.startswith("top1_score") or key == "top1_minus_player":
            if not same_weights:
                continue  # echelles de score differentes : pas comparable
        va = np.array([by_id_a[i][key] for i in ids])
        vb = np.array([by_id_b[i][key] for i in ids])
        d = vb - va
        boots = d[boot_idx].mean(axis=1)
        lo, hi = np.percentile(boots, [2.5, 97.5])
        scale = 100 if is_rate else 1
        fmt = (lambda x: f"{x * scale:.1f} %") if is_rate else (lambda x: f"{x:.4f}")
        fmt_d = (lambda x: f"{x * scale:+.1f} pt") if is_rate else (lambda x: f"{x:+.4f}")
        sig = "oui" if (lo > 0 or hi < 0) else "non"
        lines.append(f"| {label} | {fmt(va.mean())} | {fmt(vb.mean())} | {fmt_d(d.mean())} | [{fmt_d(lo)} ; {fmt_d(hi)}] | {sig} |")
    if not same_weights:
        lines += ["", "Scores non compares : les poids different, donc l'echelle du score aussi."]

    text = "\n".join(lines)
    print(text)
    if args.out:
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out).write_text(text + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
