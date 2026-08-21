"""
Script pour alimenter arena_id dans card_list depuis l'API 17lands
Usage: python populate_arena_ids.py [SET_CODE]
Exemple: python populate_arena_ids.py ECL
"""

import requests
import os
import time
import sys
from dotenv import load_dotenv
from pathlib import Path

# ==============================================================================
# 1. CONFIGURATION
# ==============================================================================

# ✅ VARIABLE DE CIBLAGE (peut être overridé par argument CLI)
TARGET_SET = "HOB"

# --- ENVIRONNEMENT ---
current_dir = Path(__file__).parent
root_dir = current_dir.parent.parent  # backend/enrichment -> racine du projet
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
# 2. RÉCUPÉRATION 17LANDS
# ==============================================================================

def fetch_17lands_data(set_code: str, format: str = "PremierDraft") -> list:
    """Récupère les données 17lands pour un set (avec mtga_id)"""
    url = f"https://www.17lands.com/card_ratings/data?expansion={set_code}&format={format}"

    print(f"📡 Récupération des données 17lands pour {set_code}...")
    response = requests.get(url, headers={"User-Agent": "MTG-Tools/1.0"})

    if response.status_code != 200:
        print(f"❌ Erreur 17lands: {response.status_code}")
        return []

    data = response.json()
    print(f"✅ {len(data)} cartes trouvées sur 17lands")
    return data

# ==============================================================================
# 3. MISE À JOUR SUPABASE
# ==============================================================================

def update_arena_ids(set_code: str, cards_17lands: list):
    """Met à jour card_list avec les arena_id depuis 17lands"""

    if not cards_17lands:
        print("⚠️ Aucune donnée 17lands.")
        return

    print(f"🚀 Mise à jour des arena_id pour {len(cards_17lands)} cartes...")

    updated = 0
    errors = 0

    for card in cards_17lands:
        card_name = card.get("name")
        arena_id = card.get("mtga_id")

        if not card_name or not arena_id:
            continue

        # PATCH pour mettre à jour arena_id
        url = f"{SUPABASE_URL}/rest/v1/card_list?card_name=eq.{requests.utils.quote(card_name)}&set_code=eq.{set_code}"

        resp = requests.patch(
            url,
            json={"arena_id": arena_id},
            headers=HEADERS_SUPABASE
        )

        if resp.status_code >= 400:
            print(f"  ❌ {card_name}: {resp.text}")
            errors += 1
        else:
            updated += 1

        # Rate limiting léger
        if updated % 50 == 0:
            print(f"  ... {updated} cartes mises à jour")
            time.sleep(0.1)

    print(f"\n✅ Résultat: {updated} mises à jour, {errors} erreurs")

# ==============================================================================
# 4. SECONDE PASSE : CARTES RECTO-VERSO
# ==============================================================================

def update_split_cards(set_code: str, cards_17lands: list):
    """
    17lands ne nomme que la face avant des cartes recto-verso / split :
    "Smaug, the Great Calamity" la ou card_list stocke
    "Smaug, the Great Calamity // Spew Flame". La passe principale, qui matche
    sur le nom exact, les rate donc toutes.

    On rattrape ici en reliant la face avant de chaque nom restant.
    """
    by_front_name = {
        c["name"]: c["mtga_id"]
        for c in cards_17lands
        if c.get("name") and c.get("mtga_id")
    }

    url = (
        f"{SUPABASE_URL}/rest/v1/card_list"
        f"?set_code=eq.{set_code}&arena_id=is.null&select=card_name"
    )
    resp = requests.get(url, headers=HEADERS_SUPABASE)
    if resp.status_code >= 400:
        print(f"[WARN] Lecture des cartes restantes impossible: {resp.text}")
        return

    remaining = [r["card_name"] for r in resp.json() if " // " in r.get("card_name", "")]
    if not remaining:
        return

    print(f"[2e passe] {len(remaining)} cartes recto-verso a relier...")

    matched = 0
    for card_name in remaining:
        front_face = card_name.split(" // ")[0].strip()
        arena_id = by_front_name.get(front_face)

        if not arena_id:
            print(f"  [MISS] {card_name} (face avant absente de 17lands)")
            continue

        patch_url = (
            f"{SUPABASE_URL}/rest/v1/card_list"
            f"?card_name=eq.{requests.utils.quote(card_name)}&set_code=eq.{set_code}"
        )
        patch = requests.patch(patch_url, json={"arena_id": arena_id}, headers=HEADERS_SUPABASE)

        if patch.status_code >= 400:
            print(f"  [ERR] {card_name}: {patch.text}")
        else:
            matched += 1

    print(f"[2e passe] {matched}/{len(remaining)} reliees via la face avant")


# ==============================================================================
# MAIN
# ==============================================================================

if __name__ == "__main__":
    # Override set code si argument CLI
    target = sys.argv[1].upper() if len(sys.argv) > 1 else TARGET_SET

    print(f"\n{'='*50}")
    print(f"🎯 Population arena_id pour le set : {target}")
    print(f"{'='*50}\n")

    start_time = time.time()

    # 1. Récupérer les données 17lands
    cards_17lands = fetch_17lands_data(target)

    # 2. Mettre à jour card_list
    update_arena_ids(target, cards_17lands)

    # 3. Rattraper les cartes recto-verso, nommees differemment par 17lands
    update_split_cards(target, cards_17lands)

    print(f"\n✨ Terminé en {round(time.time() - start_time, 2)}s.")
