# P6: Active parking timer

## Try it

Serve the repository with `npm start` or another static HTTP server. No `config.js`, database, Maps API, or authentication is needed.

1. Open `parking-setup.html`, choose preferences, and click **Start Parking Timer**.
2. Review the details. No session has started at this step.
3. Click **Confirm & Start Timer** to save a timestamped session and open `parking-timer.html`.
4. Return through **View parking timer** on setup or the existing My car screen. Refreshing or reopening the same origin in the same browser restores the original start/expiration timestamps.
5. **Find My Car** displays the saved location and notes, with an explanation that maps are not connected.
6. **End Parking Session** opens a keyboard-accessible confirmation dialog. **Keep Parking** or Escape cancels. **Yes, End Session** saves completion and freezes elapsed time. Completion persists until another session is confirmed.

The timer does not silently replace an existing unended session, including one that has expired. End the previous session first. The original Supabase-backed My car timer is unchanged and separate from this local flow.

## Standalone samples

Open `parking-timer.html` directly. Without a saved session it shows an empty state with a setup link and **Try a sample session**. No P5 page is required to exercise these URLs:

| URL | State |
|---|---|
| `parking-timer.html?demo=active` | Two-hour sample with 30 minutes remaining |
| `parking-timer.html?demo=reminder` | Reminder already due when the page opens |
| `parking-timer.html?demo=expiring` | Ten seconds remaining; transitions to expired automatically |
| `parking-timer.html?demo=expired` | Already expired, countdown clamped to zero |

Samples are labeled and do not read, overwrite, or end the saved local session. Ending a sample works in memory without a database. Reloading a sample starts that sample scenario again. Links between sample states are displayed only in demo mode.

## Input contract

`initParkingTimer(root, { session, onEnd?, onFindCar?, now? })` is exported from `js/pages/parking-timer.js`. Use the `timer-*` markup in `parking-timer.html`, and mount once per root. `session: null` displays the empty state. A supplied session has this shape:

```json
{
  "id": "session-42",
  "location": {
    "id": "garage-42",
    "name": "Selected parking garage",
    "coordinates": { "latitude": 40.2338, "longitude": -111.6585 },
    "isSample": false
  },
  "durationMinutes": 120,
  "reminderMinutesBefore": 10,
  "notes": "Level 3, Row C, near elevator.",
  "startedAt": "2026-10-29T12:00:00.000Z",
  "expiresAt": "2026-10-29T14:00:00.000Z",
  "endedAt": null
}
```

IDs and names must be nonempty strings; coordinates must be finite numbers in geographical bounds. Durations/reminders use the validated P5 preference contract (30…720 minutes in half-hour steps; reminder 0/5/10/15/30 and shorter than the duration). `notes` defaults to empty. Dates should be ISO date-time strings with timezone; expiration must equal start plus duration. `endedAt` is null/omitted until completed and cannot precede start. Invalid supplied data shows an error rather than silently displaying sample data.

`startParkingSession(preferences, now?, id?)` in `js/domain/active-parking.js` adapts P5 preferences into this contract at final confirmation. Future P7 database code can supply an equivalent object, without changing the page:

```js
import { initParkingTimer } from "./pages/parking-timer.js";

const timer = initParkingTimer(document.querySelector("#parking-timer"), {
  session: suppliedSession,
  async onEnd(completedSession) {
    // Future P7: persist completedSession.endedAt with its id.
    // Throw/reject to keep the session open and show a retryable error.
  },
  async onFindCar(location, notes) {
    // Future map feature: navigate using the supplied location and notes.
  },
});

// Replace with newly loaded data: timer.setSession(nextSession).
// Force a timestamp recalculation: timer.refresh().
// Unmount and remove intervals/listeners: timer.destroy().
```

The page validates and copies input; callbacks receive copies. `onEnd` receives a validated completed session and may return a promise. Completion is displayed only after it resolves. On rejection the timer remains open and retry is possible. Double confirmation is blocked while pending. `onFindCar` receives `(location, notes)`; without that callback the useful placeholder message is shown. No map page or Google Maps API is implemented.

`now` defaults to `Date.now` and can be injected for tests. Remaining time is `max(0, expiresAt - now)`, elapsed time is `max(0, now - startedAt)`, and completed elapsed time uses `endedAt`. The page recalculates every second and immediately on visibility/page restoration. Intervals stop on pagehide, completion, or destroy, and resume after page restoration. Reminder/expiration/completion announcements occur only on state changes, rather than every tick. No reminder means no approaching-expiration message; expiration still shows clearly.

## Persistence and boundaries

The default entry points use `js/lib/timer-storage.js` with the namespaced localStorage key `provoParking.localTimer.v1`. Only final confirmation writes a new session. The same key stores completion; a later new session replaces the completed record. Browser storage failures are reported explicitly rather than claiming a durable timer started. Corrupt data is reported without silently resetting the original record. Another tab's changes refresh the timer, and an outdated tab cannot end a newer session ID.

This is device/browser/origin-local storage, not P7 database persistence. Changing browser, device, host, or port uses different storage. Clearing site data removes it; private-mode retention follows browser behavior. No account sync or session history is implemented. Times follow the device clock. No push/email/background notifications are sent, and the UI states that reminders require the page to be open.

## Branch relationship and validation

`feature/p6-active-parking-timer` is based on the exact P5 PR #8 head (`4fd9e87`), with P6 changes in its own commit. P5 remains unchanged and unmerged. The P6 PR targets main as requested, so its diff includes the P5 prerequisite while #8 is open. For review of P6 alone, compare the P5 branch to the P6 branch. Before any eventual merge, update/rebase P6 onto the final main after P5 has landed, especially if P5 is squash-merged; do not merge both independently without refreshing the stacked branch. No merge is authorized by this work.

Run `npm test`, `npm run check`, and syntax-check JavaScript as in CI. Unit coverage includes inactive-tab time jumps, exact reminder/expiry boundaries, no-reminder behavior, invalid inputs, completion, storage failures, and stale session IDs. Browser verification covers P5 review/final confirmation, return/reload, duplicate start protection, cross-tab completion, end-dialog cancel/confirm, async callback failure/retry, map feedback, safe text, automatic expiration, and layouts at 390px and 1280px. Screenshots are in `docs/screens/p6-*.png`. The static repository has no build or separate lint command.
