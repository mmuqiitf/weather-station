#!/bin/sh
set -e

# Wait for Postgres to accept connections (max ~60s).
# NOTE: plain TCP probe — `php artisan db:show` returns non-zero here before
# the app boots (no cached config yet), so it must NOT be used as the probe.
echo "[entrypoint] waiting for database ${DB_HOST:-db}:${DB_PORT:-5432}..."
for i in $(seq 1 30); do
  if php -r "exit(@fsockopen('${DB_HOST:-db}', ${DB_PORT:-5432}) ? 0 : 1);" > /dev/null 2>&1; then
    echo "[entrypoint] database reachable."
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "[entrypoint] WARNING: database not reachable after 60s, continuing anyway."
  fi
  sleep 2
done

echo "[entrypoint] running migrations..."
php artisan migrate --force

if [ "${SEED_ON_BOOT:-true}" = "true" ]; then
  NEED_SEED=$(php artisan tinker --execute='echo((int) (\Schema::hasTable("devices") ? \App\Models\Device::query()->count() : 1));' 2>/dev/null | tail -n 1 | tr -cd '0-9')
  if [ -z "$NEED_SEED" ]; then NEED_SEED=1; fi
  if [ "$NEED_SEED" -eq 0 ]; then
    echo "[entrypoint] empty database detected, seeding (demo user + 3 devices + 7-day history)..."
    php artisan db:seed --force
  else
    echo "[entrypoint] database already seeded (${NEED_SEED} devices), skipping seeder."
  fi
else
  echo "[entrypoint] SEED_ON_BOOT=false, skipping seeder."
fi

echo "[entrypoint] starting: $*"
exec "$@"
