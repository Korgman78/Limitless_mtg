import requests
import os
import time
import argparse
from datetime import datetime, timezone
from collections import defaultdict
from itertools import combinations
from dotenv import load_dotenv
from pathlib import Path

# ==============================================================================
# 1. CONFIGURATION
# ==============================================================================

# Sets et formats à traiter
TARGET_SET_CODES = ["MSH"]  # [] pour tous les sets actifs
TARGET_FORMATS = ["PremierDraft", "TradDraft", "ArenaDirect_Sealed"]

# Seuils pour filtrer les résultats (valeurs par défaut, recalculées dynamiquement)
MIN_LIFT_SCORE = 1.2  # Ne garder que les synergies significatives (lift > 1.2)

# Une paire est aussi conservée si l'une des deux cartes en entraîne l'autre au
# moins la moitié du temps, MÊME si son lift est faible. Sans ça, les cartes
# très jouées disparaissent de la table : leur lift plafonne à 1/P(carte), donc
# une couleur dominante ne passe jamais le seuil de 1.2 et son "often played
# with" (qui se lit dans la même table) devient invisible côté front.
MIN_CONFIDENCE = 0.5

# Seuils de recevabilité d'une paire.
#
# Ils étaient exprimés en % du corpus (2% de co-occurrence, 3% de présence).
# À 15 000 trophy decks ça devient 300 et 451 decks : un compte ABSOLU, alors
# que le plafond de co-occurrence d'une carte est son propre nombre de decks.
# Une carte jouée dans 3% des decks aurait eu besoin d'un partenaire présent
# 63% du temps à ses côtés — une interdiction de fait, quelle que soit la force
# de la synergie. Le seuil de co-occurrence est donc désormais RELATIF à la
# carte la plus rare de la paire, avec un plancher absolu pour la fiabilité.
MIN_CARD_OCCURRENCE = 50      # decks minimum pour qu'une carte soit analysée
MIN_CO_OCCURRENCE = 20        # plancher absolu de co-occurrence d'une paire
CO_OCCURRENCE_RATIO = 0.25    # ... ou 25% des decks de la carte la plus rare

# Terrains de base à exclure des calculs de synergie
BASIC_LANDS = {"Plains", "Island", "Swamp", "Mountain", "Forest"}

# --- ENVIRONNEMENT ---
current_dir = Path(__file__).parent
root_dir = current_dir.parent
env_path = root_dir / '.env'
load_dotenv(dotenv_path=env_path)

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY") or os.getenv("VITE_SUPABASE_KEY")

HEADERS_SUPABASE = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates"
}

# ==============================================================================
# 2. FONCTIONS SUPABASE
# ==============================================================================

def get_active_sets():
    """Récupère les sets actifs depuis Supabase"""
    url = f"{SUPABASE_URL}/rest/v1/sets?active=eq.true&select=code"
    try:
        response = requests.get(url, headers=HEADERS_SUPABASE)
        if response.status_code == 200:
            return [s['code'] for s in response.json()]
        return []
    except Exception as e:
        print(f"❌ Exception fetch sets: {e}")
        return []

def _get_with_retry(url, retries=3, backoff=3):
    """GET avec retries pour absorber timeouts / 429 sur les gros payloads (14k+ decks)."""
    for attempt in range(1, retries + 1):
        try:
            response = requests.get(url, headers=HEADERS_SUPABASE, timeout=60)
            if response.status_code == 200:
                return response
            print(f"   ⚠️ HTTP {response.status_code} (tentative {attempt}/{retries}): {response.text[:150]}")
        except Exception as e:
            print(f"   ⚠️ Exception fetch (tentative {attempt}/{retries}): {e}")
        if attempt < retries:
            time.sleep(backoff * attempt)
    return None

