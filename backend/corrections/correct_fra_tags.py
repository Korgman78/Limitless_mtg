"""
LLM-driven tag correction for FRA (Reality Fracture).
Run after enrich_card_tags.py to fix false positives, encode the set's own
mechanics, and calibrate thresholds.

FRA est un set **planeswalker-matters** :
  - `empower <PW> N` cree (ou charge) un jeton planeswalker — 35 cartes ;
  - un cycle de 10 terrains bicolores arrive degage **seulement** si on
    controle un planeswalker ;
  - `behold a Jace` = cout additionnel paye en revelant/controlant un Jace ;
  - `prepared` : creature // sort, la creature arrive « preparee » et permet de
    copier son sort — 17 cartes ;
  - `Threshold` (sept cartes ou plus au cimetiere) — 6 payoffs.

Le detecteur generique ne connait aucune de ces mecaniques : il a produit des
tags parasites ('more' pour « seven or more cards », 'then', 'plain',
'different', 'opponent', 'cast', 'charge'). On les remplace ici par le
vocabulaire reel du format : `planeswalker`, `threshold`, `prepared`.

Corrections couvertes :
  1. Faux positifs dependency (regex) — 11 cartes
  2. Dependances THRESHOLD — 6 cartes
  3. Dependances PLANESWALKER — 17 cartes
  4. Dependance PREPARED — 1 carte
  5. Corrections is_removal — 8 cartes
  6. Support : planeswalker (empower + planeswalkers) — 42 cartes
  7. Support : prepared — 17 cartes
  8. Support : threshold (remplisseurs de cimetiere) — 29 cartes
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

SET = "FRA"

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
    Support-tags correction (ce que la carte FOURNIT).
    Contrairement a correct_sos_tags, on FUSIONNE avec les tags deja poses par
    enrich_card_tags (multicolored / lifegain / graveyard_leaves) au lieu de les
    ecraser : la moitie des cartes empower de FRA sont multicolores, et perdre ce
    tag fausserait le matching de l'optimizer.
    """
    return {"card_name": card_name, "set_code": SET, "_add_tags": list(tags)}


def resolve_support(corrections):
    """Remplace les _add_tags par la fusion (existant + ajout)."""
    if not corrections:
        return []
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/card_list",
        params={"select": "card_name,support_tags", "set_code": f"eq.{SET}", "limit": "400"},
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
    # « seven or more cards in your graveyard » : 'more' lu comme un type de
    # creature. C'est Threshold — retagge en section 2 pour les payoffs.
    dep("Eye of Jace", []),

    # Gardenize : « put a charge counter on this enchantment » -> 'charge'.
    # L'enchantement se charge tout seul, aucune dependance de deck.
    dep("Gardenize", []),

    # Ingris Stingerquill : « Then creatures you control gain haste » -> 'then'.
    dep("Ingris Stingerquill", []),

    # Koth of the Homestead : « Whenever a Plains you control enters » -> 'plain'
    # lu comme un type tribal. C'est du landfall, pas un archetype Plains.
    dep("Koth of the Homestead", []),

    # Loot, the Nexus : « for each different power among creatures » -> 'different'.
    dep("Loot, the Nexus", []),

    # Garruk, Veiled Butcher : « a creature an opponent controls » -> 'opponent'.
    dep("Garruk, Veiled Butcher", []),

    # Samut / Yuriko : « players can't cast spells » -> 'cast'.
    dep("Samut, Tyrant of Naktamun", []),
    dep("Yuriko, Blade of the Mighty", []),

    # Fateshaper Aspirant : mode « return target legendary card » -> 'legendary'.
    # Un mode sur deux, et le second (+1/+1 counter) est toujours jouable.
    dep("Fateshaper Aspirant", []),

    # Wrath of the Bloodmane : « costs {1} less if you control a legendary
    # creature » -> 'legendary'. Reduction de cout uniquement, le sort fait
    # 4 damage dans tous les cas. Pas un build-around.
    dep("Wrath of the Bloodmane", []),

    # Danitha, Sword of Hope : « an Equipment spell OR a spell that targets a
    # creature you control » -> 'equipment'. Le second membre du OR suffit a
    # declencher, la carte n'a pas besoin d'Equipements.
    dep("Danitha, Sword of Hope", []),
]

