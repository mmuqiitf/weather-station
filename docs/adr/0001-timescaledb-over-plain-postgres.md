# TimescaleDB over plain PostgreSQL

Stack is Laravel + FrankenPHP with `timescale/timescale-ha` as the database image. Same Postgres wire protocol and Eloquent driver; hypertable, compression, retention, and continuous aggregates come from one image line. Chosen because the spec awards explicit plus-points (§2, §5-Q2, §6 bonus) and the 184M-rows/year scale needs time-partitioning without hand-rolled cron partitioning.

## Considered Options

- Plain PostgreSQL + manual range partitioning + Laravel cron rollups: portable, but we own partition creation, backfill, and invalidation (~days of tricky code, easy to fail under `EXPLAIN ANALYZE`).
- TimescaleDB: lock-in to one image, refresh-lag staleness (~2h on `1h` buckets), extra bucket storage. Accepted: interview and scale benefits dominate a 3-day build.
