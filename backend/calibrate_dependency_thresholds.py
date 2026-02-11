"""
calibrate_dependency_thresholds.py
──────────────────────────────────
Analyse les trophy decks ArenaDirect_Sealed pour calibrer empiriquement
les seuils `dependency_min_support` des cartes à effet tribal/seuil.

Usage:
    python calibrate_dependency_thresholds.py --set ECL
    python calibrate_dependency_thresholds.py --set ECL --update   # écrit les seuils en BDD
"""

import argparse
import json
import math
import os
import sys
from collections import defaultdict
from pathlib import Path

import requests
from dotenv import load_dotenv

# ══════════════════════════════════════════════════════════════════════════════
# CONFIG
# ══════════════════════════════════════════════════════════════════════════════

SEALED_FORMATS = ("ArenaDirect_Sealed", "ArenaDirectSealed", "Sealed")
MIN_TROPHY_DECKS = 3  # minimum de decks contenant le payoff pour qu'on calcule un seuil

load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env")
SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY") or os.getenv("VITE_SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERREUR: Variables SUPABASE_URL / SUPABASE_KEY manquantes.")
    sys.exit(1)

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}

HEADERS_UPSERT = {
    **HEADERS,
    "Prefer": "resolution=merge-duplicates",
}


# ══════════════════════════════════════════════════════════════════════════════
# SUPABASE HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def supabase_get_all(table: str, params: dict) -> list[dict]:
    """GET paginé sur la REST API Supabase (max 1000 par page)."""
    all_rows: list[dict] = []
    page_size = 1000
    offset = 0
    while True:
        p = {**params, "limit": page_size, "offset": offset}
        qs = "&".join(f"{k}={v}" for k, v in p.items())
        url = f"{SUPABASE_URL}/rest/v1/{table}?{qs}"
        resp = requests.get(url, headers=HEADERS)
        if resp.status_code >= 400:
            print(f"  Erreur Supabase GET {table}: {resp.status_code} {resp.text[:200]}")
            break
        rows = resp.json()
        all_rows.extend(rows)
        if len(rows) < page_size:
            break
        offset += page_size
    return all_rows


# ══════════════════════════════════════════════════════════════════════════════
# DATA LOADING
# ══════════════════════════════════════════════════════════════════════════════

def load_trophy_decks(set_code: str) -> list[dict]:
    """Charge les trophy decks sealed pour un set."""
    fmt_filter = ",".join(f'"{f}"' for f in SEALED_FORMATS)
    rows = supabase_get_all("trophy_decks", {
        "select": "aggregate_id,format,archetype,cardlist",
        "set_code": f"eq.{set_code}",
        "format": f"in.({fmt_filter})",
    })
    print(f"  {len(rows)} trophy decks sealed charges pour {set_code}.")
    return rows


def load_card_metadata(set_code: str) -> dict[str, dict]:
    """Charge les metadonnees de cartes (type, cmc, dependency_tags)."""
    rows = supabase_get_all("card_list", {
        "select": "card_name,card_type,card_cmc,dependency_tags,dependency_min_support,dependency_scope,oracle_text",
        "set_code": f"eq.{set_code}",
    })
    by_name: dict[str, dict] = {}
    for row in rows:
        name = row.get("card_name")
        if not name:
            continue
        by_name[name] = {
            "card_type": (row.get("card_type") or "").lower(),
            "cmc": float(row.get("card_cmc") or 0),
            "dependency_tags": row.get("dependency_tags") or [],
            "dependency_min_support": row.get("dependency_min_support"),
            "dependency_scope": (row.get("dependency_scope") or "").lower(),
            "oracle_text": (row.get("oracle_text") or "").lower(),
        }
    print(f"  {len(by_name)} cartes chargees depuis card_list.")
    return by_name


# ══════════════════════════════════════════════════════════════════════════════
# ENABLER COUNTING
# ══════════════════════════════════════════════════════════════════════════════

