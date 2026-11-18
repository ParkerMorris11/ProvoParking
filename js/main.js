// Provo Parking entry point. Screens:
//   Sign up / Log in (first visit) -> Find (permit + arrival time) -> Areas (eligibility list)
//   -> Area details (rules) -> Favorites (heart, favorite_area) -> the floating car button (parking timer sheet, parking_session)
// Everything personal is read from / written to Supabase for the signed-in account.
// Where things live: see docs/CONTRIBUTING.md.
import { showAuthLoading } from "./components/auth-loading.js";
import { hideSplash } from "./components/splash.js";
import { resetParkingClock } from "./lib/server-clock.js";
import { state } from "./state.js";
import { createVisitTracker } from "./data/visit-tracker.js";
import { $, setStatus } from "./lib/dom.js";
import { loadSavedPermit } from "./lib/storage.js";
import { createAuthStorage } from "./lib/auth-storage.js";
import { loadData } from "./data/load.js";
import * as auth from "./data/auth.js";
import { go, showView, renderViews } from "./router.js";
import { renderFind, initFind, applyPermitChoice, resetFindSearch } from "./pages/find.js";
import { toggleFavorite, initFavorites, resetFavoriteEditor } from "./pages/favorites.js";
import { initCar, stopTimer, closeCarSheet } from "./pages/car.js";
import { initCarFab, renderCarFab } from "./components/car-fab.js";
import { initAuth, showAuth, hideAuth, requireAccount, requireFavoriteAccount, clearPasswords, askForPermits, setSignInOptions } from "./pages/auth.js";
import { takeParkingReturn } from "./lib/parking-return.js";
import { describeAuthError } from "./domain/account.js";
import { createParkingClock } from "./lib/parking-clock.js";
import { initFullscreenMap, resetMapSearch } from "./pages/fullscreen-map.js";
import { resetPersonalMap } from "./pages/map.js";
import { initHelpModal } from "./pages/help-modal.js";

const RETURNING_KEY = "provoParking.returning"; // this device has signed in before: show Log in, not Sign up
const GUEST_KEY = "provoParking.guest";         // this tab chose "Continue as guest" (sessionStorage)
const permitAskedKey = (userId) => `provoParking.permitAsked.${userId}`; // the optional permit step was shown

