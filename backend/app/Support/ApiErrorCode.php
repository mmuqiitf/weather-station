<?php

namespace App\Support;

/**
 * Stable, machine-readable error codes (§E.1). Clients branch on `code`,
 * never on the human `message`, which may change or be translated.
 */
final class ApiErrorCode
{
    /**
     * @param  bool  $hasFieldErrors  true when the body carries a per-field `errors` object.
     */
    public static function forStatus(int $status, bool $hasFieldErrors = false): string
    {
        return match ($status) {
            400 => 'bad_request',
            401 => 'unauthenticated',
            403 => 'forbidden',
            404 => 'not_found',
            405 => 'method_not_allowed',
            409 => 'conflict',
            419 => 'token_mismatch',
            422 => $hasFieldErrors ? 'validation_failed' : 'unprocessable_entity',
            429 => 'rate_limited',
            500 => 'server_error',
            503 => 'service_unavailable',
            default => 'http_'.$status,
        };
    }
}
