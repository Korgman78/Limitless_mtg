import requests
import os
import time
import json
import statistics
from collections import Counter
from datetime import datetime, timedelta, timezone
import random
from dotenv import load_dotenv
from pathlib import Path

# ==============================================================================
# 1. CONFIGURATION
# ==============================================================================

TARGET_SET_CODES = ["ECL"]
TARGET_FORMATS = ["PremierDraft", "TradDraft", "ArenaDirect_Sealed"]

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

def fetch_data(table, params="select=*"):
    """Récupère toutes les données d'une table avec pagination automatique"""
    all_data = []
    offset = 0
    page_size = 1000
    page_num = 0

    while True:
        url = f"{SUPABASE_URL}/rest/v1/{table}?{params}&order=id&limit={page_size}&offset={offset}"
        resp = requests.get(url, headers=HEADERS_SUPABASE)

        page_num += 1
        if resp.status_code != 200:
            print(f"❌ Erreur {table} (page {page_num}): status={resp.status_code} - {resp.text[:200]}")
            break

        data = resp.json()
        print(f"   📄 Page {page_num}: {len(data)} lignes (total: {len(all_data) + len(data)})")

        if not data:
            break

        all_data.extend(data)

        if len(data) < page_size:
            break  # Dernière page

        offset += page_size

    print(f"   ✅ {table}: {len(all_data)} lignes chargées au total")
    return all_data

def get_cards_metadata(set_code, fmt):
    """Charge toutes les métadonnées de card_list et les stats de card_stats"""
    print(f"🔍 Chargement des métadonnées (card_list) pour {set_code}...")
    metadata_rows = fetch_data("card_list", f"set_code=eq.{set_code}&select=*")
    
    print(f"📊 Chargement des stats (card_stats) pour {set_code} ({fmt})...")
    # On filtre IMPÉRATIVEMENT sur filter_context=Global pour avoir les stats globales de la carte
    # (Confirmé par etl_script.py:220)
    stats_rows = fetch_data("card_stats", f"set_code=eq.{set_code}&format=eq.{fmt}&filter_context=eq.Global&select=card_name,alsa,gih_wr")
    
    stats_map = {s['card_name']: s for s in stats_rows}
    
    merged_data = {}
    for card in metadata_rows:
        name = card['card_name']
        stats = stats_map.get(name, {})
        
        merged_data[name] = {
            **card,
            "alsa": stats.get('alsa'),
            "gih_wr": stats.get('gih_wr')
        }
        
    print(f"   ✅ {len(merged_data)} cartes chargées avec succès.")
    return merged_data

def get_trophy_decks(set_code, fmt):
    print(f"🏆 Chargement des trophy decks pour {set_code} ({fmt})...")
    decks = fetch_data("trophy_decks", f"set_code=eq.{set_code}&format=eq.{fmt}&select=*")

    # Debug: vérifier le nombre de decks par archétype
    from collections import Counter
    arch_counts = Counter(d['archetype'] for d in decks)
    print(f"   📊 Distribution des {len(decks)} decks par archétype:")
    for arch, count in sorted(arch_counts.items(), key=lambda x: -x[1])[:10]:
        print(f"      {arch}: {count} decks")

    return decks

def get_archetype_synergies(set_code, fmt):
    """Charge les scores de synergie significatifs"""
    print("🔗 Chargement des scores de synergie...")
    # On ne prend que les synergies positives pour ne pas biaiser négativement
    # Note: on utilise une requête directe car fetch_data utilise order=id et synergy_scores n'a pas d'id
    all_data = []
    offset = 0
    page_size = 1000

    while True:
        url = f"{SUPABASE_URL}/rest/v1/synergy_scores?set_code=eq.{set_code}&format=eq.{fmt}&synergy_score=gt.0&select=card_a,card_b,synergy_score&order=card_a&limit={page_size}&offset={offset}"
        resp = requests.get(url, headers=HEADERS_SUPABASE)

        if resp.status_code != 200:
            print(f"   ❌ Erreur synergy_scores: {resp.status_code} - {resp.text[:200]}")
            break

        data = resp.json()
        if not data:
            break

        all_data.extend(data)

        if len(data) < page_size:
            break

        offset += page_size

    print(f"   ✅ synergy_scores: {len(all_data)} lignes chargées")
    return all_data