# ======================================================================
# 2. DEPENDANCES THRESHOLD
#    « Threshold — ... seven or more cards in your graveyard ».
#    Seuils :
#      min=6 : la carte est injouable sans threshold (lancement bloque)
#      min=5 : payoff fort (activation ou moitie de la carte conditionnee)
#      min=4 : bonus notable mais la carte fonctionne avant
# ======================================================================

threshold_deps = [
    # Proft : « You can't cast this spell unless there are seven or more cards
    # in your graveyard ». Dependance dure, carte litteralement morte sans
    # remplissage de cimetiere.
    dep("Proft, Sinister Mastermind", ["threshold"], 6, "tribal"),

    # Null Summoner : la carte exilee n'est recastable que sous threshold.
    # La moitie de la valeur de la carte en depend.
    dep("Null Summoner", ["threshold"], 5, "tribal"),

    # Loot, the Anomaly : l'activation « Sacrifice another creature or
    # planeswalker » est verrouillee sous threshold.
    dep("Loot, the Anomaly", ["threshold"], 5, "tribal"),

    # Eye of Jace : surveil 1 chaque upkeep puis se sacrifie sous threshold
    # pour 2 damage + 2 life. S'auto-alimente : dependance moderee.
    dep("Eye of Jace", ["threshold"], 4, "tribal"),

    # Theorix Metamage : +1/+0 et vol sous threshold. Corps correct avant.
    dep("Theorix Metamage // Omit Variables", ["threshold"], 4, "tribal"),

    # Void Extrapolator : +1/+1 sous threshold. Meme profil.
    dep("Void Extrapolator // Omit Variables", ["threshold"], 4, "tribal"),
]

# ======================================================================
# 3. DEPENDANCES PLANESWALKER
#    Cartes qui exigent un planeswalker EN JEU sans en fabriquer un.
#    Les cartes `empower` sont exclues : elles creent leur propre jeton, donc
#    elles sont auto-suffisantes (elles sont taggees en support, section 6).
#
#    Seuils :
#      min=6 : inutilisable sans planeswalker
#      min=5 : cycle de terrains — arrive engage sans PW, cout de tempo reel
#      min=4 : bonus conditionnel notable, corps jouable sans
# ======================================================================

