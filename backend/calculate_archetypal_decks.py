import requests
import os
import time
import json
import statistics
from collections import Counter
from dotenv import load_dotenv
from pathlib import Path

# ==============================================================================
# 1. CONFIGURATION
# ==============================================================================

TARGET_SET = "ECL"
TARGET_FORMAT = "PremierDraft"

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
# 2. DATA FETCHING
# ==============================================================================

def fetch_data(table, params="*"):
    url = f"{SUPABASE_URL}/rest/v1/{table}?{params}"
    resp = requests.get(url, headers=HEADERS_SUPABASE)
    if resp.status_code != 200:
        print(f"❌ Erreur {table}: {resp.text}")
        return []
    return resp.json()

def get_cards_metadata(set_code):
    """Charge toutes les métadonnées de card_list pour les jointures en Python"""
    print("🔍 Chargement des métadonnées des cartes...")
    data = fetch_data("card_list", f"set_code=eq.{set_code}&select=*")
    return {c['card_name']: c for c in data}

def get_trophy_decks(set_code, fmt):
    print(f"🏆 Chargement des trophy decks pour {set_code} ({fmt})...")
    return fetch_data("trophy_decks", f"set_code=eq.{set_code}&format=eq.{fmt}&select=*")

def get_archetype_synergies(set_code, fmt):
    """Charge les scores de synergie significatifs"""
    print("🔗 Chargement des scores de synergie...")
    # On ne prend que les synergies positives pour ne pas biaiser négativement
    return fetch_data("synergy_scores", f"set_code=eq.{set_code}&format=eq.{fmt}&synergy_score=gt.0&select=card_a,card_b,synergy_score")

# ==============================================================================
# 3. ALGORITHME DE CALCUL DES SQUELETTES
# ==============================================================================

