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
import sys
import requests
import time
import numpy as np

# Console Windows (cp1252) : forcer l'UTF-8 pour ne pas crasher sur les emojis.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass
from collections import Counter
from dotenv import load_dotenv
from pathlib import Path

import umap

# ==============================================================================
# 1. CONFIGURATION
# ==============================================================================

TARGET_SET_CODES = []  # [] = tous les sets actifs (suivis via la table `sets`)
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
    """Recupere tous les decks trophees (pagine) pour un set/format.

    Pagination par curseur (id > dernier id vu) : avec un offset, Postgres
    relit toutes les lignes precedentes a chaque page et les gros sets
    finissent en statement timeout.
    """
    decks = []
    page_size = 500
    last_id = None
    while True:
        cursor = f"&id=gt.{last_id}" if last_id is not None else ""
        url = (
            f"{SUPABASE_URL}/rest/v1/trophy_decks"
            f"?set_code=eq.{set_code}&format=eq.{fmt}{cursor}"
            f"&select=id,aggregate_id,archetype,cardlist,wins,losses,trophy_time"
            f"&order=id&limit={page_size}"
        )
        batch = None
        for attempt in range(5):
            if attempt:
                time.sleep(3 * attempt)  # la 1re page expire parfois a froid
            try:
                r = requests.get(url, headers=HEADERS_SUPABASE, timeout=60)
                if r.status_code == 200:
                    batch = r.json()
                    break
                print(f"   ⚠️ Erreur fetch decks (apres id {last_id}, tentative {attempt + 1}): {r.text[:150]}")
            except Exception as e:
                print(f"   ⚠️ Exception fetch decks (tentative {attempt + 1}): {e}")
        if batch is None:
            print("   ❌ Fetch decks abandonne : carte non mise a jour pour ce format")
            return []
        decks.extend(batch)
        if len(batch) < page_size:
            break
        last_id = batch[-1]["id"]
    return decks


def fetch_card_meta(set_code):
    """Rarete, CMC et type par nom de carte (face avant comprise pour les DFC)."""
    url = (
        f"{SUPABASE_URL}/rest/v1/card_list"
        f"?set_code=eq.{set_code}&select=card_name,rarity,card_cmc,card_type"
    )
    meta = {}
    try:
        r = requests.get(url, headers=HEADERS_SUPABASE, timeout=60)
        if r.status_code == 200:
            for row in r.json():
                name = row.get("card_name") or ""
                for key in {name, name.split(" // ")[0]}:
                    meta.setdefault(key, row)
    except Exception as e:
        print(f"   ⚠️ Erreur fetch card_list: {e}")
    return meta


def deck_profile(spells, meta):
    """(nombre de rares+mythiques, CMC moyen des sorts non-terrains) d'un deck.

    Alimente les modes "Color by" de la carte. Les cartes absentes de
    card_list sont ignorees ; None si rien n'est mesurable.
    """
    rares = 0
    cmc_total, cmc_count = 0.0, 0
    known = False
    for name, qty in spells.items():
        row = meta.get(name)
        if not row:
            continue
        known = True
        q = int(qty or 0)
        if str(row.get("rarity") or "").lower() in ("rare", "mythic"):
            rares += q
        if "Land" not in (row.get("card_type") or "") and row.get("card_cmc") is not None:
            cmc_total += float(row["card_cmc"]) * q
            cmc_count += q
    if not known:
        return None, None
    return rares, (round(cmc_total / cmc_count, 2) if cmc_count else None)

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
    Retourne (matrix, kept_decks, vocab).
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
        return None, [], {}

    matrix = np.zeros((len(kept), len(vocab)), dtype=np.float32)
    for i, d in enumerate(kept):
        for name, qty in d["_spells"].items():
            matrix[i, vocab[name]] = float(qty)
    return matrix, kept, vocab

def fetch_archetypal_skeletons(set_code, fmt):
    """Recupere les squelettes archetypaux (principaux) pour un set/format."""
    url = (
        f"{SUPABASE_URL}/rest/v1/archetypal_skeletons"
        f"?set_code=eq.{set_code}&format=eq.{fmt}"
        f"&select=archetype_name,deck_list,is_alternative,sample_size"
    )
    try:
        r = requests.get(url, headers=HEADERS_SUPABASE)
        if r.status_code == 200:
            return r.json()
    except Exception as e:
        print(f"   ⚠️ Erreur fetch skeletons: {e}")
    return []

def skeleton_vector(deck_list, vocab):
    """Vecteur d'un squelette sur le MEME vocabulaire (basics + cartes inconnues exclues)."""
    vec = np.zeros(len(vocab), dtype=np.float32)
    total = 0
    for c in deck_list or []:
        name = c.get("name") if isinstance(c, dict) else None
        if not name or name in BASIC_LANDS or name not in vocab:
            continue
        vec[vocab[name]] += 1.0
        total += 1
    return vec, total

