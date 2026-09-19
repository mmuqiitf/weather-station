<?php

use App\Http\Middleware\AssignRequestId;
use App\Http\Middleware\AuthenticateDevice;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->append(AssignRequestId::class);
        $middleware->alias(['device.auth' => AuthenticateDevice::class]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
        // Keep the standard envelope + machine-readable code for dashboard auth failures.
        $exceptions->render(function (Illuminate\Auth\AuthenticationException $e, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            return response()->json([
                'data' => null,
                'error' => ['code' => 'user_unauthenticated', 'message' => 'Dashboard login required.'],
                'meta' => ['request_id' => $request->attributes->get('request_id')],
            ], 401);
        });
    })->create();