def get_trophy_decks(set_code, fmt):
    """Récupère tous les trophy decks pour un set/format avec pagination + retries.

    Retourne None en cas d'échec dur (retries épuisés) pour ne PAS confondre avec
    un format légitimement vide : on préfère sauter le format sans écraser les
    synergies existantes plutôt que d'insérer des données partielles/fausses.
    """
    all_decks = []
    offset = 0
    page_size = 1000

    while True:
        url = f"{SUPABASE_URL}/rest/v1/trophy_decks?set_code=eq.{set_code}&format=eq.{fmt}&select=cardlist&order=id&limit={page_size}&offset={offset}"
        response = _get_with_retry(url)
        if response is None:
            print(f"   ❌ Fetch decks abandonné après retries (offset={offset})")
            return None  # échec dur

        data = response.json()
        if not data:
            break

        all_decks.extend(data)

        if len(data) < page_size:
            break  # Dernière page

        offset += page_size
        print(f"   📄 {len(all_decks)} decks chargés...")

    return all_decks

def _order_key(name):
    """Clé de tri reproduisant le poids primaire (insensible à la casse) de la
    collation Postgres. Le tri ASCII de Python place les majuscules avant les
    minuscules ('P' < 'o'), ce qui viole la contrainte `card_order_check`
    (card_a < card_b) côté DB. casefold() aligne les deux ordres."""
    return (name.casefold(), name)

def save_synergies(synergies, set_code, fmt):
    """Sauvegarde les synergies dans Supabase. Retourne (saved, failed)."""
    if not synergies:
        return 0, 0

    # Préparer les records
    records = []
    for (card_a, card_b), data in synergies.items():
        # Ordre canonique aligné sur la collation Postgres (cf. _order_key),
        # et confidences ajustées en conséquence.
        if _order_key(card_a) > _order_key(card_b):
            card_a, card_b = card_b, card_a
            conf_a_to_b = data['confidence_b_to_a']
            conf_b_to_a = data['confidence_a_to_b']
        else:
            conf_a_to_b = data['confidence_a_to_b']
            conf_b_to_a = data['confidence_b_to_a']

        records.append({
            "set_code": set_code,
            "format": fmt,
            "card_a": card_a,
            "card_b": card_b,
            "synergy_score": round(data['lift'], 4),
            "lift_score": round(data['lift'], 4),
            "co_occurrence_count": data['co_occurrence'],
            "confidence_a_to_b": round(conf_a_to_b, 4),
            "confidence_b_to_a": round(conf_b_to_a, 4),
            "updated_at": datetime.now(timezone.utc).isoformat()
        })

    api_url = f"{SUPABASE_URL}/rest/v1/synergy_scores?on_conflict=set_code,format,card_a,card_b"

    # Upsert par batch. Un batch PostgREST est atomique : une seule ligne fautive
    # fait échouer les 500. On retombe alors en insertion ligne-par-ligne pour ne
    # perdre que les vrais rejets au lieu de tout le batch.
    saved = 0
    failed = 0
    for i in range(0, len(records), 500):
        chunk = records[i:i + 500]
        try:
            resp = requests.post(api_url, json=chunk, headers=HEADERS_SUPABASE, timeout=60)
            if resp.status_code < 400:
                saved += len(chunk)
                continue

            print(f"      ⚠️ Batch {i} rejeté ({resp.status_code}), fallback ligne-par-ligne...")
            for rec in chunk:
                try:
                    r = requests.post(api_url, json=[rec], headers=HEADERS_SUPABASE, timeout=30)
                    if r.status_code < 400:
                        saved += 1
                    else:
                        failed += 1
                        if failed <= 5:
                            print(f"         ❌ {rec['card_a']} + {rec['card_b']}: {r.text[:120]}")
                except Exception as e:
                    failed += 1
                    if failed <= 5:
                        print(f"         ❌ Exception ligne: {e}")
        except Exception as e:
            print(f"      ❌ Exception POST batch {i}: {e}")
            failed += len(chunk)

    if failed:
        print(f"      ⚠️ {failed} synergies rejetées individuellement (ignorées)")

    return saved, failed

