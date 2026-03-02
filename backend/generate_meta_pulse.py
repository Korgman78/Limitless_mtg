"""
generate_meta_pulse.py — Generateur hebdomadaire Meta Pulse v2
Genere un article structure par (set_code, format) a partir des donnees Supabase.
Compare les donnees actuelles vs le rapport precedent (fallback 7 jours).
Schedule: samedi via GitHub Actions.
"""

import argparse
import json
import os
import requests
from collections import Counter
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.parse import quote
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

BASIC_LANDS = {"Plains", "Island", "Swamp", "Mountain", "Forest"}

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


def parse_iso_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        if value.endswith("Z"):
            value = value[:-1] + "+00:00"
        dt = datetime.fromisoformat(value)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        return None


def archetype_name(colors: str) -> str:
    if colors in PAIRS:
        return PAIRS[colors]
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
        f"&select=card_name,gih_wr,win_rate_history,alsa,alsa_history,rarity"
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


def fetch_trophy_decks(
    set_code: str,
    fmt: str,
    period_from: datetime | None = None,
    period_to: datetime | None = None,
) -> list[dict]:
    params = (
        f"set_code=eq.{set_code}&format=eq.{fmt}"
        f"&select=aggregate_id,archetype,cardlist,trophy_time"
    )
    if period_from:
        params += f"&trophy_time=gte.{quote(period_from.isoformat())}"
    if period_to:
        params += f"&trophy_time=lt.{quote(period_to.isoformat())}"
    return fetch_json("trophy_decks", params)


def fetch_previous_pulse(set_code: str, fmt: str) -> tuple[dict | None, datetime | None]:
    """Recupere le dernier Meta Pulse pour ce set/format.
    Retourne (prev_data_dict, prev_published_at_dt) ou (None, None)."""

    url = (
        f"{SUPABASE_URL}/rest/v1/press_articles"
        f"?channel_name=eq.Meta Pulse&set_tag=eq.{set_code}"
        f"&tags=cs.{{{fmt}}}"
        f"&select=summary,published_at"
        f"&order=published_at.desc&limit=1"
    )
    resp = requests.get(url, headers=HEADERS_SUPABASE)
    if resp.status_code == 200 and resp.json():
        row = resp.json()[0]
        try:
            prev_data = json.loads(row["summary"])
            prev_dt = parse_iso_datetime(row.get("published_at"))
            prev_label = prev_dt.strftime("%Y-%m-%d") if prev_dt else "unknown date"
            print(f"  📎 Found previous pulse from {prev_label}")
            return prev_data, prev_dt
        except (json.JSONDecodeError, KeyError):
            pass

    print(f"  📎 No previous pulse found, using 7-day fallback")
    return None, None


# ==============================================================================
# 4. SCORING
# ==============================================================================

def compute_spotlight_score(wr_delta: float, alsa_delta: float,
                            trophy_freq_delta: float,
                            is_draft: bool, has_trophy_data: bool) -> float:
    """Score composite pour trier les cartes spotlight.
    ALSA inverse : une baisse d'ALSA = signal positif (la carte est pickee plus tot)."""
    alsa_signal = -alsa_delta  # baisse = positif

    if is_draft and has_trophy_data:
        score = wr_delta * 0.50 + (trophy_freq_delta * 100) * 0.30 + alsa_signal * 0.20
    elif is_draft:
        score = wr_delta * 0.70 + alsa_signal * 0.30
    elif has_trophy_data:
        score = wr_delta * 0.65 + (trophy_freq_delta * 100) * 0.35
    else:
        score = wr_delta * 1.0

    return round(score, 2)


# ==============================================================================
# 5. PULSE BUILDER (v2)
# ==============================================================================

