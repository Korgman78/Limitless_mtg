import requests
import os
import time
import random
import re
import math
from datetime import date
from dotenv import load_dotenv
from pathlib import Path

# ==============================================================================
# 1. CONFIGURATION
# ==============================================================================

INGESTION_MODE = "ALL"
END_DATE = date.today().strftime("%Y-%m-%d")

# ✅ VARIABLE DE CIBLAGE (liste de codes, ou liste vide pour tous les sets actifs)
# ⚠️ Ce script croise TARGET_SET_CODES avec les sets `active=true` de Supabase :
# un set listé ici mais inactif est ignoré (warning). HOB reste donc inerte
# jusqu'au passage en actif ; comme chaque run refetch toute la fenêtre depuis
# `start_date`, le 1er run après activation rattrape l'historique complet.
TARGET_SET_CODES = ["HOB"]  # Ex: ["TLA", "FDN", "DSK"] ou [] pour tous

ALL_FORMATS = ["PremierDraft", "TradDraft", "Sealed", "ArenaDirect_Sealed"]

COLORS = [
    "", "WU", "UB", "BR", "RG", "WG", "WB", "UR", "BG", "WR", "UG", 
    "WUB", "WUR", "WUG", "WBR", "WBG", "WRG", "UBR", "UBG", "URG", "BRG"
]

# --- ENVIRONNEMENT ---
current_dir = Path(__file__).parent
root_dir = current_dir.parent
env_path = root_dir / '.env'
load_dotenv(dotenv_path=env_path)

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY") or os.getenv("VITE_SUPABASE_KEY")

HEADERS_17LANDS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json"
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

def random_sleep(min_seconds=2.0, max_seconds=4.5):
    time.sleep(random.uniform(min_seconds, max_seconds))

def clean_color_code(raw_name):
    if not raw_name: return "Unknown"
    match = re.search(r'\(([WUBRG]+)\)', raw_name)
    if match: text_to_process = match.group(1)
    else: text_to_process = raw_name
    base_letters = sorted(list(set(re.findall(r'[WUBRG]', text_to_process))))
    base_code = "".join(base_letters)
    is_splash = "Splash" in raw_name
    if base_code: return f"{base_code} + Splash" if is_splash else base_code
    clean_text = raw_name.replace(" + Splash", "").replace(" (Splash)", "").strip()
    return f"{clean_text} + Splash" if is_splash else clean_text

def safe_float(value, is_percentage=False):
    if value is None: return None
    try:
        f_val = float(value)
        if math.isnan(f_val) or math.isinf(f_val): return None
        if is_percentage and 0 <= f_val <= 1.0: return f_val * 100.0
        return f_val
    except (ValueError, TypeError): return None

def get_gih_strict(row):
    return safe_float(row.get('ever_drawn_win_rate'), is_percentage=True)

def extract_card_rows(data):
    """Normalise la reponse de /api/card_data.

    Le nouvel endpoint enveloppe les cartes dans {copyright, notes, data:[...]}.
    On reste tolerant a l'ancien format (tableau brut) au cas ou.
    """
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        rows = data.get('data')
        if isinstance(rows, list):
            return rows
        # Fallback : premiere valeur de type liste
        for v in data.values():
            if isinstance(v, list):
                return v
    return []

def fetch_data_safe(url, context_name="Données"):
    try:
        print(f"   📡 GET : {url}")
        r = requests.get(url, headers=HEADERS_17LANDS)
        if r.status_code == 200: return r.json()
        elif r.status_code == 429:
            print(f"      ⏳ Rate Limit. Pause 30s...")
            time.sleep(30)
            return None
        else:
            print(f"      ❌ Status {r.status_code}")
            return None
    except Exception as e:
        print(f"      ❌ Exception: {e}")
        return None

# ==============================================================================
# 3. RECUPERATION DES SETS ACTIFS & HISTORIQUE
# ==============================================================================

def get_active_sets():
    url = f"{SUPABASE_URL}/rest/v1/sets?active=eq.true&select=code,start_date"
    try:
        r = requests.get(url, headers=HEADERS_SUPABASE)
        if r.status_code == 200:
            return r.json() 
        else:
            print(f"❌ Erreur Fetch Sets: {r.text}")
            return []
    except Exception as e:
        print(f"❌ Exception Fetch Sets: {e}")
        return []

