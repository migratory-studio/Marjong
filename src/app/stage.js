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

// True while the stage is rotated 90° (portrait viewport, e.g. a phone held
// upright). Read by clientToLocalFrac() so pointer math stays correct.
let stageRotated = false;
export function isStageRotated() { return stageRotated; }

// Compute the largest uniform scale that fits the stage in the viewport and
// apply it. #stage-viewport flex-centers #app, so scaling about its center
// keeps it centered with even letterbox bars.
//
// On a portrait viewport (taller than wide — typically a phone held upright)
// the stage is additionally rotated 90° so the landscape game fills the screen
// without the user physically tilting the device. PC/landscape is unaffected:
// it never enters the portrait branch, so its transform is byte-identical.
export function initStage(appId = "app") {
  const app = document.getElementById(appId);
  if (!app) return;
  const fit = () => {
    stageRotated = window.innerHeight > window.innerWidth;
    if (stageRotated) {
      // After a 90° turn the stage's 1280-wide axis runs vertically, so fit
      // STAGE_W against the viewport height and STAGE_H against its width.
      const scale = Math.min(window.innerWidth / STAGE_H, window.innerHeight / STAGE_W);
      app.style.transform = `rotate(90deg) scale(${scale})`;
    } else {
      const scale = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
      app.style.transform = `scale(${scale})`;
    }
  };
  fit();
  window.addEventListener("resize", fit);
  // iOS/Android sometimes change the visual viewport without a window resize.
  window.addEventListener("orientationchange", fit);
}

// Map a viewport point (clientX/clientY) to a fraction (0..1) along an element's
// own natural width/height, given that element's getBoundingClientRect(). This
// undoes the stage's scale AND its optional 90° rotation in one place.
//
// Why it's correct under rotation: a rectangle rotated by exactly 90° is still
// axis-aligned, so the element's bounding-client rect *is* its rotated box (no
// AABB slack). For a 90° clockwise turn the element's local +x axis points
// viewport-down and local +y points viewport-left, hence the swap below.
export function clientToLocalFrac(rect, clientX, clientY) {
  if (!stageRotated) {
    return { fx: (clientX - rect.left) / rect.width, fy: (clientY - rect.top) / rect.height };
  }
  return { fx: (clientY - rect.top) / rect.height, fy: (rect.right - clientX) / rect.width };
}
