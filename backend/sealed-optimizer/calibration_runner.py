import argparse
import json
import os
import statistics
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

from benchmark_trophy_pool_replay import (
    counts_to_text,
    merged_build_counts,
    multiset_jaccard,
    normalize_counts,
    parse_input_payload,
    run_optimizer_async,
    score_custom_deck,
)


@dataclass(frozen=True)
class Scenario:
    id: str
    description: str
    w_power: float
    w_consistency: float
    w_curve: float
    w_synergy: float
    hc_restarts: int
    hc_iterations: int
    seed: int
    max_optimize_ms: int
    curve_component_scales: dict[str, float] | None = None

    def weights(self) -> dict[str, float]:
        return {
            "power": float(self.w_power),
            "consistency": float(self.w_consistency),
            "curve": float(self.w_curve),
            "synergy": float(self.w_synergy),
        }


DEFAULT_SCENARIOS = [
    Scenario(
        id="baseline",
        description="Current production-like weights.",
        w_power=2.0,
        w_consistency=1.0,
        w_curve=1.0,
        w_synergy=1.0,
        hc_restarts=3,
        hc_iterations=55,
        seed=1337,
        max_optimize_ms=10000,
    ),
    Scenario(
        id="consistency_plus",
        description="Increase mana reliability pressure.",
        w_power=2.0,
        w_consistency=1.3,
        w_curve=1.0,
        w_synergy=1.0,
        hc_restarts=3,
        hc_iterations=55,
        seed=1337,
        max_optimize_ms=10000,
    ),
    Scenario(
        id="curve_plus",
        description="Increase curve and structure pressure.",
        w_power=2.0,
        w_consistency=1.0,
        w_curve=1.3,
        w_synergy=1.0,
        hc_restarts=3,
        hc_iterations=55,
        seed=1337,
        max_optimize_ms=10000,
    ),
    Scenario(
        id="synergy_plus",
        description="Increase synergy pressure.",
        w_power=2.0,
        w_consistency=1.0,
        w_curve=1.0,
        w_synergy=1.3,
        hc_restarts=3,
        hc_iterations=55,
        seed=1337,
        max_optimize_ms=10000,
    ),
    Scenario(
        id="curve_half",
        description="Reduce curve & structure weight.",
        w_power=2.0,
        w_consistency=1.0,
        w_curve=0.5,
        w_synergy=1.0,
        hc_restarts=3,
        hc_iterations=55,
        seed=1337,
        max_optimize_ms=10000,
    ),
]

SMOKE_SCENARIOS = [
    DEFAULT_SCENARIOS[0],
    DEFAULT_SCENARIOS[1],
]


def color_set(archetype: str) -> frozenset[str]:
    return frozenset(ch for ch in str(archetype or "").upper() if ch in "WUBRG")


def _mean(values: list[float]) -> float:
    return float(statistics.mean(values)) if values else 0.0


def _median(values: list[float]) -> float:
    return float(statistics.median(values)) if values else 0.0


