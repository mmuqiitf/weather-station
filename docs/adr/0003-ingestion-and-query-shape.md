# HTTP-only ingestion, continuous aggregates, per-device rate limit, server-coerced intervals

Ingestion is HTTP-only (single + batch + heartbeat); no MQTT/broker in the 3-day scope — 50 devices × 1/min (~6 writes/sec) needs no queue, and `docker compose up` stays db + backend + frontend. `GET /readings` coerces `interval` up by range (raw ≤ 24h, `1m` ≤ 7d, `1h` ≤ 90d, else `1d`) with a 5000-point cap, reporting `meta.interval_applied`. `1h`/`1d` served from continuous aggregates (2h refresh lag, late batches self-heal); raw hypertable serves `raw`/`1m`. Ingestion rate-limited per authenticated device (60/min, `429 {code: rate_limited}`). Charts render gaps as broken lines, rain gaps as absent bars — never zero or interpolation.

## Considered Options

- MQTT + worker from day one: bonus points but doubles failure modes and compose services for traffic a single PHP worker absorbs.
- Laravel-cron rollups: portable yet we own late-data invalidation; rejected after grilling (see Q9).
- Per-IP rate limit: devices behind shared NAT collide; per-device is fair.
