<?php

use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\DashboardController;
use App\Http\Controllers\Api\V1\DeviceController;
use App\Http\Controllers\Api\V1\IngestController;
use App\Http\Controllers\Api\V1\ReadingController;
use App\Http\Controllers\Api\V1\SensorController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {
    // Dashboard auth (human users, Sanctum bearer tokens).
    Route::post('auth/login', [AuthController::class, 'login']);

    // Ingestion (device auth + per-device rate limit).
    Route::middleware(['device.auth', 'throttle:ingest'])->group(function () {
        Route::post('ingest/telemetry', [IngestController::class, 'telemetry']);
        Route::post('ingest/telemetry/batch', [IngestController::class, 'batch']);
        Route::post('ingest/heartbeat', [IngestController::class, 'heartbeat']);
    });

    // Everything below requires a dashboard user token.
    // Device ingestion is intentionally separate (device.auth Bearer api_key).
    Route::middleware('auth:sanctum')->group(function () {
        Route::get('auth/me', [AuthController::class, 'me']);
        Route::post('auth/logout', [AuthController::class, 'logout']);

        // Device management.
        Route::get('locations', [DeviceController::class, 'indexLocations']);
        Route::post('devices', [DeviceController::class, 'store']);
        Route::get('devices', [DeviceController::class, 'index']);
        Route::get('devices/{id}', [DeviceController::class, 'show']);
        Route::patch('devices/{id}', [DeviceController::class, 'update']);
        Route::delete('devices/{id}', [DeviceController::class, 'destroy']);
        Route::post('devices/{id}/credentials/rotate', [DeviceController::class, 'rotate']);
        Route::get('devices/{id}/health', [DeviceController::class, 'health']);

        // Sensor management.
        Route::get('sensor-types', [SensorController::class, 'indexTypes']);
        Route::post('sensor-types', [SensorController::class, 'storeType']);
        Route::get('sensor-types/{id}', [SensorController::class, 'showType']);
        Route::patch('sensor-types/{id}', [SensorController::class, 'updateType']);
        Route::delete('sensor-types/{id}', [SensorController::class, 'destroyType']);
        Route::get('sensors', [SensorController::class, 'index']);
        Route::post('sensors', [SensorController::class, 'store']);
        Route::patch('sensors/{id}', [SensorController::class, 'update']);
        Route::delete('sensors/{id}', [SensorController::class, 'destroy']);
        Route::post('devices/{id}/sensors', [SensorController::class, 'attach']);
        Route::delete('devices/{id}/sensors/{sensorId}', [SensorController::class, 'detach']);
        Route::post('sensors/{id}/calibrations', [SensorController::class, 'storeCalibration']);
        Route::get('sensors/{id}/calibrations', [SensorController::class, 'indexCalibrations']);

        // Query data (frontend).
        Route::get('devices/{id}/readings/latest', [ReadingController::class, 'latest']);
        Route::get('readings', [ReadingController::class, 'index']);
        Route::get('readings/summary', [ReadingController::class, 'summary']);
        Route::get('dashboard/overview', [DashboardController::class, 'overview']);
    });
});