# ==============================================================================
# 3. HELPERS POUR ANALYSE AVANCÉE
# ==============================================================================

def get_trophy_weight(trophy_time):
    """Calcule le poids d'un trophy deck selon son ancienneté (Meta-Shift)"""
    if not trophy_time:
        return 0.5
    
    try:
        if trophy_time.endswith('Z'):
            trophy_time = trophy_time[:-1] + '+00:00'
        dt = datetime.fromisoformat(trophy_time)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
            
        now = datetime.now(timezone.utc)
        age_days = (now - dt).days
        
        if age_days <= 7: return 1.0     # Semaine en cours
        if age_days <= 14: return 0.75   # J-7 à J-14
        if age_days <= 28: return 0.5    # J-15 à J-28
        return 0.25                      # Plus de 28 jours
    except:
        return 0.5

def parse_mana_pips(mana_cost):
    """Extrait le nombre de symboles colorés d'un coût de mana (ex: {1}{W}{U} -> {'W':1, 'U':1})"""
    if not mana_cost or not isinstance(mana_cost, str):
        return {}
    
    pips = Counter()
    for symbol in ["W", "U", "B", "R", "G"]:
        pips[symbol] = mana_cost.count(f"{{{symbol}}}")
    return pips

def jaccard_sim(s1, s2):
    """Calcule la similarité de Jaccard entre deux ensembles."""
    u = s1 | s2
    if not u: return 0
    return len(s1 & s2) / len(u)

def calculate_silhouette(deck_sets, assignments):
    """
    Calcule le silhouette score pour filtrer les clustering dégénérés.
    Seuil bas (0.02) : on vérifie juste une cohérence minimale, pas une séparation forte.
    """
    n = len(deck_sets)
    if n < 4:
        return 0.0

    cluster0_indices = [i for i, a in enumerate(assignments) if a == 0]
    cluster1_indices = [i for i, a in enumerate(assignments) if a == 1]

    if len(cluster0_indices) < 2 or len(cluster1_indices) < 2:
        return 0.0

    # Échantillonner si trop de decks (pour performance)
    max_sample = 100
    if len(cluster0_indices) > max_sample:
        cluster0_indices = random.sample(cluster0_indices, max_sample)
    if len(cluster1_indices) > max_sample:
        cluster1_indices = random.sample(cluster1_indices, max_sample)

    silhouettes = []
    for idx in cluster0_indices + cluster1_indices:
        my_cluster = cluster0_indices if assignments[idx] == 0 else cluster1_indices
        other_cluster = cluster1_indices if assignments[idx] == 0 else cluster0_indices

        # Distance = 1 - similarité de Jaccard
        a_distances = [1 - jaccard_sim(deck_sets[idx], deck_sets[j]) for j in my_cluster if j != idx]
        a = sum(a_distances) / len(a_distances) if a_distances else 0

        b_distances = [1 - jaccard_sim(deck_sets[idx], deck_sets[j]) for j in other_cluster]
        b = sum(b_distances) / len(b_distances) if b_distances else 0

        if max(a, b) > 0:
            s = (b - a) / max(a, b)
            silhouettes.append(s)

    return sum(silhouettes) / len(silhouettes) if silhouettes else 0.0

