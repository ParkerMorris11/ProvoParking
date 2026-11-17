// Shared hide/show helpers for the start-up and sign-in splash screens.
// The overlay is removed as soon as the caller is ready. The fade is visual
// only: it never delays app init, and it is skipped when the person asked
// for less motion or when CSS transitions are not available (unit tests).
const FADE_MS = 320;

function canFade(screen) {
  return typeof matchMedia === "function"
    && !matchMedia("(prefers-reduced-motion: reduce)").matches
    && typeof screen.classList?.add === "function"
    && typeof screen.addEventListener === "function";
}

export function hideSplash(screen) {
  if (!screen || screen.hidden) return;
  if (screen.classList?.contains?.("is-leaving")) return;

  const finish = () => {
    if (screen.hidden) return;
    screen.hidden = true;
    screen.classList?.remove?.("is-leaving");
    screen.setAttribute?.("aria-busy", "false");
  };

  if (!canFade(screen)) {
    finish();
    return;
  }

  screen.classList.add("is-leaving");
  const onEnd = (event) => {
    if (event && event.target !== screen) return;
    screen.removeEventListener?.("transitionend", onEnd);
    finish();
  };
  screen.addEventListener("transitionend", onEnd);
  setTimeout(onEnd, FADE_MS + 80);
}

export function prepareSplash(screen) {
  if (!screen) return;
  screen.classList?.remove?.("is-leaving");
  screen.setAttribute?.("aria-busy", "true");
}
