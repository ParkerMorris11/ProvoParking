// Provo Parking — vertical slice: the Save to favorites heart.
// Flow: tap heart -> request to Supabase -> row added/removed in favorite_area
//       -> Supabase returns the row -> UI updates -> still there after refresh.

// No login yet: the app acts as the demo user seeded in schema.sql (Emma Carter, user_id 1).
const DEMO_USER_ID = 1;

const statusEl = document.getElementById("status");
const areaList = document.getElementById("area-list");
const favList = document.getElementById("fav-list");
const favEmpty = document.getElementById("fav-empty");
const favCount = document.getElementById("fav-count");

let db;
let areas = [];
let favoriteIds = new Set();
let permits = [];          // BYU permits only
let rules = [];            // parking_rule rows: { area_id, permit_id }
let myPermitId = null;     // the BYU permit the demo user selected
let profile = null;        // app_user row for the demo user
let extrasLoaded = false;  // false until permit/settings tables could be read
const GUIDE_KEY = "provoParking.guideSeen";

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function availabilityText(area) {
  if (area.est_available_spaces == null) return { text: "Availability unknown", cls: "" };
  const pct = area.total_spaces ? area.est_available_spaces / area.total_spaces : 0;
  return {
    text: `About ${area.est_available_spaces} of ${area.total_spaces} spaces open (estimate)`,
    cls: pct < 0.1 ? "low" : "ok",
  };
}

function cardHtml(area) {
  const saved = favoriteIds.has(area.area_id);
  const avail = availabilityText(area);
  const label = saved ? `Remove ${area.area_name} from favorites` : `Save ${area.area_name} to favorites`;
  return `
    <li class="card">
      <div class="card-body">
        <h2>${escapeHtml(area.area_name)}</h2>
        <p class="meta">${escapeHtml(area.operator)}${area.is_free ? " · Free" : ""}</p>
        <p class="avail ${avail.cls}">${avail.text}</p>
        ${validForMyPermit(area) ? `<p class="valid">&#10003; Valid with your ${escapeHtml(myPermit().permit_code)} pass</p>` : ""}
      </div>
      <button type="button" class="heart" data-area-id="${area.area_id}"
              aria-pressed="${saved}" aria-label="${escapeHtml(label)}">${saved ? "♥" : "♡"}</button>
    </li>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function render() {
  areaList.innerHTML = areas.map(cardHtml).join("");
  const favs = areas.filter((a) => favoriteIds.has(a.area_id));
  favList.innerHTML = favs.map(cardHtml).join("");
  favEmpty.hidden = favs.length > 0;
  favCount.textContent = favs.length;
  renderStart();
  renderPermits();
  renderSettings();
}

function myPermit() {
  return permits.find((p) => p.permit_id === myPermitId) || null;
}

function validAreaIds(permitId) {
  return new Set(rules.filter((r) => r.permit_id === permitId).map((r) => r.area_id));
}

function validForMyPermit(area) {
  return myPermitId != null && validAreaIds(myPermitId).has(area.area_id);
}

function renderStart() {
  const set = (id, done, text) => {
    const li = document.getElementById(id);
    li.classList.toggle("done", done);
    const state = li.querySelector("[data-state]");
    if (state) state.textContent = text;
  };
  const p = myPermit();
  set("step-permit", !!p, p ? `Selected: ${p.permit_name}` : "");
  set("step-areas", false, "");
  set("step-favs", favoriteIds.size > 0, favoriteIds.size ? `${favoriteIds.size} saved` : "");
}

function permitCardHtml(p) {
  const checked = p.permit_id === myPermitId;
  const places = areas.filter((a) => validAreaIds(p.permit_id).has(a.area_id)).map((a) => a.area_name);
  return `
    <li>
      <label class="card permit ${checked ? "selected" : ""}">
        <input type="radio" name="permit" value="${p.permit_id}" ${checked ? "checked" : ""}>
        <div class="card-body">
          <h3>${escapeHtml(p.permit_name)} <span class="code">${escapeHtml(p.permit_code)}</span></h3>
          <p class="meta">${escapeHtml(p.description || "")}</p>
          ${p.cost_note ? `<p class="meta"><strong>Cost:</strong> ${escapeHtml(p.cost_note)}</p>` : ""}
          <p class="meta"><strong>Valid at:</strong> ${places.length ? places.map(escapeHtml).join("; ") : "no sample areas yet"}</p>
        </div>
      </label>
    </li>`;
}

function renderPermits() {
  const list = document.getElementById("permit-list");
  list.innerHTML = permits.map(permitCardHtml).join("");
  const p = myPermit();
  document.getElementById("current-permit").textContent = p ? `Your pass: ${p.permit_name}` : "No pass selected yet.";
  document.getElementById("permit-clear").hidden = !p;
}

function renderSettings() {
  document.getElementById("settings-user").textContent = profile ? `Signed in as ${profile.display_name}` : "";
  for (const sw of document.querySelectorAll(".switch")) {
    const on = !!(profile && profile[sw.dataset.field]);
    sw.setAttribute("aria-checked", String(on));
    sw.textContent = on ? "On" : "Off";
    sw.disabled = !profile;
  }
}

async function loadData() {
  const [areasRes, favRes] = await Promise.all([
    db.from("parking_area").select("area_id, area_name, operator, total_spaces, est_available_spaces, is_free").order("area_name"),
    db.from("favorite_area").select("area_id").eq("user_id", DEMO_USER_ID),
  ]);
  if (areasRes.error) throw areasRes.error;
  if (favRes.error) throw favRes.error;
  areas = areasRes.data;
  favoriteIds = new Set(favRes.data.map((f) => f.area_id));
  render();
  setStatus(`${areas.length} parking areas loaded. Showing favorites for the demo user.`);
  await loadExtras();
}

// Permit and settings data. Needs supabase/2026-10-14-permit-settings-policies.sql; the
// parking list above keeps working if that has not been run yet.
async function loadExtras() {
  const [permitRes, userPermitRes, ruleRes, userRes] = await Promise.all([
    db.from("permit").select("permit_id, permit_code, permit_name, issuer, description, cost_note").eq("issuer", "BYU").order("permit_name"),
    db.from("user_permit").select("permit_id").eq("user_id", DEMO_USER_ID),
    db.from("parking_rule").select("area_id, permit_id"),
    db.from("app_user").select("display_name, location_permission, notifications_enabled").eq("user_id", DEMO_USER_ID).maybeSingle(),
  ]);
  const err = permitRes.error || userPermitRes.error || ruleRes.error || userRes.error;
  if (err) {
    console.error(err);
    setStatus("Parking areas loaded, but permits and settings could not be read. Run supabase/2026-10-14-permit-settings-policies.sql.", true);
    return;
  }
  permits = permitRes.data;
  rules = ruleRes.data;
  profile = userRes.data;
  const mine = new Set(userPermitRes.data.map((r) => r.permit_id));
  myPermitId = (permits.find((p) => mine.has(p.permit_id)) || {}).permit_id ?? null;
  extrasLoaded = true;
  render();
}

async function selectPermit(permitId) {
  if (!extrasLoaded) return setStatus("Permits are not available yet.", true);
  const ids = permits.map((p) => p.permit_id);
  try {
    // One BYU pass at a time: clear the old one, then add the new one.
    const del = await db.from("user_permit").delete().eq("user_id", DEMO_USER_ID).in("permit_id", ids);
    if (del.error) throw del.error;
    if (permitId != null) {
      const { data, error } = await db.from("user_permit")
        .insert({ user_id: DEMO_USER_ID, permit_id: permitId }).select().single();
      if (error) throw error;
      myPermitId = data.permit_id;
      setStatus(`Your pass is now ${myPermit().permit_name}.`);
    } else {
      myPermitId = null;
      setStatus("Pass cleared.");
    }
  } catch (err) {
    console.error(err);
    setStatus(`Could not save your pass: ${err.message}`, true);
    await loadExtras();
    return;
  }
  render();
}

async function toggleSetting(sw) {
  if (!profile) return;
  const field = sw.dataset.field;
  const next = !profile[field];
  sw.disabled = true;
  try {
    const { data, error } = await db.from("app_user").update({ [field]: next })
      .eq("user_id", DEMO_USER_ID).select("display_name, location_permission, notifications_enabled");
    if (error) throw error;
    if (!data.length) throw new Error("The database did not save the setting.");
    profile = data[0];
    setStatus("Setting saved.");
  } catch (err) {
    console.error(err);
    setStatus(`Could not save setting: ${err.message}`, true);
  }
  renderSettings();
}

function guideSeen(value) {
  try {
    if (value === undefined) return localStorage.getItem(GUIDE_KEY) === "1";
    if (value) localStorage.setItem(GUIDE_KEY, "1"); else localStorage.removeItem(GUIDE_KEY);
  } catch { /* storage blocked: guide just shows each visit */ }
  return value;
}

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
    render();
  } catch (err) {
    console.error(err);
    setStatus(`Could not update favorites: ${err.message}`, true);
    button.disabled = false;
  }
}