def delete_old_synergies(set_code, fmt):
    """Supprime les anciennes synergies pour un set/format avant recalcul"""
    url = f"{SUPABASE_URL}/rest/v1/synergy_scores?set_code=eq.{set_code}&format=eq.{fmt}"
    try:
        response = requests.delete(url, headers=HEADERS_SUPABASE)
        if response.status_code >= 400:
            print(f"   ⚠️ Erreur suppression anciennes synergies: {response.text[:100]}")
    except Exception as e:
        print(f"   ⚠️ Exception delete: {e}")

# ==============================================================================
# 3. CALCUL DU LIFT SCORE
# ==============================================================================

def calculate_lift_scores(decks):
    """
    Calcule le lift score pour chaque paire de cartes.

    Lift(A,B) = P(A ∩ B) / (P(A) × P(B))

    Où :
    - P(A ∩ B) = nombre de decks avec A ET B / total decks
    - P(A) = nombre de decks avec A / total decks
    - P(B) = nombre de decks avec B / total decks
    """
    if not decks:
        return {}

    total_decks = len(decks)
    print(f"   📊 Analyse de {total_decks} decks...")

    print(f"   ⚙️ Seuils: card_occurrence >= {MIN_CARD_OCCURRENCE} decks, "
          f"co_occurrence >= max({MIN_CO_OCCURRENCE}, {CO_OCCURRENCE_RATIO:.0%} de la carte la plus rare)")

    # Compter les occurrences de chaque carte (dans combien de decks elle apparaît)
    card_occurrence = defaultdict(int)

    # Compter les co-occurrences de paires de cartes
    pair_occurrence = defaultdict(int)

    for deck in decks:
        cardlist = deck.get('cardlist', {})
        if not cardlist:
            continue

        # Liste des cartes uniques dans ce deck (sans les terrains de base)
        cards_in_deck = [card for card in cardlist.keys() if card not in BASIC_LANDS]

        # Compter l'occurrence de chaque carte
        for card in cards_in_deck:
            card_occurrence[card] += 1

        # Compter les co-occurrences (paires)
        for card_a, card_b in combinations(sorted(cards_in_deck), 2):
            pair_occurrence[(card_a, card_b)] += 1

    print(f"   🃏 {len(card_occurrence)} cartes uniques trouvées")
    print(f"   🔗 {len(pair_occurrence)} paires analysées")

    # Filtrer les cartes avec trop peu d'occurrences
    valid_cards = {card for card, count in card_occurrence.items() if count >= MIN_CARD_OCCURRENCE}
    print(f"   ✅ {len(valid_cards)} cartes avec >= {MIN_CARD_OCCURRENCE} occurrences")

    # Calculer le lift pour chaque paire
    synergies = {}

    for (card_a, card_b), co_count in pair_occurrence.items():
        # Plancher absolu : en dessous, le ratio n'est pas fiable (et ça élague
        # l'immense majorité des paires avant les calculs).
        if co_count < MIN_CO_OCCURRENCE:
            continue

        # Skip si une des cartes n'est pas assez fréquente
        if card_a not in valid_cards or card_b not in valid_cards:
            continue

        # Occurrences individuelles
        count_a = card_occurrence[card_a]
        count_b = card_occurrence[card_b]

        # Seuil relatif : la paire doit représenter une part significative des
        # decks de la carte la plus rare. Sans ça, une carte de niche ne peut
        # mathématiquement atteindre aucun seuil absolu, même avec une synergie
        # parfaite (elle plafonne à son propre nombre de decks).
        if co_count < CO_OCCURRENCE_RATIO * min(count_a, count_b):
            continue

        # Calculer les probabilités
        p_a = count_a / total_decks
        p_b = count_b / total_decks
        p_ab = co_count / total_decks

        # Calculer le lift (symétrique)
        expected = p_a * p_b
        if expected > 0:
            lift = p_ab / expected
        else:
            lift = 0

        # Calculer les confidences (asymétriques)
        # Confidence(A→B) = P(B|A) = co_occurrence / occurrence_A
        confidence_a_to_b = co_count / count_a if count_a > 0 else 0
        # Confidence(B→A) = P(A|B) = co_occurrence / occurrence_B
        confidence_b_to_a = co_count / count_b if count_b > 0 else 0

        # Deux portes d'entrée : synergie significative (lift) OU association
        # forte dans au moins un sens (confidence). La seconde rattrape les
        # staples, dont le lift est mécaniquement écrasé par leur popularité.
        max_confidence = max(confidence_a_to_b, confidence_b_to_a)
        if lift >= MIN_LIFT_SCORE or max_confidence >= MIN_CONFIDENCE:
            synergies[(card_a, card_b)] = {
                'lift': lift,
                'co_occurrence': co_count,
                'confidence_a_to_b': confidence_a_to_b,
                'confidence_b_to_a': confidence_b_to_a
            }

    return synergies

