"""Calibration du score du sealed optimizer sur des resultats reels.

Question : le score de production predit-il les victoires ?

Source : game_data public de 17Lands (une ligne = une partie, tous joueurs et
tous bilans, pas seulement les trophees). 17Lands ne publie pas ArenaDirect_Sealed,
seulement Sealed / TradSealed. Comme l'optimizer cible ArenaDirect_Sealed, le
script verifie d'abord que Sealed est un proxy acceptable pour le set : il
compare le GIH WR des cartes entre les deux formats (correlation corrigee du
bruit d'echantillonnage) et s'arrete sous le seuil.

Etapes :
  1. controle de proximite Sealed vs ArenaDirect_Sealed (donnees Supabase)
  2. telechargement du game_data 17Lands (cache dans backend/tmp/outcome_calibration)
  3. regroupement des parties en decks (deck + sideboard + bilan + niveau joueur)
  4. score de chaque deck avec le vrai coeur TypeScript (score_decks.mjs, via Node)
  5. analyse statistique et fiche synthese dans
     backend/reports/benchmarks/outcome_calibration/

Usage :
  python backend/sealed-optimizer/outcome_calibration/outcome_calibration.py --set MSH
  python ... --set ECL --force          # ignore le controle de proximite
"""

import argparse
import csv
import gzip
import json
import os
import shutil
import subprocess
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import requests
from dotenv import load_dotenv
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import log_loss, roc_auc_score
from sklearn.model_selection import GroupKFold

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parents[2]
CACHE_DIR = REPO_ROOT / "backend" / "tmp" / "outcome_calibration"
REPORT_DIR = REPO_ROOT / "backend" / "reports" / "benchmarks" / "outcome_calibration"
GAME_DATA_URL = "https://17lands-public.s3.amazonaws.com/analysis_data/game_data/game_data_public.{set}.{event}.csv.gz"

TARGET_FORMAT = "ArenaDirect_Sealed"
DEFAULT_THRESHOLD = 0.88
MIN_GIH_GAMES = 200
AXES = ["wrNormalized", "synergyNormalized", "consistencyScore", "curveScore"]
PROD_WEIGHTS = {"wrNormalized": 2.0, "synergyNormalized": 1.0, "consistencyScore": 1.3, "curveScore": 1.0}

load_dotenv(REPO_ROOT / ".env")
SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY") or os.getenv("VITE_SUPABASE_KEY")


# ─── 1. Controle de proximite ────────────────────────────────────────────────

def supabase_get(table: str, query: str) -> list[dict]:
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
    rows: list[dict] = []
    start = 0
    while True:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/{table}?{query}",
            headers={**headers, "Range": f"{start}-{start + 999}"},
            timeout=60,
        )
        r.raise_for_status()
        page = r.json()
        rows.extend(page)
        if len(page) < 1000:
            return rows
        start += 1000


def proximity_check(set_code: str, event: str) -> dict:
    """Compare le GIH WR des cartes entre `event` et ArenaDirect_Sealed.

    La correlation brute est plafonnee par le bruit (un GIH sur 200 parties a
    ~3.5 pts d'erreur). On la corrige par la fiabilite de chaque serie
    (variance vraie / variance observee), et on estime l'ecart reel par carte
    une fois le bruit retire.
    """
    def cards(fmt: str) -> dict[str, tuple[float, int]]:
        rows = supabase_get(
            "card_stats",
            f"set_code=eq.{set_code}&format=eq.{fmt}&filter_context=eq.Global&select=card_name,gih_wr,img_count",
        )
        return {
            r["card_name"]: (float(r["gih_wr"]), int(r["img_count"] or 0))
            for r in rows
            if r["gih_wr"] is not None and int(r["img_count"] or 0) >= MIN_GIH_GAMES
        }

    target, proxy = cards(TARGET_FORMAT), cards(event)
    common = [c for c in target if c in proxy]
    if len(common) < 30:
        return {"cards": len(common), "corrected_corr": None, "raw_corr": None, "real_gap_sd": None}

    a = np.array([target[c][0] for c in common])
    b = np.array([proxy[c][0] for c in common])
    na = np.array([target[c][1] for c in common])
    nb = np.array([proxy[c][1] for c in common])
    noise_a = float(np.mean((a / 100) * (1 - a / 100) / na) * 1e4)
    noise_b = float(np.mean((b / 100) * (1 - b / 100) / nb) * 1e4)
    rel_a = max(1e-6, 1 - noise_a / a.var())
    rel_b = max(1e-6, 1 - noise_b / b.var())
    raw = float(np.corrcoef(a, b)[0, 1])
    diff = (a - a.mean()) - (b - b.mean())
    return {
        "cards": len(common),
        "raw_corr": raw,
        "corrected_corr": min(1.0, raw / np.sqrt(rel_a * rel_b)),
        "real_gap_sd": float(np.sqrt(max(0.0, diff.var() - noise_a - noise_b))),
        "mean_offset": float(np.mean(a - b)),
    }


