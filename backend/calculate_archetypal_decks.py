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

TARGET_SET_CODES = ["ECL"]
TARGET_FORMATS = ["PremierDraft", "TradDraft"]

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

def build_archetype_skeleton(archetype, decks, card_meta, synergy_data, set_code, format_name):
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
        candidates.append((name, weighted_score, card_meta[name]))

    candidates.sort(key=lambda x: x[1], reverse=True)

    # 5. Construction du Deck (Draft exactement 40 cartes)
    final_deck = []
    
    # Étape A: Les Terrains (Cible arrondie)
    target_lands = int(round(avg_lands))
    land_candidates = [c for c in candidates if 'Land' in c[2].get('card_type', '')]
    lands_added = 0
    for name, _, meta in land_candidates:
        if lands_added >= target_lands: break
        # Pour les terrains, on n'ajoute qu'un exemplaire à la fois 
        # (sauf s'il nous en manque beaucoup et que c'est un terrain de base)
        qty = 1 
        if 'Basic' in meta.get('card_type', ''):
            qty = min(target_lands - lands_added, 10) # On peut mettre beaucoup de basics d'un coup
            
        for _ in range(qty):
            if lands_added < target_lands:
                final_deck.append({
                    "name": name,
                    "cmc": 0, # Terrains forcés à CMC 0 pour le front
                    "type": meta.get('card_type'),
                    "cost": "",
                    "rarity": meta.get('rarity')
                })
                lands_added += 1

    # Étape B: Les Spells (Le reste jusqu'à 40)
    target_spells = 40 - lands_added
    spell_candidates = [c for c in candidates if 'Land' not in c[2].get('card_type', '')]
    
    # CALCUL DES QUOTAS BASÉS SUR LE RATIO D'ARCHÉTYPE
    # On veut respecter target_creatures = target_spells * ratio
    target_creatures = round(target_spells * (avg_creatures / (40 - avg_lands)))
    target_non_creatures = target_spells - target_creatures
    
    spells_added = 0
    creatures_added = 0
    non_creatures_added = 0
    common_pairs_count = 0
    current_curve = Counter()
    
    # PREMIÈRE PASSE : Essayer de respecter strictement les quotas tout en suivant la fréquence
    for name, _, meta in spell_candidates:
        if spells_added >= target_spells: break
        
        c_type = meta.get('card_type') or ''
        is_creature = 'Creature' in c_type
        cmc = min(int(meta.get('card_cmc') or 0), 7)
        is_common = meta.get('rarity') == 'common'

        # Skip si on a déjà atteint le quota pour ce type (avec une marge de +1)
        if is_creature and creatures_added >= target_creatures + 1: continue
        if not is_creature and non_creatures_added >= target_non_creatures + 1: continue

        qty = 1
        # Règle des 2 paires de communes
        if is_common and common_pairs_count < 2 and card_counts[name] > len(decks) * 0.75:
            qty = 2
        
        # On vérifie qu'on ne dépasse pas le slot total de sorts ni le quota spécifique
        max_for_type = (target_creatures + 1 - creatures_added) if is_creature else (target_non_creatures + 1 - non_creatures_added)
        qty = min(qty, target_spells - spells_added, max_for_type)
        if qty <= 0: continue
        
        # On respecte la courbe
        if current_curve[cmc] < round(float(avg_curve[str(cmc)])) + 2:
            for _ in range(qty):
                if spells_added < target_spells:
                    final_deck.append({
                        "name": name,
                        "cmc": cmc,
                        "type": c_type,
                        "cost": meta.get('card_cost'),
                        "rarity": meta.get('rarity')
                    })
                    current_curve[cmc] += 1
                    spells_added += 1
                    if is_creature: creatures_added += 1
                    else: non_creatures_added += 1
                    if qty == 2 and _ == 0: common_pairs_count += 1

    # DEUXIÈME PASSE : Si on n'a pas atteint les 40 cartes (à cause des quotas trop stricts), 
    # on complète avec les restants par ordre de fréquence pure
    if spells_added < target_spells:
        for name, _, meta in spell_candidates:
            if spells_added >= target_spells: break
            if any(c['name'] == name for c in final_deck): continue # Déjà là (on simplifie pas de triples pour l'instant hors basics)

            cmc = min(int(meta.get('card_cmc') or 0), 7)
            final_deck.append({
                "name": name,
                "cmc": cmc,
                "type": meta.get('card_type'),
                "cost": meta.get('card_cost'),
                "rarity": meta.get('rarity')
            })
            spells_added += 1

    return {
        "set_code": set_code,
        "format": format_name,
        "archetype_name": archetype,
        "avg_mana_curve": avg_curve,
        "avg_lands": round(avg_lands, 1),
        "creature_ratio": round(avg_creatures / (40 - avg_lands), 3),
        "deck_list": final_deck,
        "sample_size": len(decks)
    }

# ==============================================================================
# MAIN
# ==============================================================================

if __name__ == "__main__":
    for set_code in TARGET_SET_CODES:
        print(f"🚀 Traitement du set {set_code}...")
        card_meta = get_cards_metadata(set_code)
        
        for fmt in TARGET_FORMATS:
            print(f"   📋 Format: {fmt}")
            trophies = get_trophy_decks(set_code, fmt)
            synergies = get_archetype_synergies(set_code, fmt)
            
            if not trophies:
                print(f"      ⚠️ Aucun trophy deck pour {set_code} ({fmt}).")
                continue

            # Grouper par archétype
            decks_by_arch = {}
            for d in trophies:
                arch = d['archetype']
                if arch not in decks_by_arch: decks_by_arch[arch] = []
                decks_by_arch[arch].append(d)

            results = []
            for arch, decks in decks_by_arch.items():
                if len(decks) < 3: continue 
                print(f"      📊 Analyse {arch} ({len(decks)} decks)...")
                skeleton = build_archetype_skeleton(arch, decks, card_meta, synergies, set_code, fmt)
                if skeleton:
                    results.append(skeleton)

            if results:
                print(f"      🚀 Sauvegarde de {len(results)} squelettes dans Supabase...")
                url = f"{SUPABASE_URL}/rest/v1/archetypal_skeletons?on_conflict=set_code,format,archetype_name"
                resp = requests.post(url, json=results, headers=HEADERS_SUPABASE)
                if resp.status_code >= 400:
                    print(f"      ❌ Erreur sauvegarde: {resp.text}")
                else:
                    print(f"      ✅ Squelettes mis à jour pour {set_code} ({fmt}) !")
    
    print("\n🏁 Mission accomplie.")