def get_existing_histories(set_code, fmt):
    """Pour les Decks (Archetypes) — retourne (histories, initial_wrs)"""
    url = f"{SUPABASE_URL}/rest/v1/archetype_stats?select=colors,win_rate_history,initial_wr&set_code=eq.{set_code}&format=eq.{fmt}"
    try:
        r = requests.get(url, headers=HEADERS_SUPABASE)
        if r.status_code == 200:
            data = r.json()
            histories = {row['colors']: row.get('win_rate_history', []) for row in data}
            initial_wrs = {row['colors']: row.get('initial_wr') for row in data}
            return histories, initial_wrs
        return {}, {}
    except Exception:
        return {}, {}

def get_existing_card_histories(set_code, fmt, context):
    """
    Pour les Cartes : Récupère l'historique WIN RATE et ALSA par nom de carte
    pour un set, un format et un contexte de couleur donnés.
    Retourne un tuple (wr_histories, alsa_histories, initial_wrs, initial_alsas)
    """
    url = f"{SUPABASE_URL}/rest/v1/card_stats?select=card_name,win_rate_history,alsa_history,initial_wr,initial_alsa&set_code=eq.{set_code}&format=eq.{fmt}&filter_context=eq.{context}"
    try:
        r = requests.get(url, headers=HEADERS_SUPABASE)
        if r.status_code == 200:
            data = r.json()
            wr_histories = {row['card_name']: row.get('win_rate_history', []) for row in data}
            alsa_histories = {row['card_name']: row.get('alsa_history', []) for row in data}
            initial_wrs = {row['card_name']: row.get('initial_wr') for row in data}
            initial_alsas = {row['card_name']: row.get('initial_alsa') for row in data}
            return wr_histories, alsa_histories, initial_wrs, initial_alsas
        return {}, {}, {}, {}
    except Exception as e:
        print(f"⚠️ Erreur récupération historique cartes: {e}")
        return {}, {}, {}, {}

# ==============================================================================
# 4. INGESTION DES DECKS (Avec Gestion Historique)
# ==============================================================================

def ingest_decks(set_code, start_date):
    print(f"\n🚀 [DECKS] Traitement du set : {set_code} (Start: {start_date})")
    
    for fmt in ALL_FORMATS:
        print(f" 👉 Format: {fmt}")
        
        existing_histories, existing_initial_wrs = get_existing_histories(set_code, fmt)
        
        url = f"https://www.17lands.com/color_ratings/data?expansion={set_code}&event_type={fmt}&start_date={start_date}&end_date={END_DATE}&combine_splash=false"
        raw_data = fetch_data_safe(url, f"Decks {fmt}")
        random_sleep()

        if not raw_data: continue

        target_data = raw_data if isinstance(raw_data, list) else raw_data.get('results', list(raw_data.values())[0] if raw_data else [])
        unique_batch = {}

        for row in target_data:
            try:
                name = row.get('color_name')
                if not name: continue
                final_code_colors = clean_color_code(name)
                games = row.get('games', 0)
                if games == 0: continue 

                wr = safe_float(row.get('win_rate'), is_percentage=True)
                if wr is None:
                    wins = safe_float(row.get('wins', 0)) or 0
                    wr = (wins / games) * 100
                
                current_wr = round(wr, 1)

                # --- GESTION DE L'HISTORIQUE ---
                history = existing_histories.get(final_code_colors)
                if history is None: history = []
                
                history.append(current_wr)
                if len(history) > 21: history = history[-21:]
                # -------------------------------

                # --- INITIAL WR (écrit une seule fois) ---
                initial_wr = existing_initial_wrs.get(final_code_colors)
                if initial_wr is None:
                    initial_wr = current_wr

                record = {
                    "set_code": set_code,
                    "archetype_name": name,
                    "colors": final_code_colors,
                    "format": fmt,
                    "win_rate": current_wr,
                    "win_rate_history": history,
                    "games_count": games,
                    "initial_wr": initial_wr,
                }
                unique_batch[f"{fmt}_{final_code_colors}"] = record
            except: continue

        records = list(unique_batch.values())
        if records:
            api_url = f"{SUPABASE_URL}/rest/v1/archetype_stats?on_conflict=set_code,colors,format"
            try:
                resp = requests.post(api_url, json=records, headers=HEADERS_SUPABASE)
                if resp.status_code >= 400: print(f"      ❌ Erreur Supabase: {resp.text}")
                else: print(f"      ✅ {len(records)} decks sauvegardés.")
            except Exception as e: print(f"      ❌ Exception POST: {e}")