def summarize_results(results: list[dict[str, Any]]) -> dict[str, float]:
    if not results:
        return {
            "processed": 0.0,
            "avg_player_score": 0.0,
            "median_player_score": 0.0,
            "avg_top1_score": 0.0,
            "median_top1_score": 0.0,
            "avg_best3_score": 0.0,
            "median_best3_score": 0.0,
            "avg_delta_best3_minus_player": 0.0,
            "optimizer_beats_player_rate": 0.0,
            "avg_jaccard_top1": 0.0,
            "median_jaccard_top1": 0.0,
            "avg_jaccard_best3": 0.0,
            "median_jaccard_best3": 0.0,
            "strict_match_top1_rate": 0.0,
            "strict_match_top3_rate": 0.0,
            "color_match_top1_rate": 0.0,
            "color_match_top3_rate": 0.0,
            "avg_distinct_archetypes_top3": 0.0,
            "p90_top1_score": 0.0,
            "p10_top1_score": 0.0,
        }

    player_scores: list[float] = []
    top1_scores: list[float] = []
    best3_scores: list[float] = []
    top1_jacc: list[float] = []
    best3_jacc: list[float] = []
    distinct_count: list[float] = []

    strict_top1 = 0
    strict_top3 = 0
    color_top1 = 0
    color_top3 = 0
    beats = 0

    for row in results:
        player = row.get("player_deck", {}) or {}
        builds = row.get("optimizer_builds", []) or []
        if not builds:
            continue

        player_score = float(player.get("score", 0.0) or 0.0)
        player_scores.append(player_score)

        top1_score = float(builds[0].get("score", 0.0) or 0.0)
        best_score = max(float(b.get("score", 0.0) or 0.0) for b in builds)
        top1_scores.append(top1_score)
        best3_scores.append(best_score)
        if best_score > player_score:
            beats += 1

        jaccards = [float(b.get("jaccard_similarity", 0.0) or 0.0) for b in builds]
        top1_jacc.append(jaccards[0] if jaccards else 0.0)
        best3_jacc.append(max(jaccards) if jaccards else 0.0)

        player_arch = str(player.get("archetype") or "")
        player_colors = color_set(player_arch)
        build_arch = [str(b.get("archetype") or "") for b in builds[:3]]
        build_colors = [color_set(x) for x in build_arch]

        if player_arch and build_arch and player_arch == build_arch[0]:
            strict_top1 += 1
        if player_arch and any(player_arch == x for x in build_arch):
            strict_top3 += 1
        if player_colors and build_colors and player_colors == build_colors[0]:
            color_top1 += 1
        if player_colors and any(player_colors == c for c in build_colors):
            color_top3 += 1

        distinct_count.append(float(len(set(build_arch))))

    n = max(1, len(top1_scores))
    sorted_top1 = sorted(top1_scores)
    p10_idx = min(len(sorted_top1) - 1, max(0, int(0.10 * len(sorted_top1))))
    p90_idx = min(len(sorted_top1) - 1, max(0, int(0.90 * len(sorted_top1))))

    deltas = [b - p for b, p in zip(best3_scores, player_scores)]
    return {
        "processed": float(len(results)),
        "avg_player_score": _mean(player_scores),
        "median_player_score": _median(player_scores),
        "avg_top1_score": _mean(top1_scores),
        "median_top1_score": _median(top1_scores),
        "avg_best3_score": _mean(best3_scores),
        "median_best3_score": _median(best3_scores),
        "avg_delta_best3_minus_player": _mean(deltas),
        "optimizer_beats_player_rate": 100.0 * beats / n,
        "avg_jaccard_top1": _mean(top1_jacc),
        "median_jaccard_top1": _median(top1_jacc),
        "avg_jaccard_best3": _mean(best3_jacc),
        "median_jaccard_best3": _median(best3_jacc),
        "strict_match_top1_rate": 100.0 * strict_top1 / n,
        "strict_match_top3_rate": 100.0 * strict_top3 / n,
        "color_match_top1_rate": 100.0 * color_top1 / n,
        "color_match_top3_rate": 100.0 * color_top3 / n,
        "avg_distinct_archetypes_top3": _mean(distinct_count),
        "p10_top1_score": sorted_top1[p10_idx] if sorted_top1 else 0.0,
        "p90_top1_score": sorted_top1[p90_idx] if sorted_top1 else 0.0,
    }


