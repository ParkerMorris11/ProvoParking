# P5: Parking timer setup

Open `/parking-setup.html` using a local HTTP server (for example `npm start`). No `config.js`, Supabase, login, Maps API, or active timer is needed. The existing My car screen links to this demo; its database-backed timer is unchanged. The standalone page has a back link rather than another global navigation bar.

Submitting the form shows a review and JSON payload. P6 adds a separate **Confirm & Start Timer** action: only this final action creates and saves a session, then opens `parking-timer.html`. Leaving/reloading the unconfirmed form resets the form. Confirmed sessions survive a refresh and can be reopened through **View parking timer** in the same browser. No database, map, background notifications, or parking-rule enforcement is involved. Check posted parking rules; the chosen duration does not grant permission to park.

## Integration

`js/pages/parking-setup.js` exports `initParkingSetup(root, options)`. The root must contain the `setup-*` elements in `parking-setup.html`. Mount once per root. Replace the demo call in `js/parking-setup.js` with:

```js
import { initParkingSetup } from "./pages/parking-setup.js";

const setup = initParkingSetup(document.querySelector("#parking-setup"), {
  location: {
    id: "garage-42",
    name: "Selected parking garage",
    coordinates: { latitude: 40.2338, longitude: -111.6585 },
    isSample: false,
  },
  async onStart(session) {
    // Optional review-stage hook, kept for compatibility with the original P5 contract.
    // This is called before showing the review; do not start a timer here.
  },
  async onConfirm(session) {
    // Final confirmation hook used by P6. The default entry point saves locally
    // with startLocalTimer(session), then navigates to parking-timer.html.
  },
});

// Later map selection: setup.setLocation(nextLocation).
// Restore sample: setup.setLocation(null).
// Unmount event handlers: setup.destroy().
```

No map code is implemented. Supply a nonempty string `id` (convert numeric database IDs with `String(id)`), nonempty `name`, and finite numeric coordinates with latitude −90…90 and longitude −180…180. `isSample` is optional and defaults to false. Omitted/null locations use the clearly labeled sample; malformed supplied locations block submission and display an explanation. Locations are copied and normalized. Call `setLocation` only when no submission is pending; it returns to the form and preserves duration, reminder, and notes.

`onStart` receives this plain object (not a Supabase row):

```json
{
  "location": {
    "id": "garage-42",
    "name": "Selected parking garage",
    "coordinates": { "latitude": 40.2338, "longitude": -111.6585 },
    "isSample": false
  },
  "durationMinutes": 120,
  "reminderMinutesBefore": 10,
  "notes": "Level 3, Row C, near elevator."
}
```

Durations are integers 30…720 in 30-minute increments (default 120). Reminder values are 0 (none), 5, 10 (default), 15, or 30, and must be strictly shorter than the duration. Shortening the duration disables incompatible options and resets an incompatible selection to no reminder, with an announced explanation. Notes are optional, trimmed text, maximum 200 characters. The payload deliberately contains no timer timestamps, database session ID, or user identity: the future active timer owns these.

Both optional callbacks can return a promise. `onStart` remains the review-stage hook for backward compatibility: resolution shows the review; rejection preserves the form. `onConfirm` is the final submission hook added by P6; the confirmation button is visible only when this callback is supplied. It receives a copy of the reviewed payload. Controls are disabled while callbacks are pending, and rejection keeps the relevant step available for retry. Callback mutations cannot change the review snapshot. `js/parking-setup.js` connects only `onConfirm` to local persistence and navigation, so the countdown begins at final confirmation rather than at form submission.

## Checks

Run `npm test` and `npm run check`. CI also syntax-checks every JavaScript file. There is no build or separate lint tool in this static repository. Unit tests cover duration/reminder boundaries, location validation, copied data, and notes. For browser review, open the page at 390px and 1280px widths, verify keyboard focus, all duration choices, 30-minute reminder reset, notes, submission, confirmation, and editing. No credentials should be configured for the standalone check.
