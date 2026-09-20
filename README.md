# Weather Station Monitoring Platform

Platform monitoring stasiun cuaca (IoT) untuk menerima, memvalidasi, menyimpan, mengagregasi, dan menampilkan data sensor. Ini hasil tes take-home; spesifikasi aslinya ada di `Tes Teknis Fullstack Developer - Luwes Inovasi Mandiri.md`.

## Menjalankan (satu perintah)

```bash
cp .env.example .env        # isi APP_KEY dengan: php artisan key:generate --show
docker compose up --build   # docker-compose.yml: db + backend + frontend
```

Saat boot, backend otomatis menjalankan `migrate --force` dan melakukan seeding awal bila tabel `devices` masih kosong (`SEED_ON_BOOT=true`, default; ubah ke `false` kalau tidak ingin di-seed). Tidak ada langkah manual lain — file compose kanonis hanya `docker-compose.yml`, berisi `db` (TimescaleDB), `backend` (FrankenPHP/Octane), dan `frontend` (Next.js).

> Catatan: port host default stack ini 5434/8080/3000, sengaja digeser dari 5433 supaya bisa berjalan berdampingan dengan Sail (`backend-pgsql` memakai host 5433). Port bisa diubah lewat `APP_PORT` / `FRONTEND_PORT` / `FORWARD_DB_PORT`; perlu diingat, kalau `NEXT_PUBLIC_API_URL` diubah, frontend harus di-rebuild (`docker compose up --build`). Alur sudah diuji dari volume kosong: `database reachable` → migrasi → seed (3 device + histori 7 hari) → `Server running`. Frontend berjalan dalam mode dev, source `frontend/` di-mount ke container dan dilayani `next dev`, jadi setiap perubahan file langsung terlihat di `http://localhost:3000` tanpa perlu rebuild image.

Stack: Laravel 13 + FrankenPHP/Octane (`backend/`), Next.js (`frontend/`), image TimescaleDB (`db`), dan simulator Python tanpa dependensi (`simulator/simulate.py`).
URL: API `http://localhost:8080/api/v1`, OpenAPI UI `http://localhost:8080/docs/api` (JSON `http://localhost:8080/docs/api.json`), frontend `http://localhost:3000`, DB `localhost:5434`.
ERD: sumber `docs/erd.mmd`, gambar `docs/erd.svg`, dan daftar index di `docs/ERD.md`; alur data di `docs/data-flow.mmd` (Mermaid yang ter-render otomatis di GitHub, sumbernya ikut di-commit sesuai §C).
Simulator: `API_URL=... python simulator/simulate.py --all --mode normal|offline|duplicate|heartbeat` (kunci ada di `backend/database/seeders/WeatherSeeder.php`).
Tes backend: `DB_HOST=127.0.0.1 DB_PORT=5434 ./vendor/bin/phpunit` (52 tes: auth, ingest, lifecycle, sensor, dedup, kalibrasi, pagination, kontrak error `code` + `request_id`, bentuk `{data}`, 8 kasus F.3, dan agregasi series).

## Login dashboard

Semua endpoint management/query memakai Sanctum Bearer token, terpisah dari `api_key` milik device. Login lewat halaman `/login` atau `POST /api/v1/auth/login`. Kredensial demo dari seeder:

- email: `admin@weather.local`
- password: `admin123`

## Arsitektur singkat

Firmware (buffer + `seq` + `ts` UTC) → HTTP ingest (`device.auth` Bearer sha256, 60 permintaan/menit per device) → validasi skema dan rentang (ditandai, bukan dibuang) → dedup `UNIQUE(device,time,sensor_type)` + `insertOrIgnore` → enrichment (kalibrasi `effective_at ≤ device_time`, `mm_delta` hujan 0,2 mm/tip dengan toleransi restart) → hypertable `sensor_readings` → cagg `1h`/`1d` → query dengan koersi interval + batas 5000 titik → chart dalam WIB. Detailnya ada di `docs/API.md`, `docs/erd.mmd`, `docs/ERD.md`, `docs/data-flow.mmd`, dan `docs/adr/`.

## Keputusan & trade-off

