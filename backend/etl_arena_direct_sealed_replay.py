import argparse
import json
import os
import random
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

ALL_COLOR_COMBINATIONS = [
    "W",
    "U",
    "B",
    "R",
    "G",
    "WU",
    "WB",
    "WR",
    "WG",
    "UB",
    "UR",
    "UG",
    "BR",
    "BG",
    "RG",
    "WUB",
    "WUR",
    "WUG",
    "WBR",
    "WBG",
    "WRG",
    "UBR",
    "UBG",
    "URG",
    "BRG",
    "WUBR",
    "WUBG",
    "WURG",
    "WBRG",
    "UBRG",
    "WUBRG",
]

HEADERS_17LANDS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Cache-Control": "no-cache",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def random_sleep(min_seconds: float, max_seconds: float) -> None:
    duration = random.uniform(min_seconds, max_seconds)
    print(f"    sleep {duration:.1f}s")
    time.sleep(duration)


def parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    candidate = value.strip()
    if not candidate:
        return None
    if candidate.endswith("Z"):
        candidate = candidate[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(candidate)
    except Exception:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def fetch_with_retry(
    url: str,
    context: str,
    method: str = "GET",
    payload: dict[str, Any] | None = None,
    max_retries: int = 3,
    timeout_s: int = 30,
) -> dict[str, Any] | list[dict[str, Any]] | None:
    for attempt in range(max_retries):
        try:
            if method == "POST":
                resp = requests.post(
                    url,
                    json=payload or {},
                    headers=HEADERS_17LANDS,
                    timeout=timeout_s,
                )
            else:
                resp = requests.get(url, headers=HEADERS_17LANDS, timeout=timeout_s)
            if resp.status_code == 200:
                return resp.json()
            if resp.status_code in (429, 403):
                wait_s = 45 * (attempt + 1)
                print(f"    {context}: {resp.status_code}, wait {wait_s}s")
                time.sleep(wait_s)
                continue
            if resp.status_code == 404:
                return None
            print(f"    {context}: HTTP {resp.status_code} {resp.text[:180]}")
        except Exception as exc:
            print(f"    {context}: exception {exc}")
        if attempt < max_retries - 1:
            time.sleep(8)
    return None


def fetch_trophies(
    set_code: str,
    format_code: str,
    color_combo: str,
) -> list[dict[str, Any]]:
    url = "https://www.17lands.com/data/trophies/"
    payload = {
        "expansion": set_code,
        "event_type": format_code,
        "card_names": [],
        "ranks": [],
        "deck_colors": [color_combo],
    }
    data = fetch_with_retry(
        url,
        context=f"trophies {color_combo}",
        method="POST",
        payload=payload,
    )
    return data if isinstance(data, list) else []


def fetch_deck_details(aggregate_id: str, deck_index: int = 0) -> dict[str, Any] | None:
    url = f"https://www.17lands.com/data/deck?draft_id={aggregate_id}&deck_index={deck_index}"
    data = fetch_with_retry(url, context=f"deck {aggregate_id}")
    return data if isinstance(data, dict) else None


def ids_to_counts(card_ids: list[int], cards_info: dict[str, Any]) -> dict[str, int]:
    counter: Counter[str] = Counter()
    for card_id in card_ids:
        row = cards_info.get(str(card_id), {})
        name = row.get("name")
        if name:
            counter[name] += 1
    return dict(counter)


def extract_main_and_side(deck_data: dict[str, Any]) -> tuple[dict[str, int], dict[str, int]]:
    cards_info = deck_data.get("cards", {})
    groups = deck_data.get("groups", [])

    main_ids: list[int] = []
    side_ids: list[int] = []

    for group in groups:
        group_name = str(group.get("name", "")).lower()
        card_ids = group.get("cards", []) or []
        if group_name in ("deck", "maindeck", "main"):
            main_ids.extend(card_ids)
        elif "side" in group_name:
            side_ids.extend(card_ids)

    if not main_ids:
        for group in groups:
            group_name = str(group.get("name", "")).lower()
            if "side" in group_name:
                continue
            main_ids.extend(group.get("cards", []) or [])
            if main_ids:
                break

    main = ids_to_counts(main_ids, cards_info)
    side = ids_to_counts(side_ids, cards_info)
    return main, side


def parse_deck_indices(deck_data: dict[str, Any]) -> list[int]:
    event_info = deck_data.get("event_info") or {}
    links = event_info.get("deck_links") or []
    indices: set[int] = {0}
    for raw_link in links:
        link = str(raw_link or "").strip()
        if not link:
            continue
        tail = link.rsplit("/", 1)[-1]
        if tail.isdigit():
            indices.add(int(tail))
    return sorted(indices)


def choose_best_variant(variants: list[dict[str, Any]]) -> dict[str, Any]:
    def tier(main_size: int, side_size: int) -> int:
        # Priority: real played deck snapshots around 40 cards.
        if 39 <= main_size <= 41 and side_size > 0:
            return 4
        if 35 <= main_size <= 45 and side_size > 0:
            return 3
        if 35 <= main_size <= 45:
            return 2
        if side_size > 0:
            return 1
        return 0

    def score(item: dict[str, Any]) -> tuple[int, int, int, int]:
        main_size = int(item.get("main_size", 0))
        side_size = int(item.get("side_size", 0))
        pool_size = int(item.get("pool_size", 0))
        return (
            tier(main_size, side_size),
            -abs(main_size - 40),
            side_size,
            pool_size,
        )

    return max(variants, key=score)


def merge_counts(a: dict[str, int], b: dict[str, int]) -> dict[str, int]:
    out: Counter[str] = Counter()
    out.update(a)
    out.update(b)
    return dict(out)


def serialize_dt(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


# ---------------------------------------------------------------------------
# Main flow
# ---------------------------------------------------------------------------

def run(
    set_code: str,
    format_code: str,
    limit: int,
    output_path: Path,
    fetch_sleep_min: float,
    fetch_sleep_max: float,
    deck_sleep_min: float,
    deck_sleep_max: float,
) -> None:
    print(f"[1/3] Fetch trophies for {set_code} / {format_code}")
    by_aggregate: dict[str, dict[str, Any]] = {}

    for idx, color_combo in enumerate(ALL_COLOR_COMBINATIONS, start=1):
        rows = fetch_trophies(set_code, format_code, color_combo)
        print(f"  {idx:02d}/{len(ALL_COLOR_COMBINATIONS)} {color_combo}: {len(rows)} rows")
        for row in rows:
            aggregate_id = row.get("aggregate_id")
            if not aggregate_id:
                continue
            current = by_aggregate.get(aggregate_id)
            candidate_time = parse_time(row.get("time"))
            if current is None:
                by_aggregate[aggregate_id] = {
                    "aggregate_id": aggregate_id,
                    "trophy_time": row.get("time"),
                    "trophy_time_parsed": candidate_time,
                    "wins": row.get("wins", 0),
                    "losses": row.get("losses", 0),
                    "color_combo": color_combo,
                }
                continue
            current_time = current.get("trophy_time_parsed")
            if isinstance(candidate_time, datetime) and (
                not isinstance(current_time, datetime) or candidate_time > current_time
            ):
                current["trophy_time"] = row.get("time")
                current["trophy_time_parsed"] = candidate_time
                current["wins"] = row.get("wins", 0)
                current["losses"] = row.get("losses", 0)
                current["color_combo"] = color_combo
        random_sleep(fetch_sleep_min, fetch_sleep_max)

    ranked = sorted(
        by_aggregate.values(),
        key=lambda row: row.get("trophy_time_parsed") or datetime(1970, 1, 1, tzinfo=timezone.utc),
        reverse=True,
    )
    selected = ranked[:limit]
    print(f"[2/3] Selected {len(selected)} latest unique trophies")

    records: list[dict[str, Any]] = []
    request_count = 0
    for index, row in enumerate(selected, start=1):
        aggregate_id = str(row["aggregate_id"])
        request_count += 1
        if request_count % 15 == 0:
            print("  preventive cooldown 45s")
            time.sleep(45)

        deck_data = fetch_deck_details(aggregate_id, deck_index=0)
        random_sleep(deck_sleep_min, deck_sleep_max)
        if not deck_data:
            print(f"  {index:03d}/{len(selected)} skip {aggregate_id}: no deck payload")
            continue

        indices = parse_deck_indices(deck_data)
        variants: list[dict[str, Any]] = []

        for idx in indices:
            variant_data = deck_data if idx == 0 else fetch_deck_details(aggregate_id, deck_index=idx)
            if idx != 0:
                random_sleep(deck_sleep_min, deck_sleep_max)
            if not variant_data:
                continue
            main_counts, side_counts = extract_main_and_side(variant_data)
            if not main_counts:
                continue
            pool_counts = merge_counts(main_counts, side_counts)
            variants.append(
                {
                    "deck_index": idx,
                    "deck_data": variant_data,
                    "main_counts": main_counts,
                    "side_counts": side_counts,
                    "pool_counts": pool_counts,
                    "main_size": int(sum(main_counts.values())),
                    "side_size": int(sum(side_counts.values())),
                    "pool_size": int(sum(pool_counts.values())),
                }
            )

        if not variants:
            print(f"  {index:03d}/{len(selected)} skip {aggregate_id}: no maindeck")
            continue

        selected_variant = choose_best_variant(variants)
        main_counts = selected_variant["main_counts"]
        side_counts = selected_variant["side_counts"]
        pool_counts = selected_variant["pool_counts"]

        record = {
            "aggregate_id": aggregate_id,
            "set_code": set_code,
            "format": format_code,
            "trophy_time": row.get("trophy_time"),
            "wins": row.get("wins", 0),
            "losses": row.get("losses", 0),
            "color_combo": row.get("color_combo"),
            "selected_deck_index": int(selected_variant["deck_index"]),
            "player_deck_cardlist": main_counts,
            "sideboard_cardlist": side_counts,
            "pool_cardlist": pool_counts,
            "player_deck_size": int(sum(main_counts.values())),
            "sideboard_size": int(sum(side_counts.values())),
            "pool_size": int(sum(pool_counts.values())),
            "event_info": (selected_variant["deck_data"] or {}).get("event_info"),
            "source_builder_link": (selected_variant["deck_data"] or {}).get("builder_link"),
            "source_text_link": (selected_variant["deck_data"] or {}).get("text_link"),
            "deck_variants": [
                {
                    "deck_index": int(v["deck_index"]),
                    "player_deck_size": int(v["main_size"]),
                    "sideboard_size": int(v["side_size"]),
                    "pool_size": int(v["pool_size"]),
                }
                for v in variants
            ],
        }
        records.append(record)
        print(
            f"  {index:03d}/{len(selected)} ok {aggregate_id} "
            f"(idx={record['selected_deck_index']} deck={record['player_deck_size']} "
            f"side={record['sideboard_size']} pool={record['pool_size']})"
        )

    print(f"[3/3] Write output: {output_path}")
    output_payload = {
        "metadata": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "set_code": set_code,
            "format": format_code,
            "requested_limit": limit,
            "fetched_records": len(records),
        },
        "records": records,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(output_payload, indent=2), encoding="utf-8")
    print(f"Done. Saved {len(records)} records.")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fetch latest ArenaDirect Sealed trophies with full pool + played deck.",
    )
    parser.add_argument("--set", dest="set_code", default="ECL")
    parser.add_argument("--format", dest="format_code", default="ArenaDirect_Sealed")
    parser.add_argument("--limit", type=int, default=50, help="Number of latest trophies to keep.")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("backend/tmp/_tmp_arena_direct_sealed_trophy_with_pools.json"),
    )
    parser.add_argument("--fetch-sleep-min", type=float, default=2.0)
    parser.add_argument("--fetch-sleep-max", type=float, default=3.5)
    parser.add_argument("--deck-sleep-min", type=float, default=3.0)
    parser.add_argument("--deck-sleep-max", type=float, default=5.0)
    return parser.parse_args()


if __name__ == "__main__":
    load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env")
    args = parse_args()
    run(
        set_code=args.set_code.strip(),
        format_code=args.format_code.strip(),
        limit=max(1, int(args.limit)),
        output_path=args.output,
        fetch_sleep_min=max(0.0, args.fetch_sleep_min),
        fetch_sleep_max=max(args.fetch_sleep_min, args.fetch_sleep_max),
        deck_sleep_min=max(0.0, args.deck_sleep_min),
        deck_sleep_max=max(args.deck_sleep_min, args.deck_sleep_max),
    )
