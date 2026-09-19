# ERD — Weather Station Platform

Sumber: `docs/erd.mmd` (Mermaid, ikut di-commit). Gambar: `docs/erd.svg`
(di-render dari sumber via `npx @mermaid-js/mermaid-cli -i docs/erd.mmd -o docs/erd.svg`).
Kardinalitas memakai notasi Mermaid (`||--o{` = 1–N, dll.) dan tercantum di sumber.

## Index — alasan tiap index (query yang dilayani)

| Tabel | Index / unique | Melayani query |
|---|---|---|
| `devices` | `UNIQUE(device_id)` | Lookup ingest & `GET /devices/{id}` via `device_id` (`WS-GRT-001`) |
| `devices` | `UNIQUE(api_key_hash)` | `device.auth` mencari device via `where api_key_hash = sha256(bearer)` tiap request ingest |
| `devices` | `INDEX(status, location_id)` | `GET /devices?status=&location_id=` — filter equality sebelum paginasi |
| `device_heartbeats` | `INDEX(device_id, device_time)` | `GET /devices/{id}/health` — heartbeat terbaru per device (`latest(device_time)`) |
| `sensor_types` | `UNIQUE(code)` | Ingest memetakan `readings[].s` (`temp_air`, …) ke `sensor_type_id` |
| `sensors` | `UNIQUE(serial)` | Identitas unit fisik; cegah duplikat serial |
| `sensor_installations` | `INDEX(device_id, installed_at)` | `sensorIdAt(device_time)`: instalasi yang berlaku pada waktu pengukuran |
| `sensor_installations` | `INDEX(sensor_id, installed_at)` | Riwayat per sensor + deteksi "masih terpasang" (409 saat attach ganda) |
| `sensor_calibrations` | `INDEX(sensor_id, effective_at)` | Kalibrasi yang berlaku pada `device_time` (`effective_at ≤ device_time`, terbaru) |
| `sensor_readings` | `UNIQUE(device_id, device_time, sensor_type_id)` | Idempotensi: `insertOrIgnore` / `ON CONFLICT DO NOTHING` + syarat Timescale (unique harus memuat kolom partisi `device_time`) |
| `sensor_readings` | `INDEX(device_id, sensor_type_id, device_time)` | Query time-series per sensor; kolom equality (`device`, `type`) dulu, rentang (`time`) terakhir agar B-tree memangkas tepat sebelum memindai waktu |
| `reading_aggregates` | `UNIQUE(device_id, sensor_type_id, interval, bucket)` + index sama | Upsert agregat fallback Postgres + baca `1h`/`1d` per sensor |

Urutan kolom penting: B-tree hanya memakai prefix dari kiri. Kolom yang selalu
di-filter dengan `=` (`device_id`, `sensor_type_id`) ditaruh depan; kolom rentang
(`device_time`, `bucket`) paling belakang. Detail perhitungan skala & strategi
partisi: `JAWABAN.md` §C dan esai #5.