# ─── 2. Telechargement ───────────────────────────────────────────────────────

def download_game_data(set_code: str, event: str) -> tuple[Path, str | None]:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    url = GAME_DATA_URL.format(set=set_code, event=event)
    gz_path = CACHE_DIR / f"game_data_public.{set_code}.{event}.csv.gz"

    head = requests.head(url, timeout=60)
    if head.status_code != 200:
        sys.exit(f"Pas de game_data publie par 17Lands pour {set_code} {event} (HTTP {head.status_code}).")
    last_modified = head.headers.get("Last-Modified")
    remote_size = int(head.headers.get("Content-Length", 0))

    if not gz_path.exists() or gz_path.stat().st_size != remote_size:
        print(f"Telechargement {url}")
        with requests.get(url, stream=True, timeout=300) as r:
            r.raise_for_status()
            with open(gz_path, "wb") as f:
                shutil.copyfileobj(r.raw, f)
    else:
        print(f"game_data en cache : {gz_path.name}")
    return gz_path, last_modified


# ─── 3. Decks ────────────────────────────────────────────────────────────────

def build_decks(gz_path: Path) -> list[dict]:
    """Une ligne = une partie ; un deck = (draft_id, build_index)."""
    csv.field_size_limit(10_000_000)
    decks: dict[tuple[str, str], dict] = {}
    skill: dict[tuple[str, str], Counter] = defaultdict(Counter)
    with gzip.open(gz_path, "rt", encoding="utf-8", newline="") as f:
        reader = csv.reader(f)
        header = next(reader)
        idx = {name: i for i, name in enumerate(header)}
        deck_cols = [(i, h[5:]) for i, h in enumerate(header) if h.startswith("deck_")]
        side_cols = [(i, h[10:]) for i, h in enumerate(header) if h.startswith("sideboard_")]
        for row in reader:
            key = (row[idx["draft_id"]], row[idx["build_index"]])
            d = decks.get(key)
            if d is None:
                d = {
                    "draft_id": key[0],
                    "build_index": int(key[1]),
                    "main_colors": row[idx["main_colors"]],
                    "splash_colors": row[idx["splash_colors"]],
                    "deck": {n: int(row[i]) for i, n in deck_cols if row[i] not in ("", "0")},
                    "sideboard": {n: int(row[i]) for i, n in side_cols if row[i] not in ("", "0")},
                    "games": 0,
                    "wins": 0,
                }
                decks[key] = d
            d["games"] += 1
            d["wins"] += 1 if row[idx["won"]] == "True" else 0
            skill[key][row[idx["user_game_win_rate_bucket"]]] += 1
    for key, d in decks.items():
        d["skill_bucket"] = skill[key].most_common(1)[0][0]
    return list(decks.values())


# ─── 4. Score (coeur TypeScript via Node) ────────────────────────────────────

def node_command() -> list[str]:
    node = shutil.which("node")
    if not node:
        sys.exit("Node.js introuvable (>= 22.6 requis pour executer le coeur TypeScript).")
    # --use-system-ca : utilise le magasin de certificats de l'OS (proxy TLS d'entreprise).
    probe = subprocess.run([node, "--use-system-ca", "-e", "0"], capture_output=True)
    return [node, "--use-system-ca"] if probe.returncode == 0 else [node]


