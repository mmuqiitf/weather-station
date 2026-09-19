# CONTEXT — Weather Station Monitoring Platform

Glossary only. No implementation decisions.

## Terms

- **Device**: physical weather station unit. Identity is `device_id` (e.g. `WS-GRT-001`). Has location (coordinates, name, altitude), lifecycle status (`provisioned`, `active`, `decommissioned`), health metadata (battery voltage, RSSI, firmware version).
- **Sensor Type**: sensor kind (e.g. `temp_air`, `humidity`, `pressure`, `rain_counter`, `wind_speed`, `wind_dir`, `solar_rad`). Defines unit, valid min/max, precision.
- **Sensor**: physical sensor instance. Mounted to at most one Device at a time via an Installation.
- **Installation**: time-bounded mounting of a Sensor on a Device (`installed_at`, `removed_at nullable`). History of installations is append-only; a Sensor moved from Device A to Device B keeps old rows linked to A.
- **Calibration**: correction (`offset`, `scale`) for a Sensor effective since a given timestamp. Corrections never mutate stored raw values.
- **Reading (raw)**: one `(device_time, device, sensor type)` fact as sent by firmware. Field `raw_value` is exactly the sent `v`, never mutated. Missing sensors in a payload produce no row (not null).
- **Value (calibrated)**: `raw_value` corrected by the Calibration effective at `device_time`. Stored alongside `raw_value`.
- **Quality flag**: verdict on a reading: `ok` | `out_of_range` | `suspect`. Out-of-range readings are kept with flag, never dropped.
- **Rain counter**: cumulative tipping-bucket count from firmware. 1 tip = 0.2 mm. Resets to 0 on device restart. Derived measure is `mm_delta` per reading.
- **Device Time**: timestamp from firmware (`ts`, Unix epoch seconds, UTC). Authority for time-series ordering.
- **Received At**: server timestamp when payload was accepted. Kept for drift/late-data diagnosis, never the series axis.
- **Aggregate**: rollup over readings for an interval (`1h`, `1d`): `avg`/`min`/`max` for gauges, `sum` of `mm_delta` for rain, vector-mean for wind direction.
- **Heartbeat**: device health report without sensor data (`battery_v`, `rssi`, `fw`, `uptime_s`).
- **Online**: device sent any payload within the last 15 minutes. Otherwise `offline`. `offline` does not distinguish dead hardware from lost network.
