"""
generate_meta_pulse.py — Generateur bi-hebdomadaire Meta Pulse
Genere un article structure par (set_code, format) a partir des donnees Supabase.
Schedule: mercredi + samedi via GitHub Actions.
"""

import argparse
import json
import os
import requests
from datetime import datetime, timezone, timedelta
from pathlib import Path
from dotenv import load_dotenv

# ==============================================================================
# 1. CONFIGURATION
# ==============================================================================

ALL_FORMATS = ["PremierDraft", "TradDraft", "Sealed", "ArenaDirect_Sealed"]

FORMAT_LABELS = {
    "PremierDraft": "Premier Draft",
    "TradDraft": "Trad. Draft",
    "Sealed": "Sealed",
    "ArenaDirect_Sealed": "Arena Direct Sealed",
}

PAIRS = {
    "WU": "Azorius (WU)", "UB": "Dimir (UB)", "BR": "Rakdos (BR)",
    "RG": "Gruul (RG)", "WG": "Selesnya (WG)", "WB": "Orzhov (WB)",
    "UR": "Izzet (UR)", "BG": "Golgari (BG)", "WR": "Boros (WR)",
    "UG": "Simic (UG)",
}

current_dir = Path(__file__).parent
root_dir = current_dir.parent
env_path = root_dir / ".env"
load_dotenv(dotenv_path=env_path)

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY") or os.getenv("VITE_SUPABASE_KEY")

HEADERS_SUPABASE = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}


# ==============================================================================
# 2. HELPERS
# ==============================================================================

def fetch_json(endpoint: str, params: str = "") -> list:
    """GET Supabase REST avec pagination automatique."""
    all_data = []
    offset = 0
    page_size = 1000

    while True:
        sep = "&" if params else ""
        url = f"{SUPABASE_URL}/rest/v1/{endpoint}?{params}{sep}order=id&limit={page_size}&offset={offset}"
        resp = requests.get(url, headers=HEADERS_SUPABASE)
        if resp.status_code != 200:
            print(f"  ⚠ GET {endpoint} → {resp.status_code}: {resp.text[:200]}")
            break
        data = resp.json()
        if not data:
            break
        all_data.extend(data)
        if len(data) < page_size:
            break
        offset += page_size

    return all_data


def safe_float(val, default=0.0):
    try:
        f = float(val)
        if f != f:  # NaN
            return default
        return f
    except (TypeError, ValueError):
        return default


def delta_from_history(history, lookback=4):
    """Calcule le delta entre la valeur actuelle et history[-lookback]."""
    if not history or not isinstance(history, list) or len(history) < 2:
        return 0.0
    current = safe_float(history[-1])
    idx = max(0, len(history) - 1 - lookback)
    previous = safe_float(history[idx])
    return round(current - previous, 2)


def compute_grade(delta: float) -> str:
    """Grade S-F base sur le delta vs moyenne (meme seuils que le frontend)."""
    if delta >= 5.5:
        return "S"
    if delta >= 3.0:
        return "A"
    if delta >= 0.5:
        return "B"
    if delta >= -1.5:
        return "C"
    if delta >= -3.5:
        return "D"
    return "F"


def archetype_name(colors: str) -> str:
    if colors in PAIRS:
        return PAIRS[colors]
    # Try sorted WUBRG order
    order = "WUBRG"
    sorted_colors = "".join(sorted(colors, key=lambda c: order.index(c) if c in order else 99))
    return PAIRS.get(sorted_colors, colors)


# ==============================================================================
# 3. DATA FETCHERS
# ==============================================================================

def fetch_active_sets() -> list[dict]:
    url = f"{SUPABASE_URL}/rest/v1/sets?active=eq.true&select=code,name,start_date"
    resp = requests.get(url, headers=HEADERS_SUPABASE)
    if resp.status_code != 200:
        print(f"⚠ Could not fetch sets: {resp.status_code}")
        return []
    return resp.json()


def fetch_archetype_stats(set_code: str, fmt: str) -> list[dict]:
    params = f"set_code=eq.{set_code}&format=eq.{fmt}&select=colors,win_rate,win_rate_history,games_count"
    return fetch_json("archetype_stats", params)


def fetch_card_stats(set_code: str, fmt: str) -> list[dict]:
    params = (
        f"set_code=eq.{set_code}&format=eq.{fmt}&filter_context=eq.Global"
        f"&select=card_name,gih_wr,win_rate_history,alsa,rarity"
    )
    return fetch_json("card_stats", params)


def fetch_format_balance(set_code: str, fmt: str) -> dict | None:
    url = (
        f"{SUPABASE_URL}/rest/v1/format_balance"
        f"?set_code=eq.{set_code}&format=eq.{fmt}"
        f"&select=archetype_score,color_score&limit=1"
    )
    resp = requests.get(url, headers=HEADERS_SUPABASE)
    if resp.status_code == 200 and resp.json():
        return resp.json()[0]
    return None


