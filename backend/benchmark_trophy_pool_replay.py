import argparse
import json
import os
import statistics
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv

BASIC_LANDS = {"Plains", "Island", "Swamp", "Mountain", "Forest"}


def counts_to_text(card_counts: dict[str, int], include_header: bool) -> str:
    lines: list[str] = []
    if include_header:
        lines.append("Deck")
    for name in sorted(card_counts):
        qty = int(card_counts[name] or 0)
        if qty <= 0:
            continue
        lines.append(f"{qty} {name}")
    return "\n".join(lines)


def merged_build_counts(build: dict[str, Any], include_lands: bool) -> dict[str, int]:
    out: Counter[str] = Counter()
    for row in build.get("cards", []) or []:
        name = row.get("name")
        qty = int(row.get("qty", 0) or 0)
        if name and qty > 0:
            out[name] += qty
    if include_lands:
        for row in build.get("lands", []) or []:
            name = row.get("name")
            qty = int(row.get("qty", 0) or 0)
            if name and qty > 0:
                out[name] += qty
    return dict(out)


def normalize_counts(
    raw: dict[str, int],
    include_lands: bool,
) -> dict[str, int]:
    out: Counter[str] = Counter()
    for name, qty_raw in raw.items():
        qty = int(qty_raw or 0)
        if qty <= 0:
            continue
        if not include_lands and name in BASIC_LANDS:
            continue
        out[name] += qty
    return dict(out)


def multiset_jaccard(a: dict[str, int], b: dict[str, int]) -> float:
    keys = set(a) | set(b)
    inter = 0
    union = 0
    for key in keys:
        av = int(a.get(key, 0))
        bv = int(b.get(key, 0))
        inter += min(av, bv)
        union += max(av, bv)
    if union <= 0:
        return 0.0
    return inter / union


