"""
ETL — Card Map (UMAP des cartes + communautes de synergie)
==========================================================

Pendant "cartes" de la Trophy Map. Au lieu de projeter les DECKS, on projette
les CARTES :
  - Chaque carte devient un vecteur "dans quels decks trophees elle apparait".
  - UMAP (metric cosine) projette ces vecteurs en 2D : deux cartes proches =
    cartes qui apparaissent dans les memes decks (axes sans sens, seule la
    DISTANCE compte).
  - Louvain regroupe les cartes en COMMUNAUTES a partir du graphe de synergie
    (`synergy_scores`, arete ponderee par le lift). Une carte posee entre deux
    taches de couleur = carte-pont flex.

Sorties dans la table `card_map` (set_code, format, card_name, x, y, community,
degree), lue par le front (mode "Map" / "Communities" de la pop-up Card Graphs).

Ce script lit `trophy_decks` (matrice) et `synergy_scores` (graphe) deja peuples
en base — pas de scraping 17lands, donc pas de cookie de session.
"""

import os
import sys
import requests
import numpy as np

# Console Windows (cp1252) : forcer l'UTF-8 pour ne pas crasher sur les emojis.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

from dotenv import load_dotenv
from pathlib import Path

import umap
import networkx as nx
from networkx.algorithms.community import louvain_communities

# ==============================================================================
# 1. CONFIGURATION
# ==============================================================================

TARGET_SET_CODES = []  # [] = tous les sets actifs (table `sets`)
TARGET_FORMATS = ["PremierDraft", "TradDraft", "Sealed", "ArenaDirect_Sealed"]

# En dessous de ce nombre de cartes au vocabulaire, l'UMAP n'a pas de sens.
MIN_CARDS = 20

# Terrains de base a exclure (ils ecrasent la similarite).
BASIC_LANDS = {
    "Plains", "Island", "Swamp", "Mountain", "Forest", "Wastes",
    "Snow-Covered Plains", "Snow-Covered Island", "Snow-Covered Swamp",
    "Snow-Covered Mountain", "Snow-Covered Forest",
}

# --- ENVIRONNEMENT ---
current_dir = Path(__file__).parent
root_dir = current_dir.parent
load_dotenv(dotenv_path=root_dir / '.env')

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY") or os.getenv("VITE_SUPABASE_KEY")

HEADERS_SUPABASE = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}

# ==============================================================================
# 2. UTILITAIRES
# ==============================================================================

def get_active_sets():
    url = f"{SUPABASE_URL}/rest/v1/sets?active=eq.true&select=code"
    try:
        r = requests.get(url, headers=HEADERS_SUPABASE)
        if r.status_code == 200:
            return [row["code"] for row in r.json()]
        print(f"❌ Erreur fetch sets: {r.text}")
    except Exception as e:
        print(f"❌ Exception fetch sets: {e}")
    return []

def fetch_trophy_decks(set_code, fmt):
    """Recupere tous les decks trophees (pagine) pour un set/format."""
    decks = []
    page_size = 1000
    offset = 0
    while True:
        url = (
            f"{SUPABASE_URL}/rest/v1/trophy_decks"
            f"?set_code=eq.{set_code}&format=eq.{fmt}"
            f"&select=cardlist&order=id&limit={page_size}&offset={offset}"
        )
        try:
            r = requests.get(url, headers=HEADERS_SUPABASE)
            if r.status_code != 200:
                print(f"   ❌ Erreur fetch decks (offset {offset}): {r.text}")
                break
            batch = r.json()
        except Exception as e:
            print(f"   ❌ Exception fetch decks: {e}")
            break
        decks.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    return decks

def fetch_synergies(set_code, fmt):
    """Recupere les aretes de synergie (pagine) pour le graphe Louvain."""
    edges = []
    page_size = 1000
    offset = 0
    while True:
        url = (
            f"{SUPABASE_URL}/rest/v1/synergy_scores"
            f"?set_code=eq.{set_code}&format=eq.{fmt}"
            f"&select=card_a,card_b,lift_score&limit={page_size}&offset={offset}"
        )
        try:
            r = requests.get(url, headers=HEADERS_SUPABASE)
            if r.status_code != 200:
                print(f"   ⚠️ Erreur fetch synergies (offset {offset}): {r.text}")
                break
            batch = r.json()
        except Exception as e:
            print(f"   ⚠️ Exception fetch synergies: {e}")
            break
        edges.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    return edges