def cluster_decks(decks):
    """Sépare les decks en deux clusters si pertinent (Jaccard Similarity + K-means itératif)"""
    if len(decks) < 40: # Pas assez de données pour clusteriser proprement
        return decks, []

    # Seed fixe pour résultats reproductibles (même données → même clustering)
    random.seed(42)

    # 1. Représentation des decks par sets de noms de cartes (sans basics)
    deck_sets = []
    for d in decks:
        s = set(name for name in d.get('cardlist', {}).keys() if 'Island' not in name and 'Plains' not in name and 'Swamp' not in name and 'Mountain' not in name and 'Forest' not in name)
        deck_sets.append(s)

    # 2. Seed selection sur échantillon (évite le biais des premiers decks)
    sample_size = min(50, len(deck_sets))
    sample_indices = random.sample(range(len(deck_sets)), sample_size)

    c1_idx, c2_idx = 0, 1
    max_dist = 0
    for i in sample_indices:
        for j in sample_indices:
            if i >= j: continue
            dist = 1 - jaccard_sim(deck_sets[i], deck_sets[j])
            if dist > max_dist:
                max_dist, c1_idx, c2_idx = dist, i, j

    # 3. K-means itératif (3 itérations pour stabiliser)
    assignments = [0] * len(deck_sets)
    centroids = [deck_sets[c1_idx], deck_sets[c2_idx]]

    for iteration in range(3):
        # Assign : chaque deck au centroïde le plus proche
        for i, s in enumerate(deck_sets):
            sim1 = jaccard_sim(s, centroids[0])
            sim2 = jaccard_sim(s, centroids[1])
            assignments[i] = 0 if sim1 >= sim2 else 1

        # Update centroids : union des cartes présentes dans >50% du cluster
        for c_id in [0, 1]:
            cluster_indices = [i for i, a in enumerate(assignments) if a == c_id]
            if not cluster_indices:
                continue
            card_counts = Counter()
            for idx in cluster_indices:
                card_counts.update(deck_sets[idx])
            threshold = len(cluster_indices) * 0.5
            centroids[c_id] = set(card for card, cnt in card_counts.items() if cnt >= threshold)

    cluster1 = [decks[i] for i, a in enumerate(assignments) if a == 0]
    cluster2 = [decks[i] for i, a in enumerate(assignments) if a == 1]

    # 4. Vérification des seuils (15% et >= 20 trophées)
    total = len(decks)
    smaller, larger = (cluster1, cluster2) if len(cluster1) < len(cluster2) else (cluster2, cluster1)

    if len(smaller) >= 20 and len(smaller) / total >= 0.15:
        # 5. Vérification de la différenciation par overlap des piliers
        # C'est le vrai test métier : les deux groupes ont-ils des cartes clés différentes ?
        def get_top_spells(group):
            weighted_counts = Counter()
            for d in group:
                weight = get_trophy_weight(d.get('trophy_time'))
                for name, qty in d.get('cardlist', {}).items():
                    if 'Island' not in name and 'Plains' not in name and 'Swamp' not in name and 'Mountain' not in name and 'Forest' not in name:
                        weighted_counts[name] += weight * qty
            return set(name for name, _ in weighted_counts.most_common(15))

        top1 = get_top_spells(larger)
        top2 = get_top_spells(smaller)

        overlap = len(top1 & top2)
        if overlap <= 9: # Moins de 60% d'overlap sur les piliers (9/15)
            # Vérification silhouette minimale (filtre anti-bruit)
            silhouette = calculate_silhouette(deck_sets, assignments)
            if silhouette >= 0.02:
                print(f"      ✅ Clustering validé : {len(smaller)} decks alternatifs, overlap={overlap}/15, silhouette={silhouette:.3f}")
                return larger, smaller
            else:
                print(f"      ⚠️ Archétype alternatif rejeté : silhouette trop basse ({silhouette:.3f} < 0.02)")
        else:
            print(f"      ⚠️ Archétype alternatif rejeté : trop similaire ({overlap}/15 piliers communs, seuil=9)")
    elif len(smaller) >= 20:
        print(f"      ⚠️ Cluster trop petit : {len(smaller)} decks ({100*len(smaller)/total:.0f}% < 15%)")

    return decks, []

# ==============================================================================
# 4. ALGORITHME DE CALCUL DES SQUELETTES
# ==============================================================================

