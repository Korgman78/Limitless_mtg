import requests
import os
import time
import random
import argparse
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv
from pathlib import Path

# ==============================================================================
# 1. CONFIGURATION
# ==============================================================================

# Sets et formats à traiter (modifiable)
TARGET_SET_CODES = ["ECL"]  # Ex: ["FDN", "DSK"] ou [] pour tous les sets actifs
TARGET_FORMATS = ["PremierDraft", "TradDraft"]  # Formats à scraper

# Date cible (None = dernières 24h, ou "YYYY-MM-DD" pour une date spécifique)
TARGET_DATE = None  # Ex: "2025-01-20" pour scraper les decks du 20 janvier 2025

# Toutes les combinaisons de couleurs (31 au total)
ALL_COLOR_COMBINATIONS = [
    # 5 mono-couleurs
    "W", "U", "B", "R", "G",
    # 10 bi-couleurs
    "WU", "WB", "WR", "WG", "UB", "UR", "UG", "BR", "BG", "RG",
    # 10 tri-couleurs
    "WUB", "WUR", "WUG", "WBR", "WBG", "WRG", "UBR", "UBG", "URG", "BRG",
    # 5 quadri-couleurs
    "WUBR", "WUBG", "WURG", "WBRG", "UBRG",
    # 1 penta-couleur
    "WUBRG"
]

# --- ENVIRONNEMENT ---
current_dir = Path(__file__).parent
root_dir = current_dir.parent
env_path = root_dir / '.env'
load_dotenv(dotenv_path=env_path)

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY") or os.getenv("VITE_SUPABASE_KEY")

# Headers pour 17lands (bonnes pratiques scraping)
HEADERS_17LANDS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Cache-Control": "no-cache",
}

HEADERS_SUPABASE = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates"
}

# ==============================================================================
# 2. FONCTIONS UTILITAIRES
# ==============================================================================

def random_sleep(min_seconds=2.5, max_seconds=4.0):
    """Sleep aléatoire pour éviter le rate limiting"""
    sleep_time = random.uniform(min_seconds, max_seconds)
    print(f"   💤 Pause {sleep_time:.1f}s...")
    time.sleep(sleep_time)

