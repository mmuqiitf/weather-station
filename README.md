# Weather Station Monitoring Platform

IoT weather-station platform: ingestion → validation → storage → aggregation → dashboard. Take-home test, spec: `Tes Teknis Fullstack Developer - Luwes Inovasi Mandiri.md`.

## Jalankan (satu perintah)

```bash
cp .env.example .env        # isi APP_KEY (php artisan key:generate --show)
docker compose up --build   # docker-compose.yml: db + backend + frontend
```

Backend melakukan `migrate --force` otomatis saat boot dan seeding awal bila tabel
`devices` masih kosong (`SEED_ON_BOOT=true`, default; set `false` untuk skip).
Tidak ada langkah manual lagi — file compose kanonis tunggal adalah `docker-compose.yml`
(`db` TimescaleDB + `backend` FrankenPHP/Octane + `frontend` Next.js).

> Catatan: port host default stack ini adalah 5434/8080/3000 — sengaja digeser dari
> 5433 agar bisa jalan berdampingan dengan Sail (`backend-pgsql` memakai host 5433).
> Port host bisa dioverride via `APP_PORT` / `FRONTEND_PORT` / `FORWARD_DB_PORT`
> (bila `NEXT_PUBLIC_API_URL` diubah, rebuild frontend: `docker compose up --build`).
> Alur terverifikasi dari volume kosong: `database reachable` → migrasi → seed
> (3 device + histori 7 hari) → `Server running`.
> Frontend berjalan dalam mode dev: source `frontend/` di-mount ke container dan
> dilayani `next dev`, sehingga perubahan file langsung terlihat di
> `http://localhost:3000` tanpa rebuild image.

Stack: Laravel 13 + FrankenPHP/Octane (`backend/`), Next.js (`frontend/`), TimescaleDB image (`db`), simulator Python stdlib (`simulator/simulate.py`).
URL: API `http://localhost:8080/api/v1`, OpenAPI UI `http://localhost:8080/docs/api`
(JSON `http://localhost:8080/docs/api.json`), frontend `http://localhost:3000`, DB `localhost:5434`.
ERD: `docs/erd.mmd` (sumber) + `docs/erd.svg` (gambar) + daftar index di `docs/ERD.md`; alur di `docs/data-flow.mmd` (Mermaid — ter-render otomatis di GitHub; sumber ikut di-commit per §C).
Simulator: `API_URL=... python simulator/simulate.py --all --mode normal|offline|duplicate|heartbeat` (kunci di `backend/database/seeders/WeatherSeeder.php`).
Tes backend: `DB_HOST=127.0.0.1 DB_PORT=5434 ./vendor/bin/phpunit` (41 tes: auth, ingest, lifecycle, sensor, dedup, kalibrasi, pagination, kontrak error `code`, 8 kasus F.3).

## Login dashboard

Semua endpoint management/query memakai Sanctum Bearer token (terpisah dari `api_key` device).
Login di halaman `/login` atau `POST /api/v1/auth/login`. Kredensial demo (seeder):

- email: `admin@weather.local`
- password: `admin123`

## Arsitektur singkat

Firmware (buffer+`seq`+`ts` UTC) → HTTP ingest (`device.auth` Bearer sha256, 60/mnt per-device) → validasi skema & rentang (flag, bukan buang) → dedup `UNIQUE(device,time,sensor_type)` + `insertOrIgnore` → enrichment (kalibrasi `effective_at≤device_time`, `mm_delta` rain 0.2mm/tip dengan toleransi restart) → hypertable `sensor_readings` → cagg `1h`/`1d` → query dengan koersi interval + cap 5000 → chart WIB. Detail: `docs/API.md`, `docs/erd.mmd`, `docs/ERD.md`, `docs/data-flow.mmd`, ADRs `docs/adr/`.

## Keputusan & trade-off

Narrow reading + dual `raw_value`/`value` (imutabel vs terkalibrasi); soft-delete device (histori utuh); HTTP-only tanpa broker (6 tulis/dtk tak butuh antrean); Timescale opsional-defensif (jalan di Postgres biasa); auth ganda — device Bearer `api_key` jangka panjang vs user Sanctum berekspirasi (permukaan risiko & siklus hidup berbeda, lihat `docs/API.md`).

## Asumsi & deviasi sadar

- Seeder 7 hari memakai langkah **5 menit** (~42 rb baris), bukan 1/menit (~184 jt/tahun pada skala 50 device). Alasan: seed 1/menit untuk review tidak praktis (lambat, berat); chart 7 hari tetap penuh dan rapat pada densitas ini. Densitas 1/menit diwakili simulator live + perhitungan skala di `JAWABAN.md` §C.
- `ts` masa depan diterima (drift tercatat via `received_at`). `device_id` tak dikenal → 401 tanpa membedakan dari kredensial salah (disengaja, anti-enumerasi).
- Gap chart = garis putus, rain gap = bar absen. Wind rose memakai agregat `wind_dir` vector-mean per bucket.
- Semua endpoint list dipaginasi (device, sensor, sensor-type, calibration, location) via paginator default `?page&per_page` → `{data,links,meta}`.
- Format response memakai **default Laravel**, bukan envelope kustom seperti disarankan §E.1: resource → `{data}` (+`links`/`meta` paginator),
  endpoint lain objek mentah, `request_id` hanya di header `X-Request-Id`. Alasan: konsistensi dengan konvensi framework
  (terdokumentasi, langsung dikenal tooling/client).
- Setiap error punya `code` machine-readable yang stabil per §E.1 (`{"message","code"}`, plus `errors` per-field untuk validasi 422):
  mis. `validation_failed`, `unauthenticated`, `forbidden`, `not_found`, `conflict`, `unprocessable_entity`, `rate_limited`.
  Klien bercabang dari `code`, bukan `message`.

## Belum selesai / lanjut

SSE/WebSocket realtime (kini polling 60 dtk), MQTT ingest, alert hujan, export CSV, `/metrics` Prometheus, CI lint+test. Langkah: tambah endpoint + langganan SSE per device, rule alert di worker agregat, lalu metrik.
