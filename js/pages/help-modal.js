// Quick-guide dialog (#help-modal): permit colors, the 2D/3D switch, live location and directions.
// Opened by any element with [data-help-open] (the "?" button on the map). The legend is copied from the
// map's own #map-legend each time, so the colors here can never drift from the map.
let dialog;

function open(trigger) {
  const legend = document.getElementById("map-legend");
  const copy = document.getElementById("help-legend");
  if (legend && copy) copy.innerHTML = legend.innerHTML;
  if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", "");
  dialog.returnTarget = trigger;
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