def fetch_synergies(set_code: str, fmt: str, limit: int = 5) -> list[dict]:
    params = (
        f"set_code=eq.{set_code}&format=eq.{fmt}"
        f"&select=card_a,card_b,synergy_score,archetype"
        f"&order=synergy_score.desc&limit={limit}"
    )
    url = f"{SUPABASE_URL}/rest/v1/synergy_scores?{params}"
    resp = requests.get(url, headers=HEADERS_SUPABASE)
    if resp.status_code == 200:
        return resp.json()
    return []


def fetch_trophy_decks(set_code: str, fmt: str) -> list[dict]:
    params = f"set_code=eq.{set_code}&format=eq.{fmt}&select=aggregate_id,archetype,cardlist"
    return fetch_json("trophy_decks", params)


def fetch_skeletons(set_code: str, fmt: str) -> list[dict]:
    params = (
        f"set_code=eq.{set_code}&format=eq.{fmt}"
        f"&select=colors,trending_cards,declining_cards,sleeper_cards"
    )
    url = f"{SUPABASE_URL}/rest/v1/archetypal_skeletons?{params}"
    resp = requests.get(url, headers=HEADERS_SUPABASE)
    if resp.status_code == 200:
        return resp.json()
    return []


def fetch_recent_articles(set_code: str, days: int = 7) -> list[dict]:
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    params = (
        f"set_tag=eq.{set_code}&published_at=gte.{cutoff}"
        f"&channel_name=neq.Meta Pulse"
        f"&select=title,channel_name,votes_yes,votes_meh,votes_no"
        f"&order=votes_yes.desc&limit=3"
    )
    url = f"{SUPABASE_URL}/rest/v1/press_articles?{params}"
    resp = requests.get(url, headers=HEADERS_SUPABASE)
    if resp.status_code == 200:
        return resp.json()
    return []


# ==============================================================================
# 4. PULSE BUILDER
# ==============================================================================

