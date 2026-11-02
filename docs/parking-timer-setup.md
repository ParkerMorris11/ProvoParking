# P5: Parking timer setup

Open `/parking-setup.html` using a local HTTP server (for example `npm start`). No `config.js`, Supabase, login, Maps API, or active timer is needed. The existing My car screen links to this demo; its database-backed timer is unchanged. The standalone page has a back link rather than another global navigation bar.

This is a setup demonstration: submitting shows a confirmation and the JSON payload. It does not start a countdown, schedule reminders, persist data, or enforce parking rules. Leaving/reloading resets the form. Background notifications are not supported. Check posted parking rules; the chosen duration does not grant permission to park.

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
    // Future P6 integration: hand off this validated snapshot to the active timer.
    // await startActiveTimer(session);
    // Navigate only after successful handoff.
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

The optional callback can return a promise. Controls are disabled while pending to prevent duplicate submissions. Resolution shows the demo confirmation; rejection shows a retry message and preserves the form. Callback mutations cannot change the confirmation snapshot. Add persistence/navigation only in that callback when the future feature exists.

## Checks

Run `npm test` and `npm run check`. CI also syntax-checks every JavaScript file. There is no build or separate lint tool in this static repository. Unit tests cover duration/reminder boundaries, location validation, copied data, and notes. For browser review, open the page at 390px and 1280px widths, verify keyboard focus, all duration choices, 30-minute reminder reset, notes, submission, confirmation, and editing. No credentials should be configured for the standalone check.
