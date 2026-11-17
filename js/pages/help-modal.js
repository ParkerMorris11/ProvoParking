// Quick-guide dialog (#help-modal): permit colors, the 2D/3D switch, live location and directions.
// Opened by any element with [data-help-open] (Quick guide in the profile menu beside the map search bar).
// Permit colors are not repeated here: the permit list on the map chip is the one color legend.
let dialog;

function open(trigger) {
  if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", "");
  // A trigger inside a menu that closes can name a steadier element to get focus back (data-help-return).
  dialog.returnTarget = document.getElementById(trigger?.dataset?.helpReturn || "") || trigger;
  document.getElementById("help-modal-title")?.focus();
}

function close() {
  if (typeof dialog.close === "function") dialog.close(); else dialog.removeAttribute("open");
}

export function initHelpModal() {
  dialog = typeof document !== "undefined" ? document.getElementById("help-modal") : null;
  if (!dialog) return;
  document.addEventListener("click", (e) => {
    const trigger = e.target.closest("[data-help-open]");
    if (trigger) { e.preventDefault(); open(trigger); return; }
    if (e.target === dialog) close(); // a click on the dimmed backdrop
  });
  dialog.addEventListener("click", (e) => { if (e.target.closest("#help-modal-more")) close(); });
  dialog.addEventListener("close", () => dialog.returnTarget?.focus?.());
}
