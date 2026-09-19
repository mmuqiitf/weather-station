#!/usr/bin/env python3
"""Weather-station device simulator (stdlib only).

Sends firmware-format payloads from §F.1 to the ingestion API.

Usage:
    python simulate.py --mode normal --count 10
    python simulate.py --mode offline --count 180      # buffer then POST batch
    python simulate.py --mode duplicate --count 3      # same payload 3x (idempotency demo)
    python simulate.py --mode heartbeat --count 5      # health report without sensor data
    python simulate.py --all --mode normal --count 5   # all 3 seeded devices, round-robin
    python simulate.py --device WS-BDG-002 --key dev-secret-bdg-002 --mode normal

Env: API_URL (default http://localhost:8080/api/v1)
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

API = os.environ.get("API_URL", "http://localhost:8080/api/v1")
SENSORS = ["temp_air", "humidity", "pressure", "wind_speed", "wind_dir", "rain_counter", "solar_rad"]

# Seeded devices (must match WeatherSeeder::DEVICE_KEYS).
KNOWN_DEVICES = [
    ("WS-GRT-001", "dev-secret-grt-001"),
    ("WS-BDG-002", "dev-secret-bdg-002"),
    ("WS-BGR-003", "dev-secret-bgr-003"),
]


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


def heartbeat(ts, fw="1.4.2"):
    return {
        "ts": ts, "fw": fw,
        "battery_v": round(3.9 + random.uniform(-0.05, 0.05), 2),
        "rssi": random.randint(-80, -60),
        "uptime_s": random.randint(800000, 900000),
    }


def send_normal(device, key, count, interval, fw="1.4.2"):
    ts = int(time.time()) - count * 60
    seq = random.randint(10000, 11000)
    counter = random.randint(1000, 1100)
    for i in range(count):
        counter += random.randint(0, 2)
        seq += 1
        ts += 60
        body = {"device_id": device, "fw": fw, **sample(ts, seq, counter)}
        s, r = post("/ingest/telemetry", key, body)
        print(f"[{device} {i+1}/{count}] -> {s} {r.get('data') or r}")
        if i < count - 1:
            time.sleep(interval)


def send_offline(device, key, count, fw="1.4.2"):
    ts = int(time.time()) - count * 60
    seq = random.randint(10000, 11000)
    counter = random.randint(1000, 1100)
    batch = []
    for _ in range(count):
        counter += random.randint(0, 2)
        seq += 1
        ts += 60
        batch.append(sample(ts, seq, counter))
    s, r = post("/ingest/telemetry/batch", key,
                {"device_id": device, "fw": fw, "batch": batch})
    print(f"[{device}] batch {len(batch)} -> {s} {r.get('data') or r}")


def send_duplicate(device, key, fw="1.4.2"):
    seq = random.randint(10000, 11000)
    counter = random.randint(1000, 1100)
    item = sample(int(time.time()), seq, counter)
    body = {"device_id": device, "fw": fw, **item}
    for i in range(3):
        s, r = post("/ingest/telemetry", key, body)
        print(f"[{device}] send {i+1}/3 -> {s} {r.get('data') or r}")


def send_heartbeat(device, key, count, interval, fw="1.4.2"):
    for i in range(count):
        body = {"device_id": device, **heartbeat(int(time.time()), fw)}
        s, r = post("/ingest/heartbeat", key, body)
        print(f"[{device} hb {i+1}/{count}] -> {s} {r.get('data') or r}")
        if i < count - 1:
            time.sleep(interval)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--device", default="WS-GRT-001")
    ap.add_argument("--key", default="dev-secret-grt-001")
    ap.add_argument("--all", action="store_true",
                    help="simulate all 3 seeded devices (round-robin), ignoring --device/--key")
    ap.add_argument("--mode", choices=["normal", "offline", "duplicate", "heartbeat"], default="normal")
    ap.add_argument("--count", type=int, default=5)
    ap.add_argument("--interval", type=float, default=2.0, help="seconds between sends (normal/heartbeat mode)")
    args = ap.parse_args()

    targets = KNOWN_DEVICES if args.all else [(args.device, args.key)]

    for device, key in targets:
        if args.mode == "duplicate":
            send_duplicate(device, key)
        elif args.mode == "offline":
            send_offline(device, key, args.count)
        elif args.mode == "heartbeat":
            send_heartbeat(device, key, args.count, args.interval)
        else:
            send_normal(device, key, args.count, args.interval)


if __name__ == "__main__":
    main()
