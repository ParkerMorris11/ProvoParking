import { adminIdentity, METRICS, OBJECTIVES, METRIC_REASONS, METRIC_SUMMARIES, defaultGoals, validateGoals, metricPresentation } from "./domain/admin.js";
import { escapeHtml } from "./lib/format.js";

import { loadGoals, saveGoals } from "./data/admin-goals.js";

const $ = id => document.getElementById(id);
let client, version = 0, timer, signedIn = false, loading = false;
let goals = defaultGoals(), revision = null, editorRevision, lastData, saving = false;
const status = (text, error = false) => { $("admin-status").textContent = text; $("admin-status").classList.toggle("error", error); };

function clearMetrics() {
  version++;
  goals = defaultGoals(); revision = null; lastData = null;
  $("goals-editor").close();
  $("admin-edit-goals").disabled = true;
  $("goals-notice").textContent = "";
  signedIn = false;
  clearTimeout(timer);
  $("metric-help").close();
  $("admin-dashboard").hidden = true;
  $("okr-one").innerHTML = $("okr-two").innerHTML = "";
  $("admin-updated").textContent = "";
  document.title = "Admin sign in · Provo Parking";
}
function showLogin(message = "", error = false) {
  clearMetrics();
  $("admin-login").hidden = false;
  $("admin-logout").hidden = true;
  $("admin-password").value = "";
  status(message, error);
}
function helpControl(id, label, text) {
  return '<span class="help-wrap"><button type="button" class="metric-help" data-help="' + id + '" aria-haspopup="dialog" aria-describedby="tip-' + id + '" aria-label="' + escapeHtml(label) + '">?</button><span class="help-tooltip" role="tooltip" id="tip-' + id + '">' + escapeHtml(text) + '</span></span>';
}
function renderMetrics(data) {
  lastData = data;
  ["one", "two"].forEach((name, i) => {
    $("objective-" + name).textContent = goals.objectives[i];
    $("objective-help-" + name).innerHTML = helpControl("objective-" + i, "Explain objective " + (i + 1), OBJECTIVES[i].help);
  });
  const coverage = [
    `${data.signups} signed-up users`,
    `${data.favorites_count} saved spots across ${data.signups} users`,
    `${data.distance_sessions} of ${data.total_sessions} real-lot sessions measured`,
    `${data.parking_sessions} of ${data.total_sessions} real-lot sessions matched to a visit`,
  ];
  const cards = METRICS.map((definition, index) => {
    const metric = { ...definition, ...goals.metrics[index] };
    const result = metricPresentation(metric, data[metric.key]);
    const target = metric.lower ? metric.strict ? "Under" : "At most" : "At least";
    return `<article class="metric-card" aria-labelledby="metric-${metric.key}">
      <div class="metric-heading"><div><p class="eyebrow">${metric.kr}</p><h3 id="metric-${metric.key}">${escapeHtml(metric.title)}</h3></div>
      ${helpControl(String(index), `Explain ${metric.kr}: ${metric.title}`, METRIC_SUMMARIES[index] + " Why it matters: " + METRIC_REASONS[index])}</div>
      <p class="metric-description">${METRIC_SUMMARIES[index]}</p><p class="metric-value">${escapeHtml(result.value)} <span class="metric-unit">${metric.unit}</span></p>
      <p class="metric-target">Target: ${target.toLowerCase()} ${metric.target} ${metric.unit}</p>
      <p class="metric-status ${result.kind}">${result.status}</p><p class="hint">${escapeHtml(coverage[index])}</p></article>`;
  });
  // Restore a focused explanation button after background updates.
  for (const [id, content] of [["okr-one", cards.slice(0, 2).join("")], ["okr-two", cards.slice(2).join("")]]) {
    const active = document.activeElement;
    const helpIndex = $(id).contains(active) ? active.dataset.help : undefined;
    $(id).innerHTML = content;
    if (helpIndex !== undefined) $(id).querySelector(`[data-help="${helpIndex}"]`)?.focus({ preventScroll: true });
  }
  $("admin-updated").textContent = `Last updated ${new Date(data.measured_at).toLocaleString()}.`;
}
function scheduleRefresh() {
  clearTimeout(timer);
  if (signedIn && !document.hidden) timer = setTimeout(() => void refresh(), 30000);
}
async function refresh(initial = false) {
  if (loading || saving || !client) return;
  loading = true;
  const current = version;
  $("admin-refresh").disabled = true;
  status(initial ? "Checking admin access…" : "Updating metrics…");
  try {
    const { data, error } = await client.rpc("get_admin_okr_metrics");
    if (current !== version) return;
    if (error) throw error;
    if (!data || !data.measured_at) throw new Error("Invalid metrics response");
    signedIn = true;
    $("admin-login").hidden = true;
    $("admin-dashboard").hidden = false;
    $("admin-logout").hidden = false;
    document.title = "Admin dashboard · Provo Parking";
    try {
      const saved = await loadGoals(client);
      if (current !== version) return;
      if (revision === null || saved.revision >= revision) { goals = saved.goals; revision = saved.revision; }
      $("admin-edit-goals").disabled = false;
      $("goals-notice").textContent = "";
    } catch (error) {
      if (current !== version) return;
      if (error.code === "42501") throw error;
      $("admin-edit-goals").disabled = true;
      $("goals-notice").textContent = "Saved goals are unavailable. " + (revision === null ? "Showing default targets. Apply the admin goals migration to enable editing." : "Showing the last loaded targets; try Refresh metrics.");
    }
    renderMetrics(data);
    status("Metrics are up to date.");
    if (initial) $("admin-title").focus();
  } catch (error) {
    if (current !== version) return;
    if (["42501", "PGRST301", "PGRST302", "PGRST303"].includes(error.code)) {
      showLogin("Admin access could not be verified. Sign in with an authorized admin account.", true);
      await client.auth.signOut({ scope: "local" }).catch(() => {});
    } else {
      // Never render invented zeros when the database is unavailable.
      $("okr-one").innerHTML = $("okr-two").innerHTML = "";
      $("admin-updated").textContent = "";
      status("Metrics could not be loaded. Check your connection and try again. If this is the first setup, ask the project owner to apply the admin tracking migration.", true);
    }
  } finally {
    loading = false;
    $("admin-refresh").disabled = false;
    scheduleRefresh();
  }
}

