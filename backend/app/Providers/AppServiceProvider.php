<?php

namespace App\Providers;

use App\Models\Device;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        RateLimiter::for('ingest', function (Request $request) {
            $device = $request->attributes->get('device');

            return Limit::perMinute(60)->by(
                $device instanceof Device ? 'device:'.$device->id : $request->ip()
            )->response(function () use ($request) {
                return response()->json([
                    'data' => null,
                    'error' => ['code' => 'rate_limited', 'message' => 'Too many ingestion requests.'],
                    'meta' => ['request_id' => $request->attributes->get('request_id')],
                ], 429);
            });
        });
    }
}
