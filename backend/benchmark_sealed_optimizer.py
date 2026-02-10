import argparse
import json
import os
import statistics
from pathlib import Path

import requests
from dotenv import load_dotenv


def load_env() -> tuple[str, str]:
    load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env")
    url = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY") or os.getenv("VITE_SUPABASE_KEY")
    if not url or not key:
        raise RuntimeError("Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_KEY/VITE_SUPABASE_KEY")
    return url, key


def invoke(
    url: str,
    key: str,
    set_code: str,
    fmt: str,
    pool_text: str,
    weights: dict,
    restarts: int,
    iterations: int,
    debug: bool = False,
) -> tuple[int, dict]:
    resp = requests.post(
        f"{url}/functions/v1/sealed-optimizer",
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
        json={
            "setCode": set_code,
            "format": fmt,
            "poolText": pool_text,
            "scoreWeights": weights,
            "hcRestarts": restarts,
            "hcIterations": iterations,
            "debug": debug,
            "debugLimit": 10,
        },
        timeout=60,
    )
    try:
        payload = resp.json()
    except Exception:
        payload = {"raw": resp.text}
    return resp.status_code, payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark sealed-optimizer across multiple pools.")
    parser.add_argument("--set", dest="set_code", default="ECL")
    parser.add_argument("--format", dest="fmt", default="ArenaDirect_Sealed")
    parser.add_argument(
        "--pools-glob",
        default="test_sealed_pool*.txt",
        help="Glob pattern resolved from repo root (default: test_sealed_pool*.txt)",
    )
    parser.add_argument("--power", type=float, default=2.0)
    parser.add_argument("--consistency", type=float, default=1.0)
    parser.add_argument("--curve", type=float, default=1.0)
    parser.add_argument("--synergy", type=float, default=1.0)
    parser.add_argument("--restarts", type=int, default=3, help="HC restarts (default: 3)")
    parser.add_argument("--iterations", type=int, default=55, help="HC iterations per restart (default: 55)")
    args = parser.parse_args()

    root = Path(__file__).parent.parent
    pools = sorted(root.glob(args.pools_glob))
    if not pools:
        print(f"No pool files found with glob: {args.pools_glob}")
        return

    url, key = load_env()
    weights = {
        "power": args.power,
        "consistency": args.consistency,
        "curve": args.curve,
        "synergy": args.synergy,
    }

    compute_times: list[float] = []
    worker_limit = 0
    failures = 0

    print(f"Benchmarking {len(pools)} pool(s) with HC={args.restarts}x{args.iterations}")
    print(f"Weights: {json.dumps(weights)}")
    print()

    for pool_path in pools:
        pool_text = pool_path.read_text(encoding="utf-8")
        status, payload = invoke(
            url,
            key,
            args.set_code,
            args.fmt,
            pool_text,
            weights,
            args.restarts,
            args.iterations,
        )

        if status == 200:
            ms = float(payload.get("computeTimeMs", 0))
            compute_times.append(ms)
            builds = len(payload.get("result", {}).get("builds", []))
            print(f"[OK] {pool_path.name:<30} {ms:>7.0f}ms | builds={builds}")
        else:
            code = payload.get("code")
            msg = payload.get("message") or payload.get("error")
            if code == "WORKER_LIMIT":
                worker_limit += 1
            failures += 1
            print(f"[ERR] {pool_path.name:<30} status={status} code={code} msg={msg}")

    print("\nSummary")
    print(f"  Pools tested: {len(pools)}")
    print(f"  Success:      {len(pools) - failures}")
    print(f"  Failures:     {failures}")
    print(f"  WORKER_LIMIT: {worker_limit}")
    if compute_times:
        print(f"  Avg ms:       {statistics.mean(compute_times):.0f}")
        print(f"  P95 ms:       {sorted(compute_times)[max(0, int(len(compute_times)*0.95)-1)]:.0f}")
        print(f"  Max ms:       {max(compute_times):.0f}")

    if worker_limit == 0:
        print("\nNo WORKER_LIMIT observed. Candidate for trying 4x55 HC on this sample.")
    else:
        print("\nWORKER_LIMIT observed. Keep 3x55 HC.")


if __name__ == "__main__":
    main()