def build_archetype_skeleton(archetype, decks, card_meta, synergy_data, set_code, format_name, is_alternative=False, format_avg_wr=55.0):
    """
    Calcule le squelette pour un archétype donné, pondéré par la synergie.
    """
    if not decks: return None

    # Debug: Vérifier le matching des noms de cartes
    all_deck_cards = set()
    for d in decks:
        all_deck_cards.update(d.get('cardlist', {}).keys())
    matched = sum(1 for c in all_deck_cards if c in card_meta)
    print(f"      🔍 Matching: {matched}/{len(all_deck_cards)} cartes trouvées dans card_stats")

    # 1. Analyse des stats de base (Fréquence, Courbe, Ratio, Terrains)
    all_cards_in_decks = []
    curves = []
    creature_counts = []
    land_counts = []
    
    for d in decks:
        weight = get_trophy_weight(d.get('trophy_time'))
        cardlist = d.get('cardlist', {})
        total_cards = sum(cardlist.values())
        if total_cards < 35: continue
        
        creatures = 0
        lands = 0
        mana_dist = Counter()
        for name, qty in cardlist.items():
            meta = card_meta.get(name)
            if not meta: continue
            
            # Utilisation du poids pour compter les cartes
            for _ in range(qty): 
                all_cards_in_decks.extend([name] * (1 if weight == 1.0 else 0)) # Trick pour Counter pondéré plus tard
                # Pour card_counts, on va utiliser une approche plus propre :
                # On stocke (nom, poids) ou on accumule directement
            
            c_type = meta.get('card_type') or ''
            is_land = 'Land' in c_type
            
            if is_land:
                lands += qty
            else:
                cmc = min(int(meta.get('card_cmc') or 0), 7)
                mana_dist[cmc] += qty
                if 'Creature' in c_type: 
                    creatures += qty
        
        curves.append((mana_dist, weight))
        creature_counts.append((creatures, weight))
        land_counts.append((lands, weight))

    if not curves: return None

    # Calcul des moyennes pondérées
    def weighted_mean(data):
        total_weight = sum(w for _, w in data)
        if total_weight == 0: return 0
        return sum(v * w for v, w in data) / total_weight

    avg_curve = {str(i): 0.0 for i in range(8)}
    for i in range(8):
        vals = [(c[i], w) for c, w in curves]
        avg_curve[str(i)] = round(weighted_mean(vals), 1)
    
    avg_creatures = weighted_mean(creature_counts)
    avg_lands = weighted_mean(land_counts)
    
    # 2. Score de Fréquence Pondéré
    card_weights_accum = Counter()
    total_deck_weights = 0
    for d in decks:
        weight = get_trophy_weight(d.get('trophy_time'))
        total_deck_weights += weight
        for name, qty in d.get('cardlist', {}).items():
            if name in card_meta:
                card_weights_accum[name] += weight * qty
    
    max_freq_weighted = total_deck_weights
    
    # 3. Calcul de la Synergie "Cluster"
    # On identifie les 15 cartes les plus fréquentes selon les poids
    weighted_spell_counts = []
    for name, weighted_count in card_weights_accum.items():
        meta = card_meta.get(name)
        if not meta:
            continue
        c_type = meta.get('card_type') or meta.get('type_line') or ''
        if 'Land' in c_type:
            continue
        weighted_spell_counts.append((name, weighted_count))

    weighted_spell_counts.sort(key=lambda x: x[1], reverse=True)
    pillars = [name for name, _ in weighted_spell_counts[:15]]
    core_set = set(pillars)
    core_rank_map = {name: idx + 1 for idx, name in enumerate(pillars)}
    core_cards = [
        {
            "name": name,
            "rank": idx + 1,
            "frequency": round((weighted_count / max_freq_weighted) * 100, 1) if max_freq_weighted else 0
        }
        for idx, (name, weighted_count) in enumerate(weighted_spell_counts[:15])
    ]
    
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
    for name, weighted_count in card_weights_accum.items():
        if name not in card_meta: continue
        
        f_score = weighted_count / max_freq_weighted 
        s_score = min(avg_synergy.get(name, 0) / 10, 1.0)
        
        weighted_score = (f_score * 0.8) + (s_score * 0.2)
        candidates.append((name, weighted_score, card_meta[name]))

    candidates.sort(key=lambda x: x[1], reverse=True)

    # 5. Construction du Deck (Draft exactement 40 cartes)
    final_deck = []
    
    # Étape A: Les Terrains (Cible arrondie)
    # On ajoute d'abord les terrains non-basiques (bi-lands, etc.) qui sont fréquents
    target_lands = int(round(avg_lands))
    land_candidates = [c for c in candidates if 'Land' in (c[2].get('card_type') or '')]
    lands_added = 0
    
    # On garde une trace des non-basiques ajoutés
    for name, _, meta in land_candidates:
        if lands_added >= target_lands: break
        if 'Basic' in (meta.get('card_type') or ''): continue # On gèrera les basics après
        
        # Pour les non-basiques, on respecte la fréquence
        if card_weights_accum[name] / max_freq_weighted > 0.2: # Seulement si significatif
            final_deck.append({
                "name": name,
                "cmc": 0,
                "type": meta.get('card_type'),
                "cost": "",
                "rarity": meta.get('rarity'),
                "is_core": name in core_set
            })
            lands_added += 1

    # Étape B: Les Spells (Le reste jusqu'à 40)
    # IMPORTANT: On utilise target_lands (pas lands_added) car les basics seront ajoutés après
    target_spells = 40 - target_lands
    spell_candidates = [c for c in candidates if 'Land' not in (c[2].get('card_type') or '')]

    # CALCUL DES QUOTAS BASÉS SUR LE RATIO D'ARCHÉTYPE
    # On veut respecter target_creatures = target_spells * ratio
    target_creatures = round(target_spells * (avg_creatures / max(1, 40 - avg_lands)))
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
        if is_common and common_pairs_count < 2 and card_weights_accum[name] > max_freq_weighted * 1.0:
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
                        "rarity": meta.get('rarity'),
                        "is_core": name in core_set
                    })
                    current_curve[cmc] += 1
                    spells_added += 1
                    if is_creature: creatures_added += 1
                    else: non_creatures_added += 1
                    if qty == 2 and _ == 0: common_pairs_count += 1

    # Étape C: Smart Mana Base (Compléter avec les basics)
    # 1. Calculer les pips des sorts sélectionnés
    total_pips = Counter()
    for card in final_deck:
        if 'Land' not in (card['type'] or ''):
            total_pips.update(parse_mana_pips(card['cost']))
    
    # 2. Répartition des basics restants
    basic_map = {
        "W": "Plains", "U": "Island", "B": "Swamp", "R": "Mountain", "G": "Forest"
    }
    
    remaining_lands = target_lands - lands_added
    if remaining_lands > 0:
        sum_pips = sum(total_pips.values())
        if sum_pips == 0: # Si pas de pips (archi rare), répartition égale ou selon l'archétype
            # On prend les couleurs du nom de l'archétype par défaut
            colors = archetype.split(' (')[1].replace(')', '').replace(' + Splash', '') if '(' in archetype else ""
            if not colors: colors = "WUBRG"
            sum_pips = len(colors)
            for c in colors: total_pips[c] = 1

        # Calculer le nombre de terrains par couleur
        lands_to_add = []
        for color, pips in total_pips.items():
            share = pips / sum_pips
            count = round(share * remaining_lands)
            if count > 0:
                lands_to_add.extend([basic_map[color]] * count)
        
        # Ajuster pour arriver exactement au compte
        while len(lands_to_add) < remaining_lands:
            # Ajouter à la couleur dominante
            dominant = total_pips.most_common(1)[0][0]
            lands_to_add.append(basic_map[dominant])
        while len(lands_to_add) > remaining_lands:
            lands_to_add.pop()
            
        for land_name in lands_to_add:
            final_deck.append({
                "name": land_name,
                "cmc": 0,
                "type": "Basic Land",
                "cost": "",
                "rarity": "common",
                "is_core": False
            })
            lands_added += 1

    # ==========================================================================
    # 6. NOUVELLES MÉTRIQUES
    # ==========================================================================

    # Extraire les cartes non-terrain du squelette pour le calcul de synergie
    skeleton_card_names = set()
    for card in final_deck:
        card_type = card.get('type') or ''
        card_name = card.get('name', '')
        # Exclure les terrains de base
        if 'Land' not in card_type and card_name not in ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest']:
            skeleton_card_names.add(card_name)
    print(f"      🎯 Squelette: {len(skeleton_card_names)} cartes non-terrain pour calcul synergie")

    # Construire un index des synergies pour accès rapide
    synergy_index = {}
    for syn in synergy_data:
        ca, cb, score = syn['card_a'], syn['card_b'], float(syn['synergy_score'])
        # Indexer dans les deux sens
        if ca not in synergy_index:
            synergy_index[ca] = {}
        synergy_index[ca][cb] = score
        if cb not in synergy_index:
            synergy_index[cb] = {}
        synergy_index[cb][ca] = score

    # DEBUG: Vérifier le matching
    print(f"      🔗 Synergy index: {len(synergy_index)} cartes indexées")
    skeleton_in_index = [c for c in skeleton_card_names if c in synergy_index]
    print(f"      🔗 Cartes du squelette dans l'index: {len(skeleton_in_index)}/{len(skeleton_card_names)}")
    if skeleton_card_names and synergy_index:
        sample_skeleton = list(skeleton_card_names)[:3]
        sample_index = list(synergy_index.keys())[:3]
        print(f"      🔗 Exemples squelette: {sample_skeleton}")
        print(f"      🔗 Exemples index: {sample_index}")

    def calculate_skeleton_synergy(card_name, skeleton_cards, synergy_idx):
        """Calcule la synergie moyenne d'une carte avec les cartes du squelette"""
        if card_name not in synergy_idx:
            return 0.0

        scores = []
        card_synergies = synergy_idx[card_name]
        for skeleton_card in skeleton_cards:
            if skeleton_card != card_name and skeleton_card in card_synergies:
                scores.append(card_synergies[skeleton_card])

        return statistics.mean(scores) if scores else 0.0

    # --- 6.1 SLEEPER CARDS ---
    # Cartes avec ALSA élevé (draftées tard) mais fréquence élevée dans les trophies
    # = Cartes sous-estimées par les joueurs mais qui gagnent
    sleeper_cards = []

    # D'abord, calculons l'ALSA moyen du format pour calibrer
    all_alsas = [m.get('alsa') for m in card_meta.values() if m.get('alsa') is not None]
    avg_alsa = statistics.mean(all_alsas) if all_alsas else 4.0
    print(f"      📊 ALSA moyen du format: {avg_alsa:.2f} (sur {len(all_alsas)} cartes)")

    sleeper_candidates = 0
    for name, weighted_count in card_weights_accum.items():
        meta = card_meta.get(name)
        if not meta:
            continue

        # Ignorer les terrains (vérifier plusieurs noms de colonnes possibles)
        c_type = meta.get('card_type') or meta.get('type_line') or ''
        if 'Land' in c_type: continue
        if 'Basic' in c_type: continue

        alsa = meta.get('alsa')
        # Fréquence pondérée
        frequency = weighted_count / max_freq_weighted

        # Sleeper = ALSA au-dessus de la moyenne (drafté plus tard que la moyenne)
        # ET fréquence >= 15% dans les trophies de l'archétype
        if alsa is not None and alsa > avg_alsa and frequency >= 0.15:
            sleeper_candidates += 1
            # Score = écart ALSA par rapport à la moyenne × fréquence
            alsa_delta = alsa - avg_alsa
            sleeper_score = alsa_delta * frequency
            sleeper_cards.append({
                "name": name,
                "alsa": round(alsa, 2),
                "frequency": round(frequency * 100, 1),
                "score": round(sleeper_score, 3)
            })

    sleeper_cards.sort(key=lambda x: x['score'], reverse=True)
    sleeper_cards = sleeper_cards[:5]  # Top 5 sleepers
    print(f"      😴 Sleeper cards: {len(sleeper_cards)} trouvées (sur {sleeper_candidates} candidats)")

    # --- 6.2 TRENDING CARDS ---
    # Comparer fréquence dans les decks récents vs anciens
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=7)  # 7 derniers jours = récent

    recent_decks = []
    old_decks = []
    for d in decks:
        trophy_time = d.get('trophy_time')
        if trophy_time:
            try:
                if trophy_time.endswith('Z'):
                    trophy_time = trophy_time[:-1] + '+00:00'
                dt = datetime.fromisoformat(trophy_time)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                if dt >= cutoff:
                    recent_decks.append(d)
                else:
                    old_decks.append(d)
            except:
                old_decks.append(d)
        else:
            old_decks.append(d)

    trending_cards = []
    declining_cards = []
    if recent_decks and old_decks:
        # Compter les fréquences dans chaque groupe
        recent_counts = Counter()
        old_counts = Counter()

        for d in recent_decks:
            for name in d.get('cardlist', {}).keys():
                if name in card_meta and 'Land' not in (card_meta[name].get('card_type') or ''):
                    recent_counts[name] += 1

        for d in old_decks:
            for name in d.get('cardlist', {}).keys():
                if name in card_meta and 'Land' not in (card_meta[name].get('card_type') or ''):
                    old_counts[name] += 1

        # Calculer le delta de fréquence pour toutes les cartes
        rising_deltas = []
        declining_deltas = []
        for name in set(recent_counts.keys()) | set(old_counts.keys()):
            recent_freq = recent_counts[name] / len(recent_decks) if recent_decks else 0
            old_freq = old_counts[name] / len(old_decks) if old_decks else 0
            delta = recent_freq - old_freq

            card_data = {
                "name": name,
                "recent_freq": round(recent_freq * 100, 1),
                "old_freq": round(old_freq * 100, 1),
                "delta": round(delta * 100, 1)
            }

            if delta > 0:
                rising_deltas.append(card_data)
            elif delta < 0:
                declining_deltas.append(card_data)

        # Top 3 en hausse et top 3 en baisse
        rising_deltas.sort(key=lambda x: x['delta'], reverse=True)
        trending_cards = rising_deltas[:3]

        declining_deltas.sort(key=lambda x: x['delta'])  # Plus négatif en premier
        declining_cards = declining_deltas[:3]

    # --- 6.3 ARCHETYPE OPENNESS SCORE ---
    # Métrique basée sur la concentration : combien de cartes représentent 80% des slots ?
    # Plus ce nombre est élevé, plus l'archétype est ouvert (beaucoup de cartes viables)
    # Plus ce nombre est bas, plus l'archétype est fermé (quelques cartes dominent)

    # Calculer les fréquences triées (SANS LES TERRAINS)
    spell_freqs = []
    for name, weight in card_weights_accum.items():
        meta = card_meta.get(name)
        if not meta: continue
        c_type = meta.get('card_type') or ''
        if 'Land' in c_type: continue
        spell_freqs.append(weight)
    
    spell_freqs.sort(reverse=True)
    total_occurrences = sum(spell_freqs)

    # Compter combien de cartes il faut pour atteindre 80% des occurrences
    cumulative = 0
    cards_for_80pct = 0
    for freq in spell_freqs:
        cumulative += freq
        cards_for_80pct += 1
        if cumulative >= total_occurrences * 0.80:
            break

    # Normaliser : 25 cartes = très fermé (0), 70 cartes = très ouvert (100)
    # 25 = nombre de non-terrains dans un deck (40 - 17 terrains + 2 marge)
    # Formule : (cards_for_80pct - 25) / (70 - 25) * 100
    openness_raw = (cards_for_80pct - 25) / 45 * 100
    openness_score = max(0, min(100, round(openness_raw)))
    print(f"      🔓 Openness: {cards_for_80pct} cartes pour 80% -> score {openness_score}")

    # --- 6.4 CARD IMPORTANCE SCORE ---
    # Score composite : 40% Fréquence + 30% Synergie + 30% Delta WR
    importance_cards = []
    cards_with_gihwr = 0
    cards_with_synergy = 0

    for name, weighted_count in card_weights_accum.items():
        meta = card_meta.get(name)
        if not meta: continue
        c_type = meta.get('card_type') or meta.get('type_line') or ''
        if 'Land' in c_type: continue

        # Fréquence normalisée (0-1)
        freq_score = weighted_count / max_freq_weighted

        # Synergie moyenne avec les cartes du squelette
        raw_synergy = calculate_skeleton_synergy(name, skeleton_card_names, synergy_index)
        synergy_score = raw_synergy / 5 * 100  # 5 de synergie = 100 points
        if raw_synergy > 0:
            cards_with_synergy += 1

        # Delta WR (GIH WR - format average) normalisé 0-100
        gih_wr = meta.get('gih_wr')
        wr_score = 0
        if gih_wr is not None and gih_wr > 0:
            cards_with_gihwr += 1
            delta_wr = gih_wr - format_avg_wr  # Delta par rapport à la moyenne dynamique
            wr_score = max(0, min(100, (delta_wr + 10) / 20 * 100))  # Normalisé [-10, +10] -> [0, 100]

        # Score total = somme des 3 composantes
        importance = freq_score * 100 + synergy_score + wr_score

        importance_cards.append({
            "name": name,
            "importance": round(importance, 1),
            "is_core": name in core_set,
            "core_rank": core_rank_map.get(name),
            # Composantes individuelles
            "freq_score": round(freq_score * 100, 0),
            "synergy_score": round(synergy_score, 0),
            "wr_score": round(wr_score, 0),
            # Données brutes
            "frequency": round(freq_score * 100, 1),
            "gih_wr": round(gih_wr, 1) if gih_wr else None
        })

    importance_cards.sort(key=lambda x: x['importance'], reverse=True)
    importance_cards = importance_cards[:25]  # Top 25
    print(f"      ⭐ Importance: {len(importance_cards)} cartes, {cards_with_synergy} avec synergie, {cards_with_gihwr} avec GIH WR")

    return {
        "set_code": set_code,
        "format": format_name,
        "archetype_name": archetype,
        "is_alternative": is_alternative, # Flag pour le front
        "avg_mana_curve": avg_curve,
        "avg_lands": round(avg_lands, 1),
        "creature_ratio": round(avg_creatures / (40 - avg_lands), 3),
        "deck_list": final_deck,
        "sample_size": len(decks),
        # Nouvelles métriques
        "sleeper_cards": sleeper_cards,
        "trending_cards": trending_cards,
        "declining_cards": declining_cards,
        "openness_score": openness_score,
        "openness_cards": cards_for_80pct,
        "importance_cards": importance_cards,
        "core_cards": core_cards
    }

