<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('locations', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->decimal('latitude', 10, 7);
            $table->decimal('longitude', 10, 7);
            $table->decimal('altitude_m', 8, 2)->nullable();
            $table->timestamps();
        });

        Schema::create('devices', function (Blueprint $table) {
            $table->id();
            $table->string('device_id')->unique();
            $table->string('name');
            $table->foreignId('location_id')->nullable()->constrained()->nullOnDelete();
            $table->string('status')->default('provisioned');
            $table->string('api_key_hash', 64)->unique();
            $table->string('firmware_version')->nullable();
            $table->timestamp('last_seen_at')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->index(['status', 'location_id']);
        });

        Schema::create('device_heartbeats', function (Blueprint $table) {
            $table->id();
            $table->foreignId('device_id')->constrained()->cascadeOnDelete();
            $table->timestamp('device_time');
            $table->timestamp('received_at');
            $table->string('firmware_version')->nullable();
            $table->decimal('battery_v', 5, 2)->nullable();
            $table->integer('rssi')->nullable();
            $table->bigInteger('uptime_s')->nullable();
            $table->timestamps();
            $table->index(['device_id', 'device_time']);
        });

        Schema::create('sensor_types', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();
            $table->string('unit');
            $table->decimal('min_value', 12, 4)->nullable();
            $table->decimal('max_value', 12, 4)->nullable();
            $table->unsignedTinyInteger('precision')->default(2);
            $table->timestamps();
        });

        Schema::create('sensors', function (Blueprint $table) {
            $table->id();
            $table->string('serial')->unique();
            $table->foreignId('sensor_type_id')->constrained()->restrictOnDelete();
            $table->timestamps();
        });

        Schema::create('sensor_installations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sensor_id')->constrained()->cascadeOnDelete();
            $table->foreignId('device_id')->constrained()->cascadeOnDelete();
            $table->timestamp('installed_at');
            $table->timestamp('removed_at')->nullable();
            $table->timestamps();
            $table->index(['device_id', 'installed_at']);
            $table->index(['sensor_id', 'installed_at']);
        });

        Schema::create('sensor_calibrations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sensor_id')->constrained()->cascadeOnDelete();
            $table->decimal('offset', 12, 4)->default(0);
            $table->decimal('scale', 12, 6)->default(1);
            $table->timestamp('effective_at');
            $table->timestamps();
            $table->index(['sensor_id', 'effective_at']);
        });

        Schema::create('sensor_readings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('device_id')->constrained()->cascadeOnDelete();
            $table->foreignId('sensor_type_id')->constrained()->restrictOnDelete();
            $table->foreignId('sensor_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamp('device_time');
            $table->timestamp('received_at');
            $table->decimal('raw_value', 14, 4);
            $table->decimal('value', 14, 4);
            $table->decimal('mm_delta', 12, 4)->nullable();
            $table->string('quality', 16)->default('ok');
            $table->timestamps();
            $table->unique(['device_id', 'device_time', 'sensor_type_id'], 'uq_reading_device_time_sensor');
            $table->index(['device_id', 'sensor_type_id', 'device_time'], 'ix_reading_device_sensor_time');
        });

        Schema::create('reading_aggregates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('device_id')->constrained()->cascadeOnDelete();
            $table->foreignId('sensor_type_id')->constrained()->restrictOnDelete();
            $table->string('interval', 8);
            $table->timestamp('bucket');
            $table->decimal('avg_value', 14, 4)->nullable();
            $table->decimal('min_value', 14, 4)->nullable();
            $table->decimal('max_value', 14, 4)->nullable();
            $table->decimal('sum_value', 16, 4)->nullable();
            $table->unsignedInteger('sample_count')->default(0);
            $table->timestamps();
            $table->unique(['device_id', 'sensor_type_id', 'interval', 'bucket'], 'uq_agg_device_sensor_interval_bucket');
            $table->index(['device_id', 'sensor_type_id', 'interval', 'bucket'], 'ix_agg_device_sensor_interval_bucket');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('reading_aggregates');
        Schema::dropIfExists('sensor_readings');
        Schema::dropIfExists('sensor_calibrations');
        Schema::dropIfExists('sensor_installations');
        Schema::dropIfExists('sensors');
        Schema::dropIfExists('sensor_types');
        Schema::dropIfExists('device_heartbeats');
        Schema::dropIfExists('devices');
        Schema::dropIfExists('locations');
    }
};