# ==============================================================================
# 5. INGESTION DES CARTES (Avec Win Rate History)
# ==============================================================================

def ingest_cards(set_code, start_date):
    print(f"\n🚀 [CARTES] Traitement du set : {set_code} (Start: {start_date})")
    
    for fmt in ALL_FORMATS:
        print(f"\n 📂 Format: {fmt}")
        
        for color in COLORS:
            context = color if color else "Global"

            # 1. Récupération de l'historique existant pour ce set/format/context
            existing_wr_histories, existing_alsa_histories, existing_initial_wrs, existing_initial_alsas = get_existing_card_histories(set_code, fmt, context)
            
            is_sealed = "Sealed" in fmt
            splash_param = "true" if is_sealed else "false"

            # ⚠️ Migration API 17Lands (juil. 2026) : les stats de cartes filtrees
            # par couleur d'archetype sont passees de /card_ratings/data (qui ignore
            # desormais le param `colors`) au nouvel endpoint /api/card_data.
            # start_date/end_date/combine_splash sont ignores par ce endpoint, qui
            # renvoie tout l'historique cumule du set (comportement voulu).
            base_url = f"https://www.17lands.com/api/card_data?expansion={set_code}&event_type={fmt}&start_date={start_date}&end_date={END_DATE}&combine_splash={splash_param}"
            url = f"{base_url}&colors={color}" if color else base_url

            data = fetch_data_safe(url, f"Cartes {context}")
            random_sleep(2.0, 3.5)

            if not data: continue

            target_list = extract_card_rows(data)

            if not target_list: continue
            unique_batch = {}

            for row in target_list:
                try:
                    name = row.get('name')
                    if not name: continue

                    gih = get_gih_strict(row)
                    alsa = safe_float(row.get('avg_seen'))
                    img_count = row.get('game_count') or 0
                    
                    current_wr = round(gih, 2) if gih is not None else None
                    current_alsa = round(alsa, 2) if alsa is not None else None

                    # --- GESTION HISTORIQUE WIN RATE ---
                    wr_history = existing_wr_histories.get(name)
                    if wr_history is None: wr_history = []
                    if current_wr is not None:
                        wr_history.append(current_wr)
                        if len(wr_history) > 21:
                            wr_history = wr_history[-21:]

                    # --- GESTION HISTORIQUE ALSA ---
                    alsa_history = existing_alsa_histories.get(name)
                    if alsa_history is None: alsa_history = []
                    if current_alsa is not None:
                        alsa_history.append(current_alsa)
                        if len(alsa_history) > 21:
                            alsa_history = alsa_history[-21:]
                    # ----------------------------------

                    # --- INITIAL VALUES (écrites une seule fois) ---
                    initial_wr = existing_initial_wrs.get(name)
                    if initial_wr is None and current_wr is not None:
                        initial_wr = current_wr
                    initial_alsa = existing_initial_alsas.get(name)
                    if initial_alsa is None and current_alsa is not None:
                        initial_alsa = current_alsa

                    record = {
                        "set_code": set_code,
                        "card_name": name,
                        "rarity": row.get('rarity', 'common'),
                        "colors": row.get('color', ''),
                        "filter_context": context,
                        "format": fmt,
                        "gih_wr": current_wr,
                        "alsa": current_alsa,
                        "img_count": img_count,
                        "win_rate_history": wr_history,
                        "alsa_history": alsa_history,
                        "initial_wr": initial_wr,
                        "initial_alsa": initial_alsa,
                    }
                    unique_batch[f"{fmt}_{name}_{context}"] = record
                except Exception: continue
            
            batch = list(unique_batch.values())
            if batch:
                for i in range(0, len(batch), 500):
                    chunk = batch[i:i + 500]
                    api_url = f"{SUPABASE_URL}/rest/v1/card_stats?on_conflict=set_code,card_name,filter_context,format"
                    try:
                        resp = requests.post(api_url, json=chunk, headers=HEADERS_SUPABASE)
                        if resp.status_code >= 400: print(f"      ❌ Erreur Batch {i}: {resp.text}")
                    except Exception as e: print(f"      ❌ Exception POST: {e}")
                
                print(f"      ✅ {context.ljust(6)} : {len(batch)} cartes traitées")

# ==============================================================================
# 5bis. INGESTION DES CARTES PAR NIVEAU DE JOUEUR (Global uniquement)
# ==============================================================================

