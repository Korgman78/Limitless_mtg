"""
LLM-driven tag correction for TRK (Star Trek).
Run after enrich_card_tags.py to fix false positives, encode the set's own
mechanics, and set thresholds (a recalibrer apres la sortie, cf. SET_ONBOARDING).

Mecaniques de TRK que le detecteur generique ne sait pas lire :
  - `Strange new worlds` — la carte scale avec « the number of differently
    named lands you control » (13 cartes). Les basiques d'un deck bicolore ne
    donnent que 2 noms : le vrai levier, ce sont les terrains non-basiques
    (10 Planetes communes, 5 Anomalies, 10 shocklands, terrains rares...) et
    les jetons « New Planet ».
  - `dilemma` — « you face a dilemma as you choose one or more modes for a
    spell or ability ». Payoffs : Seven of Nine, Elim Garak, Melkotian
    Adjudicator... Enablers : tout ce qui est modal (41 cartes).
  - `Federation` — scale avec « creature types among non-Borg creatures you
    control ». Diversite de types, pas un tribal : pas de dependance.
  - « Whenever you attack while creatures you control have total power 8 or
    greater » — condition de board, pas de deck.
  - Station / Spacecraft, Beam me up, Landfall : pas de dependance a encoder.

Le detecteur a produit des tags parasites : 'differently' (Strange new
worlds), 'while' (puissance totale 8), 'borg' (« non-Borg creatures »),
'time' (« the number of times »), 'modal'.

Corrections couvertes :
  1. Faux positifs dependency (regex) — 20 cartes
  2. Dependances STRANGE NEW WORLDS — 13 cartes (7 dependances, 6 effacees)
  3. Dependances DILEMMA — 8 cartes
  4. Corrections is_removal — 15 cartes
  5. Support : strange_new_worlds (terrains non-basiques, New Planet) — 43 cartes
  6. Support : dilemma (cartes modales) — 40 cartes
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

SET = "TRK"

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
    """
    Support-tags correction (ce que la carte FOURNIT), FUSIONNEE avec les tags
    deja poses par enrich_card_tags (multicolored / lifegain / land_search...).
    """
    return {"card_name": card_name, "set_code": SET, "_add_tags": list(tags)}


def resolve_support(corrections):
    """Remplace les _add_tags par la fusion (existant + ajout)."""
    if not corrections:
        return []
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/card_list",
        params={"select": "card_name,support_tags", "set_code": f"eq.{SET}", "limit": "500"},
        headers=HEADERS,
    )
    resp.raise_for_status()
    current = {r["card_name"]: (r.get("support_tags") or []) for r in resp.json()}

    merged_by_name = {}
    unknown = []
    for c in corrections:
        name = c["card_name"]
        if name not in current:
            unknown.append(name)
            continue
        base = merged_by_name.get(name, set(current[name]))
        merged_by_name[name] = base | set(c["_add_tags"])
    if unknown:
        print(f"  ATTENTION: {len(unknown)} carte(s) introuvable(s) en base: {unknown}")
    return [
        {"card_name": name, "set_code": SET, "support_tags": sorted(tags)}
        for name, tags in merged_by_name.items()
    ]


# ======================================================================
# 1. FAUX POSITIFS DEPENDENCY
#    Tags produits par les regex generiques sur des tournures de phrase.
# ======================================================================

false_positive_removals = [
    # « Whenever you attack while creatures you control have total power 8 or
    # greater » -> 'while'. Condition de board (on attaque large), pas un
    # besoin de construction de deck.
    dep("Hologram Janeway", []),
    dep("Kirk, Commanding Officer", []),
    dep("La'An Noonien-Singh, Security", []),
    dep("Tactical Officer", []),
    dep("Una Chin-Riley, Number One", []),
    dep("Worf, Honor-Bound Warrior", []),

    # Federation — « creature types among non-Borg creatures you control » ->
    # 'borg'. Ca recompense la DIVERSITE de types (le set en a des dizaines),
    # l'exact inverse d'un tribal Borg. Aucune dependance encodable.
    dep("Captain Jonathan Archer", []),
    dep("Hoshi Sato, Exolinguist", []),
    dep("Infinite Diversity", []),
    dep("Saavik, Stoic Student", []),
    dep("Sarek, Federation Ambassador", []),
    dep("Starfleet Academy", []),

    # Officers / equipements / tresors que la carte fabrique elle-meme :
    # Academy Instructor cree ses Officers (on garde noncreature_spell, qui est
    # son vrai declencheur), Gwyndala cree son Equipment, Zek ses Treasures.
    dep("Academy Instructor", ["noncreature_spell"], 7, "tribal"),
    dep("Gwyndala, the Progeny", []),
    dep("Grand Nagus Zek", []),
    # Picard : l'anthem +1/+1 porte la carte, les Officers sont un bonus.
    dep("Captain Jean-Luc Picard", []),

    # Bonus mineur sur une carte qui vaut deja son cout :
    # Rutherford (ETB qui cherche un artefact), H.M.S. Bounty (tutor de Whale
    # optionnel, le vaisseau se suffit), Emergency Holographic Crew et Stray
    # from History (modales : l'autre mode — surveil 2 / discard — est toujours
    # jouable).
    dep("Rutherford, Upgraded Ensign", []),
    dep("H.M.S. Bounty, Unlikely Timeship", []),
    dep("Emergency Holographic Crew", []),
    dep("Stray from History", []),

    # Starfleet Spanner Jockey / Tal Shiar Analyst / Cetacean Ops : le tag
    # noncreature_spell est correct, on le laisse tel quel (pas de ligne ici).
]

# ======================================================================
# 2. STRANGE NEW WORLDS
#    X = nombre de terrains de noms differents. Avec seulement des basiques,
#    X = 2 dans un deck bicolore. Le support compte les terrains NON-basiques
#    et les sources de « New Planet » (section 5) : min_support=2 veut dire
#    « au moins 2 noms en plus des basiques », soit X >= 4.
#
#    Dependance seulement si la carte est mauvaise a X = 2. Les cartes qui ont
#    une capacite de base correcte sans gros X sont effacees.
# ======================================================================

snw_deps = [
    # P/T ou puissance = X : 2/2 pour 3 / 2/x pour 2 sans support.
    dep("Captain Pike, Fullness of Time", ["strange_new_worlds"], 2, "tribal"),
    dep("The Traveler",                   ["strange_new_worlds"], 2, "tribal"),
    # Cartes cheres dont toute la valeur est X.
    dep("Branching Timeline",             ["strange_new_worlds"], 3, "tribal"),
    dep("Deep Space Scan",                ["strange_new_worlds"], 3, "tribal"),
    dep("Cloak and Phaser",               ["strange_new_worlds"], 2, "tribal"),  # {8}{U} - X
    dep("Excalbian Gamemaster",           ["strange_new_worlds"], 2, "tribal"),  # 6 mana, X Officers
    dep("Ensign Pavel Chekov",            ["strange_new_worlds"], 2, "tribal"),

    # Valeur de base suffisante a X = 2 : pas de dependance.
    dep("Astute Terraformer", []),          # 2 mana, pompe optionnelle
    dep("Suus Mahna Practitioner", []),     # tapper, juste plus cher
    dep("Species 8472", []),                # 6 mana evasif, le gain de vie est un bonus
    dep("Warp Speed", []),                  # tutor de terrain + lands untapped
    dep("Pah-Wraith", []),                  # 7 mana first strike haste
    dep("The Destruction of Praxis", []),   # -2/-2 global reste un sweeper
]

# ======================================================================
# 3. DILEMMA
#    « Whenever you face a dilemma » = a chaque choix de mode. Le set en
#    fournit 41 (section 6), mais un deck Sealed n'en joue que quelques-uns.
#    Seuil provisoire de 4, a recalibrer sur les trophy decks.
#    Pas de dependance pour Tell Me What You See et Gabriel Lorca : le
#    declencheur n'y est qu'un retour en main optionnel.
# ======================================================================

dilemma_deps = [
    dep("Seven of Nine",                  ["dilemma"], 4, "tribal"),
    dep("Elim Garak, Simple Tailor",      ["dilemma"], 4, "tribal"),
    dep("Melkotian Adjudicator",          ["dilemma"], 4, "tribal"),
    dep("Obsidian Order Operative",       ["dilemma"], 4, "tribal"),
    dep("Jett Reno, Problem Solver",      ["dilemma"], 4, "tribal"),
    dep("The Caretaker",                  ["dilemma"], 4, "tribal"),
    # Sisko : ses Officers ne viennent que des dilemmes ('officer' parasite).
    dep("Captain Benjamin Sisko",         ["dilemma"], 4, "tribal"),
    # Riku : « modal spell » ('modal', 'time' parasites). Build-around.
    dep("Riku of Many Paths",             ["dilemma"], 5, "tribal"),
]

# ======================================================================
# 4. REMOVAL
#    Convention des sets precedents : removal = gere une CREATURE adverse
#    (degats, destruction, exil, -X/-X, vol, bounce, aura de neutralisation).
#    Pas les tappers/stun ponctuels, ni le removal d'artefact/enchantement seul.
# ======================================================================

removal_corrections = [
    # --- Faux positifs ---
    removal("Infinite Diversity", False),       # exile un sort de NOTRE cimetiere pour le copier
    removal("Kirk, Commanding Officer", False), # artefact/enchantement seulement
    removal("Blastoneuron", False),             # exile une carte de NOTRE cimetiere
    removal("Munitions Enthusiast", False),     # 1 degat a la mort
    removal("Tea, Earl Grey, Hot", False),      # 2 degats a l'adversaire, pas une creature
    removal("Test of Priorities", False),       # blink de notre propre creature
    removal("The Unicomplex", False),           # cible NOTRE cimetiere
    removal("Empress Galina", False),           # ne vole que des permanents legendaires

    # --- Manques du detecteur ---
    removal("Khaaaaaaaaaaaannn!", True),        # « deals twice X damage to target creature »
    removal("The Destruction of Praxis", True), # -X/-X global
    removal("Encounter the Unknown", True),     # mode 2 degats a chaque creature
    removal("D'Ghor Bloodletter", True),        # edict / -1/-1 global
    removal("Saavik, Stoic Student", True),     # flash, X degats a un attaquant/bloqueur
    removal("De-evolve", True),                 # -4/-0, ne bloque plus, exil a threshold
    removal("Marooned", True),                  # aura « doesn't untap » (paye {3} pour taper)
]

# ======================================================================
# 5. SUPPORT : STRANGE NEW WORLDS
#    Chaque terrain non-basique a un nom unique dans le set. On y ajoute les
#    cartes qui creent un jeton « New Planet » (nom distinct de tout le reste)
#    et les tuteurs de Planete. Les recherches de basique ne comptent pas.
# ======================================================================

snw_support = [
    # Planetes communes (bicolores, entrent engagees)
    sup("Andoria",                         ["strange_new_worlds"]),
    sup("Bajor",                           ["strange_new_worlds"]),
    sup("Cardassia Prime",                 ["strange_new_worlds"]),
    sup("Earth, Sector 001",               ["strange_new_worlds"]),
    sup("Ferenginar",                      ["strange_new_worlds"]),
    sup("Orion",                           ["strange_new_worlds"]),
    sup("Qo'noS",                          ["strange_new_worlds"]),
    sup("Risa",                            ["strange_new_worlds"]),
    sup("Romulus",                         ["strange_new_worlds"]),
    sup("Vulcan",                          ["strange_new_worlds"]),
    # Anomalies (incolores, se sacrifient en laissant une New Planet)
    sup("Artificial Anomaly",              ["strange_new_worlds"]),
    sup("Gaseous Anomaly",                 ["strange_new_worlds"]),
    sup("Spatial Anomaly",                 ["strange_new_worlds"]),
    sup("Subspace Anomaly",                ["strange_new_worlds"]),
    sup("Temporal Anomaly",                ["strange_new_worlds"]),
    # Shocklands
    sup("Blood Crypt",                     ["strange_new_worlds"]),
    sup("Breeding Pool",                   ["strange_new_worlds"]),
    sup("Godless Shrine",                  ["strange_new_worlds"]),
    sup("Hallowed Fountain",               ["strange_new_worlds"]),
    sup("Overgrown Tomb",                  ["strange_new_worlds"]),
    sup("Sacred Foundry",                  ["strange_new_worlds"]),
    sup("Steam Vents",                     ["strange_new_worlds"]),
    sup("Stomping Ground",                 ["strange_new_worlds"]),
    sup("Temple Garden",                   ["strange_new_worlds"]),
    sup("Watery Grave",                    ["strange_new_worlds"]),
    # Terrains rares « enters tapped unless you control two or more other lands »
    sup("Federation Outpost",              ["strange_new_worlds"]),
    sup("Ni'Var Science Academy",          ["strange_new_worlds"]),
    sup("Q Continuum",                     ["strange_new_worlds"]),
    sup("Quark's Bar",                     ["strange_new_worlds"]),
    sup("The Unicomplex",                  ["strange_new_worlds"]),
    # Autres non-basiques (dont Stardates)
    sup("Starfleet Academy",               ["strange_new_worlds"]),
    sup("Unexplored Territory",            ["strange_new_worlds"]),
    sup("Minamo, School at Water's Edge",  ["strange_new_worlds"]),
    sup("Phyrexian Tower",                 ["strange_new_worlds"]),
    sup("Shizo, Death's Storehouse",       ["strange_new_worlds"]),
    sup("Talon Gates of Madara",           ["strange_new_worlds"]),
    # Jetons « New Planet »
    sup("David and Carol Marcus, Creators", ["strange_new_worlds"]),
    sup("Saurian Explorer",                ["strange_new_worlds"]),
    sup("Stable Wormhole",                 ["strange_new_worlds"]),
    sup("Genesis Effect",                  ["strange_new_worlds"]),
    # Tuteurs « basic land card or Planet card »
    sup("Final Frontier",                  ["strange_new_worlds"]),
    sup("Genesis Device",                  ["strange_new_worlds"]),
    sup("Warp Speed",                      ["strange_new_worlds"]),
]

# ======================================================================
# 6. SUPPORT : DILEMMA
#    Toute carte qui fait choisir un mode (sort, ETB, capacite, terrain qui
#    arrive degage). Riku est exclu : c'est le payoff, pas un enabler.
# ======================================================================

dilemma_support = [
    sup("Command Decision",                  ["dilemma"]),
    sup("Commander Raffi Musiker",           ["dilemma"]),
    sup("Consider the Prime Directive",      ["dilemma"]),
    sup("Constable Odo",                     ["dilemma"]),
    sup("Culber and Stamets, Star-Crossed",  ["dilemma"]),
    sup("D'Ghor Bloodletter",                ["dilemma"]),
    sup("Dathon and Picard at El-Adrel",     ["dilemma"]),
    sup("Dominion Assault Force",            ["dilemma"]),
    sup('Dr. Leonard "Bones" McCoy',         ["dilemma"]),
    sup("Emergency Holographic Crew",        ["dilemma"]),
    sup("Encounter the Unknown",             ["dilemma"]),
    sup("Ertai Resurrected",                 ["dilemma"]),
    sup("Federation Field Medic",            ["dilemma"]),
    sup("Federation Outpost",                ["dilemma"]),
    sup("Federation Probe",                  ["dilemma"]),
    sup("Hull Breach",                       ["dilemma"]),
    sup("Impossible Choice",                 ["dilemma"]),
    sup("Kobayashi Maru Scenario",           ["dilemma"]),
    sup("Lore, Positronic Provocateur",      ["dilemma"]),
    sup("Make It So",                        ["dilemma"]),
    sup("Ni'Var Science Academy",            ["dilemma"]),
    sup("Perils of the Past",                ["dilemma"]),
    sup("Q Continuum",                       ["dilemma"]),
    sup("Quark's Bar",                       ["dilemma"]),
    sup("Resistance Is Futile",              ["dilemma"]),
    sup("Rogue Artificial Intelligence",     ["dilemma"]),
    sup("Rules of Acquisition",              ["dilemma"]),
    sup("Set Phasers to . . .",              ["dilemma"]),
    sup("Stray from History",                ["dilemma"]),
    sup("Subcommander T'Pol",                ["dilemma"]),
    sup("Tal Shiar Operative",               ["dilemma"]),
    sup("Tea, Earl Grey, Hot",               ["dilemma"]),
    sup("Test of Conviction",                ["dilemma"]),
    sup("Test of Courage",                   ["dilemma"]),
    sup("Test of Identity",                  ["dilemma"]),
    sup("Test of Loyalty",                   ["dilemma"]),
    sup("Test of Priorities",                ["dilemma"]),
    sup("The Unicomplex",                    ["dilemma"]),
    sup("V'Ger, the Intruder",               ["dilemma"]),
    sup("Wesley Crusher, Starfleet Cadet",   ["dilemma"]),
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

    upsert_batch(false_positive_removals, "1. Faux positifs supprimes")
    upsert_batch(snw_deps,                "2. Dependances strange new worlds")
    upsert_batch(dilemma_deps,            "3. Dependances dilemma")
    upsert_batch(removal_corrections,     "4. Removal corrections")

    # Les support tags sont fusionnes avec l'existant (cf. sup / resolve_support).
    supports = snw_support + dilemma_support
    upsert_batch(resolve_support(supports), "5-6. Support: strange_new_worlds/dilemma")

    n = (len(false_positive_removals) + len(snw_deps) + len(dilemma_deps)
         + len(removal_corrections) + len(supports))

    print(f"\nTotal: {n} corrections en {round(time.time() - start, 2)}s")
