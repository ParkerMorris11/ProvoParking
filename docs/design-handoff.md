# Design handoff: new look + Areas map

Target design: [Provo Parking, Final App (Figma)](https://www.figma.com/design/OzsVP0xKGMCOVQruK6naM3).
Written 2026-10-29. This is a kit for the existing Sprint 1 cards. Nothing here is merged into the app yet.

Rule of thumb: change `css/styles.css` and the HTML strings in `js/components/` and `js/pages/`.
No new framework, no build step.

## Who uses which part

| Part | Card it belongs to | Owner |
|---|---|---|
| 1. Color + type tokens | Mobile layout | James |
| 2. Area card + status tag | Mobile layout, Icons + focus | James |
| 3. Bottom tab bar (phone) | Mobile layout | James |
| 4. Permit / day / time fields on Areas | Permit picker on Areas | Liam |
| 5. Desktop: filters left, 2-column cards | Desktop layout | Spencer |
| 6. Focus ring + contrast check | Lighthouse fixes | Spencer |
| 7. Leaflet map on Areas | **Sprint 2 card** (not in the Sprint 1 Goal) | Pick at Sprint 2 Planning |

## 1. Tokens (replace the `:root` block in css/styles.css)

These match the Figma color variables (`color/navy`, `color/go`, and so on).

```css
:root {
  --bg: #f4f6f9; --card: #ffffff; --text: #17212b; --muted: #5a6573; --border: #dde2e8;
  --brand: #002e5d; --brand-soft: #dce6f2;
  --ok: #1e7b3c;   --ok-bg: #e3f2e8;
  --low: #9a5b00;  --low-bg: #fff4d6;
  --no: #b3261e;   --no-bg: #fbe4e2;
  --heart: #c2185b; --heart-bg: #fce4ec;
  --focus: #f5a623;
  --radius: 14px; --gap: 12px; --gutter: 20px;
}
body { font-family: Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
```

Keep the old variable names (`--brand`, `--ok`, `--low`, `--heart`) so existing rules keep working.
Inter is optional: if you add it, load it from Google Fonts in `index.html`. Otherwise system-ui is fine.

## 2. Area card + status tag

Order inside a card (from the Figma "Area card" component): name, type line, **status**, distance/leave-by line, Details link, heart on the right.
The status is the most important thing, so it gets an icon in a colored circle plus bold words. Never color alone.

```css
.card { border-radius: var(--radius); padding: 14px 16px; }
.card h3 { font-size: 1.06rem; font-weight: 700; }
.elig { display: flex; align-items: center; gap: 8px; font-weight: 600; }
.elig [aria-hidden] { display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; color: #fff; font-size: .8rem; }
.elig.ok [aria-hidden] { background: var(--ok); }
.elig.limit [aria-hidden] { background: var(--low); }
.elig.no-permit [aria-hidden], .elig.blocked [aria-hidden] { background: var(--no); }
.elig.pick [aria-hidden], .elig.unknown [aria-hidden] { background: var(--muted); }
.elig.no-permit, .elig.blocked { color: var(--no); }
.heart { width: 44px; height: 44px; }
.heart[aria-pressed="true"] { background: var(--heart-bg); border-color: var(--heart); }
```

`cardHtml` in `js/components/area-card.js` already outputs `.elig` with an `aria-hidden` icon span, so this is CSS only.
One honesty fix to make while you are there: the "About N of M spaces open (estimate)" line comes from sample numbers.
Either label it "Sample estimate" or drop it, as the Figma does.

## 3. Bottom tab bar on phones

Figma tab order: **Areas, Favorites, My car, Account**. Find goes away once the permit picker is on Areas.
Help is not in the Figma tab bar. The team still needs to decide where it goes.

```css
@media (max-width: 719px) {
  .tabs { position: fixed; bottom: 0; left: 0; right: 0; max-width: none; margin: 0; padding: 6px 4px calc(6px + env(safe-area-inset-bottom));
          background: var(--card); border-top: 1px solid var(--border); gap: 0; z-index: 10; }
  .tab { border: 0; background: none; color: var(--muted); font-size: .78rem; font-weight: 500; }
  .tab[aria-current="page"] { background: none; color: var(--brand); font-weight: 700; }
  main { padding-bottom: 96px; }
}
```

## 4. Fields on Areas (permit, day, time)

Each field is a white box with a small uppercase label above the value (Figma "Field" component).
The existing `<select>` elements can stay. Just wrap each one:

```css
.field { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 6px 12px; display: grid; }
.field label { font-size: .7rem; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); }
.field select, .field input { border: 0; padding: 0; min-height: 32px; font-weight: 600; }
```

## 5. Desktop layout (720px and up)

```css
@media (min-width: 720px) {
  main { max-width: 1200px; }
  #view-areas { display: grid; grid-template-columns: 320px 1fr; gap: 24px; align-items: start; }
  #view-areas .filters { position: sticky; top: 16px; }
  #area-list { grid-template-columns: 1fr 1fr; }
}
```

The tabs stay as a top row on desktop, as the Figma desktop frame shows.

## 6. Focus + contrast

```css
:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
```

All text colors above pass 4.5:1 on white. Run Lighthouse on the deployed URL after each change, not just locally.

## 7. Real map on Areas (Sprint 2 card, about 8 points)

Leaflet + OpenStreetMap. **No API key and no billing account.** The `parking_area` table already has `latitude` and `longitude`,
and `js/data/load.js` already loads them. Google Maps is still possible later; see `docs/map-plan.md`.

Suggested split: map + pins (5), "tap pin, highlight card" (3).

**index.html**: add to `<head>`, and add the map container above the list:

```html
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" defer></script>

<div id="area-map" class="area-map" role="region" aria-label="Map of parking areas. The same areas are listed below."></div>
```

**css/styles.css**:

```css
.area-map { height: 260px; border-radius: var(--radius); border: 1px solid var(--border); margin-bottom: var(--gap); }
@media (min-width: 720px) { .area-map { height: 360px; } }
.pin { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px 2px 4px; border-radius: 999px; background: #fff;
       border: 2px solid currentColor; font: 600 12px/1.4 Inter, system-ui, sans-serif; white-space: nowrap; }
.pin.ok { color: var(--ok); } .pin.limit { color: var(--low); } .pin.no-permit, .pin.blocked { color: var(--no); }
.pin.pick, .pin.unknown { color: var(--muted); }
```

**js/components/area-map.js** (new file):

```js
// Areas map: one pin per parking area, labelled with the same eligibility as the list.
// Optional: if Leaflet did not load, the list below still works.
import { escapeHtml } from "../lib/format.js";
import { evaluateArea } from "./area-card.js";

const BYU = [40.2518, -111.6493];
let map, pins;

export function renderAreaMap(areas) {
  const el = document.getElementById("area-map");
  if (!el || !window.L) return;
  if (!map) {
    map = L.map(el, { scrollWheelZoom: false }).setView(BYU, 15);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    pins = L.layerGroup().addTo(map);
  }
  map.invalidateSize(); // the Areas section starts hidden, so Leaflet needs a resize once it shows
  pins.clearLayers();
  for (const area of areas) {
    const ev = evaluateArea(area);
    const icon = L.divIcon({
      className: "",
      html: `<span class="pin ${ev.kind}"><span aria-hidden="true">${ev.icon}</span>${escapeHtml(area.area_name)}</span>`,
    });
    L.marker([area.latitude, area.longitude], { icon, title: `${area.area_name}: ${ev.text}`, keyboard: false })
      .on("click", () => { location.hash = `#area/${area.area_id}`; })
      .addTo(pins);
  }
}
```

**js/pages/areas.js**: call it at the end of `renderAreas()`:

```js
import { renderAreaMap } from "../components/area-map.js";
// ...
renderAreaMap(sorted);
```

Accessibility: pins use `keyboard: false`, so keyboard and screen-reader users skip the map and use the list, which has the same lots and status.
That keeps Lighthouse at 90 or above.
Honesty: lot coordinates in the seed data are sample points until Liam's real-lot card checks them. Say so in the demo.

Check yourself after adding it:
1. Open Areas. You should see pins around BYU with ✓ / ! / ✕ labels.
2. Change the permit. The pin labels should change to match the cards.
3. Click a pin. It should open that lot's details.
4. Tab through the page. Focus should go from the filters straight to the list, not into the map.