# Paliers 17Lands : top / middle / bottom (param user_group de l'API card_ratings)
PLAYER_LEVELS = ["top", "middle", "bottom"]

def ingest_cards_player_level(set_code, start_date):
    """
    Récupère les stats GLOBALES des cartes (pas de détail par archétype) pour
    chaque format ET chaque niveau de joueur (top / middle / bottom).
    Alimente la table `card_player_level_stats` utilisée par l'onglet Compare
    en mode "Player Level". Pas d'historique pour rester léger.
    """
    print(f"\n🚀 [CARTES / PLAYER LEVEL] Traitement du set : {set_code} (Start: {start_date})")

    for fmt in ALL_FORMATS:
        print(f"\n 📂 Format: {fmt}")

        is_sealed = "Sealed" in fmt
        splash_param = "true" if is_sealed else "false"

        for level in PLAYER_LEVELS:
            # Migration API 17Lands : /card_ratings/data -> /api/card_data (voir ingest_cards).
            url = (
                f"https://www.17lands.com/api/card_data?expansion={set_code}"
                f"&event_type={fmt}&start_date={start_date}&end_date={END_DATE}"
                f"&combine_splash={splash_param}&user_group={level}"
            )

            data = fetch_data_safe(url, f"Cartes {level}")
            random_sleep(2.0, 3.5)

            if not data: continue

            target_list = extract_card_rows(data)

            if not target_list: continue
            unique_batch = {}

            for row in target_list:
                try:
                    name = row.get('name')
                    if not name: continue

                    gih = get_gih_strict(row)
                    alsa = safe_float(row.get('avg_seen'))
                    img_count = row.get('game_count') or 0

                    record = {
                        "set_code": set_code,
                        "card_name": name,
                        "rarity": row.get('rarity', 'common'),
                        "colors": row.get('color', ''),
                        "format": fmt,
                        "player_level": level,
                        "gih_wr": round(gih, 2) if gih is not None else None,
                        "alsa": round(alsa, 2) if alsa is not None else None,
                        "img_count": img_count,
                    }
                    unique_batch[f"{fmt}_{name}_{level}"] = record
                except Exception: continue

            batch = list(unique_batch.values())
            if batch:
                for i in range(0, len(batch), 500):
                    chunk = batch[i:i + 500]
                    api_url = f"{SUPABASE_URL}/rest/v1/card_player_level_stats?on_conflict=set_code,card_name,format,player_level"
                    try:
                        resp = requests.post(api_url, json=chunk, headers=HEADERS_SUPABASE)
                        if resp.status_code >= 400: print(f"      ❌ Erreur Batch {i}: {resp.text}")
                    except Exception as e: print(f"      ❌ Exception POST: {e}")

                print(f"      ✅ {level.ljust(6)} : {len(batch)} cartes traitées")

# ==============================================================================
# MAIN LOOP
# ==============================================================================

if __name__ == "__main__":
    if not SUPABASE_URL:
        print("❌ ERREUR: Variables d'environnement manquantes.")
        exit(1)
        
    print("🌍 Démarrage de l'ETL Multi-Set...")
    
    all_active_sets = get_active_sets()

    sets_to_process = []
    if TARGET_SET_CODES:
        sets_to_process = [s for s in all_active_sets if s['code'] in TARGET_SET_CODES]
        missing = set(TARGET_SET_CODES) - {s['code'] for s in sets_to_process}
        if missing:
            print(f"⚠️ ATTENTION : Sets non trouvés dans les sets actifs : {missing}")
    else:
        sets_to_process = all_active_sets

    if not sets_to_process:
        print("⚠️ Aucun set à traiter. Fin du programme.")
    else:
        print(f"📋 Sets à traiter : {[s['code'] for s in sets_to_process]}")

        for s in sets_to_process:
            set_code = s['code']
            start_date = s['start_date']
            
            if not start_date:
                print(f"⚠️ Pas de start_date pour {set_code}, ignoré.")
                continue

            if INGESTION_MODE in ["ALL", "DECKS"]:
                ingest_decks(set_code, start_date)
            
            if INGESTION_MODE in ["ALL", "CARDS"]:
                ingest_cards(set_code, start_date)

            if INGESTION_MODE in ["ALL", "CARDS", "PLAYER"]:
                ingest_cards_player_level(set_code, start_date)

    print("\n✨ Import Terminé.")