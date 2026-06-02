// Fixed virtual stage. The entire UI is authored at a single virtual resolution
// (1280x720, 16:9) and uniformly scaled with transform:scale() to fit whatever
// window it's in, letterboxed by the body background. This keeps every screen's
// layout byte-for-byte identical regardless of window size — buttons never
// reflow or get pushed off-screen, and text scales together with everything
// else. Content that genuinely exceeds the stage scrolls inside its own screen
// (see `.screen { overflow:auto }` in styles.css).
//
//   import { STAGE_W, STAGE_H, initStage } from "./app/stage.js";
//   initStage();
export const STAGE_W = 1280;
export const STAGE_H = 720;

// Compute the largest uniform scale that fits the stage in the viewport and
// apply it. #stage-viewport flex-centers #app, so scaling about its center
// keeps it centered with even letterbox bars.
export function initStage(appId = "app") {
  const app = document.getElementById(appId);
  if (!app) return;
  const fit = () => {
    const scale = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
    app.style.transform = `scale(${scale})`;
  };
  fit();
  window.addEventListener("resize", fit);
  // iOS/Android sometimes change the visual viewport without a window resize.
  window.addEventListener("orientationchange", fit);
}