def _extract_subtypes(card_type: str) -> set[str]:
    """Extrait les sous-types depuis la type line (après le tiret)."""
    if "—" in card_type:
        after = card_type.split("—", 1)[1]
    elif "-" in card_type:
        after = card_type.split("-", 1)[1]
    else:
        return set()
    return {w.strip().lower() for w in after.split() if len(w.strip()) >= 2}


def count_tribal_choose_support(
    deck_cards: list[tuple[str, int]],
    meta_map: dict[str, dict],
    payoff_name: str | None = None,
) -> int:
    """
    Support pour les cartes "choose a creature type":
    meilleur bucket tribal + changelings (alignement optimizer).
    """
    type_counts: dict[str, int] = defaultdict(int)
    changeling_count = 0
    own_changeling_support = 0

    for name, qty in deck_cards:
        meta = meta_map.get(name, {})
        card_type = meta.get("card_type", "")
        if "creature" in card_type:
            for subtype in _extract_subtypes(card_type):
                type_counts[subtype] += qty

        if "changeling" in (meta.get("oracle_text") or ""):
            changeling_count += qty
            if payoff_name and name == payoff_name:
                own_changeling_support += qty

    best_tribe_count = max(type_counts.values()) if type_counts else 0
    effective_changeling = max(0, changeling_count - own_changeling_support)
    return best_tribe_count + effective_changeling


def count_enablers_for_tag(
    tag: str,
    deck_cards: list[tuple[str, int]],
    meta_map: dict[str, dict],
    payoff_name: str | None = None,
) -> int:
    """Compte les enablers d'un tag dans un deck."""
    count = 0

    if tag == "instant_sorcery":
        for name, qty in deck_cards:
            ct = meta_map.get(name, {}).get("card_type", "")
            if "instant" in ct or "sorcery" in ct:
                count += qty

    elif tag == "noncreature_spell":
        for name, qty in deck_cards:
            ct = meta_map.get(name, {}).get("card_type", "")
            if "creature" not in ct and "land" not in ct:
                count += qty

    elif tag.startswith("mv_ge_"):
        try:
            threshold = int(tag.split("_")[-1])
        except ValueError:
            return 0
        for name, qty in deck_cards:
            cmc = meta_map.get(name, {}).get("cmc", 0)
            if cmc >= threshold:
                count += qty

    elif tag == "fixer_only":
        # Pas un tag de seuil a calibrer
        return -1

    elif tag == "tribal_choose":
        return count_tribal_choose_support(deck_cards, meta_map, payoff_name=payoff_name)

    else:
        # Tag tribal: creature type cible + support changeling
        target_tag = tag.lower()
        changeling_count = 0
        own_changeling_support = 0
        for name, qty in deck_cards:
            meta = meta_map.get(name, {})
            subtypes = _extract_subtypes(meta.get("card_type", ""))
            if target_tag in subtypes:
                count += qty

            if "changeling" in (meta.get("oracle_text") or ""):
                changeling_count += qty
                if payoff_name and name == payoff_name:
                    own_changeling_support += qty

        count += max(0, changeling_count - own_changeling_support)

    return count


# ══════════════════════════════════════════════════════════════════════════════
# ANALYSIS
# ══════════════════════════════════════════════════════════════════════════════

def percentile(values: list[int | float], pct: float) -> float:
    """Percentile (interpolation linéaire)."""
    if not values:
        return 0
    s = sorted(values)
    k = (len(s) - 1) * pct / 100
    f = math.floor(k)
    c = min(f + 1, len(s) - 1)
    if f == c:
        return s[f]
    return s[f] + (k - f) * (s[c] - s[f])


