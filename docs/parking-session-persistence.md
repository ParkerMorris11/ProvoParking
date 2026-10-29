# P7: Parking session persistence

## Scope and approach

Target Supabase project: **provo-parking**, reference **rikekjksneoymybnehpo**. Do not apply this migration to another project. This feature reuses Supabase PostgreSQL, RLS, and the existing supabase-js client; it adds no database provider, application framework, runtime dependency, map, notifications, or production login UI.

The legacy `parking_session` table belongs to the shared integer demo-user model. P7 adds `public.owned_parking_session` rather than changing that model, its data, or its policies. P5/P6 and their localStorage flow remain unchanged. The standalone persistence service has no imports from those pages or global application state. This branch starts from main and is independent of the unmerged P5/P6 branches.

At inspection, the target project had zero Auth users. The new service requires a verified Supabase user session. It does not silently use `DEMO_USER_ID`, create a user, enable anonymous sign-in, or add a development login to production. A future authentication feature must sign users in before connecting P5/P6 to this service.

## Data model

| Field | Meaning |
|---|---|
| `id` | Server-generated UUID session identifier |
| `owner_id` | Verified `auth.uid()`, referencing the existing `auth.users` system table |
| `location_id` | Optional text ID from a future parking/map source |
| `location_name` | Required location snapshot, 1–160 characters |
| `latitude`, `longitude` | Both valid numbers or both absent |
| `is_sample` | Whether the supplied parking location is sample data |
| `started_at`, `expires_at` | Server-generated `timestamptz`; expiration equals start plus duration |
| `duration_minutes` | 30–720 minutes in 30-minute increments |
| `reminder_minutes_before` | 0, 5, 10, 15, or 30; strictly shorter than duration |
| `notes` | Optional trimmed text, maximum 200 characters |
| `status` | `active` or `completed` |
| `created_at`, `completed_at` | Server creation/completion timestamps; completion absent while active |

All timestamps represent UTC instants and the JavaScript service returns ISO strings ending in `Z`. No client timestamp or owner ID is accepted. One partial unique index enforces at most one active session per owner, including under racing requests. A second owner/creation index supports owner lookups and the ownership foreign key.

Expiration is a calculated timer state, not automatic completion. An unended session remains retrievable after its scheduled expiration, with zero remaining time and an `expired` phase. The user must end it before creating another session. Ending is idempotent and never changes a previously recorded completion timestamp; completed sessions cannot be reopened or returned as active.

## Database setup

The CLI-generated, additive migration is:

`supabase/migrations/20261029224555_parking_session_persistence.sql`

Review it, verify the exact target project, and apply the whole transaction using the project's SQL Editor or the team's authenticated migration workflow. It creates only the P7 table, indexes, policies, trigger, and three RPC functions. Reapplying it is safe and covered by tests. It does not edit legacy migrations, tables, session rows, Auth settings, project/account settings, credentials, or any other project. Do not run `schema.sql` against an existing project. Do not upload the local test fixture.

If applying directly in SQL Editor, schema application and CLI migration-history tracking are separate operations. Record the actual rollout and reconcile that migration version using the team's normal migration workflow; do not assume an editor execution added a history entry. Keep this feature PR unmerged until an explicit future merge decision.

The browser uses its existing publishable/anon project key plus a real user's access token. A publishable key alone does not authorize session access. Never use a service-role/secret key in a browser or commit credentials. This feature does not require creating or rotating any credentials.

## Service interface

```js
import { createParkingSessionService } from "./js/data/parking-session-service.js";
import { getSessionTiming } from "./js/domain/session-contract.js";

// Existing Supabase client, after genuine user authentication.
const sessions = createParkingSessionService(supabaseClient);

const saved = await sessions.createSession({
  location: {
    id: "garage-42", // optional; convert numeric IDs with String(id)
    name: "Selected garage",
    coordinates: { latitude: 40.2338, longitude: -111.6585 }, // optional pair
    isSample: false,
  },
  durationMinutes: 120,
  reminderMinutesBefore: 10, // default 10; 0 means none
  notes: "Level 3, Row C, near elevator.", // optional, default empty
});

// Works from a new service/client/process after the application was closed.
const active = await sessions.getActiveSession(); // session or null
if (active) {
  const { remainingMs, elapsedMs, phase } = getSessionTiming(active);
}

const completed = await sessions.endSession(saved.id);
// Calling endSession(saved.id) again returns its original completion.
```

Each operation calls `auth.getUser()` to verify the current user, then uses structured `client.rpc` arguments. Ownership is independently enforced by the database and is never derived from a user ID supplied to this service. Errors do not fall back to localStorage or claim a failed save succeeded.

Returned objects have this shape:

```json
{
  "id": "server-generated-uuid",
  "ownerId": "verified-auth-user-uuid",
  "location": {
    "id": "garage-42",
    "name": "Selected garage",
    "coordinates": { "latitude": 40.2338, "longitude": -111.6585 },
    "isSample": false
  },
  "durationMinutes": 120,
  "reminderMinutesBefore": 10,
  "notes": "Level 3, Row C, near elevator.",
  "status": "active",
  "startedAt": "2026-10-29T12:00:00.000Z",
  "expiresAt": "2026-10-29T14:00:00.000Z",
  "createdAt": "2026-10-29T12:00:00.000Z",
  "endedAt": null
}
```

