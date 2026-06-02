// Minimal screen switcher. Every top-level view is a <section class="screen">;
// showScreen reveals exactly one by id and hides the rest. No history / URL
// routing yet — Phase 1 just needs a single source of truth for "which screen".
//
//   import { showScreen } from "./app/router.js";
//   showScreen("home-screen");
export function showScreen(id) {
  for (const el of document.querySelectorAll(".screen")) {
    el.classList.toggle("hidden", el.id !== id);
  }
}