# ==============================================================================
# 3. TRAITEMENT D'UN SET / FORMAT
# ==============================================================================

def process(set_code, fmt):
    print(f"\n🗺️  [{set_code} / {fmt}]")
    decks = fetch_trophy_decks(set_code, fmt)
    print(f"   📦 {len(decks)} decks trophees recuperes")

    matrix, kept, vocab = build_vectors(decks)
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

    # --- Cartes signature par archetype (identite couleur) ---
    # lift = presence dans l'archetype / presence globale. Pas de clustering.
    presence = (matrix > 0)
    global_freq = presence.mean(axis=0)
    inv_vocab = {idx: name for name, idx in vocab.items()}

    by_colors = {}
    for i, d in enumerate(kept):
        c = extract_colors(d.get("archetype"))
        by_colors.setdefault(c, []).append(i)

    arch_card_records = []
    for colors, idxs in by_colors.items():
        if len(idxs) < 15:
            continue
        cfreq = presence[idxs].mean(axis=0)
        archs = [kept[i].get("archetype") for i in idxs if kept[i].get("archetype")]
        label = Counter(archs).most_common(1)[0][0] if archs else colors
        scored = []
        for col in range(matrix.shape[1]):
            if cfreq[col] < 0.35:  # carte presente dans >=35% des decks de l'archetype
                continue
            lift = float(cfreq[col]) / float(global_freq[col] or 1e-6)
            scored.append((col, float(cfreq[col]), lift))
        scored.sort(key=lambda t: t[2] * t[1], reverse=True)
        top_cards = [{"name": inv_vocab[c], "freq": round(f, 2), "lift": round(l, 1)} for c, f, l in scored[:12]]
        arch_card_records.append({
            "set_code": set_code,
            "format": fmt,
            "colors": colors,
            "label": label,
            "size": int(len(idxs)),
            "top_cards": top_cards,
        })

    # --- Construction des enregistrements (decks reels) ---
    meta = fetch_card_meta(set_code)
    records = []
    for i, d in enumerate(kept):
        rare_count, avg_cmc = deck_profile(d["_spells"], meta)
        records.append({
            "aggregate_id": d["aggregate_id"],
            "set_code": set_code,
            "format": fmt,
            "archetype": d.get("archetype"),
            "colors": extract_colors(d.get("archetype")),
            "wins": d.get("wins"),
            "losses": d.get("losses"),
            "trophy_time": d.get("trophy_time"),
            "rare_count": rare_count,
            "avg_cmc": avg_cmc,
            "x": round(float(coords[i, 0]), 4),
            "y": round(float(coords[i, 1]), 4),
            "is_archetypal": False,
        })

    # --- Projection des squelettes archetypaux dans le MEME espace UMAP ---
    skels = fetch_archetypal_skeletons(set_code, fmt)
    skels = [s for s in skels if not s.get("is_alternative") and (s.get("sample_size") or 0) >= 20]
    arch_vecs, arch_valid = [], []
    for s in skels:
        vec, total = skeleton_vector(s.get("deck_list"), vocab)
        if total > 0:
            arch_vecs.append(vec)
            arch_valid.append(s)
    arch_count = 0
    if arch_vecs:
        arch_coords = reducer.transform(np.vstack(arch_vecs))
        for i, s in enumerate(arch_valid):
            name = s["archetype_name"]
            records.append({
                "aggregate_id": f"arch:{set_code}:{fmt}:{name}",
                "set_code": set_code,
                "format": fmt,
                "archetype": name,
                "colors": extract_colors(name),
                "wins": None,
                "losses": None,
                "trophy_time": None,
                "rare_count": None,
                "avg_cmc": None,
                "x": round(float(arch_coords[i, 0]), 4),
                "y": round(float(arch_coords[i, 1]), 4),
                "is_archetypal": True,
            })
        arch_count = len(arch_valid)

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

    # --- Cartes signature par archetype ---
    adel = f"{SUPABASE_URL}/rest/v1/trophy_map_archetype_cards?set_code=eq.{set_code}&format=eq.{fmt}"
    try:
        requests.delete(adel, headers=HEADERS_SUPABASE)
        if arch_card_records:
            aurl = f"{SUPABASE_URL}/rest/v1/trophy_map_archetype_cards?on_conflict=set_code,format,colors"
            resp = requests.post(aurl, json=arch_card_records, headers=HEADERS_SUPABASE)
            if resp.status_code >= 400:
                print(f"   ❌ Erreur insert archetype cards: {resp.text}")
    except Exception as e:
        print(f"   ⚠️ Echec ecriture archetype cards: {e}")

    print(f"   ✅ {n} decks + {arch_count} archetypaux · {len(arch_card_records)} archetypes (cartes signature) · {matrix.shape[1]} cartes au vocabulaire")

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
