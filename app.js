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
  const isFav = name === "favorites";
  const tabAreas = document.getElementById("tab-areas");
  const tabFav = document.getElementById("tab-favorites");
  document.getElementById("view-areas").hidden = isFav;
  document.getElementById("view-favorites").hidden = !isFav;
  const [on, off] = isFav ? [tabFav, tabAreas] : [tabAreas, tabFav];
  on.setAttribute("aria-current", "page");
  off.removeAttribute("aria-current");
}

document.addEventListener("click", (e) => {
  const heart = e.target.closest(".heart");
  if (heart) toggleFavorite(Number(heart.dataset.areaId), heart);
  if (e.target.closest("#tab-areas")) showView("areas");
  if (e.target.closest("#tab-favorites")) showView("favorites");
});

(async function init() {
  const cfg = window.APP_CONFIG;
  if (!cfg || !cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes("YOUR-PROJECT")) {
    setStatus("Missing config.js. Copy config.example.js to config.js and add your Supabase URL and key.", true);
    return;
  }
  db = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  try {
    await loadData();
  } catch (err) {
    console.error(err);
    setStatus(`Could not load parking data: ${err.message}`, true);
  }
})();
