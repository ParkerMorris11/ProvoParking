// Dark mode. Loaded as a plain (non-module) script in <head> so the saved theme is applied
// before the page paints — no white flash when someone has picked dark.
//
// How it decides:
//   1. A choice saved by the header toggle ("light" or "dark") wins.
//   2. Otherwise the app starts dark.
// <html data-theme> holds the saved choice or the dark default.
// <html data-theme-active> always holds what is showing right now, so the toggle shows the right icon.
(function () {
  var KEY = 'pp-theme';
  var root = document.documentElement;

  function saved() {
    try { var v = localStorage.getItem(KEY); return v === 'dark' || v === 'light' ? v : null; }
    catch (e) { return null; }
  }
  function active() { return saved() || 'dark'; }

  function apply() {
    var choice = saved();
    root.setAttribute('data-theme', choice || 'dark');
    var now = active();
    root.setAttribute('data-theme-active', now);
    var buttons = document.querySelectorAll('.theme-toggle');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute('aria-pressed', now === 'dark' ? 'true' : 'false');
      buttons[i].setAttribute('title', now === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    }
  }

  function toggle() {
    var next = active() === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(KEY, next); } catch (e) { /* private mode: still switch for this visit */ root.setAttribute('data-theme', next); }
    apply();
    if (!saved()) { root.setAttribute('data-theme', next); root.setAttribute('data-theme-active', next); }
  }

  apply();
  document.addEventListener('click', function (event) {
    var button = event.target.closest && event.target.closest('.theme-toggle');
    if (button) toggle();
  });
  document.addEventListener('DOMContentLoaded', apply);
})();
