import requests
import os
import json
import time
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(dotenv_path=Path(__file__).parent.parent / '.env')
SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY") or os.getenv("VITE_SUPABASE_KEY")

pool_path = Path(__file__).parent.parent / "test_sealed_pool.txt"
pool_text = pool_path.read_text(encoding="utf-8")
weights = {
    "power": float(os.getenv("SEALED_W_POWER", "2")),
    "consistency": float(os.getenv("SEALED_W_CONSISTENCY", "1")),
    "curve": float(os.getenv("SEALED_W_CURVE", "1")),
    "synergy": float(os.getenv("SEALED_W_SYNERGY", "1")),
}
debug = os.getenv("SEALED_DEBUG", "0").lower() in {"1", "true", "yes", "on"}
debug_limit = int(os.getenv("SEALED_DEBUG_LIMIT", "20"))
hc_restarts = int(os.getenv("SEALED_HC_RESTARTS", "3"))
hc_iterations = int(os.getenv("SEALED_HC_ITERATIONS", "55"))
seed = int(os.getenv("SEALED_SEED", "1337"))
max_opt_ms = int(os.getenv("SEALED_MAX_OPTIMIZE_MS", "10000"))
async_mode = os.getenv("SEALED_ASYNC", "1").lower() in {"1", "true", "yes", "on"}
poll_interval_s = float(os.getenv("SEALED_ASYNC_POLL_INTERVAL", "0.8"))
poll_timeout_s = float(os.getenv("SEALED_ASYNC_TIMEOUT", "60"))

COLOR_TO_BASIC = {
    "W": "Plains",
    "U": "Island",
    "B": "Swamp",
    "R": "Mountain",
    "G": "Forest",
}


def format_archetype_display(build: dict) -> str:
    main_colors = list(build.get("mainColors") or [])
    splash = build.get("splashColor")
    lands = build.get("lands") or []

    if not main_colors:
        return build.get("archetype", "?")

    land_by_name = {l.get("name"): int(l.get("qty", 0)) for l in lands}
    main_colors_sorted = sorted(
        main_colors,
        key=lambda c: (
            -(land_by_name.get(COLOR_TO_BASIC.get(c, ""), 0)),
            c,
        ),
    )

    label = "".join(main_colors_sorted)
    if splash:
        label += str(splash).lower()
    return label