planeswalker_deps = [
    # --- Cycle de 10 terrains bicolores : « enters tapped unless you control a
    # planeswalker ». Jouables sans PW mais on paie un tempo a chaque pose.
    dep("Dedicated Commons",       ["planeswalker"], 5, "tribal"),
    dep("Fatehold Annex",          ["planeswalker"], 5, "tribal"),
    dep("Formidable Commons",      ["planeswalker"], 5, "tribal"),
    dep("Innovative Commons",      ["planeswalker"], 5, "tribal"),
    dep("Konstrari Annex",         ["planeswalker"], 5, "tribal"),
    dep("Meticulous Commons",      ["planeswalker"], 5, "tribal"),
    dep("Stingerquill Annex",      ["planeswalker"], 5, "tribal"),
    dep("Theorix Annex",           ["planeswalker"], 5, "tribal"),
    dep("Transformative Commons",  ["planeswalker"], 5, "tribal"),
    dep("Vigorbloom Annex",        ["planeswalker"], 5, "tribal"),

    # --- Cartes qui donnent des capacites AUX planeswalkers ---
    # Kiora : « Planeswalkers you control have [-8]... » — sans PW, la moitie du
    # texte est vide (le trigger d'attaque, lui, reste).
    dep("Kiora of Salt and Sand",  ["planeswalker"], 5, "tribal"),

    # Tomik, Orzhov Lawmage : protection des planeswalkers. Sans PW, il reste un
    # corps volant et une activation mineure.
    dep("Tomik, Orzhov Lawmage",   ["planeswalker"], 4, "tribal"),

    # --- Cartes dont le cout / la valeur passe par un planeswalker ---
    # Tam, the Possibility : reduit les sorts de planeswalker et proliferate
    # selon les types de PW controles. Build-around pur.
    dep("Tam, the Possibility",    ["planeswalker"], 6, "tribal"),

    # Gideon's Memorial : le mana produit ne sert QU'A lancer un planeswalker.
    # ('fixer_only' pose par le detecteur est trompeur : ce n'est pas un fixer.)
    dep("Gideon's Memorial",       ["planeswalker"], 6, "tribal"),

    # Entrust the Spark : sacrifie un planeswalker pour en tutorer un autre.
    # Zero planeswalker = carte morte.
    dep("Entrust the Spark",       ["planeswalker"], 6, "tribal"),

    # Face Yourself : les copies creees se sacrifient si on ne controle pas de PW.
    dep("Face Yourself",           ["planeswalker"], 5, "tribal"),

    # Mind Meanderer : vigilance conditionnee a un Jace. Le fight a l'arrivee
    # fonctionne toujours — dependance faible.
    dep("Mind Meanderer",          ["planeswalker"], 4, "tribal"),
]

# ======================================================================
# 4. DEPENDANCE PREPARED
#    Le detecteur a bien trouve 'prepared' sur Codie ; on ne fait qu'ajouter le
#    seuil. Les 17 cartes `prepared` embarquent leur propre sort : elles sont
#    auto-suffisantes et n'ont aucune dependance (voir section 7).
# ======================================================================

prepared_deps = [
    # Codie : « Whenever you cast a prepared spell, copy it » + rend toute
    # l'equipe preparee. Sans cartes prepared, ne fait rien.
    dep("Codie, Ravenous Codex", ["prepared"], 5, "tribal"),
]

# ======================================================================
# 5. CORRECTIONS is_removal
# ======================================================================

removal_corrections = [
    # --- Faux positifs : retirer ---
    # Room of Refuge : terrain qui se sacrifie pour poser deux +1/+1 counters.
    # La regex a lu « Sacrifice this land ... target ». Aucune interaction.
    # (Meme faux positif que le cycle bicolore de HOB.)
    removal("Room of Refuge", False),

    # Identity Echo : exile une creature/PW QUE VOUS CONTROLEZ pour la remplacer.
    # Effet de type pod, pas du removal.
    removal("Identity Echo", False),

    # Uldaros Theorix : exile des cartes de VOTRE cimetiere pour les copier.
    removal("Uldaros Theorix", False),

    # --- Faux negatifs : ajouter ---
    # Rise of the Deathbringer : mode « All creatures get -3/-3 » = sweeper.
    # La regex n'attrape que « target ... -X/-X ».
    removal("Rise of the Deathbringer", True),

    # Clash of Elements : tuck d'un permanent non-terrain, sinon 2 damage.
    removal("Clash of Elements", True),

    # Plan for All Outcomes : « the owner of up to one other target nonland
    # permanent puts it on top or bottom of their library » — le « up to one »
    # casse la regex de tuck.
    removal("Plan for All Outcomes", True),

    # Hapatra, the Desert Frost : tap + stun counters sur les creatures
    # adverses. Le detecteur ne connait que « can't attack or block ».
    removal("Hapatra, the Desert Frost", True),

    # Seasoned Cryomancer : tap + stun counters selon les cartes defaussees.
    removal("Seasoned Cryomancer", True),
]

# ======================================================================
# 6. SUPPORT : PLANESWALKER
#    Ce que la carte FOURNIT : un planeswalker sur le champ de bataille.
#    = les 34 cartes `empower` (creent ou chargent un jeton PW) + les 8
#    planeswalkers imprimes du set.
# ======================================================================

