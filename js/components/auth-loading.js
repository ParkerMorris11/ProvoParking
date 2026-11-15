// Full-screen sign-in feedback. Visibility is driven by the real request lifecycle.
const chromeIds = ["app-header", "app-nav", "app-main", "app-footer"];

export function showAuthLoading(message = "Signing you in…") {
  const screen = document.getElementById("auth-loading");
  document.getElementById("auth-loading-message").textContent = message;
  document.getElementById("auth-screen").inert = true;
  for (const id of chromeIds) document.getElementById(id).hidden = true;
  screen.hidden = false;
  screen.focus({ preventScroll: true });
}

export function hideAuthLoading() {
  document.getElementById("auth-loading").hidden = true;
  document.getElementById("auth-screen").inert = false;
}
