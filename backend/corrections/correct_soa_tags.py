"""
LLM-driven tag correction for SOA (Mystical Archives — SOS bonus sheet).
Run after enrich_card_tags.py to fix false positives, add missing tags,
and align with SOS archetypes (lifegain, converge, graveyard_leaves, instant_sorcery).

Corrections cover:
  1. False positive dependency removals (7 cards)
  2. Removal tag corrections (4 cards)
  3. Converge dependency tags (2 cards)
  4. Support tags — graveyard_leaves (2 cards)
"""

import requests
import os
import sys
import time
from dotenv import load_dotenv
from pathlib import Path

# --- ENV ---
current_dir = Path(__file__).parent
root_dir = current_dir.parent.parent
load_dotenv(dotenv_path=root_dir / '.env')

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY") or os.getenv("VITE_SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERREUR: Variables d'environnement manquantes.")
    sys.exit(1)

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}

SET = "SOS"  # bonus sheet cards are stored under parent set_code

# ======================================================================
# HELPERS
# ======================================================================

def dep(card_name, tags, min_support=None, scope=None):
    """Dependency-only correction."""
    return {
        "card_name": card_name,
        "set_code": SET,
        "dependency_tags": sorted(tags) if tags else [],
        "dependency_min_support": min_support,
        "dependency_scope": scope,
    }

def removal(card_name, is_removal):
    """Removal-only correction."""
    return {
        "card_name": card_name,
        "set_code": SET,
        "is_removal": is_removal,
    }

def sup(card_name, tags):
    """Support-tags-only correction (what the card PROVIDES)."""
    return {
        "card_name": card_name,
        "set_code": SET,
        "support_tags": sorted(tags) if tags else [],
    }

# ======================================================================
# 1. FALSE POSITIVE DEPENDENCY REMOVALS
#    All 7 cards are incorrectly tagged by regex in a limited context.
#    - "commander" tags: no commanders in draft/sealed
#    - "time"/"cast": regex noise from unrelated oracle text
#    - counterspell targets: the card targets OPPONENTS' spells,
#      it doesn't need those card types in YOUR deck
# ======================================================================

false_positive_removals = [
    # Ad Nauseam: "any number of times" → "time" captured as tribal type.
    dep("Ad Nauseam", []),

    # Akroma's Will: "if you control a commander" → no commanders in limited.
    dep("Akroma's Will", []),

    # Angel's Grace: split second text ("can't cast spells") triggered
    # regex for "cast" dependency. Pure protection spell, no dep.
    dep("Angel's Grace", []),

    # Disdainful Stroke: counterspell targeting MV4+ spells. Doesn't need
    # high-MV cards in YOUR deck — it's interaction, not a payoff.
    dep("Disdainful Stroke", []),

    # Flusterstorm: counter target instant/sorcery + storm. Narrow counter
    # for opponents' spells. Storm is irrelevant in limited.
    dep("Flusterstorm", []),

    # Jeska's Will: "if you control a commander" → no commanders in limited.
    dep("Jeska's Will", []),

    # Spell Pierce: counter target noncreature spell. Targets opponents'
    # spells, not a payoff for noncreatures in YOUR deck.
    dep("Spell Pierce", []),
]

# ======================================================================
# 2. REMOVAL TAG CORRECTIONS
#    Align with SOS removal definition: cards that deal with creatures
#    or permanents on the battlefield.
# ======================================================================

removal_corrections = [
    # --- False positives: remove ---
    # Armageddon: "Destroy all lands." Matched by "destroy all" regex.
    # Land destruction is strategic, not creature/threat removal.
    removal("Armageddon", False),

    # Reprieve: "Return target spell to its owner's hand." Bounces from
    # the STACK, not the battlefield. Tempo play, not removal.
    removal("Reprieve", False),

    # --- False negatives: add ---
    # Crackle with Power: "deals five times X damage to each of up to X
    # targets." Flexible heavy burn. Clear removal.
    removal("Crackle with Power", True),

    # Knockout Maneuver: "it deals damage equal to its power to target
    # creature an opponent controls." Bite effect = removal.
    removal("Knockout Maneuver", True),
]

# ======================================================================
# 3. CONVERGE DEPENDENCY TAGS
#    Cards that scale with number of colors of mana spent, consistent
#    with the SOS converge archetype (Archaics, etc.) at min=3.
# ======================================================================

converge_deps = [
    # Bring to Light: "search for card with MV X or less, where X is the
    # number of colors of mana spent." Pure converge payoff.
    dep("Bring to Light", ["converge"], 3, "tribal"),

    # Prismatic Ending: "exile target nonland permanent with MV X or less,
    # where X is number of colors of mana spent." Converge removal.
    dep("Prismatic Ending", ["converge"], 3, "tribal"),
]

# ======================================================================
# 4. SUPPORT TAGS — graveyard_leaves
#    Cards that return/exile from your graveyard, enabling the SOS
#    Lorehold RW "whenever cards leave your graveyard" payoffs.
# ======================================================================

graveyard_leaves_support = [
    # Helping Hand: return creature from GY to battlefield.
    sup("Helping Hand", ["graveyard_leaves"]),

    # Return to the Ranks: return X creatures from GY to battlefield.
    sup("Return to the Ranks", ["graveyard_leaves"]),
]

# ======================================================================
# APPLY
# ======================================================================

def upsert_batch(corrections, label):
    if not corrections:
        return
    url = f"{SUPABASE_URL}/rest/v1/card_list?on_conflict=card_name,set_code"
    batch_size = 50
    total = 0
    for i in range(0, len(corrections), batch_size):
        chunk = corrections[i:i + batch_size]
        resp = requests.post(url, json=chunk, headers=HEADERS)
        if resp.status_code >= 400:
            print(f"  ERREUR batch {i // batch_size + 1}: {resp.text}")
        else:
            total += len(chunk)
    print(f"  {label}: {total} cartes mises a jour")

if __name__ == "__main__":
    print(f"Correction LLM des tags pour {SET}")
    print("=" * 60)
    start = time.time()

    upsert_batch(false_positive_removals,   "1. Faux positifs supprimes")
    upsert_batch(removal_corrections,        "2. Removal corrections")
    upsert_batch(converge_deps,              "3. Converge")
    upsert_batch(graveyard_leaves_support,   "4. Support: graveyard_leaves")

    n = (len(false_positive_removals) + len(removal_corrections)
         + len(converge_deps) + len(graveyard_leaves_support))

    print(f"\nTotal: {n} corrections en {round(time.time() - start, 2)}s")