def build_archetype_skeleton(archetype, decks, card_meta, synergy_data):
    """
    Calcule le squelette pour un archétype donné, pondéré par la synergie.
    """
    if not decks: return None

    # 1. Analyse des stats de base (Fréquence, Courbe, Ratio, Terrains)
    all_cards_in_decks = []
    curves = []
    creature_counts = []
    land_counts = []
    
    for d in decks:
        cardlist = d.get('cardlist', {})
        total_cards = sum(cardlist.values())
        if total_cards < 35: continue
        
        creatures = 0
        lands = 0
        mana_dist = Counter()
        for name, qty in cardlist.items():
            meta = card_meta.get(name)
            if not meta: continue
            for _ in range(qty): all_cards_in_decks.append(name)
            
            c_type = meta.get('card_type') or ''
            is_land = 'Land' in c_type
            
            if is_land:
                lands += qty
            else:
                # On ne compte que les non-terrains dans la courbe de mana
                cmc = min(int(meta.get('card_cmc') or 0), 7)
                mana_dist[cmc] += qty
                if 'Creature' in c_type: 
                    creatures += qty
        
        curves.append(mana_dist)
        creature_counts.append(creatures)
        land_counts.append(lands)

    if not curves: return None

    # Calcul des moyennes cibles
    # On initialise tous les CMCs de 0 à 7 à 0.0 pour éviter les trous dans le front
    avg_curve = {str(i): 0.0 for i in range(8)}
    for i in range(8):
        vals = [c[i] for c in curves]
        avg_curve[str(i)] = round(statistics.mean(vals), 1) if vals else 0.0
    
    avg_creatures = statistics.mean(creature_counts)
    avg_lands = statistics.mean(land_counts)
    
    # 2. Score de Fréquence
    card_counts = Counter(all_cards_in_decks)
    max_freq = len(decks)
    
    # 3. Calcul de la Synergie "Cluster"
    # On identifie les 15 cartes les plus fréquentes
    pillars = [name for name, _ in card_counts.most_common(15)]
    
    synergy_map = {}
    for syn in synergy_data:
        ca, cb, score = syn['card_a'], syn['card_b'], float(syn['synergy_score'])
        if ca in pillars:
            synergy_map[cb] = synergy_map.get(cb, []) + [score]
        if cb in pillars:
            synergy_map[ca] = synergy_map.get(ca, []) + [score]
    
    avg_synergy = {name: statistics.mean(scores) if scores else 0 for name, scores in synergy_map.items()}

    # 4. Score Final Pondéré : 80% Fréquence + 20% Synergie
    candidates = []
    for name, freq in card_counts.items():
        if name not in card_meta: continue
        
        f_score = freq / max_freq 
        s_score = min(avg_synergy.get(name, 0) / 10, 1.0)
        
        weighted_score = (f_score * 0.8) + (s_score * 0.2)
        candidates.append((name, weighted_score))

    candidates.sort(key=lambda x: x[1], reverse=True)

    # 5. Construction du Deck (Draft 40 cartes)
    final_deck = []
    common_pairs_count = 0
    current_curve = Counter()
    current_creatures = 0
    
    for name, _ in candidates:
        if len(final_deck) >= 40: break
        
        meta = card_meta[name]
        c_type = meta.get('card_type') or ''
        is_land = 'Land' in c_type
        cmc = min(int(meta.get('card_cmc') or 0), 7)
        is_creature = 'Creature' in c_type
        is_common = meta.get('rarity') == 'common'

        qty = 1
        if is_common and common_pairs_count < 2 and card_counts[name] > len(decks) * 0.75 and not is_land:
            qty = 2
            common_pairs_count += 1
        
        # Logique de remplissage
        can_add = False
        if is_land:
            # On remplit les terrains jusqu'à la moyenne
            if len([c for c in final_deck if 'Land' in c['type']]) + qty <= round(avg_lands):
                can_add = True
        else:
            # On respecte la courbe moyenne pour les spells
            if current_curve[cmc] + qty <= round(float(avg_curve[str(cmc)])) + 1:
                can_add = True

        if can_add:
            for _ in range(qty):
                if len(final_deck) < 40:
                    final_deck.append({
                        "name": name,
                        "cmc": cmc,
                        "type": c_type,
                        "cost": meta.get('card_cost'),
                        "rarity": meta.get('rarity')
                    })
                    if not is_land: 
                        current_curve[cmc] += 1
                        if is_creature: current_creatures += 1

    return {
        "set_code": TARGET_SET,
        "format": TARGET_FORMAT,
        "archetype_name": archetype,
        "avg_mana_curve": avg_curve,
        "avg_lands": round(avg_lands, 1),
        "creature_ratio": round(avg_creatures / (40 - avg_lands), 3),
        "deck_list": final_deck
    }

# ==============================================================================
# MAIN
# ==============================================================================

if __name__ == "__main__":
    print(f"🚀 Calcul des squelettes pour {TARGET_SET}...")
    
    card_meta = get_cards_metadata(TARGET_SET)
    trophies = get_trophy_decks(TARGET_SET, TARGET_FORMAT)
    synergies = get_archetype_synergies(TARGET_SET, TARGET_FORMAT)
    
    if not trophies:
        print("❌ Aucun trophy deck trouvé.")
        exit(1)

    # Grouper par archétype
    decks_by_arch = {}
    for d in trophies:
        arch = d['archetype']
        if arch not in decks_by_arch: decks_by_arch[arch] = []
        decks_by_arch[arch].append(d)

    results = []
    for arch, decks in decks_by_arch.items():
        if len(decks) < 3: continue 
        print(f"   📊 Analyse {arch} ({len(decks)} decks)...")
        skeleton = build_archetype_skeleton(arch, decks, card_meta, synergies)
        if skeleton:
            results.append(skeleton)

    if results:
        print(f"🚀 Sauvegarde de {len(results)} squelettes dans Supabase...")
        url = f"{SUPABASE_URL}/rest/v1/archetypal_skeletons"
        resp = requests.post(url, json=results, headers=HEADERS_SUPABASE)
        if resp.status_code >= 400:
            print(f"❌ Erreur sauvegarde: {resp.text}")
        else:
            print("✅ Terminée !")