Unknown location IDs and coordinates are returned as `null`, never fabricated. Raw database columns are snake_case; the service normalizes them to the page-oriented camelCase contract above. Service input includes only location, duration, reminder preference, and notes; extra owner/status/timestamp fields are rejected.

### Future page and map integration

- **P5 final confirmation:** call `createSession(reviewedPreferences)` and navigate only after success. Do not create a database session on the earlier review step.
- **P6 page load:** call `getActiveSession()` on entry, including after a restart. Render an empty state for null and calculate time from persisted timestamps with `getSessionTiming`; no counter needs to run while closed.
- **P6 confirmed end action:** call `endSession(session.id)` and use the returned server completion timestamp. Display completion only after success. The existing P6 local adapter is not replaced in this PR.
- **Find My Car:** read `session.location.coordinates` and `session.notes`. If coordinates are null, explain that navigation is unavailable; never invent a location. P6 currently expects coordinates and an ID, so its future adapter must allow missing map data before passing a coordinate-less P7 session to that controller. Sessions created from the current P5 payload already include these fields.

### RPC and error contracts

| RPC | Arguments | Result |
|---|---|---|
| `p7_create_parking_session` | `p_location_name`, `p_duration_minutes`, optional `p_reminder_minutes_before`, `p_location_id`, `p_latitude`, `p_longitude`, `p_notes`, `p_is_sample` | One saved row |
| `p7_get_active_parking_session` | None | Zero or one active row, including overdue sessions |
| `p7_end_parking_session` | `p_session_id` UUID | One completed row; repeat is safe |

The service throws `ParkingSessionError` with `message`, `code`, and `status`. These are application-level status values for callers; they do not replace raw PostgREST HTTP responses.

| Status | Code | Meaning |
|---|---|---|
| 400 | `INVALID_SESSION` | Invalid preferences or session UUID |
| 401 | `AUTH_REQUIRED` | No verified user session |
| 403 | `SESSION_FORBIDDEN` | Database access denied |
| 404 | `SESSION_NOT_FOUND` | Missing or another user's session; does not reveal existence |
| 409 | `ACTIVE_SESSION_EXISTS` | An unended session already exists |
| 503 | `SESSION_STORAGE_UNAVAILABLE` | Database/network/identity service unavailable |

Database validation uses constraints even when JavaScript is bypassed. Raw SQLSTATEs include `23514`/`23502`/`22001` for invalid data, `23505` for duplicate active sessions, `42501` for permission errors, and `P0002` for a session not found. Queries are parameterized through supabase-js RPC, not interpolated SQL.

## Ownership and access

The new table has RLS with SELECT, INSERT, and UPDATE policies restricted to `(select auth.uid()) = owner_id`, all `TO authenticated`. Both `USING` and `WITH CHECK` protect updates. Anonymous users have no table/RPC access. Authenticated users receive only SELECT, INSERT on preference columns, and UPDATE on status; there are no client delete privileges or grants on owner IDs or timestamps.

A `SECURITY INVOKER` trigger stamps the verified owner and server times, normalizes inputs, and permits completion without reopening. The three RPCs are also `SECURITY INVOKER` with fixed empty search paths, so they do not bypass RLS. Default PUBLIC/anon function access is revoked and execute is granted only for the three authenticated RPCs. No user metadata is used for authorization.

## Standalone tests and development identity

`npm test` / `npm run check` run service, validation, and timer-reconstruction tests without credentials. To also run real database tests, create a **disposable local PostgreSQL** database named exactly `provo_parking_p7_test` and configure:

```powershell
$env:P7_TEST_DATABASE_URL = 'postgresql://postgres@127.0.0.1:55437/provo_parking_p7_test'
$env:P7_PSQL = 'C:\Program Files\PostgreSQL\18\bin\psql.exe' # optional if psql is on PATH
npm test
```

The integration fixture resets the `public` and `auth` schemas **only in that disposable test database**. It refuses remote hosts and any other database name. Never point it at a live project. It creates local NOLOGIN roles and two fake Auth identities, and sets test transaction claims as a privileged test connection. This is an isolated database test mechanism, not a production identity API, login feature, JWT generator, or browser endpoint. The fixture is not copied into the GitHub Pages deployment. Real production identity must come from Supabase's verified Auth token.

Each database operation in the integration test runs in a new `psql` process, proving persistence across disconnected/restarted application connections. Tests cover create/retrieve/end, absence of active data, optional coordinates, server validation, spoofed owners/timestamps, anonymous and cross-owner denial, repeatable migration, untouched legacy rows, simultaneous starts, and simultaneous ends. The saved active record was also manually compared before and after stopping/restarting the disposable PostgreSQL server; its full-row hash was unchanged.

GitHub CI provides a local PostgreSQL service and runs the real database suite automatically. No Supabase project credentials or paid service are needed. The local security advisor reported no issues. There is no application build step or standalone lint command in this repository.

## Reference documentation

- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Securing the Data API](https://supabase.com/docs/guides/api/securing-your-api)
- [Supabase changelog](https://supabase.com/changelog)

The current changelog and security documentation were checked before implementation. Existing project and legacy-table access rules are outside this migration's scope.