def call_optimizer(
    supabase_url: str,
    supabase_key: str,
    payload: dict[str, Any],
    timeout_s: float = 40.0,
) -> requests.Response:
    return requests.post(
        f"{supabase_url}/functions/v1/sealed-optimizer",
        headers={
            "Authorization": f"Bearer {supabase_key}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=timeout_s,
    )


def run_optimizer_async(
    supabase_url: str,
    supabase_key: str,
    payload: dict[str, Any],
    poll_interval_s: float,
    poll_timeout_s: float,
) -> dict[str, Any]:
    submit_payload = {**payload, "action": "submit", "async": True}
    submit_resp = call_optimizer(supabase_url, supabase_key, submit_payload, timeout_s=40.0)
    submit_data = submit_resp.json()
    if submit_resp.status_code != 202:
        raise RuntimeError(f"submit failed {submit_resp.status_code}: {json.dumps(submit_data)[:400]}")
    job_id = submit_data.get("jobId")
    if not job_id:
        raise RuntimeError("submit response has no jobId")

    started = time.time()
    while True:
        if time.time() - started > poll_timeout_s:
            raise TimeoutError(f"async optimization timeout after {poll_timeout_s:.1f}s (job={job_id})")
        time.sleep(poll_interval_s)
        status_resp = call_optimizer(
            supabase_url,
            supabase_key,
            {"action": "status", "jobId": job_id},
            timeout_s=40.0,
        )
        status_data = status_resp.json()
        if status_resp.status_code == 202:
            continue
        if status_resp.status_code != 200:
            raise RuntimeError(f"status failed {status_resp.status_code}: {json.dumps(status_data)[:400]}")
        state = status_data.get("status")
        if state == "failed":
            raise RuntimeError(f"job failed: {json.dumps(status_data.get('error'))[:400]}")
        if state == "done":
            result = status_data.get("result")
            if not isinstance(result, dict):
                raise RuntimeError("job done without result payload")
            return result


def score_custom_deck(
    supabase_url: str,
    supabase_key: str,
    set_code: str,
    format_code: str,
    deck_text: str,
    weights: dict[str, float],
) -> dict[str, Any]:
    payload = {
        "action": "score_custom_deck",
        "setCode": set_code,
        "format": format_code,
        "deckText": deck_text,
        "scoreWeights": weights,
    }
    resp = call_optimizer(supabase_url, supabase_key, payload, timeout_s=40.0)
    data = resp.json()
    if resp.status_code != 200:
        raise RuntimeError(f"score_custom_deck failed {resp.status_code}: {json.dumps(data)[:400]}")
    build = data.get("build")
    if not isinstance(build, dict):
        raise RuntimeError("score_custom_deck response missing build")
    return build


def summarize(results: list[dict[str, Any]]) -> dict[str, Any]:
    if not results:
        return {
            "processed": 0,
            "avg_player_score": None,
            "avg_best_optimizer_score": None,
            "optimizer_beats_player_rate": None,
            "avg_best_jaccard": None,
            "avg_jaccard_rank1": None,
        }

    player_scores: list[float] = []
    best_scores: list[float] = []
    best_jaccards: list[float] = []
    rank1_jaccards: list[float] = []
    beats = 0

    for row in results:
        player = float(row["player_deck"]["score"])
        player_scores.append(player)
        builds = row.get("optimizer_builds", [])
        if not builds:
            continue
        top = max(float(b["score"]) for b in builds)
        best_scores.append(top)
        if top > player:
            beats += 1
        jaccards = [float(b.get("jaccard_similarity", 0.0)) for b in builds]
        best_jaccards.append(max(jaccards) if jaccards else 0.0)
        rank1_jaccards.append(float(builds[0].get("jaccard_similarity", 0.0)))

    def avg(values: list[float]) -> float | None:
        return round(statistics.mean(values), 4) if values else None

    return {
        "processed": len(results),
        "avg_player_score": avg(player_scores),
        "avg_best_optimizer_score": avg(best_scores),
        "optimizer_beats_player_rate": round(beats / len(results), 4) if results else None,
        "avg_best_jaccard": avg(best_jaccards),
        "avg_jaccard_rank1": avg(rank1_jaccards),
    }


def parse_input_payload(path: Path) -> list[dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(payload, dict) and isinstance(payload.get("records"), list):
        return payload["records"]
    if isinstance(payload, list):
        return payload
    raise ValueError("Input JSON must be either a list of records or {metadata, records}.")


def run(args: argparse.Namespace) -> None:
    load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env")
    supabase_url = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_KEY") or os.getenv("VITE_SUPABASE_KEY")
    if not supabase_url or not supabase_key:
        raise RuntimeError("Missing SUPABASE_URL / SUPABASE_KEY in .env")

    weights = {
        "power": float(args.w_power),
        "consistency": float(args.w_consistency),
        "curve": float(args.w_curve),
        "synergy": float(args.w_synergy),
    }

    records = parse_input_payload(args.input)
    if args.limit is not None:
        records = records[: max(1, int(args.limit))]

    print(f"Run replay on {len(records)} records")

    results: list[dict[str, Any]] = []
    failures: list[dict[str, Any]] = []

    for index, row in enumerate(records, start=1):
        aggregate_id = str(row.get("aggregate_id", f"idx_{index}"))
        try:
            pool_counts_raw = row.get("pool_cardlist") or {}
            player_counts_raw = row.get("player_deck_cardlist") or {}
            if not pool_counts_raw or not player_counts_raw:
                raise ValueError("Missing pool_cardlist or player_deck_cardlist")

            pool_counts = normalize_counts(pool_counts_raw, include_lands=True)
            player_counts_for_score = normalize_counts(player_counts_raw, include_lands=True)
            player_counts_for_jaccard = normalize_counts(
                player_counts_raw,
                include_lands=args.jaccard_include_lands,
            )

            pool_text = counts_to_text(pool_counts, include_header=False)
            custom_deck_text = counts_to_text(player_counts_for_score, include_header=True)

            optimizer_payload = {
                "setCode": args.set_code,
                "format": args.format_code,
                "poolText": pool_text,
                "scoreWeights": weights,
                "hcRestarts": int(args.hc_restarts),
                "hcIterations": int(args.hc_iterations),
                "seed": int(args.seed),
                "maxOptimizeMs": int(args.max_optimize_ms),
                "debug": False,
                "debugLimit": 10,
            }

            started = time.time()
            optimizer_result = run_optimizer_async(
                supabase_url,
                supabase_key,
                optimizer_payload,
                poll_interval_s=float(args.poll_interval_s),
                poll_timeout_s=float(args.poll_timeout_s),
            )
            elapsed_opt_ms = int((time.time() - started) * 1000)

            player_build = score_custom_deck(
                supabase_url,
                supabase_key,
                set_code=args.set_code,
                format_code=args.format_code,
                deck_text=custom_deck_text,
                weights=weights,
            )

            top_builds = list(optimizer_result.get("builds", []))[:3]
            ranked_rows: list[dict[str, Any]] = []
            for build in top_builds:
                build_counts = merged_build_counts(build, include_lands=args.jaccard_include_lands)
                build_counts = normalize_counts(build_counts, include_lands=args.jaccard_include_lands)
                jaccard = multiset_jaccard(player_counts_for_jaccard, build_counts)
                ranked_rows.append(
                    {
                        "rank": int(build.get("rank", 0) or 0),
                        "score": float(build.get("score", 0.0) or 0.0),
                        "archetype": build.get("archetype"),
                        "jaccard_similarity": round(jaccard, 4),
                    }
                )

            results.append(
                {
                    "aggregate_id": aggregate_id,
                    "trophy_time": row.get("trophy_time"),
                    "optimizer_compute_ms_estimate": elapsed_opt_ms,
                    "optimizer_builds": ranked_rows,
                    "player_deck": {
                        "score": float(player_build.get("score", 0.0) or 0.0),
                        "archetype": player_build.get("archetype"),
                    },
                }
            )
            print(
                f"{index:03d}/{len(records)} ok {aggregate_id} | "
                f"player={results[-1]['player_deck']['score']:.2f} "
                f"best={max((b['score'] for b in ranked_rows), default=0.0):.2f}"
            )
        except Exception as exc:
            failures.append(
                {
                    "aggregate_id": aggregate_id,
                    "error": str(exc),
                }
            )
            print(f"{index:03d}/{len(records)} fail {aggregate_id}: {exc}")

    summary = summarize(results)
    payload = {
        "metadata": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "input_file": str(args.input),
            "set_code": args.set_code,
            "format": args.format_code,
            "weights": weights,
            "hc_restarts": int(args.hc_restarts),
            "hc_iterations": int(args.hc_iterations),
            "seed": int(args.seed),
            "max_optimize_ms": int(args.max_optimize_ms),
            "jaccard_include_lands": bool(args.jaccard_include_lands),
            "requested_records": len(records),
            "successful_records": len(results),
            "failed_records": len(failures),
        },
        "summary": summary,
        "results": results,
        "failures": failures,
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Saved report: {args.output}")
    print(f"Summary: {json.dumps(summary, indent=2)}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Replay latest sealed trophy pools against sealed-optimizer and compare with player deck.",
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=Path("backend/tmp/_tmp_arena_direct_sealed_trophy_with_pools.json"),
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("backend/tmp/_tmp_trophy_pool_replay_report.json"),
    )
    parser.add_argument("--set", dest="set_code", default="ECL")
    parser.add_argument("--format", dest="format_code", default="ArenaDirect_Sealed")
    parser.add_argument("--limit", type=int, default=None)

    parser.add_argument("--w-power", type=float, default=2.0)
    parser.add_argument("--w-consistency", type=float, default=1.0)
    parser.add_argument("--w-curve", type=float, default=1.0)
    parser.add_argument("--w-synergy", type=float, default=1.0)

    parser.add_argument("--hc-restarts", type=int, default=3)
    parser.add_argument("--hc-iterations", type=int, default=55)
    parser.add_argument("--seed", type=int, default=1337)
    parser.add_argument("--max-optimize-ms", type=int, default=10000)
    parser.add_argument("--poll-interval-s", type=float, default=0.8)
    parser.add_argument("--poll-timeout-s", type=float, default=90.0)
    parser.add_argument("--jaccard-include-lands", action="store_true")
    return parser.parse_args()


if __name__ == "__main__":
    run(parse_args())
