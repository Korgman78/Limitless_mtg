"""
LLM-driven tag correction for SOS (Secrets of Strixhaven).
Run after enrich_card_tags.py to fix false positives, add missing mechanics,
and calibrate thresholds based on set-specific analysis.

Corrections cover:
  1. False positive dependency removals (8 cards)
  2. False positive dependency fixes (1 card)
  3. New LIFEGAIN dependency tags — Infusion mechanic (17 cards)
  4. New CONVERGE dependency tags (9 cards)
  5. New GRAVEYARD_LEAVES dependency tags — Lorehold RW archetype (9 cards)
  6. Missed INSTANT_SORCERY tags (13 cards)
  7. Removal tag corrections (6 cards)
  8-10. Support tags — what cards PROVIDE (lifegain, graveyard_leaves, converge)
"""

import requests
import os
import sys
import time
from dotenv import load_dotenv
from pathlib import Path

# --- ENV ---
current_dir = Path(__file__).parent
root_dir = current_dir.parent
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

SET = "SOS"

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
#    Cards incorrectly tagged by regex-based detection.
# ======================================================================

false_positive_removals = [
    # Brush Off: counterspell that costs less vs spells — it doesn't NEED
    # spell density in YOUR deck. It's interaction, not a payoff.
    dep("Brush Off", []),

    # Burrog Barrage: fight/bite spell with a tiny +1/+0 conditional.
    # Perfectly playable without spell synergy. Not a spells-matter card.
    dep("Burrog Barrage", []),

    # Emil, Vastlands Roamer: "number of differently named lands" was
    # captured as tribal dep "differently" — clearly a regex artefact.
    dep("Emil, Vastlands Roamer", []),

    # Improvisation Capstone: "total mana value 4 or greater" was read as
    # mv_ge_4 — but the card exiles until CUMULATIVE MV >= 4, works fine
    # with any curve. No real high-MV dependency.
    dep("Improvisation Capstone", []),

    # Killian's Confidence: "one or more creatures" matched "more" as a
    # tribal type. Pure regex noise.
    dep("Killian's Confidence", []),

    # Ral Zarek, Guest Lecturer: "coin" captured from the -7 ultimate.
    # Not build-around, never drives deck construction.
    dep("Ral Zarek, Guest Lecturer", []),

    # Skycoach Conductor: "non-Pilot creature" was read as Pilot dependency.
    # The card targets NON-Pilots (flicker effect). No Pilot needed.
    dep("Skycoach Conductor // All Aboard", []),

    # Slumbering Trudge: enters WITH stun counters (a downside you want to
    # minimize). Not a stun-counter synergy card.
    dep("Slumbering Trudge", []),
]

# ======================================================================
# 2. FALSE POSITIVE DEPENDENCY FIX
#    Cards with partially correct tags that need cleanup.
# ======================================================================

false_positive_fixes = [
    # Diary of Dreams: "for each page counter" matched "page" as tribal.
    # The card counts its OWN page counters — no external page support
    # needed. Keep instant_sorcery (correct), remove page.
    dep("Diary of Dreams", ["instant_sorcery"], 7, "tribal"),
]

# ======================================================================
# 3. LIFEGAIN DEPENDENCY — Infusion mechanic + lifegain-matters
#    BG Witherbloom archetype. "If you gained life this turn" or
#    "whenever you gain life" payoffs.
#
#    Thresholds:
#      min=4 : Infusion (conditional bonus, easy to enable with 3-4
#              incidental sources — Pests, ETB lifegain, etc.)
#      min=5 : "Whenever you gain life" triggered abilities (want
#              repeated/consistent triggers each turn)
# ======================================================================