// Read before supabase-js tidies the address bar: did an email link open this page?
const linkHash = new URLSearchParams(location.hash.replace(/^#/, ""));
const openedFromResetLink = linkHash.get("type") === "recovery";
const linkError = linkHash.get("error_description");

const browserStorage = (name) => { try { return window[name]; } catch { return null; } };
const authStorage = createAuthStorage({ local: browserStorage("localStorage"), session: browserStorage("sessionStorage") });
const remember = (key, value) => { try { value == null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch { /* private mode */ } };
const recall = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
// Guest mode lasts only for this tab, so every new visit (a new tab, a new incognito window)
// starts on the sign-in screen, which still offers "Continue as guest".
const rememberGuest = (on) => { try { on ? sessionStorage.setItem(GUEST_KEY, "1") : sessionStorage.removeItem(GUEST_KEY); } catch { /* private mode */ } };
const isGuestTab = () => { try { return sessionStorage.getItem(GUEST_KEY) === "1"; } catch { return false; } };
remember(GUEST_KEY, null); // older versions kept guest mode forever in localStorage, which hid sign-in on later visits

let signingOut = false;
const parkingClock = createParkingClock({
  enabled: () => Boolean(state.db && state.find.live && (["areas", "area"].includes(state.currentView) || document.body.classList.contains("has-fs-home")) && !document.hidden && $("auth-screen").hidden),
  refresh: renderViews,
});
document.addEventListener("visibilitychange", () => parkingClock.update());
window.addEventListener("focus", () => parkingClock.update());
window.addEventListener("pageshow", () => parkingClock.update());
window.addEventListener("pagehide", () => parkingClock.stop());

// ---------- entering the app ----------
function renderAccountBar() {
  $("account-name").textContent = state.user ? state.user.displayName : "Browsing as guest";
  $("account-action").textContent = state.user ? "Log out" : "Sign up";
  const email = $("account-email");
  if (email) { email.textContent = state.user?.email || ""; email.hidden = !state.user?.email; }
}

function choosePermit() {
  const saved = loadSavedPermit(state.user?.userId);
  const mine = (state.user?.permitIds || []).filter((id) => state.permits.some((p) => p.permit_id === id));
  if (mine.length) state.find.permitId = mine.includes(saved) ? saved : mine[0];
  else if (saved && state.permits.some((p) => p.permit_id === saved)) state.find.permitId = saved;
  else state.find.permitId = null;
}

async function enterApp(note, version = state.authVersion) {
  renderAccountBar();
  setStatus("Loading parking areas…");
  try {
    if (!await loadData() || version !== state.authVersion) return;
    choosePermit();
    const parkingReturn = state.user ? takeParkingReturn() : null;
    const returnLot = parkingReturn?.hash.split("/")[1];
    if (parkingReturn) {
      if (state.destinations.some(d => d.destination_id === parkingReturn.destinationId)) state.find.destinationId = parkingReturn.destinationId;
      // Restore the underlying lot first so closing My Car still takes the driver back there.
      history.replaceState(null, "", returnLot ? `#area/${returnLot}` : "#areas");
    }
    renderFind();
    const who = state.user ? `Signed in as ${state.user.displayName}.` : "Browsing as a guest. Create an account to save favorites and start a parking timer.";
    setStatus(`${note ? `${note} ` : ""}${state.areas.filter((area) => !area.is_sample_data).length} verified parking areas loaded. ${who}`);
    hideAuth();
    showView();
    if (parkingReturn?.hash.startsWith("#car")) go(parkingReturn.hash);
    parkingClock.update();
  } catch (err) {
    if (version !== state.authVersion) return;
    console.error(err);
    hideAuth();
    setStatus(`Could not load parking data: ${err.message}. Refresh to try again.`, true);
  }
}

async function onSignedIn(session, note = "", { isNew = false } = {}) {
  clearPersonalData();
  const version = state.authVersion;
  state.authId = session.user.id;
  showAuthLoading("Loading your account…");
  try {
    const profile = await auth.loadProfile(session.user.id);
    if (version !== state.authVersion) return;
    if (!profile) {
      await auth.logOut().catch(() => {});
      if (version !== state.authVersion) return;
      showAuth("login", "Your account was created, but its profile isn't set up yet, so it can't be used. Please tell the team; the account database update may be missing.", true);
      return;
    }
    // New accounts (email or a first Google sign-in) get the optional "Which permit do you have?" step.
    if (isNew || (!profile.permitIds.length && !recall(permitAskedKey(profile.userId)))) {
      const chosen = await askForPermits(profile.userId);
      if (version !== state.authVersion) return;
      remember(permitAskedKey(profile.userId), "1");
      profile.permitIds = chosen;
      if (!note) note = "Welcome!";
    }
    state.user = profile;
    void state.visitTracker?.bind(session.user.id).then(() => state.visitTracker?.flush());
    state.guest = false;
    rememberGuest(false);
    remember(RETURNING_KEY, "1");
    await enterApp(note, version);
  } catch (err) {
    if (version !== state.authVersion) return;
    console.error(err);
    showAuth("login", `Could not load your account. ${describeAuthError(err, { action: "login" }).message}`, true);
  }
}

async function onGuest() {
  const parkingReturn = takeParkingReturn();
  if (parkingReturn?.hash.startsWith("#car")) {
    const returnLot = parkingReturn.hash.split("/")[1];
    history.replaceState(null, "", returnLot ? `#area/${returnLot}` : "#areas");
  }
  clearPersonalData();
  state.user = null;
  state.guest = true;
  rememberGuest(true);
  await enterApp("");
}

function clearPersonalData() {
  parkingClock.stop();
  // Discard a previous account's selected lot without breaking deliberate first-entry links.
  if (state.authId && /^#(?:car|area)(?:\/|$)/.test(location.hash)) history.replaceState(null, "", "#areas");
  state.find.live = true;
  state.find.permitId = null;
  state.find.customDestination = null;
  state.authVersion++;
  state.authId = null;
  clearPasswords();
  $("car-form").reset();
  $("car-active").innerHTML = "";
  state.user = null;
  state.guest = false;
  renderAccountBar();
  setStatus("");
  const timerStatus = $("car-action-status");
  timerStatus.textContent = "";
  timerStatus.hidden = true;
  state.favoriteIds = new Set();
  state.favoriteNames = new Map();
  state.activeSession = null;
  resetParkingClock();
  state.find.destinationId = null;
  state.destinations = [];
  resetFindSearch();
  resetMapSearch();
  resetFavoriteEditor();
  for (const id of ["area-search", "all-lots-search"]) {
    const input = $(id);
    if (input) input.value = "";
  }
  resetPersonalMap();
  stopTimer();
  closeCarSheet();
  renderCarFab();
  renderFind();
  renderViews();
}

async function signOut() {
  signingOut = true;
  clearPersonalData();
  showAuth("login", "Logging out…");
  const version = state.authVersion;
  $("auth-screen").inert = true;
  try { await auth.logOut(); } catch (err) { console.error(err); }
  finally { $("auth-screen").inert = false; signingOut = false; }
  if (version !== state.authVersion) return;
  state.visitTracker?.signedOut();
  clearPersonalData();
  showAuth("login", "You're logged out.");
}

// ---------- clicks shared across pages: hearts, tabs and account ----------
document.addEventListener("click", (e) => {
  const heart = e.target.closest(".heart");
  if (heart) {
    if (!requireFavoriteAccount(Number(heart.dataset.areaId))) return;
    return toggleFavorite(Number(heart.dataset.areaId), heart, { renderViews });
  }
  if (e.target.closest(".home-link")) { e.preventDefault(); return go("#areas"); } // title → Areas
  if (e.target.closest("#menu-toggle")) return setMenuOpen(!$("app-nav").classList.contains("menu-open"));
  if (!e.target.closest("#tab-list")) setMenuOpen(false); // click outside the dropdown closes it
  const tab = e.target.closest(".tab");
  if (tab) { setMenuOpen(false); return go(`#${tab.dataset.view}`); }
  if (e.target.closest("#account-action")) {
    if (state.user) return void signOut();
    rememberGuest(false);
    showAuth(recall(RETURNING_KEY) ? "login" : "signup");
  }
});

initFind({ go, choosePermit, refresh: renderViews });
initFavorites({ renderViews });
initCar({ requireAccount });
initCarFab({ go });
initAuth({ onSignedIn, onGuest, authStorage });
initHelpModal();
void initFullscreenMap({ applyPermit: (id) => applyPermitChoice(id, renderViews) }); // full-screen map + pull-up list on the Areas screen
window.addEventListener("hashchange", () => { showView(); parkingClock.update(); });

// Narrow-window tab menu (the ☰ button). Closes on Escape, on a tab choice, on an outside click,
// and when the window grows wide enough to show the tabs in a row again.
function setMenuOpen(open) {
  $("app-nav").classList.toggle("menu-open", open);
  $("menu-toggle").setAttribute("aria-expanded", String(open));
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && $("app-nav").classList.contains("menu-open")) {
    setMenuOpen(false);
    $("menu-toggle").focus();
  }
});
// Switch to the menu button only when the title, tabs, and account don't fit on one row.
// Re-checked whenever the header or the account area (name changes on sign-in) resizes.
function fitHeader() {
  if (document.body.classList.contains("has-fs-home")) return;
  const header = $("app-header");
  header.classList.remove("nav-compact");
  const cs = getComputedStyle(header);
  const room = header.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const items = [...header.children].filter((el) => el.getClientRects().length);
  const need = items.reduce((w, el) => w + el.getBoundingClientRect().width, 0) + parseFloat(cs.columnGap) * (items.length - 1);
  const compact = need > room;
  header.classList.toggle("nav-compact", compact);
  if (!compact) setMenuOpen(false);
  centerNav();
}

// How far the tabs must move left from their right-aligned spot to sit at the header's center,
// without sliding into the title. Uses offsetLeft/offsetWidth, which ignore the current transform.
function centerNav() {
  const header = $("app-header"), tabs = $("app-nav"), title = header.querySelector("h1");
  const cs = getComputedStyle(header);
  const padL = parseFloat(cs.paddingLeft), padR = parseFloat(cs.paddingRight);
  const center = padL + (header.clientWidth - padL - padR - tabs.offsetWidth) / 2;
  const gap = parseFloat(cs.columnGap);
  const minLeft = title.offsetLeft + title.offsetWidth + gap;
  // At the top the account area overlays the right end of the row; move at least far enough to clear it.
  const account = header.querySelector(".account-bar");
  const clearAccount = header.classList.contains("nav-compact") ? 0 : account.offsetWidth + gap;
  const shift = Math.max(0, Math.min(tabs.offsetLeft - minLeft, Math.max(tabs.offsetLeft - center, clearAccount)));
  header.style.setProperty("--nav-shift", shift + "px");
}
// "At the top" = not scrolled. Checked on every scroll, batched to one update per frame.
let scrollQueued = false;
function updateAtTop() {
  scrollQueued = false;
  $("app-header").classList.toggle("at-top", window.scrollY < 4);
}
window.addEventListener("scroll", () => {
  if (!scrollQueued) { scrollQueued = true; requestAnimationFrame(updateAtTop); }
}, { passive: true });
updateAtTop();
const headerWatch = new ResizeObserver(fitHeader);
headerWatch.observe($("app-header"));
headerWatch.observe($("app-header").querySelector(".account-bar"));
headerWatch.observe($("tab-list")); // e.g. the favorites badge changes the tabs' width

(async function init() {
  const loadingScreen = $("loading");
  // If session setup hangs, never leave people on the splash. Ready-path dismiss is immediate; the fade is visual only.
  const loadingFallback = setTimeout(() => hideSplash(loadingScreen), 8000);
  const dismissLoading = () => {
    clearTimeout(loadingFallback);
    hideSplash(loadingScreen);
  };
  const cfg = window.APP_CONFIG;
  if (!cfg || !cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes("YOUR-PROJECT")) {
    dismissLoading();
    for (const id of ["app-header", "app-main", "app-footer"]) $(id).hidden = false;
    setStatus("Missing config.js. Copy config.example.js to config.js and add your Supabase URL and key.", true);
    return;
  }
  state.db = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,     // stay signed in on this device...
      storage: authStorage,     // ...unless "Keep me signed in" was unchecked
      storageKey: "provoParking.auth",
      autoRefreshToken: true,   // renew the session quietly before it expires
      detectSessionInUrl: true, // finish sign-in after Google, and from password-reset links
    },
  });

  try {
    state.visitTracker = createVisitTracker({ storage: window.sessionStorage, rpc: (name, args) => state.db.rpc(name, args) });
    void state.visitTracker.open();
    window.addEventListener("online", () => void state.visitTracker?.flush());
  } catch { /* Tracking must never prevent the app from working. */ }

  auth.onAuthChange((event, changedSession) => {
    if (event === "SIGNED_IN" && changedSession?.user.id !== state.authId) {
      clearPersonalData();
      const version = state.authVersion;
      showAuthLoading("Loading your account…");
      // Defer Supabase calls until its auth callback releases the session lock.
      setTimeout(() => {
        if (version === state.authVersion && state.authId !== changedSession.user.id) void onSignedIn(changedSession);
      }, 0);
    }
    if (event === "PASSWORD_RECOVERY") showAuth("newpass");
    // Signed out somewhere else (another tab, or the session could not be renewed).
    if (event === "SIGNED_OUT" && !signingOut) {
      state.visitTracker?.signedOut();
      clearPersonalData();
      showAuth("login", "Your session ended. Please log in again.");
    }
  });

  // Show "Continue with Google" only if Google sign-in is turned on in Supabase.
  void auth.getAuthSettings({ url: cfg.SUPABASE_URL, key: cfg.SUPABASE_ANON_KEY }).then(setSignInOptions);

  let session = null;
  try { session = await auth.getCurrentSession(); } catch (err) { console.error(err); }
  dismissLoading();

  if (linkError) {
    history.replaceState(null, "", location.pathname + location.search);
    showAuth("login", `${linkError.replace(/\+/g, " ")}. Log in, or request a new link.`, true);
  } else if (openedFromResetLink && session) {
    showAuth("newpass");
  } else if (location.hash === "#login") {
    showAuth("login"); // explicit return from the separate admin page, even on a guest device
  } else if (session) {
    await onSignedIn(session);
  } else if (isGuestTab()) {
    await onGuest();
  } else {
    showAuth(recall(RETURNING_KEY) ? "login" : "signup");
  }
})();
