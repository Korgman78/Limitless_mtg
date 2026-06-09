"""
ETL — Trophy Map (UMAP + clustering des decks trophees)
=========================================================

Construit une carte 2D des decks trophees facon "format map" :
  - Chaque deck devient un vecteur "bag-of-cards" (quantite par carte, terrains
    de base exclus).
  - UMAP projette ces vecteurs en 2D (les axes n'ont pas de sens intrinseque,
    seule la DISTANCE compte : decks proches = compositions de cartes proches).
  - KMeans regroupe les points en clusters visuels (sous-archetypes).

Les coordonnees (x, y), le cluster et l'archetype sont stockes dans la table
`trophy_deck_map`, que le front lit pour afficher le nuage de points.

Ce script lit `trophy_decks` deja peuplee (pas de scraping 17lands ici, donc
pas besoin de cookie de session).
"""

import os
import re
import math
import requests
import numpy as np
from collections import Counter
from dotenv import load_dotenv
from pathlib import Path

import umap
from sklearn.cluster import KMeans

# ==============================================================================
# 1. CONFIGURATION
# ==============================================================================

TARGET_SET_CODES = ["SOS"]  # [] = tous les sets actifs
TARGET_FORMATS = ["PremierDraft", "TradDraft", "Sealed", "ArenaDirect_Sealed"]

# En dessous de ce nombre de decks, l'UMAP n'a pas de sens (on saute).
MIN_DECKS = 25

# Terrains de base a exclure du vecteur (ils ecrasent la similarite).
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
            f"&select=aggregate_id,archetype,cardlist,wins"
            f"&order=id&limit={page_size}&offset={offset}"
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

def extract_colors(archetype):
    """Extrait le code couleur WUBRG canonique depuis le champ archetype."""
    if not archetype:
        return ""
    letters = set(re.findall(r"[WUBRG]", archetype.upper()))
    order = "WUBRG"
    return "".join(c for c in order if c in letters)

def build_vectors(decks):
    """
    Construit la matrice deck x carte (quantites, terrains de base exclus).
    Retourne (matrix, kept_decks).
    """
    # Vocabulaire : toutes les cartes non-basiques rencontrees
    vocab = {}
    kept = []
    for d in decks:
        cardlist = d.get("cardlist") or {}
        if not isinstance(cardlist, dict):
            continue
        spells = {name: qty for name, qty in cardlist.items() if name not in BASIC_LANDS}
        if not spells:
            continue
        for name in spells:
            if name not in vocab:
                vocab[name] = len(vocab)
        d["_spells"] = spells
        kept.append(d)

    if not kept:
        return None, []

    matrix = np.zeros((len(kept), len(vocab)), dtype=np.float32)
    for i, d in enumerate(kept):
        for name, qty in d["_spells"].items():
            matrix[i, vocab[name]] = float(qty)
    return matrix, kept

def choose_k(n):
    """Nombre de clusters adaptatif, borne entre 4 et 14."""
    return int(max(4, min(14, round(math.sqrt(n / 2.0)))))

# ==============================================================================
# 3. TRAITEMENT D'UN SET / FORMAT
# ==============================================================================

def process(set_code, fmt):
    print(f"\n🗺️  [{set_code} / {fmt}]")
    decks = fetch_trophy_decks(set_code, fmt)
    print(f"   📦 {len(decks)} decks trophees recuperes")

    matrix, kept = build_vectors(decks)
    n = len(kept)
    if n < MIN_DECKS:
        print(f"   ⏭️  Trop peu de decks ({n} < {MIN_DECKS}), ignore.")
        return

    # --- UMAP : projection 2D (metric cosine = similarite de composition) ---
    n_neighbors = int(min(15, max(2, n - 1)))
    reducer = umap.UMAP(
        n_components=2,
        n_neighbors=n_neighbors,
        min_dist=0.12,
        metric="cosine",
        random_state=42,
    )
    coords = reducer.fit_transform(matrix)

    # --- KMeans sur l'embedding 2D (clusters visuellement coherents) ---
    k = min(choose_k(n), n)
    km = KMeans(n_clusters=k, random_state=42, n_init=10)
    clusters = km.fit_predict(coords)

    # Label de cluster = archetype dominant du cluster (pour annotation front)
    cluster_labels = {}
    for cid in range(k):
        archs = [kept[i].get("archetype") for i in range(n) if clusters[i] == cid]
        archs = [a for a in archs if a]
        cluster_labels[cid] = Counter(archs).most_common(1)[0][0] if archs else f"Cluster {cid}"

    # --- Construction des enregistrements ---
    records = []
    for i, d in enumerate(kept):
        records.append({
            "aggregate_id": d["aggregate_id"],
            "set_code": set_code,
            "format": fmt,
            "archetype": d.get("archetype"),
            "colors": extract_colors(d.get("archetype")),
            "wins": d.get("wins"),
            "x": round(float(coords[i, 0]), 4),
            "y": round(float(coords[i, 1]), 4),
            "cluster": int(clusters[i]),
            "cluster_label": cluster_labels[int(clusters[i])],
        })

    # --- Remplacement complet pour ce set/format (coords coherentes) ---
    del_url = f"{SUPABASE_URL}/rest/v1/trophy_deck_map?set_code=eq.{set_code}&format=eq.{fmt}"
    try:
        requests.delete(del_url, headers=HEADERS_SUPABASE)
    except Exception as e:
        print(f"   ⚠️ Echec suppression anciennes coords: {e}")

    for j in range(0, len(records), 500):
        chunk = records[j:j + 500]
        url = f"{SUPABASE_URL}/rest/v1/trophy_deck_map?on_conflict=aggregate_id"
        try:
            resp = requests.post(url, json=chunk, headers=HEADERS_SUPABASE)
            if resp.status_code >= 400:
                print(f"   ❌ Erreur insert {j}: {resp.text}")
        except Exception as e:
            print(f"   ❌ Exception insert: {e}")

    print(f"   ✅ {len(records)} points · {k} clusters · {matrix.shape[1]} cartes au vocabulaire")

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

    print(f"🌍 Trophy Map — sets: {sets}")
    for set_code in sets:
        for fmt in TARGET_FORMATS:
            process(set_code, fmt)

    print("\n✨ Trophy Map terminee.")
