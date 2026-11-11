// Dark mode. Loaded as a plain (non-module) script in <head> so the saved theme is applied
// before the page paints — no white flash when someone has picked dark.
//
// How it decides:
//   1. A choice saved by the header toggle ("light" or "dark") wins.
//   2. Otherwise the site follows the phone/laptop setting (prefers-color-scheme).
// <html data-theme> holds the saved choice (absent = follow the device).
// <html data-theme-active> always holds what is showing right now, so the toggle shows the right icon.
(function () {
  var KEY = 'pp-theme';
  var root = document.documentElement;
  var visitChoice = null;
  var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function saved() {
    if (visitChoice) return visitChoice;
    try { var v = localStorage.getItem(KEY); return v === 'dark' || v === 'light' ? v : null; }
    catch (e) { return null; }
  }
  function active() { return saved() || (media && media.matches ? 'dark' : 'light'); }

  function apply() {
    var choice = saved();
    if (choice) root.setAttribute('data-theme', choice); else root.removeAttribute('data-theme');
    var now = active();
    updateChoices(now);
    root.setAttribute('data-theme-active', now);
    var buttons = document.querySelectorAll('.theme-toggle');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute('aria-pressed', now === 'dark' ? 'true' : 'false');
      buttons[i].setAttribute('title', now === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    }
  }

  function choose(next) {
    if (next !== 'light' && next !== 'dark') return;
    try { localStorage.setItem(KEY, next); visitChoice = null; } catch (e) { visitChoice = next; }
    apply();
  }
  function updateChoices(now) {
    document.querySelectorAll("[data-theme-choice]").forEach(function (button) { button.setAttribute("aria-pressed", String(button.dataset.themeChoice === now)); });
  }
  function toggle() {
    choose(active() === 'dark' ? 'light' : 'dark');
  }

  apply();
  if (media && media.addEventListener) media.addEventListener('change', apply);
  document.addEventListener('click', function (event) {
    var button = event.target.closest && event.target.closest('.theme-toggle');
    if (button) toggle();
    var choice = event.target.closest && event.target.closest("[data-theme-choice]");
    if (choice) choose(choice.dataset.themeChoice);
  });
  document.addEventListener('DOMContentLoaded', apply);
})();
