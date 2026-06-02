// Audio settings: BGM/SE volume sliders + an enable/disable checkbox. Values
// persist via localStorage so they survive reloads / restarts.
//
// Two surfaces share these controls (Phase 1): the in-game gear panel and the
// standalone home 設定 screen. wireSettingsControls() binds either control set
// (by element id) to the same AudioManager + storage, so changes made on one
// surface are reflected on the other the next time it's shown (resync).
const STORAGE_KEY = "mahjong-rpg.audio";

export function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      enabled: s.enabled !== false, // default true
      bgm: typeof s.bgm === "number" ? s.bgm : 0.4,
      se: typeof s.se === "number" ? s.se : 0.8,
    };
  } catch {
    return { enabled: true, bgm: 0.4, se: 0.8 };
  }
}

function saveSettings(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

// Push the saved settings into an AudioManager (no DOM). Call once at boot so
// volumes are correct regardless of which screen the player starts on.
export function applyAudioSettings(audio) {
  const s = loadSettings();
  audio.bgmVolume = s.bgm;
  audio.seVolume = s.se;
  audio.setBgmVolume(s.bgm);
  audio.setSeVolume(s.se);
  audio.setEnabled(s.enabled);
  return s;
}

// Bind a set of volume/enable controls to the audio + storage. `ids` defaults to
// the in-game gear panel; pass overrides for the home 設定 screen. Returns a
// resync() that reloads the controls from storage (call when the screen reopens).
export function wireSettingsControls(audio, ids = {}) {
  const {
    enabled = "audio-enabled",
    bgm = "bgm-volume", bgmVal = "bgm-volume-val",
    se = "se-volume", seVal = "se-volume-val",
  } = ids;
  const $ = (id) => document.getElementById(id);
  const cbEnabled = $(enabled), sBgm = $(bgm), sBgmVal = $(bgmVal), sSe = $(se), sSeVal = $(seVal);
  if (!cbEnabled || !sBgm || !sSe) return () => {};

  const resync = () => {
    const s = loadSettings();
    cbEnabled.checked = s.enabled;
    sBgm.value = Math.round(s.bgm * 100);
    sSe.value = Math.round(s.se * 100);
    sBgmVal.textContent = `${sBgm.value}%`;
    sSeVal.textContent = `${sSe.value}%`;
  };
  resync();

  sBgm.addEventListener("input", () => {
    const v = sBgm.valueAsNumber / 100;
    sBgmVal.textContent = `${sBgm.value}%`;
    audio.setBgmVolume(v);
    const s = loadSettings(); s.bgm = v; saveSettings(s);
  });
  sSe.addEventListener("input", () => {
    const v = sSe.valueAsNumber / 100;
    sSeVal.textContent = `${sSe.value}%`;
    audio.setSeVolume(v);
    const s = loadSettings(); s.se = v; saveSettings(s);
  });
  // play a sample dahai SE on release so the user can hear the new level
  sSe.addEventListener("change", () => audio.playDahai());
  cbEnabled.addEventListener("change", () => {
    audio.setEnabled(cbEnabled.checked);
    const s = loadSettings(); s.enabled = cbEnabled.checked; saveSettings(s);
  });

  return resync;
}

// In-game gear panel: apply settings, wire the default controls, and wire the
// gear/close/click-outside toggle. Returns the live settings object.
export function initSettingsUI(audio) {
  const $ = (id) => document.getElementById(id);
  const btn = $("settings-btn"), panel = $("settings-panel"), close = $("settings-close");

  const s = applyAudioSettings(audio);
  const resync = wireSettingsControls(audio);

  // toggle panel
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    panel.classList.toggle("hidden");
    if (!panel.classList.contains("hidden")) resync(); // reflect home-screen edits
  });
  close.addEventListener("click", () => panel.classList.add("hidden"));
  // click outside to close
  document.addEventListener("click", (e) => {
    if (panel.classList.contains("hidden")) return;
    if (panel.contains(e.target) || btn.contains(e.target)) return;
    panel.classList.add("hidden");
  });

  return s;
}