# ==============================================================================
# 4. PROCESSING PRINCIPAL
# ==============================================================================

def process_synergies(set_code, formats):
    """Calcule et sauvegarde les synergies pour un set"""
    print(f"\n{'='*60}")
    print(f"🔗 SYNERGIES - Set: {set_code}")
    print(f"{'='*60}")

    total_saved = 0
    total_fetch_failed = 0
    total_row_failed = 0

    for fmt in formats:
        print(f"\n📂 Format: {fmt}")

        # Récupérer les trophy decks
        decks = get_trophy_decks(set_code, fmt)
        if decks is None:
            # Échec dur du fetch : on saute SANS toucher aux synergies existantes.
            print(f"   ❌ Fetch échoué — format sauté (données existantes préservées)")
            total_fetch_failed += 1
            continue
        if not decks:
            print(f"   ⚠️ Aucun deck trouvé (format vide)")
            continue

        # Calculer les lift scores
        synergies = calculate_lift_scores(decks)
        by_lift = sum(1 for d in synergies.values() if d['lift'] >= MIN_LIFT_SCORE)
        print(f"   🎯 {len(synergies)} paires retenues "
              f"({by_lift} par lift >= {MIN_LIFT_SCORE}, "
              f"{len(synergies) - by_lift} par confidence >= {MIN_CONFIDENCE:.0%})")

        if synergies:
            # Supprimer les anciennes synergies
            delete_old_synergies(set_code, fmt)

            # Sauvegarder les nouvelles
            saved, failed = save_synergies(synergies, set_code, fmt)
            total_saved += saved
            total_row_failed += failed
            print(f"   ✅ {saved} synergies sauvegardées")

            # === LOGS: Top 10 par Lift Score ===
            top_by_lift = sorted(synergies.items(), key=lambda x: x[1]['lift'], reverse=True)[:10]
            print(f"\n   🏆 Top 10 LIFT (synergies les plus fortes):")
            for i, ((card_a, card_b), data) in enumerate(top_by_lift, 1):
                print(f"      {i:2}. {card_a} + {card_b}")
                print(f"          lift={data['lift']:.2f} | co={data['co_occurrence']} | conf(A→B)={data['confidence_a_to_b']:.0%} conf(B→A)={data['confidence_b_to_a']:.0%}")

            # === LOGS: Top 10 par Confidence A→B ===
            top_by_conf_ab = sorted(synergies.items(), key=lambda x: x[1]['confidence_a_to_b'], reverse=True)[:10]
            print(f"\n   🎯 Top 10 CONFIDENCE A→B (si j'ai A, je veux B):")
            for i, ((card_a, card_b), data) in enumerate(top_by_conf_ab, 1):
                print(f"      {i:2}. {card_a} → {card_b}: {data['confidence_a_to_b']:.0%} (lift={data['lift']:.2f}, co={data['co_occurrence']})")

            # === LOGS: Top 10 par Confidence B→A ===
            top_by_conf_ba = sorted(synergies.items(), key=lambda x: x[1]['confidence_b_to_a'], reverse=True)[:10]
            print(f"\n   🎯 Top 10 CONFIDENCE B→A (si j'ai B, je veux A):")
            for i, ((card_a, card_b), data) in enumerate(top_by_conf_ba, 1):
                print(f"      {i:2}. {card_b} → {card_a}: {data['confidence_b_to_a']:.0%} (lift={data['lift']:.2f}, co={data['co_occurrence']})")

    return total_saved, total_fetch_failed, total_row_failed