planeswalker_support = [
    # --- empower : cree un jeton planeswalker s'il n'y en a pas ---
    sup("Academic Ascent",              ["planeswalker"]),
    sup("Arcane Amphisbaena",           ["planeswalker"]),
    sup("Avatar of Burgeoning Echoes",  ["planeswalker"]),
    sup("Campus Crier",                 ["planeswalker"]),
    sup("Countersculpt",                ["planeswalker"]),
    sup("Fatehold Charm",               ["planeswalker"]),
    sup("Hexhaven Battalion",           ["planeswalker"]),
    sup("Inspired Tethermage",          ["planeswalker"]),
    sup("Jace's Machinations",          ["planeswalker"]),
    sup("Keeper of the Quiet Hour",     ["planeswalker"]),
    sup("Mindseeker Oculus",            ["planeswalker"]),
    sup("No Admittance",                ["planeswalker"]),
    sup("Overwrite the Multiverse",     ["planeswalker"]),
    sup("Plan for All Outcomes",        ["planeswalker"]),
    sup("Protege's Awakening",          ["planeswalker"]),
    sup("Repurposed Enforcer",          ["planeswalker"]),
    sup("Rewrite Regrets",              ["planeswalker"]),
    sup("Sanctum Lurker",               ["planeswalker"]),
    sup("Solve for Disappointment",     ["planeswalker"]),
    sup("Tam's Resistance",             ["planeswalker"]),
    sup("Theorist's Proxy",             ["planeswalker"]),
    sup("Theorist's Sanctum",           ["planeswalker"]),
    sup("Violent Echoes",               ["planeswalker"]),
    sup("Vraska's Final Mercy",         ["planeswalker"]),
    # Le cycle « Way of ... » : enchantements legendaires qui empower 5 a l'ETB
    # puis donnent une capacite de loyaute a tous les planeswalkers controles.
    sup("Way of the Cryomancer",        ["planeswalker"]),
    sup("Way of the Deathbringer",      ["planeswalker"]),
    sup("Way of the Healer",            ["planeswalker"]),
    sup("Way of the Mentor",            ["planeswalker"]),
    sup("Way of the Mind Sculptor",     ["planeswalker"]),
    sup("Way of the Necromancer",       ["planeswalker"]),
    sup("Way of the Paradox",           ["planeswalker"]),
    sup("Way of the Pyromancer",        ["planeswalker"]),
    sup("Way of the Warlord",           ["planeswalker"]),
    sup("Way of the Wildspeaker",       ["planeswalker"]),
    # --- planeswalkers imprimes ---
    sup("Ajani Resolute",               ["planeswalker"]),
    sup("Ajani Unrelenting",            ["planeswalker"]),
    sup("Chandra, Chill of Compliance", ["planeswalker"]),
    sup("Chandra, Torch of Defiance",   ["planeswalker"]),
    sup("Garruk, Curse Breaker",        ["planeswalker"]),
    sup("Garruk, Veiled Butcher",       ["planeswalker"]),
    sup("Jace, Reality Sculptor",       ["planeswalker"]),
    sup("The Theorist, Jace Beleren",   ["planeswalker"]),
]

# ======================================================================
# 7. SUPPORT : PREPARED
#    Les 17 creatures // sort qui arrivent « preparees ».
# ======================================================================

