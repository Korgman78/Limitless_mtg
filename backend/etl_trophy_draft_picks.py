"""
ETL — Trophy Draft Picks (Draft Practice)
=========================================

Ingere la SEQUENCE DE PICKS (pack par pack) de quelques drafts trophees MYTHIC,
pour alimenter la feature "Draft Practice" : le joueur rejoue les memes packs
qu'un joueur mythic du haut du ladder, puis compare ses choix.

Qualitatif, pas exhaustif : on ne garde que les MEILLEURS exemples, classes par
le VRAI rang ladder (pas de fallback approximatif).

Trois endpoints 17Lands :
  - POST /api/trophies/  -> liste des trophees (EXIGE le cookie de session).
  - GET  /data/details?draft_id=<id> -> rang ladder reel (PUBLIC, pas de cookie).
    Le rang vit dans match_results[].game_results[].start_rank, au format
    "Mythic-1-<percentile>-<leaderboard|None>-0" :
      * leaderboard = position numerotee (#N, plus petit = meilleur) si le
        joueur est dans le haut du classement, sinon "None" ;
      * percentile = position en % (plus grand = meilleur) sinon.
  - GET  /data/draft?draft_id=<id> -> draft log complet (PUBLIC, pas de cookie).
    {expansion, picks:[{pack_number, pick_number, available:[...], pick:{name}}]}

Le draft_id 17Lands == aggregate_id des trophy_decks.

Selection : parmi les NOUVEAUX trophees mythic recents, on lit le rang reel de
chacun (cape a DETAIL_SCAN_CAP appels), on trie meilleur-d'abord, on garde
MAX_PER_FORMAT. Les drafts sans rang lisible sont ignores (pas de fallback).
"""

import os
import sys
import time
import random
import requests

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

from datetime import datetime, timezone
from dotenv import load_dotenv
from pathlib import Path

# ==============================================================================
# 1. CONFIGURATION
# ==============================================================================

TARGET_SET_CODES = ["SOS"]  # [] = tous les sets actifs
TARGET_FORMATS = ["PremierDraft", "TradDraft"]  # draft only (le scellé n'a pas de picks)

# Qualitatif : peu d'exemples, les meilleurs. Nouveaux drafts max / set / format / run.
MAX_PER_FORMAT = 10
# Nb max de candidats (récents) dont on lit le rang réel par run (borne le coût).
DETAIL_SCAN_CAP = 60

# --- ENVIRONNEMENT ---
current_dir = Path(__file__).parent
root_dir = current_dir.parent
load_dotenv(dotenv_path=root_dir / '.env')

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY") or os.getenv("VITE_SUPABASE_KEY")
LANDS17_COOKIE = os.getenv("LANDS17_COOKIE")

HEADERS_17LANDS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    "Origin": "https://www.17lands.com",
    "Referer": "https://www.17lands.com/trophy_decks",
}
if LANDS17_COOKIE:
    HEADERS_17LANDS["Cookie"] = LANDS17_COOKIE

HEADERS_SUPABASE = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}

# ==============================================================================
# 2. UTILITAIRES
# ==============================================================================

def random_sleep(lo=5.0, hi=8.0):
    time.sleep(random.uniform(lo, hi))

def get_active_sets():
    url = f"{SUPABASE_URL}/rest/v1/sets?active=eq.true&select=code"
    try:
        r = requests.get(url, headers=HEADERS_SUPABASE, timeout=30)
        if r.status_code == 200:
            return [row["code"] for row in r.json()]
    except Exception as e:
        print(f"❌ Exception fetch sets: {e}")
    return []

def get_existing_ids(set_code, fmt):
    """aggregate_id déjà stockés, pour ne jamais re-ingérer (pagination)."""
    ids, offset, page = set(), 0, 1000
    while True:
        url = (f"{SUPABASE_URL}/rest/v1/trophy_draft_picks"
               f"?set_code=eq.{set_code}&format=eq.{fmt}"
               f"&select=aggregate_id&order=aggregate_id&limit={page}&offset={offset}")
        try:
            r = requests.get(url, headers=HEADERS_SUPABASE, timeout=30)
            if r.status_code != 200:
                break
            batch = r.json()
        except Exception:
            break
        ids.update(row["aggregate_id"] for row in batch)
        if len(batch) < page:
            break
        offset += page
    return ids