def call_optimizer(payload: dict):
    return requests.post(
        f"{SUPABASE_URL}/functions/v1/sealed-optimizer",
        headers={
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=30,
    )


used_hc_restarts = hc_restarts
used_hc_iterations = hc_iterations
base_payload = {
    "setCode": "ECL",
    "format": os.getenv("SEALED_OPTIMIZER_FORMAT", "ArenaDirect_Sealed"),
    "poolText": pool_text,
    "scoreWeights": weights,
    "hcRestarts": used_hc_restarts,
    "hcIterations": used_hc_iterations,
    "seed": seed,
    "maxOptimizeMs": max_opt_ms,
    "debug": debug,
    "debugLimit": debug_limit,
}

if async_mode:
    submit_payload = {
        **base_payload,
        "action": "submit",
        "async": True,
    }
    submit_resp = call_optimizer(submit_payload)
    submit_data = submit_resp.json()
    if submit_resp.status_code != 202:
        print(f"Erreur submit {submit_resp.status_code}:")
        print(json.dumps(submit_data, indent=2)[:3000])
        raise SystemExit(1)

    job_id = submit_data.get("jobId")
    if not job_id:
        print("Erreur: réponse async sans jobId.")
        print(json.dumps(submit_data, indent=2)[:3000])
        raise SystemExit(1)

    started = time.time()
    data = None
    status_code = 202
    while True:
        if time.time() - started > poll_timeout_s:
            print(f"Timeout async après {poll_timeout_s:.1f}s (jobId={job_id}).")
            raise SystemExit(1)
        time.sleep(poll_interval_s)
        status_resp = call_optimizer({"action": "status", "jobId": job_id})
        status_code = status_resp.status_code
        status_data = status_resp.json()
        if status_code == 202:
            continue
        if status_code != 200:
            print(f"Erreur status {status_code}:")
            print(json.dumps(status_data, indent=2)[:3000])
            raise SystemExit(1)
        if status_data.get("status") == "failed":
            print("Job async en erreur:")
            print(json.dumps(status_data.get("error"), indent=2)[:3000])
            raise SystemExit(1)
        if status_data.get("status") == "done":
            data = {
                "result": status_data.get("result"),
                "computeTimeMs": status_data.get("computeTimeMs"),
            }
            break
    resp_status = 200
else:
    resp = call_optimizer(base_payload)
    first_data = resp.json()
    if resp.status_code == 202 and isinstance(first_data, dict) and first_data.get("jobId"):
        job_id = first_data.get("jobId")
        started = time.time()
        data = None
        status_code = 202
        while True:
            if time.time() - started > poll_timeout_s:
                print(f"Timeout async après {poll_timeout_s:.1f}s (jobId={job_id}).")
                raise SystemExit(1)
            time.sleep(poll_interval_s)
            status_resp = call_optimizer({"action": "status", "jobId": job_id})
            status_code = status_resp.status_code
            status_data = status_resp.json()
            if status_code == 202:
                continue
            if status_code != 200:
                print(f"Erreur status {status_code}:")
                print(json.dumps(status_data, indent=2)[:3000])
                raise SystemExit(1)
            if status_data.get("status") == "failed":
                print("Job async en erreur:")
                print(json.dumps(status_data.get("error"), indent=2)[:3000])
                raise SystemExit(1)
            if status_data.get("status") == "done":
                data = {
                    "result": status_data.get("result"),
                    "computeTimeMs": status_data.get("computeTimeMs"),
                }
                break
        resp_status = 200
    else:
        data = first_data
        resp_status = resp.status_code

if resp_status != 200:
    print(f"Erreur {resp_status}:")
    print(json.dumps(data, indent=2)[:3000])
else:
    result = data["result"]
    elapsed = data.get("computeTimeMs", "?")
    applied = result.get("weightsApplied", weights)
    w_power = float(applied.get("power", 0) or 0)
    w_consistency = float(applied.get("consistency", 0) or 0)
    w_curve = float(applied.get("curve", 0) or 0)
    w_synergy = float(applied.get("synergy", 0) or 0)
    w_sum = max(1e-9, w_power + w_consistency + w_curve + w_synergy)

    power_share = w_power / w_sum
    consistency_share = w_consistency / w_sum
    curve_share = w_curve / w_sum
    synergy_share = w_synergy / w_sum

    print(f"Pool: {result['poolSize']} cartes | {len(result['builds'])} builds | {elapsed}ms\n")
    print(
        "Weights:"
        f" Power={applied.get('power')} | Consistency={applied.get('consistency')} |"
        f" Curve={applied.get('curve')} | Synergy={applied.get('synergy')}\n"
    )
    print(f"HC profile: {used_hc_restarts}x{used_hc_iterations} | Seed={seed}\n")
    if debug:
        print("Debug candidates (quality vs adjustments):")
        for c in result.get("debugCandidates", []):
            mana_dbg = c.get("manaDebug", "")
            mana_suffix = f"\n         {mana_dbg}" if mana_dbg else ""
            print(
                f"  {c['archetype']:>4} | score {c['score']:>6} = Q {c['qualityScore']:>6} + Adj {c['totalAdjustment']:>6}"
                f" | Cons {c['consistencyScore']:>5} | Curve {c['curveScore']:>5}"
                f" | Crea {c['creatureCount']:>2} | Rem {c['removalCount']:>2}"
                f"{mana_suffix}"
            )
        print()

    for b in result["builds"]:
        s = b["stats"]
        sb = b["scoreBreakdown"]
        archetype_label = format_archetype_display(b)
        print(f"=== Build #{b['rank']} - {archetype_label} (score: {b['score']}) ===")
        print(f"  Creatures: {s['creatureCount']} | Removal: {s['removalCount']} | Avg CMC: {s['avgCmc']} | Skeleton sim: {s['skeletonSimilarity']}")
        print(
            f"  WR raw: {sb['wrScore']} -> {sb['wrNormalized']}/100 | "
            f"Syn raw: {sb['synergyScore']} -> {sb['synergyNormalized']}/100"
        )

        power_contrib = float(sb["wrNormalized"]) * power_share
        synergy_contrib = float(sb["synergyNormalized"]) * synergy_share
        consistency_contrib = float(sb["consistencyScore"]) * consistency_share
        curve_contrib = float(sb["curveScore"]) * curve_share
        base_score = power_contrib + synergy_contrib + consistency_contrib + curve_contrib
        structure_adjustment = float(sb["skeletonAdjustment"]) + float(sb["creatureAdjustment"]) + float(sb["removalAdjustment"]) + float(sb["dependencyAdjustment"])

        print("  Base score (weighted 4-axis average):")
        print(
            f"    Power (WR norm {sb['wrNormalized']}) x {power_share:.0%} = {power_contrib:.2f} | "
            f"Synergy ({sb['synergyNormalized']}) x {synergy_share:.0%} = {synergy_contrib:.2f}"
        )
        print(
            f"    Consistency ({sb['consistencyScore']}) x {consistency_share:.0%} = {consistency_contrib:.2f} | "
            f"Curve ({sb['curveScore']}) x {curve_share:.0%} = {curve_contrib:.2f}"
        )
        print(f"    => Base = {base_score:.2f} (API qualityScore={float(sb['qualityScore']):.2f})")

        print("  Structure adjustment:")
        print(
            f"    Skeleton {float(sb['skeletonAdjustment']):+.2f} | "
            f"Creatures {float(sb['creatureAdjustment']):+.2f} | "
            f"Removal {float(sb['removalAdjustment']):+.2f} | "
            f"Dependency {float(sb['dependencyAdjustment']):+.2f}"
        )
        print(f"    => Adjustment total = {structure_adjustment:+.2f} (API totalAdjustment={float(sb['totalAdjustment']):+.2f})")
        print(f"  Final score: {base_score:.2f} + {structure_adjustment:+.2f} = {float(b['score']):.2f}")

        print(
            f"  Axes values: Consistency {sb['consistencyScore']} | Curve {sb['curveScore']} | "
            f"Creature target: {sb['creatureTarget']}"
        )
        print(
            f"  Raw penalties: Curve {sb['curvePenalty']} | Mana {sb['manaPenalty']} | Dep {sb['dependencyPenalty']}"
        )
        lands_str = " | ".join(f"{l['qty']}x {l['name']}" for l in b["lands"])
        print(f"  Lands: {lands_str}")
        card_count = sum(c["qty"] for c in b["cards"])
        print(f"  Cards ({card_count}):")
        for c in sorted(b["cards"], key=lambda x: x["name"]):
            print(f"    {c['qty']}x {c['name']}")
        print()