prepared_support = [
    sup("Blossom-Blessed Angel // Seed Suture",   ["prepared"]),
    sup("Carnivorous Cultivator // Enroot",       ["prepared"]),
    sup("Diviner of Victory // Unwind History",   ["prepared"]),
    sup("Emergency Phytomedic // Seed Suture",    ["prepared"]),
    sup("Fatehold Chronologist // Peer Review",   ["prepared"]),
    sup("Hallway Heckler // Vicious Verse",       ["prepared"]),
    sup("Heartwood Crafter // Soul Tether",       ["prepared"]),
    sup("Konstrari Improviser // Soul Tether",    ["prepared"]),
    sup("Pompous Battlemage // Improvised Act",   ["prepared"]),
    sup("Prudent Fateseer // Peer Review",        ["prepared"]),
    sup("Pyre Rhymer // Molten Tide",             ["prepared"]),
    sup("Semester Foreseer // Peer Review",       ["prepared"]),
    sup("Theorix Metamage // Omit Variables",     ["prepared"]),
    sup("Variable Chaser // Arc of Fortune",      ["prepared"]),
    sup("Vigorbloom Vanguard // Seed Suture",     ["prepared"]),
    sup("Void Extrapolator // Omit Variables",    ["prepared"]),
    sup("Whiplash Wordsmith // Vicious Verse",    ["prepared"]),
]

# ======================================================================
# 8. SUPPORT : THRESHOLD
#    Remplisseurs de cimetiere : surveil/mill repetes, defausse, landcycling.
#    Liste volontairement restreinte aux cartes qui mettent plusieurs cartes au
#    cimetiere ou qui le font de facon repetee — un surveil 1 ponctuel ne fait
#    pas d'une carte un enabler de threshold.
# ======================================================================

threshold_support = [
    sup("Apex Witchstalker",                    ["threshold"]),
    sup("Awaken the Inferno",                   ["threshold"]),
    sup("Countersculpt",                        ["threshold"]),
    sup("Dark Matter Manipulator",              ["threshold"]),
    sup("Denzilore Fatehold",                   ["threshold"]),
    sup("Diviner of Victory // Unwind History", ["threshold"]),
    sup("Enlightened Confidant",                ["threshold"]),
    sup("Eye of Jace",                          ["threshold"]),
    sup("Garruk, Veiled Butcher",               ["threshold"]),
    sup("Gideon's Memorial",                    ["threshold"]),
    sup("Hallway Heckler // Vicious Verse",     ["threshold"]),
    sup("Hexhaven Battalion",                   ["threshold"]),
    sup("Liliana the Faultless",                ["threshold"]),
    sup("Liliana the Repentant",                ["threshold"]),
    sup("Murmuring Volume",                     ["threshold"]),
    sup("Primal Witchstalker",                  ["threshold"]),
    sup("Proctor of Potential",                 ["threshold"]),
    sup("Proft, Consulting Detective",          ["threshold"]),
    sup("Proft, Sinister Mastermind",           ["threshold"]),
    sup("Prudent Fateseer // Peer Review",      ["threshold"]),
    sup("Saheeli, Consul of Oversight",         ["threshold"]),
    sup("Seasoned Cryomancer",                  ["threshold"]),
    sup("Something Worth Saving",               ["threshold"]),
    sup("Sureshot Sower",                       ["threshold"]),
    sup("Surveillance Phantasm",                ["threshold"]),
    sup("Theorix Charm",                        ["threshold"]),
    sup("Undulating Witness",                   ["threshold"]),
    sup("Vinelasher Adept",                     ["threshold"]),
    sup("Yuriko, Hope from the Shadows",        ["threshold"]),
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
    upsert_batch(threshold_deps,          "2. Dependances threshold")
    upsert_batch(planeswalker_deps,       "3. Dependances planeswalker")
    upsert_batch(prepared_deps,           "4. Dependance prepared")
    upsert_batch(removal_corrections,     "5. Removal corrections")

    # Les support tags sont fusionnes avec l'existant (cf. sup / resolve_support).
    supports = planeswalker_support + prepared_support + threshold_support
    upsert_batch(resolve_support(supports), "6-8. Support: planeswalker/prepared/threshold")

    n = (len(false_positive_removals) + len(threshold_deps) + len(planeswalker_deps)
         + len(prepared_deps) + len(removal_corrections) + len(supports))

    print(f"\nTotal: {n} corrections en {round(time.time() - start, 2)}s")