lifegain_deps = [
    # --- Infusion cards (min=4) ---
    dep("Efflorescence",        ["lifegain"], 4, "tribal"),
    dep("Follow the Lumarets",  ["lifegain"], 4, "tribal"),
    dep("Foolish Fate",         ["lifegain"], 4, "tribal"),
    dep("Lumaret's Favor",      ["lifegain"], 4, "tribal"),
    dep("Old-Growth Educator",  ["lifegain"], 4, "tribal"),
    dep("Poisoner's Apprentice",["lifegain"], 4, "tribal"),
    dep("Tenured Concocter",    ["lifegain"], 4, "tribal"),
    dep("Tragedy Feaster",      ["lifegain"], 4, "tribal"),
    dep("Ulna Alley Shopkeep",  ["lifegain"], 4, "tribal"),
    dep("Withering Curse",      ["lifegain"], 4, "tribal"),

    # Scheming Silvertongue: "if you gained 2+ life" → becomes prepared.
    dep("Scheming Silvertongue // Sign in Blood", ["lifegain"], 4, "tribal"),

    # --- Infusion lord-like effects (min=5) ---
    # Thornfist Striker: "creatures you control get +1/+0 and trample
    # as long as you gained life" — persistent lord, needs reliable trigger.
    dep("Thornfist Striker",    ["lifegain"], 5, "tribal"),

    # Moseo: returns creature from GY if gained life — powerful payoff.
    dep("Moseo, Vein's New Dean", ["lifegain"], 5, "tribal"),

    # --- "Whenever you gain life" triggered payoffs (min=5) ---
    dep("Blech, Loafing Pest",  ["lifegain"], 5, "tribal"),
    dep("Comforting Counsel",   ["lifegain"], 5, "tribal"),
    dep("Pest Mascot",          ["lifegain"], 5, "tribal"),

    # Leech Collector: "first time each turn you gain life" → prepared.
    dep("Leech Collector // Bloodletting", ["lifegain"], 5, "tribal"),
]

# ======================================================================
# 4. CONVERGE DEPENDENCY — color fixing matters
#    "X = number of colors of mana spent." These cards scale from weak
#    (X=2 in 2-color deck) to strong (X=3+ with fixing).
#
#    min=3 : need ~3 fixing sources to reliably cast with 3 colors.
# ======================================================================

converge_deps = [
    dep("Arcane Omens",          ["converge"], 3, "tribal"),
    dep("Archaic's Agony",       ["converge"], 3, "tribal"),
    dep("Rancorous Archaic",     ["converge"], 3, "tribal"),
    dep("Snarl Song",            ["converge"], 3, "tribal"),
    dep("Sundering Archaic",     ["converge"], 3, "tribal"),
    dep("Together as One",       ["converge"], 3, "tribal"),
    dep("Transcendent Archaic",  ["converge"], 3, "tribal"),
    dep("Wildgrowth Archaic",    ["converge"], 3, "tribal"),

    # Magmablood Archaic: Converge + spells-matter (keep both).
    dep("Magmablood Archaic",    ["converge", "instant_sorcery"], 7, "tribal"),
]

# ======================================================================
# 5. GRAVEYARD_LEAVES DEPENDENCY — Lorehold RW archetype
#    "Whenever one or more cards leave your graveyard" payoffs.
#    Enabled by: Flashback (9 cards in set), graveyard exile effects
#    (Rubble Rouser, Startled Relic Sloth, Postmortem Professor, etc.)
#
#    Thresholds:
#      min=5 : strong triggered payoffs (token creation, counters, draw)
#      min=4 : milder payoffs (gets +1/+1 until EOT, mild bonus)
#      min=3 : very mild (cost reduction)
# ======================================================================

graveyard_leaves_deps = [
    # Strong payoffs — need consistent enablers
    dep("Ark of Hunger",         ["graveyard_leaves"], 5, "tribal"),
    dep("Garrison Excavator",    ["graveyard_leaves"], 5, "tribal"),
    dep("Hardened Academic",     ["graveyard_leaves"], 5, "tribal"),
    dep("Primary Research",      ["graveyard_leaves"], 5, "tribal"),

    # Moderate payoffs
    dep("Kirol, History Buff // Pack a Punch", ["graveyard_leaves"], 5, "tribal"),
    dep("Spirit Mascot",         ["graveyard_leaves"], 5, "tribal"),
    dep("Living History",        ["graveyard_leaves"], 4, "tribal"),
    dep("Owlin Historian",       ["graveyard_leaves"], 4, "tribal"),

    # Mild — cost reduction only
    dep("Wilt in the Heat",      ["graveyard_leaves"], 3, "tribal"),
]