def get_date_range():
    """
    Retourne (start_time, end_time) pour filtrer les trophies.
    - Si TARGET_DATE est défini: retourne la journée complète de cette date
    - Sinon: retourne les dernières 24h
    """
    if TARGET_DATE:
        # Parse la date cible
        target = datetime.strptime(TARGET_DATE, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        start_time = target  # 00:00:00 UTC
        end_time = target + timedelta(days=1)  # 23:59:59 UTC (jour suivant)
        return start_time, end_time
    else:
        # Dernières 24h
        now = datetime.now(timezone.utc)
        start_time = now - timedelta(hours=24)
        end_time = now
        return start_time, end_time

def parse_trophy_time(time_str):
    """Parse le timestamp d'un trophy deck (format ISO) et retourne un datetime UTC"""
    if not time_str:
        return None
    try:
        # Format: "2024-01-15T10:30:00Z" ou "2024-01-15T10:30:00" ou avec offset
        if time_str.endswith('Z'):
            time_str = time_str[:-1] + '+00:00'
        dt = datetime.fromisoformat(time_str)
        # S'assurer que le datetime est timezone-aware (UTC)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None

def normalize_colors(colors_str):
    """Normalise les couleurs en ordre WUBRG standard"""
    if not colors_str:
        return ""
    order = "WUBRG"
    chars = sorted(set(colors_str.upper()), key=lambda c: order.index(c) if c in order else 99)
    return "".join(c for c in chars if c in order)

def fetch_with_retry(url, context_name="Data", max_retries=3, method="GET", payload=None):
    """Fetch avec retry et gestion des erreurs (incluant 403). Supporte GET et POST."""
    for attempt in range(max_retries):
        try:
            if method == "POST" and payload:
                print(f"   📡 POST: {url} | {context_name}")
                response = requests.post(url, json=payload, headers=HEADERS_17LANDS, timeout=30)
            else:
                print(f"   📡 GET: {url[:100]}...")
                response = requests.get(url, headers=HEADERS_17LANDS, timeout=30)

            if response.status_code == 200:
                return response.json()
            elif response.status_code == 429:
                wait_time = 60 * (attempt + 1)
                print(f"   ⏳ Rate limit (429). Attente {wait_time}s...")
                time.sleep(wait_time)
            elif response.status_code == 403:
                # 403 = bloqué temporairement, attendre plus longtemps
                wait_time = 90 * (attempt + 1)
                print(f"   🚫 Bloqué (403). Attente {wait_time}s...")
                time.sleep(wait_time)
            elif response.status_code == 404:
                print(f"   ⚠️ Pas de données (404) pour {context_name}")
                return None
            else:
                print(f"   ❌ Erreur {response.status_code}: {response.text[:200]}")
                if attempt < max_retries - 1:
                    time.sleep(10)
        except requests.exceptions.Timeout:
            print(f"   ⏱️ Timeout, tentative {attempt + 1}/{max_retries}")
            time.sleep(10)
        except Exception as e:
            print(f"   ❌ Exception: {e}")
            if attempt < max_retries - 1:
                time.sleep(10)

    return None

# ==============================================================================
# 3. RECUPERATION DES DONNEES SUPABASE
# ==============================================================================

def get_active_sets():
    """Récupère les sets actifs depuis Supabase"""
    url = f"{SUPABASE_URL}/rest/v1/sets?active=eq.true&select=code,start_date"
    try:
        response = requests.get(url, headers=HEADERS_SUPABASE)
        if response.status_code == 200:
            return response.json()
        else:
            print(f"❌ Erreur fetch sets: {response.text}")
            return []
    except Exception as e:
        print(f"❌ Exception fetch sets: {e}")
        return []

def get_existing_deck_ids(set_code, fmt):
    """Récupère tous les aggregate_id déjà en BDD pour éviter les doublons (avec pagination)"""
    all_ids = set()
    offset = 0
    page_size = 1000

    while True:
        url = f"{SUPABASE_URL}/rest/v1/trophy_decks?set_code=eq.{set_code}&format=eq.{fmt}&select=aggregate_id&limit={page_size}&offset={offset}"
        try:
            response = requests.get(url, headers=HEADERS_SUPABASE)
            if response.status_code == 200:
                data = response.json()
                if not data:
                    break  # Plus de données
                for row in data:
                    all_ids.add(row['aggregate_id'])
                if len(data) < page_size:
                    break  # Dernière page
                offset += page_size
            else:
                print(f"   ⚠️ Erreur fetch existing IDs: {response.text[:100]}")
                break
        except Exception as e:
            print(f"   ⚠️ Exception fetch existing IDs: {e}")
            break

    return all_ids

# ==============================================================================
# 4. FONCTIONS DE SCRAPING 17LANDS
# ==============================================================================

def fetch_trophies(expansion, format_type, colors=None):
    """
    Récupère la liste des trophies pour un set/format/couleur via POST.
    Utilise le même endpoint que l'interface web de 17lands.
    """
    url = "https://www.17lands.com/data/trophies/"

    payload = {
        "expansion": expansion,
        "event_type": format_type,
        "card_names": [],
        "ranks": [],
        "deck_colors": [colors] if colors else []
    }

    return fetch_with_retry(
        url,
        context_name=f"Trophies {expansion}/{format_type}/{colors or 'ALL'}",
        method="POST",
        payload=payload
    )

def fetch_deck_details(aggregate_id, deck_index=0):
    """Récupère les détails d'un deck par son ID"""
    url = f"https://www.17lands.com/data/deck?draft_id={aggregate_id}&deck_index={deck_index}"
    return fetch_with_retry(url, f"Deck {aggregate_id}")

def process_deck_to_cardlist(deck_data):
    """
    Transforme les données d'un deck en liste de cartes avec quantités.
    Retourne un dict {card_name: quantity} pour le maindeck uniquement.
    """
    if not deck_data:
        return None

    cards_info = deck_data.get('cards', {})

    # Chercher le groupe "Deck" (maindeck)
    for group in deck_data.get('groups', []):
        group_name = group.get('name', '').lower()
        if group_name in ['deck', 'maindeck', 'main']:
            card_ids = group.get('cards', [])

            # Compter les occurrences de chaque carte
            card_counts = {}
            for cid in card_ids:
                card_obj = cards_info.get(str(cid), {})
                name = card_obj.get('name')
                if name:
                    card_counts[name] = card_counts.get(name, 0) + 1

            return card_counts

    # Fallback: prendre le premier groupe non-sideboard
    for group in deck_data.get('groups', []):
        group_name = group.get('name', '').lower()
        if 'sideboard' not in group_name and 'side' not in group_name:
            card_ids = group.get('cards', [])
            card_counts = {}
            for cid in card_ids:
                card_obj = cards_info.get(str(cid), {})
                name = card_obj.get('name')
                if name:
                    card_counts[name] = card_counts.get(name, 0) + 1
            if card_counts:
                return card_counts

    return None

# ==============================================================================
# 5. INGESTION DES TROPHY DECKS
# ==============================================================================

def ingest_trophy_decks(set_code, formats):
    """
    Ingère les trophy decks pour un set donné, tous formats et toutes couleurs.
    Filtre par date selon TARGET_DATE (date spécifique) ou dernières 24h.
    """
    print(f"\n{'='*60}")
    print(f"🏆 TROPHY DECKS - Set: {set_code}")
    print(f"{'='*60}")

    start_time, end_time = get_date_range()
    if TARGET_DATE:
        print(f"📅 Date cible: {TARGET_DATE} (de {start_time.isoformat()} à {end_time.isoformat()})")
    else:
        print(f"📅 Période: dernières 24h (depuis {start_time.isoformat()})")

    stats = {"total_fetched": 0, "total_saved": 0, "skipped_old": 0, "skipped_error": 0, "skipped_existing": 0}
    request_count = 0  # Compteur pour pause périodique

    for fmt in formats:
        print(f"\n📂 Format: {fmt}")

        # Récupérer les IDs déjà en BDD pour éviter les doublons
        existing_ids = get_existing_deck_ids(set_code, fmt)
        print(f"   📦 {len(existing_ids)} decks déjà en BDD")

        # Parcourir chaque combinaison de couleurs (un appel API par couleur)
        for color_combo in ALL_COLOR_COMBINATIONS:
            # Récupérer les trophies pour cette couleur spécifique
            trophies = fetch_trophies(set_code, fmt, colors=color_combo)
            random_sleep(3.0, 5.0)
            request_count += 1

            if not trophies:
                continue

            # Filtrer par date (plage définie par TARGET_DATE ou dernières 24h)
            recent_trophies = []
            for trophy in trophies:
                trophy_time = parse_trophy_time(trophy.get('time'))
                if trophy_time and start_time <= trophy_time < end_time:
                    recent_trophies.append(trophy)
                else:
                    stats["skipped_old"] += 1

            if not recent_trophies:
                continue

            print(f"   🎨 {color_combo}: {len(recent_trophies)} decks récents (sur {len(trophies)} total)")

            # Récupérer les détails de chaque deck
            color_records = []
            for trophy in recent_trophies:
                agg_id = trophy.get('aggregate_id')
                if not agg_id:
                    continue

                # Skip si déjà en BDD
                if agg_id in existing_ids:
                    stats["skipped_existing"] += 1
                    print(f"   ⏭️ Skip doublon: {agg_id[:16]}...")
                    continue

                stats["total_fetched"] += 1
                request_count += 1

                # Pause longue toutes les 15 requêtes
                if request_count % 15 == 0:
                    print(f"   ⏸️ Pause préventive (après {request_count} requêtes)...")
                    time.sleep(45)

                # Fetch deck details
                deck_data = fetch_deck_details(agg_id)
                random_sleep(4.0, 6.0)  # Sleep plus long entre chaque requête

                if not deck_data:
                    stats["skipped_error"] += 1
                    continue

                # Extraire la liste de cartes
                cardlist = process_deck_to_cardlist(deck_data)
                if not cardlist:
                    stats["skipped_error"] += 1
                    continue

                # Créer le record pour Supabase
                record = {
                    "set_code": set_code,
                    "format": fmt,
                    "archetype": color_combo,
                    "aggregate_id": agg_id,
                    "wins": trophy.get('wins', 0),
                    "losses": trophy.get('losses', 0),
                    "trophy_time": trophy.get('time'),
                    "cardlist": cardlist,  # JSON: {card_name: quantity}
                    "scraped_at": datetime.now(timezone.utc).isoformat()
                }

                color_records.append(record)

            # Sauvegarder au fil de l'eau après chaque combinaison de couleurs
            if color_records:
                api_url = f"{SUPABASE_URL}/rest/v1/trophy_decks?on_conflict=aggregate_id"
                try:
                    resp = requests.post(api_url, json=color_records, headers=HEADERS_SUPABASE)
                    if resp.status_code >= 400:
                        print(f"      ❌ Erreur sauvegarde {color_combo}: {resp.text[:200]}")
                    else:
                        stats["total_saved"] += len(color_records)
                        print(f"      ✅ {len(color_records)} decks {color_combo} sauvegardés")
                        # Ajouter les IDs sauvegardés pour éviter les doublons dans la même session
                        for rec in color_records:
                            existing_ids.add(rec['aggregate_id'])
                except Exception as e:
                    print(f"      ❌ Exception POST {color_combo}: {e}")

    # Résumé
    print(f"\n📈 Résumé {set_code}:")
    print(f"   - Decks récupérés: {stats['total_fetched']}")
    print(f"   - Decks sauvegardés: {stats['total_saved']}")
    print(f"   - Déjà en BDD (skip): {stats['skipped_existing']}")
    print(f"   - Hors période: {stats['skipped_old']}")
    print(f"   - Erreurs: {stats['skipped_error']}")

    return stats

# ==============================================================================
# MAIN
# ==============================================================================

def parse_arguments():
    """Parse les arguments de la ligne de commande"""
    parser = argparse.ArgumentParser(description='Scrape 17lands trophy decks')
    parser.add_argument(
        '--date', '-d',
        type=str,
        default=None,
        help='Date cible au format YYYY-MM-DD (défaut: dernières 24h)'
    )
    parser.add_argument(
        '--sets', '-s',
        type=str,
        nargs='+',
        default=None,
        help='Codes des sets à scraper (ex: --sets FDN DSK)'
    )
    parser.add_argument(
        '--formats', '-f',
        type=str,
        nargs='+',
        default=None,
        help='Formats à scraper (ex: --formats PremierDraft TradDraft)'
    )
    parser.add_argument(
        '--colors', '-c',
        type=str,
        nargs='+',
        default=None,
        help='Combinaisons de couleurs à scraper (ex: --colors WU WB WUB)'
    )
    return parser.parse_args()

if __name__ == "__main__":
    args = parse_arguments()

    # Override des configs par les arguments CLI
    if args.date:
        TARGET_DATE = args.date
    if args.sets:
        TARGET_SET_CODES = list(args.sets)
    if args.formats:
        TARGET_FORMATS = list(args.formats)
    if args.colors:
        ALL_COLOR_COMBINATIONS = list(args.colors)

    print("🏆 ETL Trophy Decks - Démarrage")
    print(f"⏰ {datetime.now(timezone.utc).isoformat()}")

    if not SUPABASE_URL or not SUPABASE_KEY:
        print("❌ ERREUR: Variables d'environnement SUPABASE manquantes.")
        exit(1)

    # Déterminer les sets à traiter
    if TARGET_SET_CODES:
        sets_to_process = [{"code": code} for code in TARGET_SET_CODES]
        print(f"📋 Sets ciblés: {TARGET_SET_CODES}")
    else:
        all_active = get_active_sets()
        sets_to_process = all_active
        print(f"📋 Sets actifs: {[s['code'] for s in sets_to_process]}")

    if not sets_to_process:
        print("⚠️ Aucun set à traiter.")
        exit(0)

    print(f"📋 Formats: {TARGET_FORMATS}")
    print(f"🎨 Combinaisons de couleurs: {len(ALL_COLOR_COMBINATIONS)} {ALL_COLOR_COMBINATIONS if len(ALL_COLOR_COMBINATIONS) <= 5 else ''}")
    if TARGET_DATE:
        print(f"📅 Date cible: {TARGET_DATE}")

    # Traiter chaque set
    total_stats = {"total_fetched": 0, "total_saved": 0, "skipped_old": 0, "skipped_error": 0, "skipped_existing": 0}

    for s in sets_to_process:
        set_code = s['code']
        stats = ingest_trophy_decks(set_code, TARGET_FORMATS)

        for key in total_stats:
            total_stats[key] += stats.get(key, 0)

    # Résumé final
    print(f"\n{'='*60}")
    print("✨ ETL Trophy Decks - Terminé")
    print(f"{'='*60}")
    print(f"📊 Total decks récupérés: {total_stats['total_fetched']}")
    print(f"💾 Total decks sauvegardés: {total_stats['total_saved']}")
    print(f"📦 Déjà en BDD (skip): {total_stats['skipped_existing']}")
    print(f"⏭️ Hors période: {total_stats['skipped_old']}")
    print(f"❌ Erreurs: {total_stats['skipped_error']}")