def to_epoch(raw):
    if not raw:
        return 0
    try:
        if raw.endswith("Z"):
            raw = raw[:-1] + "+00:00"
        dt = datetime.fromisoformat(raw)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.timestamp()
    except Exception:
        return 0

def fetch_trophies_mythic(expansion, fmt):
    """POST /api/trophies/ filtré mythic. EXIGE le cookie de session."""
    url = "https://www.17lands.com/api/trophies/"
    payload = {
        "expansion": expansion,
        "event_type": fmt,
        "card_names": [],
        "ranks": ["mythic"],
        "deck_colors": [],
    }
    for attempt in range(3):
        try:
            r = requests.post(url, json=payload, headers=HEADERS_17LANDS, timeout=30)
            if r.status_code == 200:
                data = r.json()
                return data.get("data", []) if isinstance(data, dict) else (data or [])
            print(f"   ⚠️ trophies HTTP {r.status_code} (essai {attempt+1})")
        except Exception as e:
            print(f"   ⚠️ trophies exception: {e} (essai {attempt+1})")
        time.sleep(3 * (attempt + 1))
    return []

def fetch_json(url):
    """GET public 17Lands (corps JSON même si content-type text/html)."""
    for attempt in range(3):
        try:
            r = requests.get(url, headers=HEADERS_17LANDS, timeout=30)
            if r.status_code == 200:
                return r.json()
            print(f"      ⚠️ HTTP {r.status_code} (essai {attempt+1}) {url[:60]}…")
        except Exception as e:
            print(f"      ⚠️ exception: {e} (essai {attempt+1})")
        # Backoff plus long : un 403 = rate-limit IP, on laisse 17Lands respirer.
        time.sleep(8 * (attempt + 1))
    return None

def parse_rank(details):
    """
    Extrait le rang ladder réel depuis /data/details. Renvoie un dict
    {score, display, lb, pct, raw} ou None si non-mythic / illisible (→ on saute,
    pas de fallback).

    On prend le start_rank du DERNIER match (standing le plus proche de la fin).
    Format : "Mythic-1-<percentile>-<leaderboard|None>-0".
    score (plus petit = meilleur) : (0, leaderboard) si numéroté, sinon (1, -percentile).
    """
    last = None
    for m in details.get("match_results") or []:
        for g in m.get("game_results") or []:
            if g.get("start_rank"):
                last = g["start_rank"]
    last = last or details.get("end_rank") or details.get("start_rank") or ""
    parts = str(last).split("-")
    if not parts or "mythic" not in parts[0].lower():
        return None
    pct = None
    lb = None
    if len(parts) >= 3:
        try:
            pct = float(parts[2])
        except ValueError:
            pct = None
    if len(parts) >= 4 and parts[3] not in ("", "None"):
        try:
            lb = int(parts[3])
        except ValueError:
            lb = None
    if lb is not None:
        score = (0, lb)
        display = f"Mythic #{lb}"
    elif pct is not None:
        score = (1, -pct)
        display = "Mythic"
    else:
        return None  # ni leaderboard ni percentile lisible → on saute
    return {"score": score, "display": display, "lb": lb, "pct": pct, "raw": last}

def compact_picks(draft):
    """[{pack, pick, options:[noms], taken:"nom"}] — on jette les image_url."""
    out = []
    for p in draft.get("picks", []) or []:
        options = [c.get("name") for c in (p.get("available") or []) if c.get("name")]
        taken = (p.get("pick") or {}).get("name")
        if not taken or not options:
            continue
        out.append({
            "pack": p.get("pack_number"),
            "pick": p.get("pick_number"),
            "options": options,
            "taken": taken,
        })
    return out

# ==============================================================================
# 3. TRAITEMENT D'UN SET / FORMAT
# ==============================================================================