# ==============================================================================
# MAIN
# ==============================================================================

def parse_arguments():
    """Parse les arguments de la ligne de commande"""
    parser = argparse.ArgumentParser(description='Calculate card synergies from trophy decks')
    parser.add_argument(
        '--sets', '-s',
        type=str,
        nargs='+',
        default=None,
        help='Codes des sets (ex: --sets FDN DSK)'
    )
    parser.add_argument(
        '--formats', '-f',
        type=str,
        nargs='+',
        default=None,
        help='Formats (ex: --formats PremierDraft TradDraft)'
    )
    parser.add_argument(
        '--min-lift', '-l',
        type=float,
        default=None,
        help=f'Minimum lift score (défaut: {MIN_LIFT_SCORE})'
    )
    parser.add_argument(
        '--min-confidence', '-c',
        type=float,
        default=None,
        help=f'Confidence de rattrapage des staples (défaut: {MIN_CONFIDENCE})'
    )
    return parser.parse_args()

if __name__ == "__main__":
    args = parse_arguments()

    # Override des configs
    if args.sets:
        TARGET_SET_CODES = list(args.sets)
    if args.formats:
        TARGET_FORMATS = list(args.formats)
    if args.min_lift:
        MIN_LIFT_SCORE = args.min_lift
    if args.min_confidence:
        MIN_CONFIDENCE = args.min_confidence

    print("🔗 ETL Synergies - Démarrage")
    print(f"⏰ {datetime.now(timezone.utc).isoformat()}")

    if not SUPABASE_URL or not SUPABASE_KEY:
        print("❌ ERREUR: Variables d'environnement SUPABASE manquantes.")
        exit(1)

    # Déterminer les sets
    if TARGET_SET_CODES:
        sets_to_process = TARGET_SET_CODES
        print(f"📋 Sets ciblés: {sets_to_process}")
    else:
        sets_to_process = get_active_sets()
        print(f"📋 Sets actifs: {sets_to_process}")

    if not sets_to_process:
        print("⚠️ Aucun set à traiter.")
        exit(0)

    print(f"📋 Formats: {TARGET_FORMATS}")
    print(f"⚙️ Seuils: min_lift={MIN_LIFT_SCORE} OU min_confidence={MIN_CONFIDENCE} ; "
          f"card_occurrence >= {MIN_CARD_OCCURRENCE}, "
          f"co_occurrence >= max({MIN_CO_OCCURRENCE}, {CO_OCCURRENCE_RATIO:.0%} de la carte la plus rare)")

    # Traiter chaque set
    total_saved = 0
    total_fetch_failed = 0
    total_row_failed = 0
    for set_code in sets_to_process:
        saved, fetch_failed, row_failed = process_synergies(set_code, TARGET_FORMATS)
        total_saved += saved
        total_fetch_failed += fetch_failed
        total_row_failed += row_failed

    # Résumé final
    print(f"\n{'='*60}")
    print("✨ ETL Synergies - Terminé")
    print(f"{'='*60}")
    print(f"💾 Total synergies sauvegardées: {total_saved}")
    if total_row_failed:
        print(f"ℹ️ {total_row_failed} synergie(s) rejetée(s) individuellement (edge-cases de collation, négligeable)")

    # Sortir en erreur pour rendre le workflow GitHub ROUGE (au lieu de
    # "vert-silencieux") uniquement sur un VRAI problème :
    #  - échec dur de fetch (les données n'ont PAS été mises à jour), ou
    #  - rejets d'insert massifs au-delà de la tolérance (signale une régression,
    #    pas les quelques paires à ponctuation exotique que le fallback isole).
    ROW_FAIL_TOLERANCE = 25
    if total_fetch_failed or total_row_failed > ROW_FAIL_TOLERANCE:
        print(f"❌ Échec: {total_fetch_failed} fetch(s) dur(s), {total_row_failed} rejet(s) d'insert (tolérance {ROW_FAIL_TOLERANCE})")
        exit(1)
