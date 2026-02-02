"""
Script de debug pour analyser les incohérences de sample_size dans TrophyDecks.

Compare:
1. Nombre de trophy_decks en BDD par archétype
2. sample_size stocké dans archetypal_skeletons
3. Détecte les écarts
"""

import requests
import os
from collections import Counter
from datetime import datetime, timezone
from dotenv import load_dotenv
from pathlib import Path

# --- CONFIGURATION ---
TARGET_SET_CODE = "ECL"  # Set à analyser
TARGET_FORMAT = "PremierDraft"  # Format à analyser

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
}


def fetch_all(table, params):
    """Fetch avec pagination automatique"""
    all_data = []
    offset = 0
    page_size = 1000

    while True:
        url = f"{SUPABASE_URL}/rest/v1/{table}?{params}&limit={page_size}&offset={offset}"
        resp = requests.get(url, headers=HEADERS_SUPABASE)
        if resp.status_code != 200:
            print(f"❌ Erreur {table}: {resp.status_code} - {resp.text[:200]}")
            break
        data = resp.json()
        if not data:
            break
        all_data.extend(data)
        if len(data) < page_size:
            break
        offset += page_size

    return all_data


def main():
    print("=" * 70)
    print(f"🔍 DEBUG TROPHY COUNTS - {TARGET_SET_CODE} / {TARGET_FORMAT}")
    print(f"⏰ {datetime.now(timezone.utc).isoformat()}")
    print("=" * 70)

    # 1. Récupérer tous les trophy_decks
    print("\n📦 1. Chargement des trophy_decks...")
    trophy_decks = fetch_all(
        "trophy_decks",
        f"set_code=eq.{TARGET_SET_CODE}&format=eq.{TARGET_FORMAT}&select=id,archetype,trophy_time,aggregate_id,scraped_at"
    )
    print(f"   Total trophy_decks: {len(trophy_decks)}")

    # Compter par archétype
    trophy_counts = Counter(d['archetype'] for d in trophy_decks)
    print(f"   Archétypes uniques: {len(trophy_counts)}")

    # 2. Récupérer les archetypal_skeletons
    print("\n📊 2. Chargement des archetypal_skeletons...")
    skeletons = fetch_all(
        "archetypal_skeletons",
        f"set_code=eq.{TARGET_SET_CODE}&format=eq.{TARGET_FORMAT}&select=id,archetype_name,sample_size,is_alternative,updated_at"
    )
    print(f"   Total skeletons: {len(skeletons)}")

    # Créer un map pour comparaison
    skeleton_map = {}
    for s in skeletons:
        key = (s['archetype_name'], s.get('is_alternative', False))
        skeleton_map[key] = s

    # 3. Comparaison
    print("\n" + "=" * 70)
    print("📋 3. COMPARAISON PAR ARCHÉTYPE")
    print("=" * 70)
    print(f"{'Archétype':<12} | {'Trophy BDD':>10} | {'Skeleton Main':>13} | {'Skeleton Alt':>12} | {'Écart':>8}")
    print("-" * 70)

    issues = []
    for arch in sorted(trophy_counts.keys()):
        trophy_count = trophy_counts[arch]

        main_skeleton = skeleton_map.get((arch, False))
        alt_skeleton = skeleton_map.get((arch, True))

        main_sample = main_skeleton['sample_size'] if main_skeleton else "-"
        alt_sample = alt_skeleton['sample_size'] if alt_skeleton else "-"

        # Calculer l'écart
        total_skeleton = 0
        if main_skeleton:
            total_skeleton += main_skeleton['sample_size'] or 0
        if alt_skeleton:
            total_skeleton += alt_skeleton['sample_size'] or 0

        ecart = trophy_count - total_skeleton if total_skeleton > 0 else "N/A"

        # Marquer les problèmes
        flag = ""
        if isinstance(ecart, int) and abs(ecart) > 5:
            flag = "⚠️"
            issues.append({
                "archetype": arch,
                "trophy_count": trophy_count,
                "skeleton_total": total_skeleton,
                "ecart": ecart
            })

        print(f"{arch:<12} | {trophy_count:>10} | {str(main_sample):>13} | {str(alt_sample):>12} | {str(ecart):>8} {flag}")

    # 4. Détails des skeletons
    print("\n" + "=" * 70)
    print("📅 4. DATES DE MISE À JOUR DES SKELETONS")
    print("=" * 70)
    for s in sorted(skeletons, key=lambda x: x['archetype_name']):
        alt_flag = " (ALT)" if s.get('is_alternative') else ""
        print(f"   {s['archetype_name']:<12}{alt_flag:<8} | sample_size: {s['sample_size']:>4} | updated: {s['updated_at']}")

    # 5. Vérifier les doublons potentiels dans trophy_decks
    print("\n" + "=" * 70)
    print("🔎 5. VÉRIFICATION DES DOUBLONS (aggregate_id)")
    print("=" * 70)
    aggregate_ids = [d['aggregate_id'] for d in trophy_decks]
    id_counts = Counter(aggregate_ids)
    duplicates = {k: v for k, v in id_counts.items() if v > 1}
    if duplicates:
        print(f"   ⚠️ {len(duplicates)} aggregate_id en doublon!")
        for agg_id, count in list(duplicates.items())[:10]:
            print(f"      {agg_id}: {count} occurrences")
    else:
        print("   ✅ Aucun doublon détecté")

    # 6. Distribution temporelle des trophy_decks
    print("\n" + "=" * 70)
    print("📆 6. DISTRIBUTION TEMPORELLE DES TROPHY_DECKS")
    print("=" * 70)
    dates = []
    for d in trophy_decks:
        tt = d.get('trophy_time')
        if tt:
            try:
                if tt.endswith('Z'):
                    tt = tt[:-1] + '+00:00'
                dt = datetime.fromisoformat(tt)
                dates.append(dt.date())
            except:
                pass

    date_counts = Counter(dates)
    for date in sorted(date_counts.keys())[-14:]:  # 14 derniers jours
        print(f"   {date}: {date_counts[date]:>4} decks")

    # 7. Résumé des problèmes
    print("\n" + "=" * 70)
    print("🚨 7. RÉSUMÉ DES PROBLÈMES DÉTECTÉS")
    print("=" * 70)
    if issues:
        print(f"   {len(issues)} archétypes avec écart significatif (>5):")
        for issue in issues:
            print(f"   - {issue['archetype']}: BDD={issue['trophy_count']}, Skeleton={issue['skeleton_total']}, Écart={issue['ecart']}")
    else:
        print("   ✅ Aucun écart significatif détecté")

    # 8. Distribution par date de scraping (scraped_at) pour WU
    print("\n" + "=" * 70)
    print("🕐 8. DISTRIBUTION WU PAR DATE DE SCRAPING (scraped_at)")
    print("=" * 70)
    wu_decks = [d for d in trophy_decks if d['archetype'] == 'WU']
    print(f"   Total WU dans trophy_decks: {len(wu_decks)}")

    scraped_dates = []
    for d in wu_decks:
        sa = d.get('scraped_at')
        if sa:
            try:
                if sa.endswith('Z'):
                    sa = sa[:-1] + '+00:00'
                dt = datetime.fromisoformat(sa)
                scraped_dates.append(dt.date())
            except:
                pass

    scraped_counts = Counter(scraped_dates)
    print("   Par date de scraping (scraped_at):")
    for date in sorted(scraped_counts.keys()):
        print(f"      {date}: {scraped_counts[date]:>4} decks WU ajoutés")

    # 9. Vérifier les archétypes dans trophy_decks vs ce que le script devrait voir
    print("\n" + "=" * 70)
    print("🔎 9. VÉRIFICATION DES ARCHÉTYPES (valeurs uniques)")
    print("=" * 70)
    unique_archetypes = set(d['archetype'] for d in trophy_decks)
    print(f"   Archétypes uniques trouvés: {sorted(unique_archetypes)}")

    # Vérifier s'il y a des variantes de WU (espaces, casse, etc.)
    wu_variants = [a for a in unique_archetypes if 'W' in a.upper() and 'U' in a.upper() and len(a) <= 3]
    print(f"   Variantes contenant W et U: {wu_variants}")

    # 9b. Analyser les decks WU - vérifier leurs champs
    print("\n   --- Analyse détaillée des decks WU ---")
    wu_with_scraped = sum(1 for d in wu_decks if d.get('scraped_at'))
    wu_without_scraped = sum(1 for d in wu_decks if not d.get('scraped_at'))
    print(f"   WU avec scraped_at: {wu_with_scraped}")
    print(f"   WU sans scraped_at: {wu_without_scraped}")

    # Vérifier un échantillon de decks WU
    if wu_decks:
        sample = wu_decks[0]
        print(f"   Exemple de deck WU (premier):")
        sample_id = sample.get('id', 'N/A')
        agg_id = sample.get('aggregate_id', 'N/A')
        print(f"      - id: {sample_id}")
        print(f"      - aggregate_id: {agg_id}")
        print(f"      - format: {sample.get('format', 'N/A')}")
        print(f"      - archetype: {sample.get('archetype', 'N/A')}")
        print(f"      - trophy_time: {sample.get('trophy_time', 'N/A')}")
        print(f"      - scraped_at: {sample.get('scraped_at', 'N/A')}")
        print(f"      - cardlist keys count: {len(sample.get('cardlist', {})) if sample.get('cardlist') else 0}")

    # 10. Test API directe (simuler ce que fait le front)
    print("\n" + "=" * 70)
    print("🌐 10. TEST API DIRECTE (comme le front)")
    print("=" * 70)
    url = f"{SUPABASE_URL}/rest/v1/archetypal_skeletons?set_code=eq.{TARGET_SET_CODE}&format=eq.{TARGET_FORMAT}&select=archetype_name,sample_size,is_alternative,updated_at"
    resp = requests.get(url, headers=HEADERS_SUPABASE)
    if resp.status_code == 200:
        api_data = resp.json()
        print(f"   Réponse API: {len(api_data)} skeletons")
        for s in sorted(api_data, key=lambda x: x['archetype_name']):
            alt = " (alt)" if s.get('is_alternative') else ""
            updated = s.get('updated_at', '')[:10] if s.get('updated_at') else 'N/A'
            print(f"   {s['archetype_name']:<12}{alt:<8}: sample_size = {s['sample_size']:>4} | updated: {updated}")
    else:
        print(f"   ❌ Erreur API: {resp.status_code}")

    print("\n" + "=" * 70)
    print("✅ Debug terminé")
    print("=" * 70)


if __name__ == "__main__":
    main()