def build_pulse(set_code: str, set_name: str, fmt: str, min_games: int) -> dict | None:
    """Construit le JSON Meta Pulse pour un (set_code, format)."""
    print(f"\n📊 Building pulse for {set_code} / {fmt}...")

    # --- Archetypes ---
    archetypes_raw = fetch_archetype_stats(set_code, fmt)
    total_games = sum(safe_float(a.get("games_count", 0)) for a in archetypes_raw)

    if total_games < min_games:
        print(f"  ⏭ Skipped: {int(total_games)} games < {min_games} threshold")
        return None

    BASIC_LANDS = {"Plains", "Island", "Swamp", "Mountain", "Forest"}

    # Enrich archetypes with deltas
    archetypes = []
    for a in archetypes_raw:
        colors = a.get("colors", "")
        if not colors or len(colors) < 2 or len(colors) > 3:  # Only pairs/trios
            continue
        wr = safe_float(a.get("win_rate"))
        delta = delta_from_history(a.get("win_rate_history"))
        games = int(safe_float(a.get("games_count")))
        archetypes.append({
            "name": archetype_name(colors),
            "colors": colors,
            "wr": round(wr, 2),
            "delta": delta,
            "games": games,
        })

    archetypes.sort(key=lambda x: x["wr"], reverse=True)
    top_archetypes = archetypes[:5]
    rising = sorted([a for a in archetypes if a["delta"] > 0.3], key=lambda x: x["delta"], reverse=True)[:3]
    falling = sorted([a for a in archetypes if a["delta"] < -0.3], key=lambda x: x["delta"])[:3]

    # --- Cards ---
    cards_raw = fetch_card_stats(set_code, fmt)
    mean_wr = 0.0
    valid_wrs = [safe_float(c.get("gih_wr")) for c in cards_raw if safe_float(c.get("gih_wr")) > 0]
    if valid_wrs:
        mean_wr = sum(valid_wrs) / len(valid_wrs)

    cards_enriched = []
    for c in cards_raw:
        wr = safe_float(c.get("gih_wr"))
        if wr <= 0:
            continue
        delta = delta_from_history(c.get("win_rate_history"))
        grade = compute_grade(wr - mean_wr)
        cards_enriched.append({
            "name": c.get("card_name", ""),
            "rarity": (c.get("rarity") or "C")[0].upper(),
            "gih_wr": round(wr, 2),
            "delta": delta,
            "grade": grade,
            "alsa": round(safe_float(c.get("alsa")), 1),
        })

    # Stars (biggest positive delta), Falling (biggest negative delta)
    stars = sorted([c for c in cards_enriched if c["delta"] > 0.5], key=lambda x: x["delta"], reverse=True)[:5]
    falling_cards = sorted([c for c in cards_enriched if c["delta"] < -0.5], key=lambda x: x["delta"])[:5]

    # Sleepers from skeletons
    skeletons = fetch_skeletons(set_code, fmt)
    sleepers = []
    seen_sleepers = set()
    for sk in skeletons:
        sk_sleepers = sk.get("sleeper_cards") or []
        colors = sk.get("colors", "")
        for s in sk_sleepers[:3]:
            card_name = s if isinstance(s, str) else (s.get("name", "") if isinstance(s, dict) else "")
            if card_name and card_name not in seen_sleepers:
                seen_sleepers.add(card_name)
                # Find card data
                card_data = next((c for c in cards_enriched if c["name"] == card_name), None)
                sleepers.append({
                    "name": card_name,
                    "rarity": card_data["rarity"] if card_data else "C",
                    "gih_wr": card_data["gih_wr"] if card_data else 0,
                    "alsa": card_data["alsa"] if card_data else 0,
                    "best_in": archetype_name(colors),
                })
    sleepers = sleepers[:5]

    # Card of the week: highest positive delta among good cards (WR > mean)
    cotw_candidates = [c for c in cards_enriched if c["gih_wr"] > mean_wr and c["delta"] > 0]
    cotw_candidates.sort(key=lambda x: x["delta"], reverse=True)
    card_of_week = None
    if cotw_candidates:
        c = cotw_candidates[0]
        # Find best archetype for this card from skeletons
        best_arch = ""
        for sk in skeletons:
            trending = sk.get("trending_cards") or []
            for t in trending:
                t_name = t if isinstance(t, str) else (t.get("name", "") if isinstance(t, dict) else "")
                if t_name == c["name"]:
                    best_arch = archetype_name(sk.get("colors", ""))
                    break
        card_of_week = {
            "name": c["name"],
            "rarity": c["rarity"],
            "gih_wr": c["gih_wr"],
            "delta": c["delta"],
            "grade": c["grade"],
            "best_archetype": best_arch or (top_archetypes[0]["name"] if top_archetypes else ""),
        }

    # --- Format Health ---
    balance = fetch_format_balance(set_code, fmt)
    format_health = None
    if balance:
        arch_score = safe_float(balance.get("archetype_score"))
        color_score = safe_float(balance.get("color_score"))
        classification = "BALANCED"
        avg_score = (arch_score + color_score) / 2
        if avg_score >= 7.5:
            classification = "PRINCE"
        elif avg_score < 5:
            classification = "PAUPER"
        format_health = {
            "archetype_score": round(arch_score, 1),
            "color_score": round(color_score, 1),
            "classification": classification,
        }

    # --- Trophy Trends ---
    trophies_raw = fetch_trophy_decks(set_code, fmt)
    trophy_trends = None
    if trophies_raw:
        from collections import Counter
        arch_counts = Counter()
        card_freq = Counter()
        for t in trophies_raw:
            colors = t.get("archetype", "")
            arch_counts[colors] += 1
            cardlist = t.get("cardlist") or {}
            if isinstance(cardlist, str):
                import json as _json
                try:
                    cardlist = _json.loads(cardlist)
                except Exception:
                    cardlist = {}
            for name in cardlist:
                card_freq[name] += 1

        total_trophies = len(trophies_raw)
        top_trophy_archs = [
            {"name": archetype_name(c), "count": cnt, "delta": 0}
            for c, cnt in arch_counts.most_common(5)
        ]

        # Top gaining cards by frequency (exclude basic lands)
        gaining = []
        if total_trophies > 0:
            for card_name, count in card_freq.most_common(30):
                if card_name in BASIC_LANDS:
                    continue
                freq = round(count / total_trophies, 2)
                if freq > 0.2:
                    gaining.append({"name": card_name, "freq": freq})
                if len(gaining) >= 5:
                    break

        trophy_trends = {
            "total_trophies": total_trophies,
            "top_archetypes": top_trophy_archs,
            "gaining_cards": gaining,
            "losing_cards": [],
        }

    # --- Synergies ---
    synergies_raw = fetch_synergies(set_code, fmt, limit=5)
    synergies = []
    for s in synergies_raw:
        synergies.append({
            "card_a": s.get("card_a", ""),
            "card_b": s.get("card_b", ""),
            "lift": round(safe_float(s.get("synergy_score")), 2),
            "archetype": s.get("archetype", ""),
        })

    # --- Community Buzz ---
    recent = fetch_recent_articles(set_code)
    community_buzz = []
    for a in recent:
        yes = int(safe_float(a.get("votes_yes", 0)))
        meh = int(safe_float(a.get("votes_meh", 0)))
        no = int(safe_float(a.get("votes_no", 0)))
        total_votes = yes + meh + no
        sentiment_pct = round((yes / total_votes) * 100) if total_votes > 0 else 0
        community_buzz.append({
            "title": a.get("title", ""),
            "source": a.get("channel_name", ""),
            "sentiment_pct": sentiment_pct,
        })

    # --- Period ---
    now = datetime.now(timezone.utc)
    period_from = (now - timedelta(days=3)).strftime("%Y-%m-%d")
    period_to = now.strftime("%Y-%m-%d")

    # --- Assemble ---
    pulse = {
        "version": 1,
        "type": "meta_pulse",
        "generated_at": now.isoformat(),
        "set_code": set_code,
        "set_name": set_name,
        "format": fmt,
        "format_label": FORMAT_LABELS.get(fmt, fmt),
        "period": {"from": period_from, "to": period_to},
        "total_games": int(total_games),
    }

    if format_health:
        pulse["format_health"] = format_health
    if card_of_week:
        pulse["card_of_the_week"] = card_of_week

    pulse["archetypes"] = {
        "top": top_archetypes,
        "rising": rising,
        "falling": falling,
    }

    pulse["cards"] = {
        "stars": stars,
        "falling": falling_cards,
        "sleepers": sleepers,
    }

    if trophy_trends:
        pulse["trophy_trends"] = trophy_trends
    if synergies:
        pulse["synergies"] = synergies
    if community_buzz:
        pulse["community_buzz"] = community_buzz

    # Collect mentioned card names for the article record
    mentioned = set()
    if card_of_week:
        mentioned.add(card_of_week["name"])
    for c in stars + falling_cards + sleepers:
        mentioned.add(c["name"])
    for s in synergies:
        mentioned.add(s["card_a"])
        mentioned.add(s["card_b"])

    pulse["_mentioned_cards"] = list(mentioned)[:15]

    return pulse