def analyze(set_code: str, card_filter: str | None = None) -> dict[str, dict]:
    """
    Retourne un dict :
      tag -> {
        "samples": int,
        "p10": float, "p25": float, "median": float, "p75": float, "mean": float,
        "payoffs": { card_name: { "samples": int, "p10": ..., ... } }
      }
    """
    trophy_decks = load_trophy_decks(set_code)
    meta_map = load_card_metadata(set_code)

    if not trophy_decks:
        print("Aucun trophy deck sealed trouve.")
        return {}

    # tag -> list[int] enabler counts across all decks
    tag_global: dict[str, list[int]] = defaultdict(list)
    # (payoff_card, tag) -> list[int]
    payoff_tag: dict[tuple[str, str], list[int]] = defaultdict(list)
    # tag -> set of payoff card names
    tag_payoffs: dict[str, set[str]] = defaultdict(set)

    for deck in trophy_decks:
        cardlist = deck.get("cardlist")
        if not cardlist or not isinstance(cardlist, dict):
            continue

        deck_cards = [(name, int(qty)) for name, qty in cardlist.items()]

        # Identifier les payoffs dans ce deck
        for name, qty in deck_cards:
            if card_filter and name.lower() != card_filter.lower():
                continue
            meta = meta_map.get(name)
            if not meta:
                continue

            tags = meta.get("dependency_tags") or []
            scope = (meta.get("dependency_scope") or "").lower()

            # Cas standard: tags explicites
            if tags:
                iter_tags = tags
            # Cas "choose a creature type" sans tags explicites (ex: Gathering Stone)
            elif scope == "tribal":
                iter_tags = ["tribal_choose"]
            else:
                iter_tags = []

            if not iter_tags:
                continue

            for tag in iter_tags:
                enabler_count = count_enablers_for_tag(
                    tag,
                    deck_cards,
                    meta_map,
                    payoff_name=name,
                )
                if enabler_count < 0:
                    continue  # tag non-calibrable (fixer_only)

                tag_global[tag].append(enabler_count)
                payoff_tag[(name, tag)].append(enabler_count)
                tag_payoffs[tag].add(name)

    # Aggregation
    results: dict[str, dict] = {}
    for tag in sorted(tag_global.keys()):
        values = tag_global[tag]
        if len(values) < MIN_TROPHY_DECKS:
            continue

        tag_result = {
            "samples": len(values),
            "p10": round(percentile(values, 10), 1),
            "p25": round(percentile(values, 25), 1),
            "median": round(percentile(values, 50), 1),
            "p75": round(percentile(values, 75), 1),
            "mean": round(sum(values) / len(values), 1),
            "current_min_support": None,
            "payoffs": {},
        }

        for payoff_name in sorted(tag_payoffs[tag]):
            pv = payoff_tag[(payoff_name, tag)]
            meta = meta_map.get(payoff_name, {})
            current = meta.get("dependency_min_support")
            tag_result["current_min_support"] = current

            tag_result["payoffs"][payoff_name] = {
                "samples": len(pv),
                "p10": round(percentile(pv, 10), 1),
                "p25": round(percentile(pv, 25), 1),
                "median": round(percentile(pv, 50), 1),
                "current": current,
            }

        results[tag] = tag_result

    return results


# ══════════════════════════════════════════════════════════════════════════════
# DISPLAY
# ══════════════════════════════════════════════════════════════════════════════

def display_results(results: dict[str, dict]) -> dict[str, int]:
    """Affiche les résultats et retourne les seuils recommandés par tag."""
    recommendations: dict[str, int] = {}

    print(f"\n{'=' * 80}")
    print("CALIBRATION DES SEUILS dependency_min_support (sealed trophy decks)")
    print(f"{'=' * 80}")

    for tag, data in results.items():
        recommended = max(1, int(math.ceil(data["p25"])))
        recommendations[tag] = recommended

        print(f"\n--{tag.upper()} --({data['samples']} observations)")
        print(f"   P10={data['p10']}  P25={data['p25']}  "
              f"Median={data['median']}  P75={data['p75']}  Mean={data['mean']}")
        print(f"   Current min_support: {data['current_min_support']}")
        print(f"   => Recommande (P25 arrondi) : {recommended}")

        for payoff_name, pdata in data["payoffs"].items():
            delta = ""
            if pdata["current"] is not None and recommended != pdata["current"]:
                delta = f"  *** CHANGE {pdata['current']} => {recommended} ***"
            print(f"     {payoff_name}: "
                  f"n={pdata['samples']}  P10={pdata['p10']}  P25={pdata['p25']}  "
                  f"Med={pdata['median']}  (current={pdata['current']}){delta}")

    print(f"\n{'=' * 80}")
    print("RESUME DES RECOMMANDATIONS")
    print(f"{'=' * 80}")
    for tag, rec in sorted(recommendations.items()):
        current = results[tag].get("current_min_support")
        marker = " <== CHANGE" if current is not None and current != rec else ""
        print(f"  {tag:25s} : {rec:3d}  (current={current}){marker}")

    return recommendations