def build_pulse(set_code: str, set_name: str, fmt: str, min_games: int) -> dict | None:
    """Construit le JSON Meta Pulse v2 pour un (set_code, format)."""
    print(f"\n📊 Building pulse v2 for {set_code} / {fmt}...")

    is_draft = fmt in ("PremierDraft", "TradDraft")

    # --- Archetypes ---
    archetypes_raw = fetch_archetype_stats(set_code, fmt)
    total_games = sum(safe_float(a.get("games_count", 0)) for a in archetypes_raw)

    if total_games < min_games:
        print(f"  ⏭ Skipped: {int(total_games)} games < {min_games} threshold")
        return None

    # --- Previous pulse ---
    prev_data, prev_published_at = fetch_previous_pulse(set_code, fmt)
    now = datetime.now(timezone.utc)
    seven_day_floor = now - timedelta(days=7)
    period_start = prev_published_at or seven_day_floor

    # Ignorer le prev pulse s'il date de plus de 14 jours (hors cadence hebdo)
    if prev_data and prev_published_at and (now - prev_published_at) > timedelta(days=14):
        prev_label = prev_published_at.strftime("%Y-%m-%d")
        print(f"  ⚠ Previous pulse too old ({prev_label}), ignoring for deltas")
        prev_data = None
        period_start = seven_day_floor

    # Guardrail: même si un pulse existe très récemment (ex: rerun le même jour),
    # on garde au moins 7 jours de données pour éviter une fenêtre vide.
    if period_start > seven_day_floor:
        period_start = seven_day_floor

    # Lookback aligné sur la fenêtre réelle depuis le dernier pulse
    history_lookback = max(1, min(13, int((now - period_start).total_seconds() // 86_400)))
    period_label_from = period_start.strftime("%Y-%m-%d")
    period_label_to = now.strftime("%Y-%m-%d")
    print(f"  📆 Window: {period_label_from} -> {period_label_to} | history lookback={history_lookback}d")

    # Build lookup maps from previous pulse / fallback previous window
    prev_trophy_freq_map = {}
    prev_arch_share_map = {}
    prev_arch_count_map = {}
    prev_format_health = None

    if prev_data:
        prev_format_health = prev_data.get("format_health")
        trophy_snapshot = prev_data.get("trophy_freq_snapshot")
        if isinstance(trophy_snapshot, dict):
            for name, freq in trophy_snapshot.items():
                prev_trophy_freq_map[name] = safe_float(freq)

        arch_share_snapshot = prev_data.get("archetype_share_snapshot")
        if isinstance(arch_share_snapshot, dict):
            for colors, share in arch_share_snapshot.items():
                prev_arch_share_map[colors] = safe_float(share)

        arch_count_snapshot = prev_data.get("archetype_count_snapshot")
        if isinstance(arch_count_snapshot, dict):
            for colors, count in arch_count_snapshot.items():
                prev_arch_count_map[colors] = int(safe_float(count))

    # --- Cards ---
    cards_raw = fetch_card_stats(set_code, fmt)
    mean_wr = 0.0
    valid_wrs = [safe_float(c.get("gih_wr")) for c in cards_raw if safe_float(c.get("gih_wr")) > 0]
    if valid_wrs:
        mean_wr = sum(valid_wrs) / len(valid_wrs)

    # --- Trophy data (current + previous period fallback) ---
    def build_trophy_counters(trophies: list[dict]):
        card_freq = Counter()
        arch_counter = Counter()
        card_archetypes: dict[str, Counter] = {}
        for t in trophies:
            arch_colors = t.get("archetype", "")
            valid_arch = bool(arch_colors) and 2 <= len(arch_colors) <= 3
            if valid_arch:
                arch_counter[arch_colors] += 1

            cardlist = t.get("cardlist") or {}
            if isinstance(cardlist, str):
                try:
                    cardlist = json.loads(cardlist)
                except Exception:
                    cardlist = {}
            for card_name in cardlist:
                if card_name in BASIC_LANDS:
                    continue
                card_freq[card_name] += 1
                if valid_arch:
                    if card_name not in card_archetypes:
                        card_archetypes[card_name] = Counter()
                    card_archetypes[card_name][arch_colors] += 1
        return len(trophies), card_freq, arch_counter, card_archetypes

    trophies_raw = fetch_trophy_decks(set_code, fmt, period_from=period_start, period_to=now)
    total_trophies, trophy_card_freq, trophy_arch_counter, trophy_card_archetypes = build_trophy_counters(trophies_raw)
    has_trophy_data = total_trophies > 0

    # If we don't have previous snapshots, fallback to the previous 7-day period.
    if not prev_trophy_freq_map or not prev_arch_share_map:
        prev_period_duration = now - period_start
        prev_period_end = period_start
        prev_period_start = period_start - prev_period_duration
        prev_trophies_raw = fetch_trophy_decks(set_code, fmt, period_from=prev_period_start, period_to=prev_period_end)
        prev_total_trophies, prev_trophy_card_freq, prev_trophy_arch_counter, _ = build_trophy_counters(prev_trophies_raw)
        if prev_total_trophies > 0:
            if not prev_trophy_freq_map:
                prev_trophy_freq_map = {
                    name: round(count / prev_total_trophies, 4)
                    for name, count in prev_trophy_card_freq.items()
                }
            if not prev_arch_share_map:
                prev_arch_share_map = {
                    colors: round(count / prev_total_trophies, 4)
                    for colors, count in prev_trophy_arch_counter.items()
                }
            if not prev_arch_count_map:
                prev_arch_count_map = {
                    colors: int(count)
                    for colors, count in prev_trophy_arch_counter.items()
                }

    # --- Enrich archetypes ---
    archetypes = []
    for a in archetypes_raw:
        colors = a.get("colors", "")
        if not colors or len(colors) < 2 or len(colors) > 3:
            continue
        wr = safe_float(a.get("win_rate"))
        lifetime_games = int(safe_float(a.get("games_count")))

        # Period counts from trophy window when available; fallback to lifetime.
        if total_trophies > 0:
            games = int(trophy_arch_counter.get(colors, 0))
            meta_share = round(games / total_trophies, 4)
        else:
            games = lifetime_games
            meta_share = round(games / total_games, 4) if total_games > 0 else 0

        # WR delta computed on rolling history over the active period window.
        wr_delta = delta_from_history(a.get("win_rate_history"), history_lookback)

        prev_games = prev_arch_count_map.get(colors)
        if prev_games is None:
            prev_games = 0
        games_delta = games - int(prev_games)

        prev_meta_share = safe_float(prev_arch_share_map.get(colors), 0.0)
        meta_share_delta = round(meta_share - prev_meta_share, 4)

        archetypes.append({
            "name": archetype_name(colors),
            "colors": colors,
            "wr": round(wr, 2),
            "wr_delta": wr_delta,
            "games": games,
            "games_delta": games_delta,
            "meta_share": round(meta_share, 4),
            "meta_share_delta": meta_share_delta,
        })

    # --- Cards Spotlight ---
    cards_enriched = []
    for c in cards_raw:
        wr = safe_float(c.get("gih_wr"))
        if wr <= 0:
            continue
        card_name = c.get("card_name", "")
        rarity = (c.get("rarity") or "C")[0].upper()
        alsa = round(safe_float(c.get("alsa")), 1)

        # WR delta: toujours depuis l'historique sur la fenêtre courante
        wr_delta = delta_from_history(c.get("win_rate_history"), history_lookback)

        # ALSA delta: depuis l'historique sur la même fenêtre
        alsa_delta = None
        if is_draft and alsa > 0:
            hist_delta = delta_from_history(c.get("alsa_history"), history_lookback)
            alsa_delta = hist_delta if hist_delta != 0 else None

        # Trophy freq + delta
        trophy_freq = 0.0
        trophy_freq_delta = 0.0
        if total_trophies > 0:
            trophy_freq = round(trophy_card_freq.get(card_name, 0) / total_trophies, 4)
            prev_freq = prev_trophy_freq_map.get(card_name, 0)
            trophy_freq_delta = round(trophy_freq - safe_float(prev_freq), 4)

        # Spotlight score
        score = compute_spotlight_score(
            wr_delta, alsa_delta or 0.0, trophy_freq_delta, is_draft, has_trophy_data
        )

        cards_enriched.append({
            "name": card_name,
            "rarity": rarity,
            "gih_wr": round(wr, 2),
            "wr_delta": wr_delta,
            "alsa": alsa if is_draft else None,
            "alsa_delta": alsa_delta,
            "trophy_freq": round(trophy_freq, 4) if has_trophy_data else None,
            "trophy_freq_delta": round(trophy_freq_delta, 4) if has_trophy_data else None,
            "score": score,
        })

    # Sort by score for spotlight — always pick top 3 and bottom 3
    sorted_by_score = sorted(cards_enriched, key=lambda x: x["score"], reverse=True)
    rising_cards = sorted_by_score[:3]
    falling_cards = sorted_by_score[-3:]
    # Avoid overlap if fewer than 6 cards
    rising_names = {c["name"] for c in rising_cards}
    falling_cards = [c for c in falling_cards if c["name"] not in rising_names]

    # --- Format Health ---
    balance = fetch_format_balance(set_code, fmt)
    format_health = None
    if balance:
        arch_score = safe_float(balance.get("archetype_score"))
        color_score = safe_float(balance.get("color_score"))

        arch_delta = 0.0
        color_delta = 0.0
        if prev_format_health:
            arch_delta = round(arch_score - safe_float(prev_format_health.get("archetype_score")), 1)
            color_delta = round(color_score - safe_float(prev_format_health.get("color_score")), 1)

        format_health = {
            "archetype_score": round(arch_score, 1),
            "color_score": round(color_score, 1),
            "archetype_delta": arch_delta,
            "color_delta": color_delta,
        }

    # --- Moving Archetypes ---
    # Rank by period-over-period share delta (meta evolution), keeping significant archetypes.
    significant_archetypes = [
        a for a in archetypes
        if max(a.get("meta_share", 0), safe_float(prev_arch_share_map.get(a.get("colors", "")), 0.0)) >= 0.01
    ]
    rising_archs = sorted(
        [a for a in significant_archetypes if a.get("meta_share_delta", 0) > 0],
        key=lambda x: abs(x.get("meta_share_delta", 0)), reverse=True
    )[:5]
    falling_archs = sorted(
        [a for a in significant_archetypes if a.get("meta_share_delta", 0) < 0],
        key=lambda x: abs(x.get("meta_share_delta", 0)), reverse=True
    )[:5]

    # --- Trophy Movers ---
    trophy_movers = None
    if has_trophy_data and total_trophies > 0:
        # Build list of cards with their freq and delta
        trophy_cards_list = []
        for card_name, count in trophy_card_freq.items():
            freq = round(count / total_trophies, 4)
            prev_freq = safe_float(prev_trophy_freq_map.get(card_name, 0))
            delta = round(freq - prev_freq, 4)

            # Find primary archetype
            primary_arch = ""
            if card_name in trophy_card_archetypes:
                top_arch_colors = trophy_card_archetypes[card_name].most_common(1)[0][0]
                primary_arch = archetype_name(top_arch_colors) if top_arch_colors else ""

            trophy_cards_list.append({
                "name": card_name,
                "freq": freq,
                "delta": delta,
                "archetype": primary_arch,
            })

        gaining = sorted([c for c in trophy_cards_list if c["delta"] > 0], key=lambda x: x["delta"], reverse=True)[:5]
        losing = sorted([c for c in trophy_cards_list if c["delta"] < 0], key=lambda x: x["delta"])[:5]

        trophy_movers = {
            "gaining": gaining,
            "losing": losing,
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

    # --- Period ---
    period_from = period_start.strftime("%Y-%m-%d")
    period_to = now.strftime("%Y-%m-%d")

    # --- Assemble v2 ---
    pulse = {
        "version": 2,
        "type": "meta_pulse",
        "generated_at": now.isoformat(),
        "set_code": set_code,
        "set_name": set_name,
        "format": fmt,
        "format_label": FORMAT_LABELS.get(fmt, fmt),
        "period": {"from": period_from, "to": period_to},
        # Legacy field kept for compatibility with existing frontend consumers.
        "total_games": int(total_games),
        # Explicit scopes to avoid confusion: period sample vs lifetime sample.
        "period_sample": int(total_trophies),
        "period_sample_source": "trophy_decks",
        "lifetime_games": int(total_games),
    }

    if format_health:
        pulse["format_health"] = format_health

    pulse["cards_spotlight"] = {
        "rising": rising_cards,
        "falling": falling_cards,
    }

    pulse["moving_archetypes"] = {
        "rising": rising_archs,
        "falling": falling_archs,
    }

    if trophy_movers:
        pulse["trophy_movers"] = trophy_movers
    pulse["trophy_freq_snapshot"] = {
        name: round(count / total_trophies, 4)
        for name, count in trophy_card_freq.items()
    } if total_trophies > 0 else {}
    pulse["archetype_share_snapshot"] = {
        colors: round(count / total_trophies, 4)
        for colors, count in trophy_arch_counter.items()
    } if total_trophies > 0 else {}
    pulse["archetype_count_snapshot"] = {
        colors: int(count)
        for colors, count in trophy_arch_counter.items()
    } if total_trophies > 0 else {}

    if synergies:
        pulse["synergies"] = synergies

    # --- Mentioned cards (max 15) ---
    mentioned = set()
    for c in rising_cards + falling_cards:
        mentioned.add(c["name"])
    if trophy_movers:
        for c in trophy_movers.get("gaining", []) + trophy_movers.get("losing", []):
            mentioned.add(c["name"])
    for s in synergies:
        mentioned.add(s["card_a"])
        mentioned.add(s["card_b"])

    pulse["_mentioned_cards"] = list(mentioned)[:15]

    return pulse


# ==============================================================================
# 6. INSERT INTO press_articles
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
# 7. MAIN
# ==============================================================================

def parse_args():
    parser = argparse.ArgumentParser(description="Generate Meta Pulse v2 articles")
    parser.add_argument("--sets", nargs="*", default=[], help="Set codes to process (default: all active)")
    parser.add_argument("--formats", nargs="*", default=ALL_FORMATS, help="Formats to process")
    parser.add_argument("--min-games", type=int, default=500, help="Minimum games threshold")
    parser.add_argument("--dry-run", action="store_true", help="Print JSON without inserting")
    return parser.parse_args()


def main():
    args = parse_args()
    print("🚀 Meta Pulse Generator v2")
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