def run_one_scenario(
    records: list[dict[str, Any]],
    scenario: Scenario,
    set_code: str,
    format_code: str,
    jaccard_include_lands: bool,
    poll_interval_s: float,
    poll_timeout_s: float,
    supabase_url: str,
    supabase_key: str,
) -> dict[str, Any]:
    start = time.time()
    results: list[dict[str, Any]] = []
    failures: list[dict[str, Any]] = []
    weights = scenario.weights()

    print(f"\n=== Scenario {scenario.id} ({len(records)} pools) ===")
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
                include_lands=jaccard_include_lands,
            )

            pool_text = counts_to_text(pool_counts, include_header=False)
            custom_deck_text = counts_to_text(player_counts_for_score, include_header=True)

            optimizer_payload = {
                "setCode": set_code,
                "format": format_code,
                "poolText": pool_text,
                "scoreWeights": weights,
                "hcRestarts": int(scenario.hc_restarts),
                "hcIterations": int(scenario.hc_iterations),
                "seed": int(scenario.seed),
                "maxOptimizeMs": int(scenario.max_optimize_ms),
                "debug": False,
                "debugLimit": 10,
            }
            if scenario.curve_component_scales:
                optimizer_payload["curveComponentScales"] = scenario.curve_component_scales

            started = time.time()
            optimizer_result = run_optimizer_async(
                supabase_url,
                supabase_key,
                optimizer_payload,
                poll_interval_s=poll_interval_s,
                poll_timeout_s=poll_timeout_s,
            )
            elapsed_opt_ms = int((time.time() - started) * 1000)

            player_build = score_custom_deck(
                supabase_url,
                supabase_key,
                set_code=set_code,
                format_code=format_code,
                deck_text=custom_deck_text,
                weights=weights,
                curve_component_scales=scenario.curve_component_scales,
            )

            top_builds = list(optimizer_result.get("builds", []))[:3]
            ranked_rows: list[dict[str, Any]] = []
            for build in top_builds:
                build_counts = merged_build_counts(build, include_lands=jaccard_include_lands)
                build_counts = normalize_counts(build_counts, include_lands=jaccard_include_lands)
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
        except Exception as exc:  # noqa: BLE001
            failures.append({"aggregate_id": aggregate_id, "error": str(exc)})
            print(f"{index:03d}/{len(records)} fail {aggregate_id}: {exc}")

    summary = summarize_results(results)
    elapsed_s = time.time() - start
    return {
        "scenario": {
            "id": scenario.id,
            "description": scenario.description,
            "weights": weights,
            "hc_restarts": scenario.hc_restarts,
            "hc_iterations": scenario.hc_iterations,
            "seed": scenario.seed,
            "max_optimize_ms": scenario.max_optimize_ms,
            "curve_component_scales": scenario.curve_component_scales,
        },
        "summary": summary,
        "elapsed_seconds": round(elapsed_s, 2),
        "successful_records": len(results),
        "failed_records": len(failures),
        "results": results,
        "failures": failures,
    }


def round_summary(summary: dict[str, float]) -> dict[str, float]:
    out: dict[str, float] = {}
    for key, value in summary.items():
        if key == "processed":
            out[key] = value
        elif key.endswith("_rate"):
            out[key] = round(value, 2)
        else:
            out[key] = round(value, 4)
    return out


def build_markdown(payload: dict[str, Any]) -> str:
    scenarios = payload.get("scenarios", [])
    baseline_id = payload.get("baseline_scenario_id")
    baseline = next((s for s in scenarios if s["scenario"]["id"] == baseline_id), None)
    baseline_summary = baseline["summary"] if baseline else {}

    rows = []
    for s in scenarios:
        sid = s["scenario"]["id"]
        summ = s["summary"]
        delta_top1 = summ["avg_top1_score"] - baseline_summary.get("avg_top1_score", 0.0)
        delta_jacc = summ["avg_jaccard_best3"] - baseline_summary.get("avg_jaccard_best3", 0.0)
        delta_color = summ["color_match_top3_rate"] - baseline_summary.get("color_match_top3_rate", 0.0)
        rows.append(
            (
                sid,
                summ["avg_top1_score"],
                summ["avg_jaccard_best3"],
                summ["color_match_top3_rate"],
                summ["strict_match_top3_rate"],
                summ["avg_distinct_archetypes_top3"],
                delta_top1,
                delta_jacc,
                delta_color,
            )
        )

    lines: list[str] = []
    lines.append("# Sealed Optimizer Calibration Runner Report")
    lines.append("")
    lines.append(f"Date: {payload['metadata']['generated_at']}")
    lines.append(f"Input: `{payload['metadata']['input_file']}`")
    lines.append(f"Pools: {payload['metadata']['requested_records']}")
    lines.append(f"Baseline scenario: `{baseline_id}`")
    lines.append("")
    lines.append("## Scenario Comparison")
    lines.append("")
    lines.append("| Scenario | Avg Top1 | Avg Jaccard Best3 | Color Match Top3 | Strict Match Top3 | Diversity Top3 | dTop1 vs baseline | dJaccard Best3 | dColor Match |")
    lines.append("|---|---:|---:|---:|---:|---:|---:|---:|---:|")
    for row in rows:
        lines.append(
            f"| {row[0]} | {row[1]:.4f} | {row[2]:.4f} | {row[3]:.2f}% | "
            f"{row[4]:.2f}% | {row[5]:.2f} | {row[6]:+.4f} | {row[7]:+.4f} | {row[8]:+.2f} pts |"
        )

    lines.append("")
    lines.append("## Weights")
    lines.append("")
    for s in scenarios:
        sc = s["scenario"]
        w = sc["weights"]
        lines.append(
            f"- `{sc['id']}`: power={w['power']}, consistency={w['consistency']}, curve={w['curve']}, synergy={w['synergy']} "
            f"| hc=({sc['hc_restarts']}x{sc['hc_iterations']}) | max_ms={sc['max_optimize_ms']}"
        )

    return "\n".join(lines) + "\n"


