<?php

use App\Http\Controllers\Api\V1\IngestController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {
    Route::middleware(['device.auth', 'throttle:ingest'])->group(function () {
        Route::post('ingest/telemetry', [IngestController::class, 'telemetry']);
        Route::post('ingest/telemetry/batch', [IngestController::class, 'batch']);
        Route::post('ingest/heartbeat', [IngestController::class, 'heartbeat']);
    });
});
