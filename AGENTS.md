# Weather Station — agent notes

IoT weather platform: firmware → HTTP ingest → validation → Postgres/TimescaleDB → Next.js dashboard.
Spec: `Tes Teknis Fullstack Developer - Luwes Inovasi Mandiri.md`. Glossary: `CONTEXT.md`. Decisions: `docs/adr/` (4 files).

## Run it (only supported path)

```bash
cp .env.example .env        # fill APP_KEY via: php artisan key:generate --show (run in backend/)
docker compose up --build   # from repo root; services: db + backend + frontend
```

- Canonical compose is root `docker-compose.yml` only. `backend/compose.yaml`, `backend/.env(.example)`,
  and the Sail/`vendor/bin/sail` guidance in `backend/AGENTS.md` are stale leftovers — do not use.
- Ports (host): DB `5434` / API `8080` / frontend `3000`, deliberately shifted from Sail's `5433`.
  Override via `FORWARD_DB_PORT` / `APP_PORT` / `FRONTEND_PORT` in root `.env`.
- Backend entrypoint (`backend/docker-entrypoint.sh`) auto-runs `migrate --force` and seeds only when
  `devices` is empty (`SEED_ON_BOOT`, default `true`; set `false` to skip).
- Frontend runs `next dev` with `./frontend` bind-mounted: edits hot-reload, no rebuild.
  Exception: changing `NEXT_PUBLIC_API_URL` is build-time → requires `docker compose up --build`.
- Backend runs Octane/FrankenPHP (long-lived process): never keep request state in singletons/statics;
  restart the `backend` container to pick up PHP changes.

## Endpoints & auth (two systems, do not mix)

- API base `http://localhost:8080/api/v1`; OpenAPI UI `/docs/api`, JSON `/docs/api.json`. Routes: `backend/routes/api.php`.
- Devices → `device.auth` Bearer raw `api_key` (stored sha256), throttled `60/min` per device.
  Unknown `device_id` returns 401 identical to bad key (anti-enumeration, intentional).
- Humans → Sanctum Bearer from `POST /api/v1/auth/login` (demo `admin@weather.local` / `admin123`,
  seeded). Frontend stores it as `ws_token` in localStorage; any `401` → redirect `/login`.
- Responses are Laravel defaults, not a custom envelope: resources → `{data}` (+`links`/`meta` when
  paginated), other endpoints return raw objects, errors are `{"message"}` (`{"message","errors"}`
  for 422). `request_id` lives only in the `X-Request-Id` header. Full contract: `docs/API.md`.
- Device keys for simulator live in `backend/database/seeders/WeatherSeeder.php`
  (`WS-GRT-001`, `WS-BDG-002`, `WS-BGR-003`).

## Tests & verification

- Backend (from `backend/`, needs stack up — hits live Postgres on host port 5434):
  `DB_HOST=127.0.0.1 DB_PORT=5434 DB_USERNAME=weather DB_PASSWORD=secret ./vendor/bin/phpunit`
  (~20 tests: auth, ingest, lifecycle, dedup, calibration). Credentials must override `backend/.env`
  (stale Sail `sail`/`password`), matching root `.env` instead.
  Narrow with file path or `--filter=`. Tests use `RefreshDatabase`; phpunit.xml sets `DB_DATABASE=testing`.
- Frontend (from `frontend/`): `npm run lint`, `npm run typecheck` (`tsc --noEmit`), `npm run build`.
  Format: prettier + tailwind plugin (`npm run format`).
- Simulator (stdlib only, no deps): `API_URL=... python simulator/simulate.py --all --mode normal|offline|duplicate|heartbeat`.

## Data rules that surprise

- Narrow readings, one row per `(device, time, sensor_type)` with `UNIQUE` + `insertOrIgnore` dedup —
  retries/duplicates are idempotent by design.
- `raw_value` is immutable (exact firmware `v`); `value` is calibrated (`offset`/`scale` with
  `effective_at ≤ device_time`). Never mutate raw.
- Out-of-range readings are kept with `quality_flag` (`ok`|`out_of_range`|`suspect`), never dropped.
- Rain: cumulative `rain_counter`, 1 tip = 0.2 mm, resets to 0 on restart; derived `mm_delta` tolerates restarts.
- `ts` (firmware, UTC epoch) is the series axis; `received_at` is diagnostic only. Future `ts` accepted.
- Query shape: interval coercion + hard cap 5000 rows; rollups via `1h`/`1d` continuous aggregates
  (avg/min/max gauges, sum rain, vector-mean wind dir). Timescale calls are defensive — runs on plain Postgres.
- Device soft-delete (history intact); `online` = payload within 15 min. `GET /sensor-types`,
  `GET /locations` unpaginated (small); all other lists paginated.

## Agent skills

### Issue tracker

Issues live in GitHub Issues. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: root `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.
Use glossary terms verbatim; flag output that contradicts an ADR.