def build_card_matrix(decks):
    """
    Construit la matrice carte x deck (presence/quantite, basics exclus).

    Chaque carte est un echantillon (ligne) dont les features sont les decks ou
    elle apparait. Seules les cartes assez frequentes sont gardees (memes seuils
    que l'ETL synergie pour que le vocabulaire colle au graphe).

    Retourne (matrix, cards) ou matrix.shape == (n_cards, n_decks).
    """
    n_decks = len(decks)
    if n_decks == 0:
        return None, []

    # Seuil de frequence aligne sur etl_script_synergy.py
    min_card_occurrence = max(20, int(n_decks * 0.03))

    # Liste des cartes (sans basics) par deck + comptage d'occurrence
    deck_cards = []
    occurrence = {}
    for d in decks:
        cardlist = d.get("cardlist") or {}
        if not isinstance(cardlist, dict):
            deck_cards.append({})
            continue
        spells = {name: qty for name, qty in cardlist.items() if name not in BASIC_LANDS}
        deck_cards.append(spells)
        for name in spells:
            occurrence[name] = occurrence.get(name, 0) + 1

    cards = sorted(name for name, cnt in occurrence.items() if cnt >= min_card_occurrence)
    if len(cards) < MIN_CARDS:
        return None, cards

    card_idx = {name: i for i, name in enumerate(cards)}
    matrix = np.zeros((len(cards), n_decks), dtype=np.float32)
    for j, spells in enumerate(deck_cards):
        for name, qty in spells.items():
            i = card_idx.get(name)
            if i is not None:
                matrix[i, j] = float(qty)
    return matrix, cards

def detect_communities(edges, vocab):
    """
    Louvain sur le graphe de synergie restreint au vocabulaire.

    Retourne (community_of, degree_of) : dict carte -> id communaute / nb de
    partenaires. Cartes sans arete -> communaute -1.
    """
    vocab_set = set(vocab)
    G = nx.Graph()
    G.add_nodes_from(vocab)
    for e in edges:
        a, b = e.get("card_a"), e.get("card_b")
        if a in vocab_set and b in vocab_set and a != b:
            w = float(e.get("lift_score") or 1.0)
            G.add_edge(a, b, weight=w)

    degree_of = {name: G.degree(name) for name in vocab}

    community_of = {name: -1 for name in vocab}
    # On ne clusterise que les noeuds connectes ; les isoles restent -1.
    connected = [n for n in G.nodes if G.degree(n) > 0]
    if connected:
        sub = G.subgraph(connected)
        communities = louvain_communities(sub, weight="weight", seed=42)
        # Trier par taille decroissante pour des ids stables/lisibles (0 = plus gros)
        communities = sorted(communities, key=len, reverse=True)
        for cid, members in enumerate(communities):
            for name in members:
                community_of[name] = cid
    return community_of, degree_of

# ==============================================================================
# 3. TRAITEMENT D'UN SET / FORMAT
# ==============================================================================

def process(set_code, fmt):
    print(f"\n🗺️  [{set_code} / {fmt}]")
    decks = fetch_trophy_decks(set_code, fmt)
    print(f"   📦 {len(decks)} decks trophees recuperes")

    matrix, cards = build_card_matrix(decks)
    if matrix is None:
        print(f"   ⏭️  Trop peu de cartes frequentes ({len(cards)} < {MIN_CARDS}), ignore.")
        return

    n_cards = len(cards)

    # --- UMAP : projection 2D (cosine = similarite d'apparition dans les decks) ---
    n_neighbors = int(min(15, max(2, n_cards - 1)))
    reducer = umap.UMAP(
        n_components=2,
        n_neighbors=n_neighbors,
        min_dist=0.12,
        metric="cosine",
        random_state=42,
    )
    coords = reducer.fit_transform(matrix)

    # --- Communautes (Louvain sur le graphe de synergie) ---
    edges = fetch_synergies(set_code, fmt)
    community_of, degree_of = detect_communities(edges, cards)
    n_comm = len(set(c for c in community_of.values() if c >= 0))
    print(f"   🔗 {len(edges)} aretes synergie · {n_comm} communautes")

    # --- Enregistrements ---
    records = []
    for i, name in enumerate(cards):
        records.append({
            "set_code": set_code,
            "format": fmt,
            "card_name": name,
            "x": round(float(coords[i, 0]), 4),
            "y": round(float(coords[i, 1]), 4),
            "community": int(community_of.get(name, -1)),
            "degree": int(degree_of.get(name, 0)),
        })

    # --- Remplacement complet pour ce set/format (coords coherentes) ---
    del_url = f"{SUPABASE_URL}/rest/v1/card_map?set_code=eq.{set_code}&format=eq.{fmt}"
    try:
        requests.delete(del_url, headers=HEADERS_SUPABASE)
    except Exception as e:
        print(f"   ⚠️ Echec suppression anciennes coords: {e}")

    for j in range(0, len(records), 500):
        chunk = records[j:j + 500]
        url = f"{SUPABASE_URL}/rest/v1/card_map?on_conflict=set_code,format,card_name"
        try:
            resp = requests.post(url, json=chunk, headers=HEADERS_SUPABASE)
            if resp.status_code >= 400:
                print(f"   ❌ Erreur insert {j}: {resp.text}")
        except Exception as e:
            print(f"   ❌ Exception insert: {e}")

    print(f"   ✅ {n_cards} cartes projetees · {n_comm} communautes")

# ==============================================================================
# MAIN
# ==============================================================================

if __name__ == "__main__":
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("❌ Variables d'environnement Supabase manquantes.")
        raise SystemExit(1)

    sets = TARGET_SET_CODES or get_active_sets()
    if not sets:
        print("⚠️ Aucun set a traiter.")
        raise SystemExit(0)

    print(f"🌍 Card Map — sets: {sets}")
    for set_code in sets:
        for fmt in TARGET_FORMATS:
            process(set_code, fmt)

    print("\n✨ Card Map terminee.")
