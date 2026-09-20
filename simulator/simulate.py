#!/usr/bin/env python3
"""Weather-station device simulator (stdlib only).

Sends firmware-format payloads from §F.1 to the ingestion API.

Usage:
    python simulate.py --mode normal --count 10
    python simulate.py --mode offline --count 180      # buffer then POST batch(es)
    python simulate.py --mode duplicate --count 3      # same payload 3x (idempotency demo)
    python simulate.py --mode heartbeat --count 5      # health report without sensor data
    python simulate.py --mode edge                     # exercise the 8 §F.3 edge cases
    python simulate.py --all --mode normal --count 5   # all 3 seeded devices
    python simulate.py --device WS-BDG-002 --key dev-secret-bdg-002 --mode normal

Env: API_URL (default http://localhost:8080/api/v1)
     SIM_TIMEOUT (seconds per request, default 60 — large buffered batches are slow)
Keys (see backend/database/seeders/WeatherSeeder.php):
    WS-GRT-001 / dev-secret-grt-001
    WS-BDG-002 / dev-secret-bdg-002
    WS-BGR-003 / dev-secret-bgr-003

Note: `edge` mode deliberately writes flagged readings (suspect / out_of_range)
and a future timestamp so the reviewer can see quality handling. It ends with a
clean sample so the dashboard's "latest" panel looks normal again.
"""
import argparse
import json
import math
import os
import random
import time
import urllib.error
import urllib.request

API = os.environ.get("API_URL", "http://localhost:8080/api/v1")
TIMEOUT = int(os.environ.get("SIM_TIMEOUT", "60"))
SENSORS = ["temp_air", "humidity", "pressure", "wind_speed", "wind_dir", "rain_counter", "solar_rad"]

# Must mirror IngestService::MAX_BATCH — larger buffers are split into chunks.
MAX_BATCH = 500

# Seeded devices (must match WeatherSeeder::DEVICE_KEYS).
KNOWN_DEVICES = [
    ("WS-GRT-001", "dev-secret-grt-001"),
    ("WS-BDG-002", "dev-secret-bdg-002"),
    ("WS-BGR-003", "dev-secret-bgr-003"),
]


def post(path, key, body):
    """POST JSON; return (status, parsed_body).

    HTTP errors are parsed, not swallowed, so the API's machine-readable
    `code` field is visible (e.g. 401 unauthenticated, 422 validation_failed).
    """
    req = urllib.request.Request(
        API + path,
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
            return res.status, json.loads(res.read() or b"{}")
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw or b"{}")
        except ValueError:
            return e.code, {"raw": raw.decode(errors="replace")}
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

    # Firmware buffers, then flushes in MAX_BATCH-sized chunks (mirrors the API cap).
    for start in range(0, len(batch), MAX_BATCH):
        chunk = batch[start:start + MAX_BATCH]
        s, r = post("/ingest/telemetry/batch", key,
                    {"device_id": device, "fw": fw, "batch": chunk})
        print(f"[{device}] batch {start + 1}-{start + len(chunk)}/{len(batch)} -> {s} {r.get('data') or r}")


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