# ======================================================================
# 6. MISSED INSTANT_SORCERY TAGS
#    The regex only matches "instant or sorcery spell" but many cards
#    use "instant and sorcery" phrasing (with "and" instead of "or")
#    or reference "instant or sorcery card" (not "spell").
#
#    Thresholds:
#      min=7 : build-around that scales with spell count
#      min=6 : strong payoff, wants many spells
#      min=5 : moderate scaling with spell count
#      min=4 : needs some spells in deck/GY but mild dependency
#      min=3 : bomb that slightly benefits from spells (always play)
# ======================================================================

missed_spells_deps = [
    # The Dawning Archaic: cost reduction per spell in GY + casts from GY.
    # Very spell-dependent: useless in creature-heavy decks.
    dep("The Dawning Archaic",   ["instant_sorcery"], 7, "tribal"),

    # Resonating Lute: lands tap for 2 mana, spells only. Dead without spells.
    dep("Resonating Lute",       ["instant_sorcery"], 6, "tribal"),

    # Wisdom of Ages: return ALL spells from GY. Highly spell-dependent.
    dep("Wisdom of Ages",        ["instant_sorcery"], 6, "tribal"),

    # Steal the Show: damage = number of spells in GY. Scales hard.
    dep("Steal the Show",        ["instant_sorcery"], 5, "tribal"),

    # Abstract Paintmage: adds UR for spells only. IS the support but
    # also needs spells to spend the mana on.
    dep("Abstract Paintmage",    ["instant_sorcery"], 4, "tribal"),

    # Tablet of Discovery: adds RR for spells only.
    dep("Tablet of Discovery",   ["instant_sorcery"], 4, "tribal"),

    # Divergent Equation: return X spells from GY. Needs spells in GY.
    dep("Divergent Equation",    ["instant_sorcery"], 4, "tribal"),

    # Postmortem Professor: exile spell from GY to recur. Mild dep.
    dep("Postmortem Professor",  ["instant_sorcery"], 4, "tribal"),

    # Flashback (the card): give a spell in GY flashback. Needs target.
    dep("Flashback",             ["instant_sorcery"], 4, "tribal"),

    # Zealous Lorecaster: return spell from GY. Needs spell in GY.
    dep("Zealous Lorecaster",    ["instant_sorcery"], 4, "tribal"),

    # --- Elder Dragons: bombs you always play, slight spell bonus ---
    # Silverquill: casualty 1 on spells. 6/6 flyer regardless.
    dep("Silverquill, the Disputant", ["instant_sorcery"], 3, "tribal"),

    # Lorehold: miracle on spells. 5/5 flyer haste regardless.
    dep("Lorehold, the Historian",    ["instant_sorcery"], 3, "tribal"),

    # Quandrix: cascade on spells. 7/7 flyer trample regardless.
    dep("Quandrix, the Proof",        ["instant_sorcery"], 4, "tribal"),
]

# ======================================================================
# 7. REMOVAL TAG CORRECTIONS
# ======================================================================

removal_corrections = [
    # --- False positive: remove ---
    # Daydream: "exile target creature you control, then return it."
    # This is a flicker/protection spell targeting YOUR creature.
    removal("Daydream", False),

    # --- False negatives: add ---
    # End of the Hunt: "Target opponent exiles a creature or planeswalker
    # they control with the greatest mana value." Hard removal.
    removal("End of the Hunt", True),

    # Run Behind: "Target creature's owner puts it on top or bottom of
    # their library." Library tuck = hard removal.
    removal("Run Behind", True),

    # Splatter Technique: "deals 4 damage to each creature and
    # planeswalker" mode. Board wipe.
    removal("Splatter Technique", True),

    # Proctor's Gaze: "Return up to one target nonland permanent to its
    # owner's hand." Bounce = removal. Missed by regex ("up to one"
    # between "return" and "target").
    removal("Proctor's Gaze", True),

    # Matterbending Mage: "return up to one other target creature to its
    # owner's hand." Same regex gap.
    removal("Matterbending Mage", True),
]

# ======================================================================
# 8. SUPPORT TAGS — what cards PROVIDE to the deck
#    These complement the regex-detected support_tags from enrich_card_tags.
#    The regex catches lifelink, "you gain X life", flashback, multicolored,
#    and "any color" mana. Below we add cards the regex misses.
# ======================================================================

