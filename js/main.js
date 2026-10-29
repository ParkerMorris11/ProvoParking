// Provo Parking entry point. Screens:
//   Find (permit + arrival time) -> Areas (eligibility list) -> Area details (rules)
//   Favorites (heart, stored in favorite_area) -> My car (parking timer, stored in parking_session)
// Everything is read from / written to Supabase, so it survives a refresh.
// Where things live: see docs/CONTRIBUTING.md.
import { state } from "./state.js";
import { setStatus } from "./lib/dom.js";
import { loadSavedPermit } from "./lib/storage.js";
import { loadData } from "./data/load.js";
import { go, showView, renderViews } from "./router.js";
import { renderFind, initFind } from "./pages/find.js";
import { toggleFavorite } from "./pages/favorites.js";
import { initCar, preselectArea } from "./pages/car.js";

// Clicks shared across pages: hearts, tabs, "Park here".
document.addEventListener("click", (e) => {
  const heart = e.target.closest(".heart");
  if (heart) return toggleFavorite(Number(heart.dataset.areaId), heart, { renderViews });
  const tab = e.target.closest(".tab");
  if (tab) return go(`#${tab.dataset.view}`);
  const park = e.target.closest("[data-park-area]");
  if (park) {
    go("#car");
    preselectArea(park.dataset.parkArea);
  }
});

initFind({ go });
initCar();
window.addEventListener("hashchange", showView);

(async function init() {
  const cfg = window.APP_CONFIG;
  if (!cfg || !cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes("YOUR-PROJECT")) {
    setStatus("Missing config.js. Copy config.example.js to config.js and add your Supabase URL and key.", true);
    return;
  }
  state.db = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  try {
    await loadData();
    const saved = loadSavedPermit();
    if (saved && state.permits.some((p) => p.permit_id === saved)) state.find.permitId = saved;
    renderFind();
    setStatus(`${state.areas.length} parking areas loaded. Showing data for the demo user.`);
    showView();
  } catch (err) {
    console.error(err);
    const hint = /permission|policy|RLS|denied/i.test(err.message || "")
      ? " If this mentions permissions, run supabase/2026-10-14-screens-policies.sql in the Supabase SQL Editor."
      : "";
    setStatus(`Could not load parking data: ${err.message}.${hint}`, true);
  }
})();
