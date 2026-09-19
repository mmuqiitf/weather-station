# Weather Station Monitoring Platform

IoT weather-station platform: ingestion → validation → storage → aggregation → dashboard. Take-home test, spec: `Tes Teknis Fullstack Developer - Luwes Inovasi Mandiri.md`.

## Jalankan (satu perintah)

```bash
cp .env.example .env        # isi APP_KEY (php artisan key:generate --show)
docker compose up --build
php artisan migrate --force && php artisan db:seed --force   # di container backend
```

Stack: Laravel 13 + FrankenPHP/Octane (`backend/`), Next.js (`frontend/`), TimescaleDB image (`db`), simulator Python stdlib (`simulator/simulate.py`).
URL: API `http://localhost:8000/api/v1`, frontend `http://localhost:3000`, DB `localhost:5433`.
ERD sumber di `docs/erd.mmd` + alur di `docs/data-flow.mmd` (Mermaid — ter-render otomatis di GitHub; sumber ikut di-commit per §C).
Simulator: `API_URL=... python simulator/simulate.py --mode normal|offline|duplicate` (kunci di `backend/database/seeders/WeatherSeeder.php`).
Tes backend: `DB_HOST=127.0.0.1 DB_PORT=5433 ./vendor/bin/phpunit` (17 tes: ingest, lifecycle, sensor, dedup, kalibrasi).

## Arsitektur singkat

Firmware (buffer+`seq`+`ts` UTC) → HTTP ingest (`device.auth` Bearer sha256, 60/mnt per-device) → validasi skema & rentang (flag, bukan buang) → dedup `UNIQUE(device,time,sensor_type)` + `insertOrIgnore` → enrichment (kalibrasi `effective_at≤device_time`, `mm_delta` rain 0.2mm/tip dengan toleransi restart) → hypertable `sensor_readings` → cagg `1h`/`1d` → query dengan koersi interval + cap 5000 → chart WIB. Detail: `docs/API.md`, `docs/erd.mmd`, `docs/data-flow.mmd`, ADRs `docs/adr/`.

## Keputusan & trade-off

Narrow reading + dual `raw_value`/`value` (imutabel vs terkalibrasi); soft-delete device (histori utuh); HTTP-only tanpa broker (6 tulis/dtk tak butuh antrean); Timescale opsional-defensif (jalan di Postgres biasa); auth dashboard terbuka di lingkup review, produksi Sanctum (lihat `docs/API.md`).

## Asumsi

Seeder 7 hari memakai langkah 5 menit (~42 rb baris; densitas 1/menit dari simulator live). `ts` masa depan diterima (drift tercatat via `received_at`). `device_id` tak dikenal → 401 (tak dibedakan dari kredensial salah). Gap chart = garis putus, rain gap = bar absen.

## Belum selesai / lanjut

SSE/WebSocket realtime (kini polling 60 dtk), MQTT ingest, alert hujan, export CSV, `/metrics` Prometheus, CI lint+test. Langkah: tambah endpoint + langganan SSE per device, rule alert di worker agregat, lalu metrik.

## Waktu

±2 hari kerja: backend & ingest (±8 jam), seeder/simulator/tes (±3 jam), frontend (±4 jam), dokumen (ERD, API, JAWABAN, README) (±3 jam).