$("admin-login-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!client || loading) return;
  let email;
  try { email = adminIdentity($("admin-username").value); }
  catch (error) { status(error.message, true); $("admin-username").focus(); return; }
  $("admin-submit").disabled = true;
  status("Signing in…");
  try {
    const { error } = await client.auth.signInWithPassword({ email, password: $("admin-password").value });
    $("admin-password").value = "";
    if (error) { status("Sign-in failed. Check your username and password and try again.", true); return; }
    await refresh(true);
  } catch { status("Sign-in is unavailable. Please try again.", true); }
  finally { $("admin-submit").disabled = false; }
});
$("admin-logout").addEventListener("click", async () => {
  clearMetrics();
  $("admin-logout").disabled = true;
  status("Logging out…");
  try {
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error) throw error;
    window.location.replace("index.html#login");
  } catch {
    // Data is cleared immediately. Keep a way to retry if logout could not finish.
    status("Could not finish logging out. Please try Log out again.", true);
    $("admin-logout").disabled = false;
  }
});
$("admin-refresh").addEventListener("click", () => void refresh());
document.addEventListener("click", event => {
  const button = event.target.closest("[data-help]");
  if (!button) return;
  const id = button.dataset.help;
  const objective = id.startsWith("objective-");
  const index = Number(objective ? id.slice(10) : id);
  $("metric-help-title").textContent = objective ? goals.objectives[index] : `${METRICS[index].kr}: ${goals.metrics[index].title}`;
  $("metric-help-text").textContent = objective ? OBJECTIVES[index].help : METRICS[index].help.replace(/ Target:.*$/, "") + " Why it matters: " + METRIC_REASONS[index];
  $("metric-help").showModal();
});
$("admin-edit-goals").addEventListener("click", () => {
  editorRevision = revision;
  $("goals-error").textContent = "";
  $("goals-fields").innerHTML = goals.objectives.map((title, i) => '<fieldset><legend>Objective ' + (i + 1) + '</legend><label for="goal-objective-' + i + '">Objective</label><input id="goal-objective-' + i + '" type="text" maxlength="160" required value="' + escapeHtml(title) + '">' +
    goals.metrics.slice(i * 2, i * 2 + 2).map((m, j) => {
      const index = i * 2 + j, metric = METRICS[index];
      return '<div class="goal-result"><label for="goal-title-' + index + '">' + metric.kr + ' title</label><input id="goal-title-' + index + '" type="text" maxlength="160" required value="' + escapeHtml(m.title) + '"><p class="hint">Measures: ' + metric.title + '. ' + (metric.lower ? metric.strict ? 'Under' : 'At most' : 'At least') + ' the target below.</p><label for="goal-target-' + index + '">Target (' + metric.unit + ')</label><input id="goal-target-' + index + '" type="number" min="' + (index === 2 ? '0.000001' : '0') + '" max="1000000000" step="' + (index === 0 ? '1' : 'any') + '" required value="' + m.target + '"></div>';
    }).join("") + '</fieldset>').join("");
  $("goals-editor").showModal();
  $("goal-objective-0").focus();
});
$("goals-cancel").addEventListener("click", () => $("goals-editor").close());
$("goals-editor").addEventListener("cancel", event => { if (saving) event.preventDefault(); });
$("goals-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (saving || !signedIn) return;
  const current = version;
  $("goals-error").textContent = "";
  try {
    const next = validateGoals({
      objectives: [0, 1].map(i => $("goal-objective-" + i).value),
      metrics: METRICS.map((m, i) => ({ key: m.key, title: $("goal-title-" + i).value, target: Number($("goal-target-" + i).value) })),
    });
    saving = true;
    $("goals-save").disabled = $("goals-cancel").disabled = true;
    const saved = await saveGoals(client, next, editorRevision);
    if (current !== version) return;
    goals = saved.goals; revision = saved.revision;
    if (lastData) renderMetrics(lastData);
    $("goals-editor").close();
    status("Goals saved for all admins.");
    $("admin-edit-goals").focus();
  } catch (error) {
    if (current !== version) return;
    $("goals-error").textContent = error.code === "40001"
      ? "Another admin changed these goals. Cancel and refresh metrics to review their changes before saving."
      : error.code === "42501" ? "Your admin access ended. Close this editor and sign in again."
      : "Goals were not saved. " + (error instanceof Error ? error.message : "Check your connection and try again.");
  } finally {
    saving = false;
    $("goals-save").disabled = $("goals-cancel").disabled = false;
  }
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape") document.querySelectorAll(".help-wrap").forEach(el => el.classList.add("help-dismissed"));
});
document.addEventListener("pointerover", event => event.target.closest(".help-wrap")?.classList.remove("help-dismissed"));
document.addEventListener("focusin", event => event.target.closest(".help-wrap")?.classList.remove("help-dismissed"));

document.addEventListener("visibilitychange", () => {
  if (document.hidden) clearTimeout(timer);
  else if (signedIn) void refresh();
});
window.addEventListener("pagehide", () => { clearTimeout(timer); clearMetrics(); });
window.addEventListener("pageshow", event => { if (event.persisted && client) void refresh(true); });

(async () => {
  const config = window.APP_CONFIG;
  if (!config?.SUPABASE_URL || !config?.SUPABASE_ANON_KEY || !window.supabase) {
    showLogin("Admin sign-in is not configured. Ask the project owner to check config.js.", true); return;
  }
  // Admin tokens stay in this tab's memory; no shared browser password or long-lived storage.
  client = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, storageKey: "provoParking.admin", autoRefreshToken: true, detectSessionInUrl: false },
  });
  client.auth.onAuthStateChange(event => {
    if (event === "SIGNED_OUT" && signedIn) showLogin("Your admin session ended. Please sign in again.");
  });
  showLogin();
  $("admin-submit").disabled = false;
})();
