#!/usr/bin/env python3
"""Weather-station device simulator (stdlib only).

Sends firmware-format payloads from §F.1 to the ingestion API.

Usage:
    python simulate.py --mode normal --count 10
    python simulate.py --mode offline --count 180      # buffer then POST batch
    python simulate.py --mode duplicate --count 3      # same payload 3x (idempotency demo)
    python simulate.py --device WS-BDG-002 --key dev-secret-bdg-002 --mode normal

Env: API_URL (default http://localhost:8000/api/v1)
Keys (see backend/database/seeders/WeatherSeeder.php):
    WS-GRT-001 / dev-secret-grt-001
    WS-BDG-002 / dev-secret-bdg-002
    WS-BGR-003 / dev-secret-bgr-003
"""
import argparse
import json
import math
import os
import random
import time
import urllib.request

API = os.environ.get("API_URL", "http://localhost:8000/api/v1")
SENSORS = ["temp_air", "humidity", "pressure", "wind_speed", "wind_dir", "rain_counter", "solar_rad"]


def post(path, key, body):
    req = urllib.request.Request(
        API + path,
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            return res.status, json.loads(res.read() or b"{}")
    except Exception as e:  # noqa: BLE001 - simulator, print and continue
        print("ERR", e)
        return -1, {}


def sample(ts, seq, counter):
    hour = time.gmtime(ts).tm_hour + time.gmtime(ts).tm_min / 60
    return {
        "ts": ts, "seq": seq, "battery_v": round(3.9 + random.uniform(-0.05, 0.05), 2),
        "rssi": random.randint(-80, -60),
        "readings": [
            {"s": "temp_air", "v": round(24 + 5 * math.sin((hour - 9) / 24 * 2 * math.pi), 1)},
            {"s": "humidity", "v": round(80 - 15 * math.sin((hour - 9) / 24 * 2 * math.pi), 1)},
            {"s": "pressure", "v": round(1008 + random.uniform(-1, 1), 1)},
            {"s": "wind_speed", "v": round(max(0, 3 + random.uniform(-1.5, 1.5)), 1)},
            {"s": "wind_dir", "v": random.randint(0, 359)},
            {"s": "rain_counter", "v": counter},
            {"s": "solar_rad", "v": round(max(0, 800 * math.sin(max(0, (hour - 6)) / 12 * math.pi)), 1)},
        ],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--device", default="WS-GRT-001")
    ap.add_argument("--key", default="dev-secret-grt-001")
    ap.add_argument("--mode", choices=["normal", "offline", "duplicate"], default="normal")
    ap.add_argument("--count", type=int, default=5)
    ap.add_argument("--interval", type=float, default=2.0, help="seconds between sends (normal mode)")
    args = ap.parse_args()

    ts = int(time.time()) - args.count * 60
    seq = random.randint(10000, 11000)
    counter = random.randint(1000, 1100)
    fw = "1.4.2"

    if args.mode == "duplicate":
        item = sample(int(time.time()), seq, counter)
        body = {"device_id": args.device, "fw": fw, **item}
        for i in range(3):
            s, r = post("/ingest/telemetry", args.key, body)
            print(f"send {i+1}/3 -> {s} {r.get('data') or r}")
        return

    if args.mode == "offline":
        batch = []
        for _ in range(args.count):
            counter += random.randint(0, 2)
            seq += 1
            ts += 60
            batch.append(sample(ts, seq, counter))
        s, r = post("/ingest/telemetry/batch", args.key,
                    {"device_id": args.device, "fw": fw, "batch": batch})
        print(f"batch {len(batch)} -> {s} {r.get('data') or r}")
        return

    for i in range(args.count):
        counter += random.randint(0, 2)
        seq += 1
        ts += 60
        body = {"device_id": args.device, "fw": fw, **sample(ts, seq, counter)}
        s, r = post("/ingest/telemetry", args.key, body)
        print(f"[{i+1}/{args.count}] -> {s} {r.get('data') or r}")
        if i < args.count - 1:
            time.sleep(args.interval)


if __name__ == "__main__":
    main()
