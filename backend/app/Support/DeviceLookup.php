<?php

namespace App\Support;

use App\Models\Device;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * Devices are addressed by human `device_id` (WS-GRT-001) or numeric PK.
 */
final class DeviceLookup
{
    public static function findOrFail(string $id): Device
    {
        $query = Device::query()->where('device_id', $id);

        // Postgres bigint rejects non-numeric bindings — only match PK when numeric.
        if (is_numeric($id)) {
            $query->orWhere('id', (int) $id);
        }

        return $query->first() ?? throw new NotFoundHttpException('Device not found.');
    }
}
