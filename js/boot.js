// Runs in <head> before the first paint: applies the saved theme and, when the
// app lock is on, hides the list until js/lock.js asks for the PIN, so
// neither the wrong colours nor the data flash on screen.
(() => {
  "use strict";
  try {
    const theme = localStorage.getItem("bilgilerim.theme");
    if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
    if (localStorage.getItem("bilgilerim.lock")) document.documentElement.classList.add("app-locked");
  } catch (_) { /* storage unavailable: system theme, no lock */ }
})();
