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
TARGET_SET = "ECL" 

# --- ENVIRONNEMENT ---
current_dir = Path(__file__).parent
root_dir = current_dir.parent
env_path = root_dir / '.env'
load_dotenv(dotenv_path=env_path)

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY") or os.getenv("VITE_SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ ERREUR: Variables d'environnement SUPABASE_URL ou SUPABASE_KEY manquantes.")
    sys.exit(1)

HEADERS_SUPABASE = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates"
}

# ==============================================================================
# 2. LOGIQUE SCRYFALL
# ==============================================================================

def get_scryfall_data(set_code, wanted_names):
    """
    Récupère les données Scryfall. 
    1. Recherche par set.
    2. Recherche par noms pour les cartes manquantes (Special Guests, etc.).
    """
    cards_metadata = {}
    
    # --- PHASE 1 : Recherche par SET ---
    print(f"📡 Phase 1: Recherche par set '{set_code}' sur Scryfall...")
    url = f"https://api.scryfall.com/cards/search?q=set:{set_code}"
    while url:
        response = requests.get(url)
        if response.status_code != 200: break
        data = response.json()
        for card in data.get('data', []):
            _process_card(card, cards_metadata)
        url = data.get('next_page')
        if url: time.sleep(0.1)

    # --- PHASE 2 : Recherche par NOMS pour les manquants ---
    missing_names = [name for name in wanted_names if name not in cards_metadata]
    
    # On vérifie aussi si ce sont des cartes double-face (Scryfall renvoie "Front // Back")
    # On va indexer par front_face aussi pour faciliter la correspondance
    _index_by_front_face(cards_metadata)
    
    missing_names = [name for name in wanted_names if name not in cards_metadata]

    if missing_names:
        print(f"📡 Phase 2: Recherche de {len(missing_names)} cartes par nom exact...")
        for i in range(0, len(missing_names), 75):
            chunk = missing_names[i:i + 75]
            identifiers = [{"name": n} for n in chunk]
            resp = requests.post("https://api.scryfall.com/cards/collection", json={"identifiers": identifiers})
            if resp.status_code == 200:
                data = resp.json()
                for card in data.get('data', []):
                    if 'name' in card: _process_card(card, cards_metadata)
            time.sleep(0.1)
            
    # On ré-indexe après phase 2
    _index_by_front_face(cards_metadata)
    
    # --- PHASE 3 : Recherche FUZZY pour les irréductibles (Typos, etc.) ---
    missing_names = [name for name in wanted_names if name not in cards_metadata]
    if missing_names:
        print(f"📡 Phase 3: Recherche floue (fuzzy) pour {len(missing_names)} cartes...")
        for name in missing_names:
            # On cherche par nom flou
            url = f"https://api.scryfall.com/cards/named?fuzzy={requests.utils.quote(name)}"
            resp = requests.get(url)
            if resp.status_code == 200:
                card = resp.json()
                _process_card(card, cards_metadata)
                print(f"   ✅ Trouvé via fuzzy: '{name}' -> '{card.get('name')}'")
            time.sleep(0.1)

    # On ré-indexe une dernière fois pour les résultats du fuzzy search (DFCs)
    _index_by_front_face(cards_metadata)

    return cards_metadata

def _index_by_front_face(metadata_dict):
    """Permet de trouver 'Carte A' si Scryfall a 'Carte A // Carte B'"""
    dfc_map = {}
    for full_name, data in metadata_dict.items():
        if " // " in full_name:
            front = full_name.split(" // ")[0]
            dfc_map[front] = data
    metadata_dict.update(dfc_map)

def _process_card(card, metadata_dict):
    name = card.get('name')
    if not name: return
    cmc = card.get('cmc')
    mana_cost = card.get('mana_cost')
    type_line = card.get('type_line')

    if 'card_faces' in card and not mana_cost:
        face = card['card_faces'][0]
        mana_cost = face.get('mana_cost')
        type_line = face.get('type_line')

    metadata_dict[name] = {
        "card_cmc": cmc,
        "card_cost": mana_cost,
        "card_type": type_line
    }

# ==============================================================================
# 3. MISE À JOUR SUPABASE
# ==============================================================================

def run_enrichment(set_code):
    """
    Exécute le workflow complet.
    """
    start_time = time.time()
    
    # 1. Lire Supabase
    print(f"🔍 Recherche des cartes existantes dans Supabase pour {set_code}...")
    select_url = f"{SUPABASE_URL}/rest/v1/card_stats?select=id,card_name,set_code,format,filter_context&set_code=eq.{set_code}"
    resp = requests.get(select_url, headers=HEADERS_SUPABASE)
    if resp.status_code != 200:
        print(f"❌ Erreur Supabase: {resp.text}")
        return
    supabase_rows = resp.json()
    print(f"✅ {len(supabase_rows)} lignes trouvées.")

    unique_names = list(set(row['card_name'] for row in supabase_rows))

    # 2. Lire Scryfall
    scryfall_meta = get_scryfall_data(set_code, unique_names)
    
    # 3. Préparer Updates
    updates = []
    missing_names = []
    for row in supabase_rows:
        name = row['card_name']
        if name in scryfall_meta:
            data = scryfall_meta[name]
            updates.append({
                "id": row['id'],
                "card_name": row['card_name'],
                "set_code": row['set_code'],
                "format": row['format'],
                "filter_context": row['filter_context'],
                "card_cmc": data['card_cmc'],
                "card_cost": data['card_cost'],
                "card_type": data['card_type']
            })
        else:
            if name not in missing_names: missing_names.append(name)

    if missing_names:
        print(f"⚠️ {len(missing_names)} cartes toujours introuvables sur Scryfall : {missing_names[:5]}...")

    # 4. Batch Update
    if updates:
        print(f"🚀 Mise à jour de {len(updates)} lignes dans Supabase...")
        batch_size = 500
        for i in range(0, len(updates), batch_size):
            chunk = updates[i:i + batch_size]
            res = requests.post(f"{SUPABASE_URL}/rest/v1/card_stats", json=chunk, headers=HEADERS_SUPABASE)
            if res.status_code >= 400: print(f"❌ Erreur Batch {i}: {res.text}")
            else: print(f"✅ Batch {i//batch_size + 1} terminé.")

    end_time = time.time()
    print(f"\n✨ Terminé en {round(end_time - start_time, 2)} secondes.")

# ==============================================================================
# 4. MAIN
# ==============================================================================

if __name__ == "__main__":
    # On utilise la variable TARGET_SET définie plus haut
    target_set = TARGET_SET.upper()
    
    if not target_set:
        print("❌ ERREUR: TARGET_SET n'est pas défini dans le script.")
        sys.exit(1)

    print(f"🚀 Démarrage de l'enrichissement pour le set : {target_set}")
    run_enrichment(target_set)