lifegain_support = [
    # --- ETB / triggered lifegain (not caught by regex patterns) ---
    sup("Adventurous Eater",         ["lifegain"]),  # prepare: gain 1
    sup("Arnyn, Bane of the Hive",   ["lifegain"]),  # small creature dies: drain 2
    sup("Cauldron of Essence",       ["lifegain"]),  # creature dies: gain 1
    sup("Root Manipulation",         ["lifegain"]),  # attack: gain 1
    sup("Infirmary Healer",          ["lifegain"]),  # prepare: gain X
    sup("Potioner's Trove",          ["lifegain"]),  # conditional gain 2
    # --- Pest token producers (Pests have "dies: gain 1 life") ---
    sup("Essenceknit Scholar",       ["lifegain"]),
    sup("Lluwen, Foul Propagator",   ["lifegain"]),
    sup("Moseo, Vein's New Dean",    ["lifegain"]),
    sup("Pestbrood Sloth",           ["lifegain"]),
    sup("Send in the Pest",          ["lifegain"]),
    # --- Cards with conditional lifelink or drain ---
    sup("Inkshape Demonstrator",     ["lifegain"]),  # repartee: lifelink
    sup("Melancholic Poet",          ["lifegain"]),  # repartee: drain 1
    sup("Professor Dellian Fel",     ["lifegain"]),  # +2: gain 3
]

graveyard_leaves_support = [
    # --- Cards that exile or return from your GY (not flashback) ---
    sup("Rubble Rouser",             ["graveyard_leaves"]),  # exile from GY for mana
    sup("Postmortem Professor",      ["graveyard_leaves"]),  # exile spell from GY
    sup("Practiced Scrollsmith",     ["graveyard_leaves"]),  # exile card from GY
    sup("Startled Relic Sloth",      ["graveyard_leaves"]),  # exile card from GY
    sup("Ascendant Dustspeaker",     ["graveyard_leaves"]),  # exile card from GY
    sup("Soaring Stoneglider",       ["graveyard_leaves"]),  # exile 2 from GY as alt cost
    sup("Heated Argument",           ["graveyard_leaves"]),  # may exile from GY
    sup("Lorehold Charm",            ["graveyard_leaves"]),  # return from GY
    sup("Cheerful Osteomancer",      ["graveyard_leaves"]),  # return from GY
    sup("Stone Docent",              ["graveyard_leaves"]),  # exile from GY
]

converge_support = [
    # --- Mana fixers that help cast converge spells with 3+ colors ---
    # (Cards that produce "any color" already caught by regex.)
    sup("Goblin Glasswright",        ["converge"]),  # treasure = any color
    sup("Hydro-Channeler",           ["converge"]),  # adds any color
    sup("Berta, Foul Alchemist",     ["converge"]),  # treasure maker
    sup("Seize the Spoils",          ["converge"]),  # treasure maker
    sup("Strixhaven Skycoach",       ["converge"]),  # adds WU
    sup("Environmental Scientist",   ["converge"]),  # fetches basic
    sup("Great Hall of Strixhaven",  ["converge"]),  # any-color land
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
    upsert_batch(false_positive_fixes,       "2. Faux positifs corriges")
    upsert_batch(lifegain_deps,              "3. Lifegain (Infusion)")
    upsert_batch(converge_deps,              "4. Converge")
    upsert_batch(graveyard_leaves_deps,      "5. Graveyard leaves (Lorehold)")
    upsert_batch(missed_spells_deps,         "6. Instant/sorcery manques")
    upsert_batch(removal_corrections,        "7. Removal corrections")
    upsert_batch(lifegain_support,           "8. Support: lifegain")
    upsert_batch(graveyard_leaves_support,   "9. Support: graveyard_leaves")
    upsert_batch(converge_support,           "10. Support: converge")

    n = (len(false_positive_removals) + len(false_positive_fixes)
         + len(lifegain_deps) + len(converge_deps)
         + len(graveyard_leaves_deps) + len(missed_spells_deps)
         + len(removal_corrections)
         + len(lifegain_support) + len(graveyard_leaves_support)
         + len(converge_support))

    print(f"\nTotal: {n} corrections en {round(time.time() - start, 2)}s")