def send_edge(device, key, fw="1.4.2"):
    """Walk through the eight §F.3 cases, printing what each proves."""
    base = int(time.time())
    seq = 90000

    def telemetry(label, ts, readings, expect="", device_id=None):
        body = {"device_id": device_id or device, "fw": fw, "ts": ts, "seq": seq,
                "readings": readings}
        s, r = post("/ingest/telemetry", key, body)
        print(f"[{label}] -> {s} {r}" + (f"  ({expect})" if expect else ""))

    telemetry("1 future ts +2h", base + 7200, [{"s": "temp_air", "v": 27.4}],
              "accepted, drift logged in received_at")
    telemetry("2 temp_air=-999", base + 60, [{"s": "temp_air", "v": -999}],
              "stored, quality=suspect")
    telemetry("3 humidity=150", base + 120, [{"s": "humidity", "v": 150}],
              "stored, quality=out_of_range")

    # 4. Restart: counter drops 1043 -> 5 -> 3; mm_delta must never go negative.
    for i, counter in enumerate([1043, 5, 3]):
        telemetry(f"4 rain_counter={counter}", base + 180 + i * 60,
                  [{"s": "rain_counter", "v": counter}], "mm_delta >= 0")

    # 5. Identical payload three times -> one row, two duplicates.
    for i in range(3):
        telemetry(f"5 duplicate {i+1}/3", base + 600,
                  [{"s": "temp_air", "v": 28.0}, {"s": "humidity", "v": 70.0}],
              "" if i == 0 else "expected 200 duplicates=1")

    # 6. Unknown device_id: with a valid key it is a 403 mismatch; with a bad
    #    key the server answers 401 identically to a wrong key (anti-enumeration).
    telemetry("6 unknown device (valid key)", base + 660, [{"s": "temp_air", "v": 1}],
              "expected 403 forbidden", device_id="WS-UNKNOWN-999")
    s, r = post("/ingest/telemetry", "not-a-real-key",
                {"device_id": "WS-UNKNOWN-999", "fw": fw, "ts": base + 720,
                 "seq": seq, "readings": [{"s": "temp_air", "v": 1}]})
    print(f"[6 unknown device (bad key)] -> {s} {r}  (expected 401 unauthenticated)")

    # 7. Absent sensor stays absent (no row), rather than being stored as null/zero.
    telemetry("7 missing solar_rad", base + 780, [{"s": "temp_air", "v": 25.0}],
              "no solar_rad row created")

    # 8. Batch boundary: 500 accepted, 501 rejected by validation. The window is
    #    pushed 3 days out so it cannot collide with the future-ts case above.
    batch_base = base + 3 * 86400
    batch = [
        {"ts": batch_base + i * 60, "seq": seq + 100 + i,
         "readings": [{"s": "temp_air", "v": round(20 + i % 5, 1)}]}
        for i in range(MAX_BATCH)
    ]
    s, r = post("/ingest/telemetry/batch", key, {"device_id": device, "fw": fw, "batch": batch})
    print(f"[8 batch {MAX_BATCH}] -> {s} {r.get('data') or r}  (expected 201 accepted={MAX_BATCH})")

    s, r = post("/ingest/telemetry/batch", key,
                {"device_id": device, "fw": fw,
                 "batch": batch + [{"ts": batch_base + MAX_BATCH * 60, "seq": seq + 700,
                                    "readings": [{"s": "temp_air", "v": 20.0}]}]})
    print(f"[8 batch {MAX_BATCH + 1}] -> {s} {r}  (expected 422 validation_failed)")

    # Leave "latest" sane after the intentionally-bad rows above.
    telem = {"device_id": device, "fw": fw, "ts": int(time.time()), "seq": seq + 999,
             **sample(int(time.time()), seq + 999, 1200)}
    s, r = post("/ingest/telemetry", key, telem)
    print(f"[recovery sample] -> {s} {r.get('data') or r}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--device", default="WS-GRT-001")
    ap.add_argument("--key", default="dev-secret-grt-001")
    ap.add_argument("--all", action="store_true",
                    help="simulate all 3 seeded devices, one after another")
    ap.add_argument("--mode", choices=["normal", "offline", "duplicate", "heartbeat", "edge"],
                    default="normal")
    ap.add_argument("--count", type=int, default=5)
    ap.add_argument("--interval", type=float, default=2.0,
                    help="seconds between sends (normal/heartbeat mode)")
    args = ap.parse_args()

    targets = KNOWN_DEVICES if args.all else [(args.device, args.key)]

    for device, key in targets:
        if args.mode == "duplicate":
            send_duplicate(device, key)
        elif args.mode == "offline":
            send_offline(device, key, args.count)
        elif args.mode == "heartbeat":
            send_heartbeat(device, key, args.count, args.interval)
        elif args.mode == "edge":
            send_edge(device, key)
        else:
            send_normal(device, key, args.count, args.interval)


if __name__ == "__main__":
    main()