Pembacaan disimpan narrow dengan dua nilai: `raw_value` (imutabel, persis dari firmware) dan `value` (hasil kalibrasi); device memakai soft delete agar histori tetap utuh; ingestion murni HTTP tanpa broker karena 6 penulisan per detik masih ringan; Timescale bersifat opsional-defensif sehingga aplikasi tetap jalan di Postgres biasa; dan autentikasi dipisah menjadi device (Bearer `api_key` berumur panjang) serta user dashboard (Sanctum yang bisa kedaluwarsa) karena permukaan risiko dan siklus hidup keduanya berbeda — lihat `docs/API.md`.

## Asumsi & deviasi sadar

- Seeder 7 hari memakai langkah **5 menit** (~42 ribu baris), bukan 1 menit (~184 juta baris/tahun pada skala 50 device). Alasannya, seed 1 menit untuk keperluan review tidak praktis karena lambat dan berat, sementara chart 7 hari tetap terisi rapat pada densitas ini. Densitas 1 menit diwakili simulator live, dan perhitungan skalanya ada di `JAWABAN.md` §C.
- `ts` dari masa depan tetap diterima dan drift-nya dicatat lewat `received_at`. `device_id` yang tidak dikenal dijawab 401 tanpa dibedakan dari kredensial salah — ini disengaja untuk mencegah enumerasi.
- Gap pada chart digambar sebagai garis putus, sedangkan gap hujan sebagai bar yang absen. Wind rose memakai agregat vector-mean `wind_dir` per bucket.
- Semua endpoint list dipaginasi (device, sensor, sensor-type, calibration, location) memakai paginator default `?page&per_page` → `{data,links,meta}`. Kebijakannya terpusat di `config/api.php` lewat trait `HasPagination`, dan setiap sort dari user diberi tie-breaker `id` agar urutannya stabil.
- Format response mengikuti **default Laravel** sesuai §E.1 — semua respons sukses adalah API Resource: tunggal `{data}`, koleksi `{data,links,meta}` (termasuk auth/ingest/readings/overview/health). Alasannya, cukup satu pola bawaan framework daripada menambah envelope kustom kedua; lihat `docs/adr/0005-*`.
- Setiap error punya `code` machine-readable yang stabil dari enum `App\Support\ApiErrorCode` (`{"message","code"}` + `request_id`, ditambah `errors` per-field untuk validasi 422). Kodenya mencakup transport (`validation_failed`, `unauthenticated`, `forbidden`, `not_found`, `conflict`, `unprocessable_entity`, `rate_limited`, …) dan domain (`device_mismatch`, `illegal_lifecycle_transition`, `sensor_type_in_use`, `sensor_mounted`, `sensor_attached_elsewhere`, `unknown_sensor_type`, `too_many_points`). Klien sebaiknya bercabang dari `code`, bukan `message`; khusus 429, responsnya menyertakan header `Retry-After`.
- `request_id` adalah UUID per request. Kalau klien mengirim `X-Request-Id` yang valid, nilai itu yang dipakai; kalau tidak, server membuat sendiri. Nilainya disimpan di `Context` (aman untuk Octane dan ikut masuk ke log), lalu dikembalikan di header dan di body setiap error.

## Estimasi waktu

Total sekitar **18–22 jam efektif** dalam ±2 hari (commit history membentang 19–20 September 2026). Perkiraan pembagiannya:

- Membaca spesifikasi, desain skema/ERD, migrasi, dan seeder: ±4 jam
- Backend ingestion + enrichment + API + kontrak error: ±6 jam
- Test backend (F.3, dedup, kalibrasi, pagination, kontrak): ±3 jam
- Frontend dashboard (overview, detail, chart, manajemen): ±5 jam
- Docker, simulator, dokumentasi, dan perbaikan akhir: ±3 jam

## Belum selesai / rencana lanjutan

Yang belum dikerjakan: update realtime via SSE/WebSocket (sekarang masih polling 60 detik), ingestion MQTT, sistem alert hujan, ekspor CSV, endpoint `/metrics` Prometheus, serta CI lint + test. Rencananya, menambah endpoint dan langganan SSE per device lebih dulu, lalu rule alert di worker agregat, baru terakhir metrik.