def parse_scenarios(
    scenario_set: str,
    scenario_file: Path | None,
) -> list[Scenario]:
    if scenario_file:
        raw = json.loads(scenario_file.read_text(encoding="utf-8"))
        if not isinstance(raw, list):
            raise ValueError("--scenario-file must contain a JSON list")
        parsed: list[Scenario] = []
        for item in raw:
            parsed.append(Scenario(**item))
        return parsed

    if scenario_set == "smoke":
        return SMOKE_SCENARIOS
    return DEFAULT_SCENARIOS


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run multi-scenario calibration on trophy sealed pools.",
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=Path("backend/tmp/_tmp_arena_direct_sealed_trophy_with_pools_cleaned.json"),
    )
    parser.add_argument(
        "--output-json",
        type=Path,
        default=Path("backend/reports/benchmarks/calibration_runner_report.json"),
    )
    parser.add_argument(
        "--output-md",
        type=Path,
        default=Path("backend/reports/benchmarks/calibration_runner_report.md"),
    )
    parser.add_argument("--set", dest="set_code", default="TMT")
    parser.add_argument("--format", dest="format_code", default="ArenaDirect_Sealed")
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--poll-interval-s", type=float, default=0.8)
    parser.add_argument("--poll-timeout-s", type=float, default=90.0)
    parser.add_argument("--jaccard-include-lands", action="store_true")
    parser.add_argument(
        "--scenario-set",
        choices=["smoke", "default"],
        default="default",
    )
    parser.add_argument(
        "--scenario-file",
        type=Path,
        default=None,
        help="Optional JSON list of scenarios.",
    )
    parser.add_argument(
        "--baseline-scenario-id",
        default="baseline",
        help="Scenario id used as delta reference in markdown report.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env")

    supabase_url = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_KEY") or os.getenv("VITE_SUPABASE_KEY")
    if not supabase_url or not supabase_key:
        raise RuntimeError("Missing SUPABASE_URL / SUPABASE_KEY in .env")

    records = parse_input_payload(args.input)
    if args.limit is not None:
        records = records[: max(1, int(args.limit))]

    scenarios = parse_scenarios(args.scenario_set, args.scenario_file)
    if not scenarios:
        raise RuntimeError("No scenarios configured.")

    print(f"Calibration runner: {len(records)} pools x {len(scenarios)} scenarios")
    scenario_runs: list[dict[str, Any]] = []
    for scenario in scenarios:
        run_data = run_one_scenario(
            records=records,
            scenario=scenario,
            set_code=args.set_code,
            format_code=args.format_code,
            jaccard_include_lands=bool(args.jaccard_include_lands),
            poll_interval_s=float(args.poll_interval_s),
            poll_timeout_s=float(args.poll_timeout_s),
            supabase_url=supabase_url,
            supabase_key=supabase_key,
        )
        run_data["summary"] = round_summary(run_data["summary"])
        scenario_runs.append(run_data)

    payload = {
        "metadata": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "input_file": str(args.input),
            "set_code": args.set_code,
            "format": args.format_code,
            "requested_records": len(records),
            "scenario_count": len(scenarios),
            "jaccard_include_lands": bool(args.jaccard_include_lands),
            "scenario_set": args.scenario_set,
        },
        "baseline_scenario_id": args.baseline_scenario_id,
        "scenarios": scenario_runs,
    }

    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_md.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    args.output_md.write_text(build_markdown(payload), encoding="utf-8")
    print(f"Saved JSON report: {args.output_json}")
    print(f"Saved Markdown report: {args.output_md}")


if __name__ == "__main__":
    main()
