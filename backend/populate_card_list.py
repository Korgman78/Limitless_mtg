import requests
import os
import time
import sys
from dotenv import load_dotenv
from pathlib import Path

# ==============================================================================
# 1. CONFIGURATION
# ==============================================================================

# ✅ VARIABLE DE CIBLAGE
TARGET_SET = "MSH"

# --- ENVIRONNEMENT ---
current_dir = Path(__file__).parent
root_dir = current_dir.parent
env_path = root_dir / '.env'
load_dotenv(dotenv_path=env_path)

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY") or os.getenv("VITE_SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ ERREUR: Variables d'environnement manquantes.")
    sys.exit(1)

HEADERS_SUPABASE = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates"
}

# Scryfall exige depuis 2024 un User-Agent custom : sans lui, l'API renvoie 400.
HEADERS_SCRYFALL = {
    "User-Agent": "LimitlessMTG/1.0 (https://github.com/Korgman78/Limitless_mtg)",
    "Accept": "application/json",
}

# ==============================================================================
# 2. RÉCUPÉRATION SCRYFALL
# ==============================================================================

def fetch_bonus_sheet_codes(set_code):
    """
    Récupère les set codes des bonus sheets (child sets de type masterpiece)
    rattachées au set parent via l'API Scryfall.
    """
    resp = requests.get("https://api.scryfall.com/sets", headers=HEADERS_SCRYFALL)
    if resp.status_code != 200:
        return []
    all_sets = resp.json().get("data", [])
    bonus_codes = [
        s["code"] for s in all_sets
        if s.get("parent_set_code", "").lower() == set_code.lower()
        and s.get("set_type") in ("masterpiece", "bonus")
    ]
    if bonus_codes:
        print(f"  Found bonus sheet set(s): {bonus_codes}")
    return bonus_codes


def fetch_scryfall_set(set_code, store_as=None):
    """
    Récupère toutes les cartes d'un set depuis Scryfall.
    store_as: set_code à utiliser dans card_list (pour rattacher les bonus sheets au set parent).
    """
    target_code = store_as or set_code
    print(f"📡 Récupération du set {set_code} sur Scryfall (stocké sous {target_code})...")
    cards = []
    url = f"https://api.scryfall.com/cards/search?q=set:{set_code}"

    while url:
        resp = requests.get(url, headers=HEADERS_SCRYFALL)
        if resp.status_code != 200: break

        data = resp.json()
        for c in data.get('data', []):
            # Extraction des infos
            name = c.get('name')
            cmc = c.get('cmc')
            mana_cost = c.get('mana_cost')
            type_line = c.get('type_line')
            colors = "".join(c.get('colors', []))
            rarity = c.get('rarity')

            # Gestion DFC
            if 'card_faces' in c and not mana_cost:
                face = c['card_faces'][0]
                mana_cost = face.get('mana_cost')
                type_line = face.get('type_line')
                if not colors:
                     colors = "".join(face.get('colors', []))

            cards.append({
                "card_name": name,
                "set_code": target_code,
                "colors": colors,
                "card_cmc": cmc,
                "card_cost": mana_cost,
                "rarity": rarity,
                "card_type": type_line
            })

        url = data.get('next_page')
        if url: time.sleep(0.1)

    return cards

# ==============================================================================
# 3. POPULATION SUPABASE
# ==============================================================================

def populate_table(cards):
    if not cards:
        print("⚠️ Aucune carte trouvée.")
        return

    print(f"🚀 Insertion de {len(cards)} cartes dans card_list...")
    
    # Supabase UPSERT par lot de 500
    batch_size = 500
    for i in range(0, len(cards), batch_size):
        chunk = cards[i:i + batch_size]
        url = f"{SUPABASE_URL}/rest/v1/card_list?on_conflict=card_name,set_code"
        # On utilise resolution=merge-duplicates pour gérer la contrainte unique(card_name, set_code)
        resp = requests.post(url, json=chunk, headers=HEADERS_SUPABASE)
        
        if resp.status_code >= 400:
            print(f"❌ Erreur Batch {i}: {resp.text}")
        else:
            print(f"✅ Batch {i//batch_size + 1} terminé.")

# ==============================================================================
# MAIN
# ==============================================================================

if __name__ == "__main__":
    target = TARGET_SET.upper()
    print(f"🏁 Démarrage pour le set : {target}")

    start_time = time.time()

    # 1. Scryfall — set principal
    all_cards = fetch_scryfall_set(target)

    # 2. Scryfall — bonus sheets (child sets rattachés au parent)
    bonus_codes = fetch_bonus_sheet_codes(target)
    for bonus_code in bonus_codes:
        bonus_cards = fetch_scryfall_set(bonus_code, store_as=target)
        print(f"  {len(bonus_cards)} bonus sheet cards from {bonus_code}")
        all_cards.extend(bonus_cards)

    # 3. Supabase
    populate_table(all_cards)

    print(f"\n✨ Terminé en {round(time.time() - start_time, 2)}s.")