function showView(name) {
  for (const tab of document.querySelectorAll(".tab")) {
    const on = tab.dataset.view === name;
    document.getElementById(`view-${tab.dataset.view}`).hidden = !on;
    if (on) tab.setAttribute("aria-current", "page"); else tab.removeAttribute("aria-current");
  }
}

document.addEventListener("click", (e) => {
  const heart = e.target.closest(".heart");
  if (heart) toggleFavorite(Number(heart.dataset.areaId), heart);
  const tab = e.target.closest(".tab");
  if (tab) showView(tab.dataset.view);
  const go = e.target.closest("[data-goto]");
  if (go) showView(go.dataset.goto);
  if (e.target.closest("#start-done")) { guideSeen(true); showView("areas"); }
  if (e.target.closest("#permit-clear")) selectPermit(null);
  const sw = e.target.closest(".switch");
  if (sw) toggleSetting(sw);
  if (e.target.closest("#reset-guide")) { guideSeen(false); setStatus("The getting started guide will show next time you open the app."); }
});

document.addEventListener("change", (e) => {
  if (e.target.name === "permit") selectPermit(Number(e.target.value));
});

(async function init() {
  const cfg = window.APP_CONFIG;
  if (!cfg || !cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes("YOUR-PROJECT")) {
    setStatus("Missing config.js. Copy config.example.js to config.js and add your Supabase URL and key.", true);
    return;
  }
  if (!guideSeen()) showView("start");
  db = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  try {
    await loadData();
  } catch (err) {
    console.error(err);
    setStatus(`Could not load parking data: ${err.message}`, true);
  }
})();
