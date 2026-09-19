<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Defensive: works on plain PostgreSQL (Sail dev) and TimescaleDB (reviewer compose).
        // If the extension is unavailable we skip; base tables + indexes still serve traffic.
        $available = DB::selectOne(
            "SELECT 1 AS ok FROM pg_available_extensions WHERE name = 'timescaledb'"
        );

        if ($available === null) {
            return;
        }

        DB::statement('CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE');

        // Timescale requires every unique constraint to include the partitioning column.
        // The scalar PK `sensor_readings_pkey (id)` violates that, so drop it on the
        // Timescale path only (plain Postgres keeps it). `id` keeps its sequence default
        // and stays practically unique; dedup is enforced by uq_reading_device_time_sensor.
        // No FK references sensor_readings.id, so this is safe.
        Schema::table('sensor_readings', function ($table) {
            $table->dropPrimary();
        });

        DB::statement(
            "SELECT create_hypertable('sensor_readings', 'device_time', if_not_exists => TRUE)"
        );

        // Continuous aggregates: hourly + daily. Late/batch data self-heals on refresh.
        DB::unprepared(<<<'SQL'
            CREATE MATERIALIZED VIEW IF NOT EXISTS readings_hourly
            WITH (timescaledb.continuous) AS
            SELECT time_bucket('1 hour', device_time) AS bucket,
                   device_id, sensor_type_id,
                   AVG(value) AS avg_value, MIN(value) AS min_value,
                   MAX(value) AS max_value, SUM(mm_delta) AS sum_value,
                   COUNT(*) AS sample_count
            FROM sensor_readings GROUP BY bucket, device_id, sensor_type_id
            WITH NO DATA;
            SQL);

        DB::unprepared(<<<'SQL'
            CREATE MATERIALIZED VIEW IF NOT EXISTS readings_daily
            WITH (timescaledb.continuous) AS
            SELECT time_bucket('1 day', device_time) AS bucket,
                   device_id, sensor_type_id,
                   AVG(value) AS avg_value, MIN(value) AS min_value,
                   MAX(value) AS max_value, SUM(mm_delta) AS sum_value,
                   COUNT(*) AS sample_count
            FROM sensor_readings GROUP BY bucket, device_id, sensor_type_id
            WITH NO DATA;
            SQL);

        // Refresh + compression + retention policies: best-effort, ignore if already set.
        foreach ([
            "SELECT add_continuous_aggregate_policy('readings_hourly', start_offset => INTERVAL '7 days', end_offset => INTERVAL '2 hours', schedule_interval => INTERVAL '1 hour', if_not_exists => TRUE)",
            "SELECT add_continuous_aggregate_policy('readings_daily', start_offset => INTERVAL '30 days', end_offset => INTERVAL '2 hours', schedule_interval => INTERVAL '1 day', if_not_exists => TRUE)",
            "ALTER TABLE sensor_readings SET (timescaledb.compress, timescaledb.compress_segmentby = 'device_id,sensor_type_id')",
            "SELECT add_compression_policy('sensor_readings', INTERVAL '7 days', if_not_exists => TRUE)",
            "SELECT add_retention_policy('sensor_readings', INTERVAL '365 days', if_not_exists => TRUE)",
        ] as $sql) {
            try {
                DB::statement($sql);
            } catch (Throwable $e) {
                fwrite(STDERR, "Timescale policy skipped: {$e->getMessage()}\n");
            }
        }
    }

    public function down(): void
    {
        DB::statement('DROP MATERIALIZED VIEW IF EXISTS readings_daily');
        DB::statement('DROP MATERIALIZED VIEW IF EXISTS readings_hourly');
    }
};
