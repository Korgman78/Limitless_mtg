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
TARGET_SET = "TMT"

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

# ==============================================================================
# 2. RÉCUPÉRATION SCRYFALL
# ==============================================================================

def fetch_scryfall_set(set_code):
    """
    Récupère toutes les cartes d'un set depuis Scryfall.
    """
    print(f"📡 Récupération du set {set_code} sur Scryfall...")
    cards = []
    # On cherche tout ce qui appartient au set, y compris les bonus sheets rattachées
    url = f"https://api.scryfall.com/cards/search?q=set:{set_code}"
    
    while url:
        resp = requests.get(url)
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
                "set_code": set_code,
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
        url = f"{SUPABASE_URL}/rest/v1/card_list"
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
    
    # 1. Scryfall
    all_cards = fetch_scryfall_set(target)
    
    # 2. Supabase
    populate_table(all_cards)
    
    print(f"\n✨ Terminé en {round(time.time() - start_time, 2)}s.")
