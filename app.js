// Provo Parking — five screens:
//   Find (permit + arrival time) -> Areas (eligibility list) -> Area details (rules)
//   Favorites (heart, stored in favorite_area) -> My car (parking timer, stored in parking_session)
// Everything is read from / written to Supabase, so it survives a refresh.

// No login yet: the app acts as the demo user seeded in schema.sql (Emma Carter, user_id 1).
const DEMO_USER_ID = 1;
const PERMIT_KEY = "provoParking.permitId";
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const VIEWS = ["find", "areas", "area", "favorites", "car", "help"];

const $ = (id) => document.getElementById(id);
const statusEl = $("status");

let db;
let areas = [];
let permits = [];
let rulesByArea = new Map();
let towById = new Map();
let favoriteIds = new Set();
let activeSession = null;
let currentView = null;
let timerHandle = null;
let lastReminderState = "";

// What the user picked on the Find screen.
const find = { permitId: null, day: new Date().getDay(), time: nowHHMM() };

// ---------- small helpers ----------
function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function toMinutes(t) { // "HH:MM" or "HH:MM:SS" -> minutes since midnight
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function fmtTime(t) { // "13:05:00" -> "1:05 PM"
  const mins = toMinutes(t);
  const h = Math.floor(mins / 60), m = mins % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

function fmtDuration(minutes) {
  if (minutes % 1440 === 0) { const d = minutes / 1440; return `${d} day${d === 1 ? "" : "s"}`; }
  const h = Math.floor(minutes / 60), m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

function fmtClock(date) {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function timeAgo(iso) {
  if (!iso) return "unknown";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 1440) return `${Math.round(mins / 60)} h ago`;
  return `${Math.round(mins / 1440)} days ago`;
}

function directionsUrl(area) {
  return `https://www.google.com/maps/dir/?api=1&destination=${area.latitude},${area.longitude}&travelmode=walking`;
}

function loadSavedPermit() {
  try { const v = localStorage.getItem(PERMIT_KEY); return v ? Number(v) : null; } catch { return null; }
}
function savePermit(id) {
  try { localStorage.setItem(PERMIT_KEY, String(id)); } catch { /* private mode: keep it in memory only */ }
}

// ---------- eligibility ----------
function ruleAppliesOnDay(rule, dayIdx) {
  const spec = rule.days_of_week.trim();
  if (/^all$/i.test(spec)) return true;
  return spec.split(",").some((part) => {
    const [a, b] = part.split("-").map((s) => DAY_NAMES.indexOf(s.trim().slice(0, 3)));
    if (a < 0 || (b !== undefined && b < 0)) return true; // unreadable: assume it applies (safer)
    if (b === undefined) return dayIdx === a;
    return a <= b ? dayIdx >= a && dayIdx <= b : dayIdx >= a || dayIdx <= b;
  });
}

function inWindow(minutes, start, end) { // end exclusive; handles overnight windows
  return start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

function ruleCoversTime(rule, minutes) { // start_time..end_time inclusive of 23:59
  return minutes >= toMinutes(rule.start_time) && minutes <= toMinutes(rule.end_time);
}

function ruleBlocksTime(rule, minutes) {
  return rule.blocked_start && rule.blocked_end && inWindow(minutes, toMinutes(rule.blocked_start), toMinutes(rule.blocked_end));
}

// Returns { kind: ok | limit | no-permit | blocked | pick | unknown, icon, text, rule }.
function evaluate(area, permitId, dayIdx, hhmm) {
  const minutes = toMinutes(hhmm);
  const rules = (rulesByArea.get(area.area_id) || []).filter((r) => ruleAppliesOnDay(r, dayIdx) && ruleCoversTime(r, minutes));
  if (!rules.length) return { kind: "unknown", icon: "?", text: "No rules on file for that time" };

  const mine = rules.filter((r) => r.permit_id == null || r.permit_id === permitId);
  if (!mine.length) {
    return permitId == null
      ? { kind: "pick", icon: "?", text: "Choose a permit to check this area" }
      : { kind: "no-permit", icon: "✕", text: "Not covered by your permit" };
  }
  const usable = mine.filter((r) => !ruleBlocksTime(r, minutes));
  if (!usable.length) {
    const r = mine[0];
    return { kind: "blocked", icon: "✕", text: `No parking ${fmtTime(r.blocked_start)}–${fmtTime(r.blocked_end)}`, rule: r };
  }
  const best = usable.find((r) => !r.max_stay_minutes) || usable[0];
  const open = best.permit_id == null;
  if (best.max_stay_minutes) {
    return { kind: "limit", icon: "!", text: `${open ? "Open to everyone" : "Your permit works here"}, ${fmtDuration(best.max_stay_minutes)} limit`, rule: best };
  }
  return { kind: "ok", icon: "✓", text: open ? "Open to everyone" : "Your permit works here", rule: best };
}

const KIND_ORDER = { ok: 0, limit: 1, pick: 2, unknown: 3, blocked: 4, "no-permit": 5 };

function availabilityText(area) {
  if (area.est_available_spaces == null) return { text: "Availability unknown", cls: "" };
  const pct = area.total_spaces ? area.est_available_spaces / area.total_spaces : 0;
  return {
    text: `About ${area.est_available_spaces} of ${area.total_spaces} spaces open (estimate)`,
    cls: pct < 0.1 ? "low" : "ok",
  };
}

// ---------- Screen 2 + 4: area cards ----------
function cardHtml(area) {
  const saved = favoriteIds.has(area.area_id);
  const avail = availabilityText(area);
  const ev = evaluate(area, find.permitId, find.day, find.time);
  const label = saved ? `Remove ${area.area_name} from favorites` : `Save ${area.area_name} to favorites`;
  return `
    <li class="card">
      <div class="card-body">
        <h3>${escapeHtml(area.area_name)}</h3>
        <p class="meta">${escapeHtml(area.operator)}${area.is_free ? " · Free" : ""}</p>
        <p class="elig ${ev.kind}"><span aria-hidden="true">${ev.icon}</span> ${escapeHtml(ev.text)}</p>
        <p class="avail ${avail.cls}">${avail.text}</p>
        <a class="link" href="#area/${area.area_id}" aria-label="Rules and details for ${escapeHtml(area.area_name)}">Rules &amp; details →</a>
      </div>
      <button type="button" class="heart" data-area-id="${area.area_id}"
              aria-pressed="${saved}" aria-label="${escapeHtml(label)}">${saved ? "♥" : "♡"}</button>
    </li>`;
}

function renderAreas() {
  const sorted = [...areas].sort((a, b) => {
    const ka = KIND_ORDER[evaluate(a, find.permitId, find.day, find.time).kind];
    const kb = KIND_ORDER[evaluate(b, find.permitId, find.day, find.time).kind];
    return ka - kb || a.area_name.localeCompare(b.area_name);
  });
  $("area-list").innerHTML = sorted.map(cardHtml).join("");
  const permit = permits.find((p) => p.permit_id === find.permitId);
  $("areas-summary").textContent = permit
    ? `Showing ${DAY_NAMES[find.day]} at ${fmtTime(find.time)} with the ${permit.permit_name} permit. Change this on the Find screen.`
    : "No permit chosen yet. Go to Find to pick one and see which areas you can use.";
}

function renderFavorites() {
  const favs = areas.filter((a) => favoriteIds.has(a.area_id));
  $("fav-list").innerHTML = favs.map(cardHtml).join("");
  $("fav-empty").hidden = favs.length > 0;
  $("fav-count").textContent = favs.length;
}

// ---------- Screen 1: Find ----------
function renderFind() {
  const sel = $("permit-select");
  sel.innerHTML = `<option value="">Choose a permit…</option>` +
    permits.map((p) => `<option value="${p.permit_id}">${escapeHtml(p.permit_code)} — ${escapeHtml(p.permit_name)}</option>`).join("");
  sel.value = find.permitId ?? "";
  $("arrive-day").value = String(find.day);
  $("arrive-time").value = find.time;
  renderPermitInfo();
}

function renderPermitInfo() {
  const p = permits.find((x) => x.permit_id === Number($("permit-select").value));
  $("permit-info").innerHTML = p
    ? `${escapeHtml(p.description || "")}${p.cost_note ? ` Cost: ${escapeHtml(p.cost_note)}.` : ""}` +
      (p.source_url ? ` <a href="${escapeHtml(p.source_url)}" target="_blank" rel="noopener">Source</a>${p.last_verified_on ? ` (checked ${escapeHtml(p.last_verified_on)})` : ""}` : "")
    : "";
}

// ---------- Screen 3: Area details ----------
function groupRules(rules) {
  const groups = new Map();
  for (const r of rules) {
    const key = [r.days_of_week, r.start_time, r.end_time, r.max_stay_minutes, r.blocked_start, r.blocked_end, r.permit_id == null].join("|");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  return [...groups.values()];
}

function ruleGroupHtml(group) {
  const r = group[0];
  const open = r.permit_id == null;
  const codes = group.map((g) => permits.find((p) => p.permit_id === g.permit_id)?.permit_code).filter(Boolean);
  const days = /^all$/i.test(r.days_of_week.trim()) ? "Every day" : r.days_of_week;
  const hours = toMinutes(r.start_time) === 0 && toMinutes(r.end_time) >= 1439 ? "all day" : `${fmtTime(r.start_time)}–${fmtTime(r.end_time)}`;
  const bullets = [];
  bullets.push(open ? "Open to everyone." : `Valid permits: ${codes.map(escapeHtml).join(", ")}.`);
  if (r.blocked_start && r.blocked_end) bullets.push(`No parking ${fmtTime(r.blocked_start)}–${fmtTime(r.blocked_end)}.`);
  bullets.push(r.max_stay_minutes ? `Time limit: ${fmtDuration(r.max_stay_minutes)}.` : "No time limit listed.");
  if (group.length === 1 && r.rule_note) bullets.push(escapeHtml(r.rule_note));
  return `
    <li class="rule">
      <p class="rule-when">${escapeHtml(days)}, ${escapeHtml(hours)}</p>
      <ul>${bullets.map((b) => `<li>${b}</li>`).join("")}</ul>
      <p class="hint"><a href="${escapeHtml(r.source_url)}" target="_blank" rel="noopener">Source</a> · checked ${escapeHtml(r.last_verified_on)}</p>
    </li>`;
}

function renderAreaDetail(areaId) {
  const area = areas.find((a) => a.area_id === areaId);
  const box = $("area-detail");
  if (!area) {
    box.innerHTML = `<h2 id="h-area" tabindex="-1">Area not found</h2><p class="empty">That parking area does not exist. Go back to the list.</p>`;
    return;
  }
  const saved = favoriteIds.has(area.area_id);
  const avail = availabilityText(area);
  const ev = evaluate(area, find.permitId, find.day, find.time);
  const tow = towById.get(area.tow_company_id);
  const groups = groupRules(rulesByArea.get(area.area_id) || []);
  const label = saved ? `Remove ${area.area_name} from favorites` : `Save ${area.area_name} to favorites`;
  box.innerHTML = `
    <div class="detail-head">
      <div>
        <h2 id="h-area" tabindex="-1">${escapeHtml(area.area_name)}</h2>
        <p class="meta">${escapeHtml(area.operator)}${area.lot_code ? ` · ${escapeHtml(area.lot_code)}` : ""}${area.is_free ? " · Free" : ""}</p>
      </div>
      <button type="button" class="heart" data-area-id="${area.area_id}" aria-pressed="${saved}" aria-label="${escapeHtml(label)}">${saved ? "♥" : "♡"}</button>
    </div>
    <p class="elig ${ev.kind} big"><span aria-hidden="true">${ev.icon}</span> ${escapeHtml(ev.text)}
      <span class="when">(${DAY_NAMES[find.day]} ${fmtTime(find.time)})</span></p>
    <p class="avail ${avail.cls}">${avail.text}. Updated ${timeAgo(area.availability_updated_at)}. A valid permit does not guarantee an open space.</p>

    <h3>Rules</h3>
    ${groups.length ? `<ul class="rules">${groups.map(ruleGroupHtml).join("")}</ul>` : `<p class="empty">No rules on file for this area yet.</p>`}

    <h3>If you are towed</h3>
    <p>${tow ? `${escapeHtml(tow.company_name)}: <a href="tel:${escapeHtml(tow.phone.replace(/[^\d+]/g, ""))}">${escapeHtml(tow.phone)}</a>${tow.is_sample_data ? " (sample number, not real)" : ""}` : "No tow company on file."}</p>

    <div class="actions">
      <button type="button" class="primary" data-park-area="${area.area_id}">Park here — start timer</button>
      <a class="secondary" href="${directionsUrl(area)}" target="_blank" rel="noopener">Walking directions (sample location)</a>
    </div>`;
}

// ---------- Screen 5: My car ----------
function stopTimer() { if (timerHandle) { clearInterval(timerHandle); timerHandle = null; } }

function renderCar() {
  const active = $("car-active"), form = $("car-form");
  stopTimer();
  lastReminderState = "";
  if (activeSession) {
    form.hidden = true;
    active.hidden = false;
    const area = areas.find((a) => a.area_id === activeSession.area_id);
    active.innerHTML = `
      <div class="panel session">
        <p class="meta">You parked at</p>
        <h3>${escapeHtml(area ? area.area_name : "Unknown area")}</h3>
        <p class="countdown" id="countdown" aria-hidden="true"></p>
        <p id="countdown-text" class="sr-text"></p>
        <p id="reminder" class="reminder" hidden></p>
        <p class="meta">Started ${fmtClock(new Date(activeSession.started_at))} · leave by <strong>${fmtClock(new Date(activeSession.leave_by))}</strong> · reminder ${activeSession.reminder_minutes_before} min before</p>

        <form id="note-form">
          <label for="note-edit">Where is your car?</label>
          <input type="text" id="note-edit" maxlength="200" value="${escapeHtml(activeSession.car_note || "")}" placeholder="e.g. Row C near the stairs">
          <button type="submit" class="secondary">Save note</button>
        </form>

        <div class="actions">
          ${area ? `<a class="secondary" href="${directionsUrl(area)}" target="_blank" rel="noopener">Walking directions (sample location)</a>` : ""}
          <button type="button" class="primary" id="end-session">I left — end timer</button>
        </div>
      </div>`;
    tick();
    timerHandle = setInterval(tick, 1000);
  } else {
    active.hidden = true;
    active.innerHTML = "";
    form.hidden = false;
    const sel = $("car-area");
    const keep = sel.value;
    sel.innerHTML = areas.map((a) => `<option value="${a.area_id}">${escapeHtml(a.area_name)}</option>`).join("");
    if (keep) sel.value = keep;
    updateCarWarning();
  }
}

function tick() {
  if (!activeSession) return;
  const msLeft = new Date(activeSession.leave_by).getTime() - Date.now();
  const el = $("countdown");
  if (!el) return stopTimer();
  const over = msLeft < 0;
  const total = Math.abs(Math.floor(msLeft / 1000));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  const clock = `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  el.textContent = over ? `Over by ${clock}` : clock;
  el.classList.toggle("over", over);
  $("countdown-text").textContent = over ? `Time is up. You are over by ${fmtDuration(Math.max(1, Math.round(total / 60)))}.` : `${fmtDuration(Math.max(1, Math.ceil(total / 60)))} left.`;

  const remindMs = activeSession.reminder_minutes_before * 60000;
  const state = over ? "over" : msLeft <= remindMs ? "soon" : "ok";
  const rem = $("reminder");
  if (state !== lastReminderState) { // only touch the live text when the state changes
    lastReminderState = state;
    rem.hidden = state === "ok";
    rem.setAttribute("role", state === "ok" ? "" : "alert");
    rem.textContent = state === "over"
      ? "Time is up — move your car now to avoid a ticket or tow."
      : state === "soon" ? `Heads up: ${fmtDuration(Math.max(1, Math.ceil(msLeft / 60000)))} left. Head back to your car.` : "";
    rem.classList.toggle("over", state === "over");
  }
}

function updateCarWarning() {
  const warn = $("car-warning");
  const area = areas.find((a) => a.area_id === Number($("car-area").value));
  const mins = Number($("car-minutes").value);
  if (!area) { warn.hidden = true; return; }
  const ev = evaluate(area, find.permitId, new Date().getDay(), nowHHMM());
  let msg = "";
  if (ev.kind === "no-permit") msg = `Heads up: your selected permit does not cover this area right now, so you could be ticketed.`;
  else if (ev.kind === "blocked") msg = `Heads up: ${ev.text.toLowerCase()} here.`;
  else if (ev.rule && ev.rule.max_stay_minutes && mins > ev.rule.max_stay_minutes) msg = `Heads up: this area has a ${fmtDuration(ev.rule.max_stay_minutes)} limit, shorter than ${fmtDuration(mins)}.`;
  warn.textContent = msg;
  warn.hidden = !msg;
}

async function startSession(e) {
  e.preventDefault();
  const btn = e.submitter;
  btn.disabled = true;
  try {
    const minutes = Number($("car-minutes").value);
    const row = {
      user_id: DEMO_USER_ID,
      area_id: Number($("car-area").value),
      planned_minutes: minutes,
      leave_by: new Date(Date.now() + minutes * 60000).toISOString(),
      reminder_minutes_before: Number($("car-reminder").value),
      car_note: $("car-note").value.trim() || null,
    };
    const { data, error } = await db.from("parking_session").insert(row).select().single();
    if (error) throw error;
    activeSession = data;
    $("car-note").value = "";
    setStatus("Parking timer started.");
    renderCar();
    $("h-car").focus();
  } catch (err) {
    console.error(err);
    setStatus(`Could not start the timer: ${err.message}`, true);
  } finally {
    btn.disabled = false;
  }
}

async function endSession(btn) {
  btn.disabled = true;
  try {
    const expired = Date.now() > new Date(activeSession.leave_by).getTime();
    const { data, error } = await db.from("parking_session")
      .update({ status: expired ? "expired" : "ended", ended_at: new Date().toISOString() })
      .eq("session_id", activeSession.session_id).select();
    if (error) throw error;
    if (!data.length) throw new Error("The database did not end the session.");
    activeSession = null;
    setStatus(expired ? "Timer ended. You were over your planned time." : "Timer ended. Safe travels!");
    renderCar();
    $("h-car").focus();
  } catch (err) {
    console.error(err);
    setStatus(`Could not end the timer: ${err.message}`, true);
    btn.disabled = false;
  }
}

async function saveNote(e) {
  e.preventDefault();
  const btn = e.submitter;
  btn.disabled = true;
  try {
    const note = $("note-edit").value.trim() || null;
    const { data, error } = await db.from("parking_session").update({ car_note: note })
      .eq("session_id", activeSession.session_id).select().single();
    if (error) throw error;
    activeSession = data;
    setStatus("Saved your car note.");
  } catch (err) {
    console.error(err);
    setStatus(`Could not save the note: ${err.message}`, true);
  } finally {
    btn.disabled = false;
  }
}

// ---------- data loading ----------
async function loadData() {
  const [areasRes, favRes, permitRes, ruleRes, towRes, sessRes] = await Promise.all([
    db.from("parking_area").select("area_id, area_name, lot_code, operator, latitude, longitude, total_spaces, est_available_spaces, availability_updated_at, is_free, tow_company_id").order("area_name"),
    db.from("favorite_area").select("area_id").eq("user_id", DEMO_USER_ID),
    db.from("permit").select("permit_id, permit_code, permit_name, description, cost_note, source_url, last_verified_on").order("permit_code"),
    db.from("parking_rule").select("rule_id, area_id, permit_id, days_of_week, start_time, end_time, max_stay_minutes, blocked_start, blocked_end, source_url, last_verified_on, rule_note"),
    db.from("tow_company").select("tow_company_id, company_name, phone, is_sample_data"),
    db.from("parking_session").select("*").eq("user_id", DEMO_USER_ID).eq("status", "active").order("started_at", { ascending: false }).limit(1),
  ]);
  for (const res of [areasRes, favRes, permitRes, ruleRes, towRes, sessRes]) if (res.error) throw res.error;

  areas = areasRes.data;
  permits = permitRes.data;
  favoriteIds = new Set(favRes.data.map((f) => f.area_id));
  towById = new Map(towRes.data.map((t) => [t.tow_company_id, t]));
  rulesByArea = new Map();
  for (const r of ruleRes.data) {
    if (!rulesByArea.has(r.area_id)) rulesByArea.set(r.area_id, []);
    rulesByArea.get(r.area_id).push(r);
  }
  activeSession = sessRes.data[0] || null;

  const saved = loadSavedPermit();
  if (saved && permits.some((p) => p.permit_id === saved)) find.permitId = saved;
  renderFind();
  setStatus(`${areas.length} parking areas loaded. Showing data for the demo user.`);
}

// ---------- favorites (unchanged behavior) ----------
async function toggleFavorite(areaId, button) {
  button.disabled = true;
  const area = areas.find((a) => a.area_id === areaId);
  try {
    if (favoriteIds.has(areaId)) {
      const { data, error } = await db.from("favorite_area").delete()
        .eq("user_id", DEMO_USER_ID).eq("area_id", areaId).select();
      if (error) throw error;
      if (!data.length) throw new Error("The database did not remove the favorite.");
      favoriteIds.delete(areaId);
      setStatus(`Removed ${area.area_name} from favorites.`);
    } else {
      // .select() makes Supabase return the saved row, so we only show what the database confirmed.
      const { data, error } = await db.from("favorite_area")
        .insert({ user_id: DEMO_USER_ID, area_id: areaId }).select().single();
      if (error) throw error;
      favoriteIds.add(data.area_id);
      setStatus(`Saved ${area.area_name} to favorites.`);
    }
    renderViews();
    document.querySelector(`#view-${currentView}:not([hidden]) .heart[data-area-id="${areaId}"]`)?.focus();
  } catch (err) {
    console.error(err);
    setStatus(`Could not update favorites: ${err.message}`, true);
    button.disabled = false;
  }
}

// ---------- routing ----------
function renderViews() {
  renderAreas();
  renderFavorites();
  if (currentView === "area") renderAreaDetail(Number(location.hash.split("/")[1]));
}

function showView() {
  if (!db || !areas.length && !permits.length) return; // data not loaded yet
  const [name] = (location.hash.replace(/^#/, "") || (find.permitId ? "areas" : "find")).split("/");
  currentView = VIEWS.includes(name) ? name : "find";
  for (const v of VIEWS) $(`view-${v}`).hidden = v !== currentView;
  const tabFor = currentView === "area" ? "areas" : currentView;
  document.querySelectorAll(".tab").forEach((t) => {
    if (t.dataset.view === tabFor) t.setAttribute("aria-current", "page"); else t.removeAttribute("aria-current");
  });
  renderViews();
  if (currentView === "car") renderCar(); else stopTimer();
  document.querySelector(`#view-${currentView} h2[tabindex]`)?.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

function go(hash) {
  if (location.hash === hash) showView(); else location.hash = hash;
}

// ---------- events ----------
document.addEventListener("click", (e) => {
  const heart = e.target.closest(".heart");
  if (heart) return toggleFavorite(Number(heart.dataset.areaId), heart);
  const tab = e.target.closest(".tab");
  if (tab) return go(`#${tab.dataset.view}`);
  const park = e.target.closest("[data-park-area]");
  if (park) {
    go("#car");
    if (!activeSession) { $("car-area").value = park.dataset.parkArea; updateCarWarning(); }
    return;
  }
  const end = e.target.closest("#end-session");
  if (end) endSession(end);
});

document.addEventListener("submit", (e) => {
  if (e.target.id === "car-form") startSession(e);
  if (e.target.id === "note-form") saveNote(e);
});

$("permit-select").addEventListener("change", renderPermitInfo);
$("car-area").addEventListener("change", updateCarWarning);
$("car-minutes").addEventListener("change", updateCarWarning);

$("find-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const id = Number($("permit-select").value);
  if (!id) { setStatus("Choose your permit first so we can check which areas you can use.", true); $("permit-select").focus(); return; }
  find.permitId = id;
  find.day = Number($("arrive-day").value);
  find.time = $("arrive-time").value || nowHHMM();
  savePermit(id);
  setStatus(`Showing areas for ${DAY_NAMES[find.day]} at ${fmtTime(find.time)}.`);
  go("#areas");
});

window.addEventListener("hashchange", showView);

(async function init() {
  const cfg = window.APP_CONFIG;
  if (!cfg || !cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes("YOUR-PROJECT")) {
    setStatus("Missing config.js. Copy config.example.js to config.js and add your Supabase URL and key.", true);
    return;
  }
  db = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  try {
    await loadData();
    showView();
  } catch (err) {
    console.error(err);
    const hint = /permission|policy|RLS|denied/i.test(err.message || "")
      ? " If this mentions permissions, run supabase/2026-10-14-screens-policies.sql in the Supabase SQL Editor."
      : "";
    setStatus(`Could not load parking data: ${err.message}.${hint}`, true);
  }
})();
