<?php

namespace App\Providers;

use App\Models\Device;
use App\Models\User;
use App\Support\ApiErrorCode;
use Dedoc\Scramble\Scramble;
use Dedoc\Scramble\Support\Generator\OpenApi;
use Dedoc\Scramble\Support\Generator\SecurityScheme;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
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
        Gate::define('viewApiDocs', fn (?User $user) => true);

        Scramble::configure()
            ->withDocumentTransformers(function (OpenApi $openApi): void {
                $openApi->secure(SecurityScheme::http('bearer'));
            });
        RateLimiter::for('ingest', function (Request $request) {
            $device = $request->attributes->get('device');

            return Limit::perMinute(60)->by(
                $device instanceof Device ? 'device:'.$device->id : $request->ip()
            )->response(function (Request $request, array $headers) {
                return response()->json([
                    'message' => 'Too many ingestion requests.',
                    'code' => ApiErrorCode::RateLimited->value,
                ], 429, $headers);
            });
        });
    }
}
