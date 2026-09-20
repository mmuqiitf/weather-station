# API response & error contract (§E.1)

Success is always a Laravel API Resource — single `{data:{…}}`, collection
`{data:[…],links,meta}` — never a hand-built object. Errors are always
`{message,code}` (+ `errors` per-field on 422, `request_id` on every error),
built by typed `render()` callbacks in `bootstrap/app.php` from the
`App\Support\ApiErrorCode` enum; domain failures that need a specific code
throw the single `App\Exceptions\ApiException`. `request_id` is honored inbound
(`X-Request-Id`), stored in `Context` (Octane-safe, feeds logs), and echoed in
the header plus every error body.

## Considered Options

- Custom uniform envelope (e.g. `{success,data,meta}` on everything): maximally
  explicit, but a second dialect on top of Laravel's — violates the repo's
  "Consistency First" rule (use the pattern the codebase already has).
- Laravel defaults with docs only (status quo ante): resources `{data}` but raw
  objects on auth/ingest/readings/overview, `{"message"}` errors with `code`
  bolted on by a `respond` post-processor that re-decodes JSON. Two success
  shapes and a fragile error path.
- Resources everywhere + enum + typed renders (chosen): one success pattern,
  one error policy, domain codes (`device_mismatch`,
  `illegal_lifecycle_transition`, …) without an exception hierarchy. Cost: auth,
  ingest, readings, overview, health, and rotate responses moved under `{data}`,
  so frontend types and the simulator consume `.data` — mechanical, pinned by
  `ResponseShapeTest`.

Pagination stays on Laravel's paginator (`config/api.php` default/max via the
`HasPagination` trait), with a unique `id` tie-breaker after every user sort so
page boundaries are stable. Raw time-series keeps offset (monotonic append-only
`device_time`); aggregates stay server-side with the 5000-point cap
(`config('api.readings.max_points')`, `code: too_many_points`).
