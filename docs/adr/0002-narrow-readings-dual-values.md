# Narrow readings + dual raw/calibrated values

One row per `(device_time, device, sensor type)` with `raw_value` (as-sent, immutable) and `value` (calibrated against the calibration effective at `device_time`). Unique key `(device_id, device_time, sensor_type)` doubles as the idempotency guard (`ON CONFLICT DO NOTHING`).

## Considered Options

- Wide row (one row per payload, column per sensor): fewer rows but `ALTER TABLE` per new sensor, NULLs for error-omitted sensors, fails the "2 temperature sensors per device" interview trap.
- Apply-on-read (store raw only, calibrate at query): single column but every calibration edit rewrites history, contradicting §B.3's "old data must not change" expectation.

## Consequences

- ~184M rows/year at 50 dev × 7 sensors × 1/min lives in the hypertable; compression policy required.
- Rain `mm_delta` precomputed at ingest (`new >= prev ? new-prev : new`, × 0.2); hourly/daily rain is `SUM`, immune to double-restart inside one bucket.