# ══════════════════════════════════════════════════════════════════════════════
# UPDATE BDD
# ══════════════════════════════════════════════════════════════════════════════

def update_thresholds(
    set_code: str,
    results: dict[str, dict],
    recommendations: dict[str, int],
) -> None:
    """Met a jour dependency_min_support dans card_list pour les cartes impactees.

    Pour les cartes multi-tags (ex: Maralen = elf + faerie), on prend le MIN
    des seuils recommandes car l'optimizer utilise Math.max(supports) : la carte
    est viable des qu'un seul tag est suffisamment supporte.
    """
    # Dedup: card_name -> min recommended threshold across all its tags
    card_best: dict[str, int] = {}
    card_current: dict[str, int | None] = {}

    for tag, data in results.items():
        new_min = recommendations.get(tag)
        if new_min is None:
            continue
        for payoff_name, pdata in data["payoffs"].items():
            if payoff_name not in card_best or new_min < card_best[payoff_name]:
                card_best[payoff_name] = new_min
            card_current[payoff_name] = pdata.get("current")

    updates: list[dict] = []
    for card_name, new_min in card_best.items():
        current = card_current.get(card_name)
        if current == new_min:
            continue
        updates.append({
            "card_name": card_name,
            "set_code": set_code,
            "dependency_min_support": new_min,
        })

    if not updates:
        print("\nAucune mise a jour necessaire — tous les seuils sont deja corrects.")
        return

    print(f"\nMise a jour de {len(updates)} cartes...")
    url = f"{SUPABASE_URL}/rest/v1/card_list?on_conflict=card_name,set_code"
    batch_size = 200
    for i in range(0, len(updates), batch_size):
        chunk = updates[i:i + batch_size]
        resp = requests.post(url, json=chunk, headers=HEADERS_UPSERT)
        if resp.status_code >= 400:
            print(f"  Erreur batch {i // batch_size + 1}: {resp.text[:200]}")
        else:
            print(f"  Batch {i // batch_size + 1} OK ({len(chunk)} cartes)")

    print("Mise a jour terminee.")


# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Calibre dependency_min_support depuis les trophy decks sealed."
    )
    parser.add_argument("--set", default="ECL", help="Set code (default: ECL)")
    parser.add_argument("--card", default=None, help="Filtrer sur une seule carte payoff (ex: 'Maralen, Fae Ascendant')")
    parser.add_argument(
        "--update",
        action="store_true",
        help="Ecrire les seuils calibres en BDD (sans ce flag = dry run)",
    )
    args = parser.parse_args()

    set_code = args.set.upper()
    label = f"{set_code} / {args.card}" if args.card else set_code
    print(f"Calibration des seuils pour {label} (sealed trophy decks)\n")

    results = analyze(set_code, card_filter=args.card)
    if not results:
        print("Pas assez de donnees pour calibrer.")
        sys.exit(0)

    recommendations = display_results(results)

    if args.update:
        print("\n>>> MODE UPDATE : ecriture en BDD <<<")
        update_thresholds(set_code, results, recommendations)
    else:
        print("\n(Dry run — ajouter --update pour ecrire en BDD)")