def process(set_code, fmt):
    print(f"\n🎓 [{set_code} / {fmt}]")
    trophies = fetch_trophies_mythic(set_code, fmt)
    random_sleep(3.0, 5.0)
    if not trophies:
        print("   ⏭️  Aucun trophée mythic (ou cookie manquant).")
        return

    existing = get_existing_ids(set_code, fmt)
    # Nouveaux candidats, les plus récents d'abord, capés pour borner les appels rang
    candidates = [t for t in trophies if t.get("aggregate_id") and t["aggregate_id"] not in existing]
    candidates.sort(key=lambda t: -to_epoch(t.get("time")))
    candidates = candidates[:DETAIL_SCAN_CAP]
    print(f"   🏅 {len(trophies)} mythic dispo · {len(candidates)} nouveaux candidats à classer")

    # Lecture du rang ladder réel de chaque candidat (pas de fallback)
    scored = []
    for t in candidates:
        agg = t["aggregate_id"]
        details = fetch_json(f"https://www.17lands.com/data/details?draft_id={agg}")
        random_sleep(5.0, 8.0)
        if not details:
            continue
        rank = parse_rank(details)
        if not rank:
            continue  # pas de rang mythic lisible → ignoré
        scored.append((rank, t, details))

    # Meilleur d'abord, on garde les MAX_PER_FORMAT meilleurs
    scored.sort(key=lambda x: x[0]["score"])
    top = scored[:MAX_PER_FORMAT]
    print(f"   🎯 {len(scored)} classés · on garde les {len(top)} meilleurs"
          + (f" (top: {top[0][0]['display']})" if top else ""))

    records = []
    for i, (rank, t, details) in enumerate(top, 1):
        agg = t["aggregate_id"]
        draft = fetch_json(f"https://www.17lands.com/data/draft?draft_id={agg}")
        random_sleep(5.0, 8.0)
        if not draft:
            print(f"      ⚠️ {agg[:16]}… : draft log indisponible")
            continue
        picks = compact_picks(draft)
        if len(picks) < 10:
            print(f"      ⚠️ {agg[:16]}… : seulement {len(picks)} picks, ignoré")
            continue
        records.append({
            "aggregate_id": agg,
            "set_code": set_code,
            "format": fmt,
            "colors": t.get("colors") or t.get("deck_colors"),
            "rank": rank["display"],
            "mythic_rank": rank["lb"],
            "mythic_pct": rank["pct"],
            "wins": int(t.get("wins") or details.get("wins") or 0),
            "losses": int(t.get("losses") or details.get("losses") or 0),
            "trophy_time": t.get("time"),
            "picks": picks,
            "scraped_at": datetime.now(timezone.utc).isoformat(),
        })
        print(f"      ✅ {i}/{len(top)} {rank['display']} · {agg[:16]}… · {len(picks)} picks")

    if records:
        url = f"{SUPABASE_URL}/rest/v1/trophy_draft_picks?on_conflict=aggregate_id"
        try:
            resp = requests.post(url, json=records, headers=HEADERS_SUPABASE, timeout=60)
            if resp.status_code >= 400:
                print(f"   ❌ Erreur insert: {resp.text[:200]}")
            else:
                print(f"   💾 {len(records)} drafts enregistrés")
        except Exception as e:
            print(f"   ❌ Exception insert: {e}")

# ==============================================================================
# MAIN
# ==============================================================================

if __name__ == "__main__":
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("❌ Variables Supabase manquantes.")
        raise SystemExit(1)
    if not LANDS17_COOKIE:
        print("⚠️ LANDS17_COOKIE manquant : /api/trophies/ renverra vide. "
              "Renseigne le secret pour le run CI.")

    sets = TARGET_SET_CODES or get_active_sets()
    if not sets:
        print("⚠️ Aucun set à traiter.")
        raise SystemExit(0)

    print(f"🌍 Trophy Draft Picks — sets: {sets}")
    for set_code in sets:
        for fmt in TARGET_FORMATS:
            process(set_code, fmt)

    print("\n✨ Trophy Draft Picks terminé.")
