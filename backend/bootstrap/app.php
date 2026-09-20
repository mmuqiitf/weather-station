<?php

use App\Http\Middleware\AssignRequestId;
use App\Http\Middleware\AuthenticateDevice;
use App\Http\Middleware\ForceJsonResponse;
use App\Support\ApiErrorCode;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response as SymfonyResponse;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->append(ForceJsonResponse::class);
        $middleware->append(AssignRequestId::class);
        $middleware->alias(['device.auth' => AuthenticateDevice::class]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );

        // Every API error carries a stable, machine-readable `code` (§E.1).
        $exceptions->respond(function (SymfonyResponse $response, Throwable $e, Request $request): SymfonyResponse {
            if ($response->getStatusCode() < 400 || ! ($request->is('api/*') || $request->expectsJson())) {
                return $response;
            }

            if (! str_contains((string) $response->headers->get('Content-Type'), 'json')) {
                return $response;
            }

            $body = json_decode((string) $response->getContent(), true);

            if (! is_array($body) || array_key_exists('code', $body)) {
                return $response;
            }

            $body['code'] = ApiErrorCode::forStatus($response->getStatusCode(), ! empty($body['errors']));

            if ($response instanceof JsonResponse) {
                $response->setData($body);
            } else {
                $response->setContent(json_encode($body));
                $response->headers->set('Content-Type', 'application/json');
            }

            return $response;
        });
    })->create();