# ==============================================================================
# 5. INSERT INTO press_articles
# ==============================================================================

def insert_article(pulse: dict):
    """Insere l'article Meta Pulse dans press_articles."""
    set_code = pulse["set_code"]
    fmt = pulse["format"]
    fmt_label = pulse["format_label"]
    set_name = pulse.get("set_name", set_code)
    date_str = datetime.now(timezone.utc).strftime("%b %d")

    mentioned = pulse.pop("_mentioned_cards", [])

    title = f"Meta Pulse — {set_name} {fmt_label} — {date_str}"

    record = {
        "title": title,
        "summary": json.dumps(pulse, ensure_ascii=False),
        "channel_name": "Meta Pulse",
        "set_tag": set_code,
        "tags": ["meta-pulse", fmt],
        "strategic_score": 9,
        "mentioned_cards": mentioned,
        "published_at": datetime.now(timezone.utc).isoformat(),
        "video_url": None,
        "thumbnail_url": None,
    }

    url = f"{SUPABASE_URL}/rest/v1/press_articles"
    resp = requests.post(url, json=record, headers=HEADERS_SUPABASE)
    if resp.status_code in (200, 201):
        print(f"  ✅ Inserted: {title}")
    else:
        print(f"  ❌ Insert failed ({resp.status_code}): {resp.text[:300]}")


# ==============================================================================
# 6. MAIN
# ==============================================================================

def parse_args():
    parser = argparse.ArgumentParser(description="Generate Meta Pulse articles")
    parser.add_argument("--sets", nargs="*", default=[], help="Set codes to process (default: all active)")
    parser.add_argument("--formats", nargs="*", default=ALL_FORMATS, help="Formats to process")
    parser.add_argument("--min-games", type=int, default=500, help="Minimum games threshold")
    parser.add_argument("--dry-run", action="store_true", help="Print JSON without inserting")
    return parser.parse_args()


def main():
    args = parse_args()
    print("🚀 Meta Pulse Generator")
    print(f"   Formats: {args.formats}")
    print(f"   Min games: {args.min_games}")

    # Fetch active sets
    active_sets = fetch_active_sets()
    if not active_sets:
        print("❌ No active sets found")
        return

    # Filter sets if specified
    if args.sets:
        active_sets = [s for s in active_sets if s["code"] in args.sets]

    print(f"   Sets: {[s['code'] for s in active_sets]}")

    generated = 0
    for s in active_sets:
        set_code = s["code"]
        set_name = s.get("name", set_code)

        for fmt in args.formats:
            pulse = build_pulse(set_code, set_name, fmt, args.min_games)
            if pulse:
                if args.dry_run:
                    mentioned = pulse.pop("_mentioned_cards", [])
                    print(json.dumps(pulse, indent=2, ensure_ascii=False)[:3000])
                    print(f"  ... ({len(json.dumps(pulse))} chars total)")
                    print(f"  Mentioned cards: {mentioned[:5]}...")
                    pulse["_mentioned_cards"] = mentioned
                else:
                    insert_article(pulse)
                generated += 1

    print(f"\n✅ Done — {generated} pulse(s) generated")


if __name__ == "__main__":
    main()
