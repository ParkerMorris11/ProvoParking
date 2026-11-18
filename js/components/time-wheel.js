// A phone-style scroll wheel (like the iOS timer) for picking one number.
// Swipe or scroll to spin, tap a number to jump to it, or use the arrow keys.
// The wheel is a spinbutton for screen readers; onChange fires whenever the centered value changes.
const ROW = 44; // px; must match .time-wheel-item height in styles.css

export function createTimeWheel(root, { values, value, label, unit = "", onChange = () => {} }) {
  let index = Math.max(0, values.indexOf(value));
  let settleTimer = null;
  root.classList.add("time-wheel");
  root.setAttribute("role", "spinbutton");
  root.setAttribute("tabindex", "0");
  root.setAttribute("aria-label", label);
  root.setAttribute("aria-valuemin", String(values[0]));
  root.setAttribute("aria-valuemax", String(values.at(-1)));
  root.innerHTML = `<div class="time-wheel-track">${values
    .map((v, i) => `<div class="time-wheel-item" data-index="${i}" aria-hidden="true">${String(v).padStart(unit === "min" ? 2 : 1, "0")}</div>`)
    .join("")}</div>`;
  const items = [...root.querySelectorAll(".time-wheel-item")];

  function paint() {
    const v = values[index];
    root.setAttribute("aria-valuenow", String(v));
    root.setAttribute("aria-valuetext", `${v} ${unit === "min" ? (v === 1 ? "minute" : "minutes") : (v === 1 ? "hour" : "hours")}`);
    items.forEach((item, i) => item.classList.toggle("selected", i === index));
  }
  let gliding = null; // while we scroll the wheel ourselves, its in-between positions are not choices
  function set(i, { scroll = true, smooth = true, notify = true } = {}) {
    const next = Math.min(values.length - 1, Math.max(0, i));
    const changed = next !== index;
    index = next;
    if (scroll) {
      clearTimeout(gliding);
      gliding = smooth ? setTimeout(() => { gliding = null; }, 400) : null;
      root.scrollTo({ top: index * ROW, behavior: smooth ? "smooth" : "auto" });
    }
    paint();
    if (changed && notify) onChange(values[index]);
  }

  root.addEventListener("scroll", () => {
    if (gliding) return;
    const i = Math.round(root.scrollTop / ROW);
    if (i !== index) set(i, { scroll: false });
    clearTimeout(settleTimer); // snap exactly onto a row once the swipe stops
    settleTimer = setTimeout(() => {
      if (Math.abs(root.scrollTop - index * ROW) > 1) root.scrollTo({ top: index * ROW, behavior: "smooth" });
    }, 120);
  }, { passive: true });
  root.addEventListener("click", e => {
    const item = e.target.closest(".time-wheel-item");
    if (item) set(Number(item.dataset.index));
  });
  root.addEventListener("keydown", e => {
    const step = { ArrowUp: -1, ArrowDown: 1, PageUp: -3, PageDown: 3 }[e.key];
    if (step) { e.preventDefault(); set(index + step); }
    else if (e.key === "Home") { e.preventDefault(); set(0); }
    else if (e.key === "End") { e.preventDefault(); set(values.length - 1); }
  });

  paint();
  // Position once the wheel is laid out (it may still be hidden when created).
  requestAnimationFrame(() => { root.scrollTop = index * ROW; });

  return {
    get value() { return values[index]; },
    setValue(v, opts) { const i = values.indexOf(v); if (i >= 0) set(i, { smooth: false, ...opts }); },
    refresh() { root.scrollTop = index * ROW; },
  };
}