# ==============================================================================
# MAIN
# ==============================================================================

if __name__ == "__main__":
    print("=" * 60)
    print("🔧 CONFIGURATION DEBUG")
    print("=" * 60)
    print(f"   SUPABASE_URL: {SUPABASE_URL[:50] if SUPABASE_URL else 'MISSING'}...")
    print(f"   SUPABASE_KEY: {'*' * 10 + SUPABASE_KEY[-10:] if SUPABASE_KEY else 'MISSING'}")
    print(f"   TARGET_SET_CODES: {TARGET_SET_CODES}")
    print(f"   TARGET_FORMATS: {TARGET_FORMATS}")
    print("=" * 60)

    for set_code in TARGET_SET_CODES:
        print(f"🚀 Traitement du set {set_code}...")

        for fmt in TARGET_FORMATS:
            print(f"   📋 Format: {fmt}")
            card_meta = get_cards_metadata(set_code, fmt)
            trophies = get_trophy_decks(set_code, fmt)
            synergies = get_archetype_synergies(set_code, fmt)
            
            # Calculer le WR moyen du format (pour le centrage des scores d'importance)
            all_wrs = [m['gih_wr'] for m in card_meta.values() if m.get('gih_wr')]
            format_avg_wr = statistics.mean(all_wrs) if all_wrs else 55.0
            print(f"      📊 GIH WR moyen du format: {format_avg_wr:.2f}% (sur {len(all_wrs)} cartes)")
            
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
                
                # Clustering
                main_group, alt_group = cluster_decks(decks)
                
                # Build Main
                skeleton = build_archetype_skeleton(arch, main_group, card_meta, synergies, set_code, fmt, is_alternative=False, format_avg_wr=format_avg_wr)
                if skeleton:
                    results.append(skeleton)
                
                # Build Alternative if exists
                if alt_group:
                    print(f"         ✨ Archétype alternatif détecté pour {arch} ({len(alt_group)} decks)")
                    alt_skeleton = build_archetype_skeleton(arch, alt_group, card_meta, synergies, set_code, fmt, is_alternative=True, format_avg_wr=format_avg_wr)
                    if alt_skeleton:
                        results.append(alt_skeleton)

            if results:
                # D'abord, supprimer les anciens squelettes pour ce set/format
                # Cela évite de garder des ALT orphelins qui ne sont plus détectés
                print(f"      🗑️ Suppression des anciens squelettes pour {set_code}/{fmt}...")
                delete_url = f"{SUPABASE_URL}/rest/v1/archetypal_skeletons?set_code=eq.{set_code}&format=eq.{fmt}"
                delete_resp = requests.delete(delete_url, headers=HEADERS_SUPABASE)
                if delete_resp.status_code >= 400:
                    print(f"      ⚠️ Erreur suppression (non bloquant): {delete_resp.text}")

                # Ensuite, insérer les nouveaux squelettes
                print(f"      🚀 Sauvegarde de {len(results)} squelettes dans Supabase...")
                url = f"{SUPABASE_URL}/rest/v1/archetypal_skeletons"
                resp = requests.post(url, json=results, headers=HEADERS_SUPABASE)
                if resp.status_code >= 400:
                    print(f"      ❌ Erreur sauvegarde: {resp.text}")
                else:
                    print(f"      ✅ Squelettes mis à jour pour {set_code} ({fmt}) !")
    
    print("\n🏁 Mission accomplie.")
