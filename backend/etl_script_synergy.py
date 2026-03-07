import requests
import os
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
TARGET_SET_CODES = ["TMT"]  # [] pour tous les sets actifs
TARGET_FORMATS = ["PremierDraft", "TradDraft", "ArenaDirect_Sealed"]

# Seuils pour filtrer les résultats (valeurs par défaut, recalculées dynamiquement)
MIN_LIFT_SCORE = 1.2  # Ne garder que les synergies significatives (lift > 1.2)

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

def get_trophy_decks(set_code, fmt):
    """Récupère tous les trophy decks pour un set/format avec pagination"""
    all_decks = []
    offset = 0
    page_size = 1000

    while True:
        url = f"{SUPABASE_URL}/rest/v1/trophy_decks?set_code=eq.{set_code}&format=eq.{fmt}&select=cardlist&order=id&limit={page_size}&offset={offset}"
        try:
            response = requests.get(url, headers=HEADERS_SUPABASE)
            if response.status_code != 200:
                print(f"   ❌ Erreur fetch decks: {response.text[:200]}")
                break

            data = response.json()
            if not data:
                break

            all_decks.extend(data)

            if len(data) < page_size:
                break  # Dernière page

            offset += page_size
            print(f"   📄 {len(all_decks)} decks chargés...")

        except Exception as e:
            print(f"   ❌ Exception fetch decks: {e}")
            break

    return all_decks

def save_synergies(synergies, set_code, fmt):
    """Sauvegarde les synergies dans Supabase"""
    if not synergies:
        return 0

    # Préparer les records
    records = []
    for (card_a, card_b), data in synergies.items():
        # Ordonner alphabétiquement et ajuster les confidences en conséquence
        if card_a > card_b:
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

    # Upsert par batch
    saved = 0
    for i in range(0, len(records), 500):
        chunk = records[i:i + 500]
        api_url = f"{SUPABASE_URL}/rest/v1/synergy_scores?on_conflict=set_code,format,card_a,card_b"

        try:
            resp = requests.post(api_url, json=chunk, headers=HEADERS_SUPABASE)
            if resp.status_code >= 400:
                print(f"      ❌ Erreur batch {i}: {resp.text[:200]}")
            else:
                saved += len(chunk)
        except Exception as e:
            print(f"      ❌ Exception POST: {e}")

    return saved

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

    # Seuils dynamiques basés sur la taille du dataset
    min_co_occurrence = max(10, int(total_decks * 0.02))   # Au moins 2% des decks
    min_card_occurrence = max(20, int(total_decks * 0.03)) # Au moins 3% des decks
    print(f"   ⚙️ Seuils dynamiques: co_occurrence >= {min_co_occurrence}, card_occurrence >= {min_card_occurrence}")

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
    valid_cards = {card for card, count in card_occurrence.items() if count >= min_card_occurrence}
    print(f"   ✅ {len(valid_cards)} cartes avec >= {min_card_occurrence} occurrences")

    # Calculer le lift pour chaque paire
    synergies = {}

    for (card_a, card_b), co_count in pair_occurrence.items():
        # Skip si co-occurrence trop faible
        if co_count < min_co_occurrence:
            continue

        # Skip si une des cartes n'est pas assez fréquente
        if card_a not in valid_cards or card_b not in valid_cards:
            continue

        # Occurrences individuelles
        count_a = card_occurrence[card_a]
        count_b = card_occurrence[card_b]

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

        # Ne garder que les synergies significatives
        if lift >= MIN_LIFT_SCORE:
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

    for fmt in formats:
        print(f"\n📂 Format: {fmt}")

        # Récupérer les trophy decks
        decks = get_trophy_decks(set_code, fmt)
        if not decks:
            print(f"   ⚠️ Aucun deck trouvé")
            continue

        # Calculer les lift scores
        synergies = calculate_lift_scores(decks)
        print(f"   🎯 {len(synergies)} synergies significatives (lift >= {MIN_LIFT_SCORE})")

        if synergies:
            # Supprimer les anciennes synergies
            delete_old_synergies(set_code, fmt)

            # Sauvegarder les nouvelles
            saved = save_synergies(synergies, set_code, fmt)
            total_saved += saved
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

    return total_saved

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
    print(f"⚙️ Seuils: min_lift={MIN_LIFT_SCORE} (co_occurrence et card_occurrence sont dynamiques)")

    # Traiter chaque set
    total_saved = 0
    for set_code in sets_to_process:
        saved = process_synergies(set_code, TARGET_FORMATS)
        total_saved += saved

    # Résumé final
    print(f"\n{'='*60}")
    print("✨ ETL Synergies - Terminé")
    print(f"{'='*60}")
    print(f"💾 Total synergies sauvegardées: {total_saved}")