def score_decks(
    decks_path: Path, scores_path: Path, set_code: str, weights: str | None = None, tuning: str | None = None,
) -> None:
    cmd = node_command() + [
        str(HERE / "score_decks.mjs"), str(REPO_ROOT), str(decks_path), str(scores_path), set_code, TARGET_FORMAT,
        weights or "", tuning or "",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
    for line in result.stderr.splitlines():
        if "ExperimentalWarning" not in line and "--trace-warnings" not in line:
            print(f"  [node] {line}")
    if result.returncode != 0:
        sys.exit("Echec du scoring Node.")


# ─── 5. Analyse ──────────────────────────────────────────────────────────────

class Dataset:
    def __init__(self, scores_path: Path):
        rows = [r for r in csv.DictReader(open(scores_path, encoding="utf-8")) if r["skill_bucket"]]
        self.rows = rows
        col = lambda k: np.array([float(r[k]) for r in rows])
        self.col = col
        self.n = len(rows)
        self.wins, self.games = col("wins"), col("games")
        self.skill, self.score = col("skill_bucket"), col("score")
        self.axes = np.column_stack([col(a) for a in AXES])
        self.groups = np.array([r["draft_id"] for r in rows])
        self.pair = np.array(["".join(sorted(r["main_colors"])) for r in rows])
        self.tricolor = np.array([float(len(r["main_colors"]) >= 3) for r in rows])

    def expand(self, X: np.ndarray):
        """Chaque deck devient 2 lignes (victoires / defaites) ponderees."""
        Xw = np.vstack([X, X])
        y = np.concatenate([np.ones(self.n), np.zeros(self.n)])
        w = np.concatenate([self.wins, self.games - self.wins])
        g = np.concatenate([self.groups, self.groups])
        keep = w > 0
        return Xw[keep], y[keep], w[keep], g[keep]


def fit_logit(X, y, w):
    return LogisticRegression(C=1e6, max_iter=5000).fit(X, y, sample_weight=w)


def cv_predictions(ds: Dataset, X: np.ndarray):
    """Predictions hors echantillon (5 plis, groupes par event)."""
    Xw, y, w, g = ds.expand(X)
    mu, sd = Xw.mean(0), Xw.std(0) + 1e-9
    Xs = (Xw - mu) / sd
    preds = np.zeros(len(y))
    for tr, te in GroupKFold(n_splits=5).split(Xs, y, g):
        preds[te] = fit_logit(Xs[tr], y[tr], w[tr]).predict_proba(Xs[te])[:, 1]
    return preds, y, w, g


def cv_metrics(ds: Dataset, X: np.ndarray) -> dict:
    preds, y, w, _ = cv_predictions(ds, X)
    return {
        "log_loss": float(log_loss(y, preds, sample_weight=w)),
        "auc": float(roc_auc_score(y, preds, sample_weight=w)),
    }


def compare_weights(ds_prod: Dataset, ds_cand: Dataset) -> dict:
    """Ecart de log-loss (candidat - prod) du modele "niveau + score", apparie.

    Les deux scores sont calcules sur les memes decks : on compare les pertes
    hors echantillon partie par partie, et l'IC 95 % vient d'un bootstrap sur
    les events (draft_id). Negatif = le candidat predit mieux.
    """
    assert [r["draft_id"] for r in ds_prod.rows] == [r["draft_id"] for r in ds_cand.rows]
    pa, y, w, g = cv_predictions(ds_prod, np.column_stack([ds_prod.skill, ds_prod.score]))
    pb, _, _, _ = cv_predictions(ds_cand, np.column_stack([ds_cand.skill, ds_cand.score]))
    eps = 1e-12
    loss = lambda p: -(y * np.log(p + eps) + (1 - y) * np.log(1 - p + eps)) * w
    diff = loss(pb) - loss(pa)
    groups, inv = np.unique(g, return_inverse=True)
    diff_g = np.bincount(inv, weights=diff)
    w_g = np.bincount(inv, weights=w)
    rng = np.random.default_rng(0)
    boots = []
    for _ in range(2000):
        idx = rng.integers(0, len(groups), len(groups))
        boots.append(diff_g[idx].sum() / w_g[idx].sum())
    lo, hi = np.percentile(boots, [2.5, 97.5])
    return {"delta_log_loss": float(diff_g.sum() / w_g.sum()), "ci95": [float(lo), float(hi)]}


def multicolor_effect(ds: Dataset, n_boot: int = 200) -> dict:
    """Un deck a 3 couleurs principales gagne-t-il plus (ou moins) qu'un bicolore de meme score ?

    Modele : victoire ~ niveau + score + tricolore. L'effet tricolore est exprime
    en points de score (coef tricolore / coef score) : positif = le score sous-note
    les tricolores. IC 95 % par bootstrap sur les events (poids multinomiaux).
    """
    X = np.column_stack([ds.skill, ds.score, ds.tricolor])
    Xw, y, w, g = ds.expand(X)

    def effect(weights):
        m = LogisticRegression(C=1e6, max_iter=3000).fit(Xw, y, sample_weight=weights)
        return m.coef_[0][2] / m.coef_[0][1]

    point = float(effect(w))
    groups, inv = np.unique(g, return_inverse=True)
    rng = np.random.default_rng(0)
    boots = []
    for _ in range(n_boot):
        counts = rng.multinomial(len(groups), np.full(len(groups), 1 / len(groups)))
        boots.append(effect(w * counts[inv]))
    lo, hi = np.percentile(boots, [2.5, 97.5])
    tri = ds.tricolor == 1
    return {
        "decks_3c": int(tri.sum()),
        "share_3c": float(tri.mean()),
        "mean_score_3c": float(ds.score[tri].mean()) if tri.any() else None,
        "mean_score_2c": float(ds.score[~tri].mean()),
        "effect_score_pts": point,
        "ci95": [float(lo), float(hi)],
    }


def wr_shift(base: float, coef_per_point: float, points: float = 10.0) -> float:
    lo = np.log(base / (1 - base)) + coef_per_point * points
    return float(1 / (1 + np.exp(-lo)))


def analyze(ds: Dataset) -> dict:
    out: dict = {}
    base = float(ds.wins.sum() / ds.games.sum())
    out["decks"], out["games"], out["base_wr"] = ds.n, int(ds.games.sum()), base

    out["saturation"] = {
        a: {
            "mean": float(ds.axes[:, i].mean()),
            "p10": float(np.percentile(ds.axes[:, i], 10)),
            "p90": float(np.percentile(ds.axes[:, i], 90)),
            "at_100": float(np.mean(ds.axes[:, i] >= 99.99)),
            "at_0": float(np.mean(ds.axes[:, i] <= 0.01)),
        }
        for i, a in enumerate(AXES)
    }

    Xw, y, w, _ = ds.expand(np.zeros((ds.n, 1)))
    out["predictive"] = {
        "aucun predicteur": {"log_loss": float(log_loss(y, np.full(len(y), base), sample_weight=w)), "auc": 0.5},
        "niveau joueur seul": cv_metrics(ds, ds.skill[:, None]),
        "score prod seul": cv_metrics(ds, ds.score[:, None]),
        "niveau + score prod": cv_metrics(ds, np.column_stack([ds.skill, ds.score])),
        "niveau + 4 axes (poids refits)": cv_metrics(ds, np.column_stack([ds.skill, ds.axes])),
    }

    # Effet du score, a niveau egal, avec et sans effets fixes de paire
    pairs = [p for p in sorted(set(ds.pair)) if (ds.pair == p).sum() >= 150]
    dummies = np.column_stack([(ds.pair == p).astype(float) for p in pairs]) if pairs else np.zeros((ds.n, 0))
    m_all = fit_logit(*ds.expand(np.column_stack([ds.skill, ds.score]))[:3])
    m_in = fit_logit(*ds.expand(np.column_stack([ds.skill, ds.score, dummies]))[:3])
    c_all, c_in = float(m_all.coef_[0][1]), float(m_in.coef_[0][1])
    out["score_effect"] = {
        "coef_all": c_all,
        "coef_within_pair": c_in,
        "wr_plus10_all": wr_shift(base, c_all),
        "wr_plus10_within_pair": wr_shift(base, c_in),
    }

    # Poids refits, exprimes en ratio de l'axe puissance
    Xa = np.column_stack([ds.skill, ds.axes])
    Xw, y, w, _ = ds.expand(Xa)
    mu, sd = Xw.mean(0), Xw.std(0) + 1e-9
    m_axes = fit_logit((Xw - mu) / sd, y, w)
    raw = m_axes.coef_[0] / sd
    power = raw[1]
    out["refit_weights"] = {
        a: {
            "coef_per_point": float(raw[1 + i]),
            "ratio_vs_power": float(raw[1 + i] / power) if power != 0 else None,
            "prod_ratio": PROD_WEIGHTS[a] / PROD_WEIGHTS["wrNormalized"],
        }
        for i, a in enumerate(AXES)
    }

    # Quintiles de score par tranche de niveau
    qs = np.percentile(ds.score, [20, 40, 60, 80])
    q = np.searchsorted(qs, ds.score)
    tiers = [
        ("niveau < 0.48", ds.skill < 0.48),
        ("0.48 - 0.60", (ds.skill >= 0.48) & (ds.skill < 0.60)),
        ("niveau >= 0.60", ds.skill >= 0.60),
    ]
    out["quintile_bounds"] = [float(x) for x in qs]
    out["quintiles"] = {
        name: [
            {"wr": float(ds.wins[mask & (q == i)].sum() / max(1, ds.games[mask & (q == i)].sum())),
             "games": int(ds.games[mask & (q == i)].sum())}
            for i in range(5)
        ]
        for name, mask in tiers
    }

    # Par paire : score moyen vs victoires au-dessus de l'attendu (a niveau egal)
    m_sk = fit_logit(*ds.expand(ds.skill[:, None])[:3])
    expected = m_sk.predict_proba(ds.skill[:, None])[:, 1]
    by_pair = []
    for p in pairs:
        m = ds.pair == p
        g = ds.games[m].sum()
        by_pair.append({
            "pair": p,
            "decks": int(m.sum()),
            "wr": float(ds.wins[m].sum() / g),
            "expected_wr": float((expected[m] * ds.games[m]).sum() / g),
            "mean_score": float(ds.score[m].mean()),
            "mean_wr_axis": float(ds.col("wrNormalized")[m].mean()),
        })
    for b in by_pair:
        b["residual"] = b["wr"] - b["expected_wr"]
    out["by_pair"] = sorted(by_pair, key=lambda b: -b["decks"])
    if ds.tricolor.sum() >= 200:
        out["multicolor"] = multicolor_effect(ds)
    if len(by_pair) >= 3:
        s = np.array([b["mean_score"] for b in by_pair])
        r = np.array([b["residual"] for b in by_pair])
        out["pair_score_vs_residual_corr"] = float(np.corrcoef(s, r)[0, 1])
    return out


# ─── Fiche synthese ──────────────────────────────────────────────────────────

def pct(x: float) -> str:
    return f"{x * 100:.1f} %"


def comparison_section(cmp: dict, res_prod: dict) -> list[str]:
    rc, c = cmp["results"], cmp["comparison"]
    se_p, se_c = res_prod["score_effect"], rc["score_effect"]
    pred_p = res_prod["predictive"]["niveau + score prod"]
    pred_c = rc["predictive"]["niveau + score prod"]
    spread = lambda r, tier: r["quintiles"][tier][4]["wr"] - r["quintiles"][tier][0]["wr"]
    better = c["ci95"][1] < 0
    worse = c["ci95"][0] > 0
    verdict = "le candidat predit mieux" if better else ("le candidat predit moins bien" if worse else "pas de difference distinguable du bruit")
    L = [
        f"## Comparaison : candidat {cmp['label']} vs {cmp['base_label']}",
        "",
        f"| Mesure | {cmp['base_label']} | Candidat |",
        "|---|---:|---:|",
        f"| Log-loss niveau + score (CV) | {pred_p['log_loss']:.5f} | {pred_c['log_loss']:.5f} |",
        f"| AUC niveau + score (CV) | {pred_p['auc']:.4f} | {pred_c['auc']:.4f} |",
        f"| WR +10 pts de score, toutes paires | {pct(se_p['wr_plus10_all'])} | {pct(se_c['wr_plus10_all'])} |",
        f"| WR +10 pts de score, intra-paire | {pct(se_p['wr_plus10_within_pair'])} | {pct(se_c['wr_plus10_within_pair'])} |",
        f"| Ecart Q5 - Q1, niveau 0.48-0.60 | {spread(res_prod, '0.48 - 0.60') * 100:+.1f} pt | {spread(rc, '0.48 - 0.60') * 100:+.1f} pt |",
        f"| Ecart Q5 - Q1, niveau >= 0.60 | {spread(res_prod, 'niveau >= 0.60') * 100:+.1f} pt | {spread(rc, 'niveau >= 0.60') * 100:+.1f} pt |",
        "",
        f"Ecart de log-loss apparie (candidat - {cmp['base_label']}) : {c['delta_log_loss']:+.6f}, "
        f"IC 95 % [{c['ci95'][0]:+.6f} ; {c['ci95'][1]:+.6f}] (bootstrap sur les events). **{verdict}**.",
        "",
        "Les ecarts de score ne se comparent pas en valeur absolue (l'echelle change avec les poids) : "
        "seuls le pouvoir predictif et l'ecart entre quintiles sont comparables.",
        "",
    ]
    return L


def write_report(meta: dict, prox: dict, res: dict | None, cmp: dict | None = None) -> Path:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    stem = f"{meta['set']}_{meta['event']}_{meta['run_date']}"
    if cmp:
        stem += "_" + cmp["slug"]
        if cmp["base_label"] != "prod":
            stem += "_vs_" + cmp["base_label"]
    (REPORT_DIR / f"{stem}.json").write_text(
        json.dumps({"meta": meta, "proximity": prox, "results": res, "weights_comparison": cmp}, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    L: list[str] = []
    L.append(f"# Calibration sur resultats reels : {meta['set']} ({meta['event']} comme proxy d'ArenaDirect_Sealed)")
    L.append("")
    L.append(f"- Date du run : {meta['run_date']}")
    L.append(f"- Donnees 17Lands : `{meta['source']}` (mise a jour {meta['source_last_modified']})")
    L.append(f"- Score : coeur de production `sealedOptimizerCore.ts`, contexte {TARGET_FORMAT}, poids {PROD_WEIGHTS}")
    if meta.get("base_tuning") or meta.get("base_weights"):
        L.append(f"- Reference `{meta['base_label']}` (toutes les sections ci-dessous sauf la comparaison) : "
                 f"poids {meta.get('base_weights') or 'prod'}, reglages `{meta.get('base_tuning') or 'prod'}`")
    L.append("")
    L.append("## Proximite du proxy")
    L.append("")
    if prox.get("corrected_corr") is None:
        L.append(f"Trop peu de cartes communes ({prox['cards']}) pour comparer les formats.")
    else:
        L.append(
            f"GIH WR {meta['event']} vs {TARGET_FORMAT}, {prox['cards']} cartes (>= {MIN_GIH_GAMES} parties) : "
            f"correlation brute {prox['raw_corr']:.2f}, **corrigee du bruit {prox['corrected_corr']:.2f}**, "
            f"ecart reel par carte {prox['real_gap_sd']:.2f} pt (seuil d'acceptation : {meta['threshold']:.2f})."
        )
    L.append("")
    L.append(f"**Verdict : {meta['verdict']}**")
    L.append("")

    if res is None:
        L.append(f"Analyse non lancee : {meta['event']} ne represente pas assez {TARGET_FORMAT} pour ce set. "
                 "Relancer avec `--force` pour l'analyser quand meme, a titre indicatif.")
    else:
        se = res["score_effect"]
        L.append("## En bref")
        L.append("")
        L.append(f"- {res['decks']} decks, {res['games']} parties, WR moyen {pct(res['base_wr'])}.")
        L.append(f"- A niveau de joueur egal, +10 pts de score = WR {pct(res['base_wr'])} -> "
                 f"**{pct(se['wr_plus10_all'])}** toutes paires confondues, "
                 f"**{pct(se['wr_plus10_within_pair'])}** au sein d'une meme paire.")
        sat = [a for a, s in res["saturation"].items() if s["at_100"] >= 0.2]
        if sat:
            L.append(f"- Axe(s) sature(s) (>= 20 % des decks a 100) : {', '.join(sat)}.")
        if "pair_score_vs_residual_corr" in res:
            L.append(f"- Correlation entre score moyen d'une paire et ses victoires au-dessus de l'attendu : "
                     f"{res['pair_score_vs_residual_corr']:+.2f} (proche de +1 = le score classe bien les paires).")
        L.append("")

        if cmp:
            L.extend(comparison_section(cmp, res))

        if res.get("multicolor"):
            mc = res["multicolor"]
            lo, hi = mc["ci95"]
            sig = "significatif" if (lo > 0 or hi < 0) else "non significatif"
            L.append("## Decks tricolores")
            L.append("")
            L.append(f"- {mc['decks_3c']} decks a 3 couleurs principales ({pct(mc['share_3c'])}), "
                     f"score moyen {mc['mean_score_3c']:.1f} contre {mc['mean_score_2c']:.1f} pour les bicolores.")
            L.append(f"- A score egal, un tricolore gagne comme un bicolore note **{mc['effect_score_pts']:+.1f} pts** "
                     f"de plus (IC 95 % [{lo:+.1f} ; {hi:+.1f}], {sig}). Positif = le score sous-note les tricolores.")
            L.append("")
            if cmp and cmp["results"].get("multicolor"):
                cm = cmp["results"]["multicolor"]
                L.append(f"- Avec le candidat : {cm['effect_score_pts']:+.1f} pts (IC 95 % [{cm['ci95'][0]:+.1f} ; {cm['ci95'][1]:+.1f}]).")
                L.append("")

        L.append("## Pouvoir predictif (validation croisee 5 plis, groupes par event)")
        L.append("")
        L.append("| Modele | Log-loss | AUC |")
        L.append("|---|---:|---:|")
        for k, v in res["predictive"].items():
            L.append(f"| {k} | {v['log_loss']:.4f} | {v['auc']:.4f} |")
        L.append("")
        L.append("Une partie isolee est tres bruitee : le gain d'AUC du score reste faible meme quand son effet est reel. "
                 "Lire plutot l'effet en points de WR et les quintiles.")
        L.append("")

        L.append("## WR de partie par quintile de score, a niveau comparable")
        L.append("")
        L.append("| Niveau | Q1 | Q2 | Q3 | Q4 | Q5 |")
        L.append("|---|---:|---:|---:|---:|---:|")
        for tier, cells in res["quintiles"].items():
            L.append(f"| {tier} | " + " | ".join(f"{pct(c['wr'])} ({c['games']})" for c in cells) + " |")
        L.append("")
        L.append("Bornes de score des quintiles : " + ", ".join(f"{b:.1f}" for b in res["quintile_bounds"]))
        L.append("")

        L.append("## Saturation des axes")
        L.append("")
        L.append("| Axe | Moyenne | p10 | p90 | A 100 | A 0 |")
        L.append("|---|---:|---:|---:|---:|---:|")
        for a, s in res["saturation"].items():
            L.append(f"| {a} | {s['mean']:.1f} | {s['p10']:.1f} | {s['p90']:.1f} | {pct(s['at_100'])} | {pct(s['at_0'])} |")
        L.append("")

        L.append("## Poids refits sur les victoires (ratio a l'axe puissance)")
        L.append("")
        L.append("| Axe | Effet par point (log-odds x100) | Ratio refit | Ratio prod |")
        L.append("|---|---:|---:|---:|")
        for a, v in res["refit_weights"].items():
            ratio = "n/a" if v["ratio_vs_power"] is None else f"{v['ratio_vs_power']:+.2f}"
            L.append(f"| {a} | {v['coef_per_point'] * 100:+.3f} | {ratio} | {v['prod_ratio']:.2f} |")
        L.append("")
        L.append("Un axe sature a un effet par point gonfle (il ne varie que sur les decks hors plafond) : "
                 "ne pas reporter ces ratios tels quels dans la prod.")
        L.append("")

        L.append("## Par paire de couleurs (>= 150 decks)")
        L.append("")
        L.append("| Paire | Decks | WR reel | WR attendu (niveau) | Ecart | Score moyen | Axe puissance moyen |")
        L.append("|---|---:|---:|---:|---:|---:|---:|")
        for b in res["by_pair"]:
            L.append(f"| {b['pair']} | {b['decks']} | {pct(b['wr'])} | {pct(b['expected_wr'])} | "
                     f"{b['residual'] * 100:+.1f} pt | {b['mean_score']:.1f} | {b['mean_wr_axis']:.1f} |")
        L.append("")

    L.append("## Limites")
    L.append("")
    L.append(f"- Proxy : {meta['event']} n'est pas {TARGET_FORMAT} (17Lands ne publie pas les parties ArenaDirect).")
    L.append("- Le niveau du joueur (`user_game_win_rate_bucket`) est un controle grossier : les bons joueurs "
             "construisent aussi de meilleurs decks, l'effet du score peut etre un peu surestime.")
    L.append("- Les GIH WR du score viennent en partie des memes parties (fuite faible, une carte agrege des milliers de parties).")
    L.append("")
    path = REPORT_DIR / f"{stem}.md"
    path.write_text("\n".join(L), encoding="utf-8")
    return path


# ─── Main ────────────────────────────────────────────────────────────────────

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--set", required=True, help="Code du set (ex: MSH)")
    ap.add_argument("--event", default="Sealed", help="Format 17Lands du game_data (Sealed ou TradSealed)")
    ap.add_argument("--threshold", type=float, default=DEFAULT_THRESHOLD,
                    help="Correlation corrigee minimale entre le proxy et ArenaDirect_Sealed")
    ap.add_argument("--force", action="store_true", help="Analyser meme si le proxy est juge trop eloigne")
    ap.add_argument("--weights", help="Poids candidats 'power,consistency,curve,synergy' a comparer a la prod")
    ap.add_argument("--tuning", help="Reglages candidats (JSON) de MULTICOLOR_CONSISTENCY, ex: '{\"deficitFactor\":3.5}'")
    ap.add_argument("--label", help="Nom court du candidat (fiche et fichiers)")
    ap.add_argument("--base-tuning", help="Reglages de la reference (JSON par section) ; defaut = prod")
    ap.add_argument("--base-weights", help="Poids de la reference ; defaut = prod")
    ap.add_argument("--base-label", default="prod", help="Nom de la reference dans la fiche")
    args = ap.parse_args()
    set_code = args.set.upper()

    meta = {
        "base_label": args.base_label,
        "base_tuning": args.base_tuning,
        "base_weights": args.base_weights,
        "set": set_code,
        "event": args.event,
        "threshold": args.threshold,
        "run_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "source": f"game_data_public.{set_code}.{args.event}.csv.gz",
        "source_last_modified": None,
    }

    print(f"1/5 Controle de proximite {args.event} vs {TARGET_FORMAT} pour {set_code}")
    prox = proximity_check(set_code, args.event)
    corr = prox.get("corrected_corr")
    accepted = corr is not None and corr >= args.threshold
    print(f"    correlation corrigee : {corr if corr is None else round(corr, 3)} (seuil {args.threshold})")
    if not accepted and not args.force:
        meta["verdict"] = "proxy refuse, analyse non lancee"
        path = write_report(meta, prox, None)
        print(f"Proxy trop eloigne. Fiche : {path.relative_to(REPO_ROOT)}")
        return
    meta["verdict"] = "proxy accepte" if accepted else "proxy sous le seuil, analyse forcee (indicative seulement)"

    print("2/5 Telechargement du game_data")
    gz_path, last_modified = download_game_data(set_code, args.event)
    meta["source_last_modified"] = last_modified

    print("3/5 Regroupement des parties en decks")
    decks = build_decks(gz_path)
    work = CACHE_DIR / f"{set_code}_{args.event}"
    work.mkdir(parents=True, exist_ok=True)
    decks_path, scores_path = work / "decks.json", work / "scores.csv"
    decks_path.write_text(json.dumps(decks), encoding="utf-8")
    print(f"    {len(decks)} decks")

    print("4/5 Score des decks (coeur de production)")
    if args.base_tuning or args.base_weights:
        scores_path = work / f"scores_base_{args.base_label}.csv"
    score_decks(decks_path, scores_path, set_code, args.base_weights, args.base_tuning)

    cmp = None
    has_candidate = bool(args.weights or args.tuning)
    if has_candidate:
        parts = []
        if args.weights:
            parts.append("w" + args.weights.replace(",", "-"))
        if args.tuning:
            parts.append("t" + "".join(ch for ch in args.tuning if ch.isalnum() or ch in ".-")[:40])
        slug = args.label or "_".join(parts)
        label = args.label or " + ".join(filter(None, [
            f"poids {args.weights}" if args.weights else "", f"reglages {args.tuning}" if args.tuning else "",
        ]))
        print(f"    candidat : {label}")
        cand_path = work / f"scores_{slug}.csv"
        score_decks(decks_path, cand_path, set_code, args.weights, args.tuning)

    print("5/5 Analyse")
    ds_prod = Dataset(scores_path)
    res = analyze(ds_prod)
    if has_candidate:
        ds_cand = Dataset(cand_path)
        cmp = {
            "label": label,
            "slug": slug,
            "base_label": args.base_label,
            "weights": args.weights,
            "tuning": args.tuning,
            "results": analyze(ds_cand),
            "comparison": compare_weights(ds_prod, ds_cand),
        }
    path = write_report(meta, prox, res, cmp)
    print(f"Fiche : {path.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
