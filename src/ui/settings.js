// Settings panel: gear icon toggles a small overlay with BGM/SE volume sliders
// and an audio enable/disable checkbox. Values persist via localStorage so they
// survive reloads / restarts.
const STORAGE_KEY = "mahjong-rpg.audio";

function loadSettings() {
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

// Wire the gear button + panel to an AudioManager instance. Returns the live
// settings object (useful for tests / debugging).
export function initSettingsUI(audio) {
  const $ = (id) => document.getElementById(id);
  const btn = $("settings-btn"), panel = $("settings-panel"), close = $("settings-close");
  const cbEnabled = $("audio-enabled");
  const sBgm = $("bgm-volume"), sBgmVal = $("bgm-volume-val");
  const sSe = $("se-volume"), sSeVal = $("se-volume-val");

  const s = loadSettings();

  // initial sync: UI -> audio
  cbEnabled.checked = s.enabled;
  sBgm.value = Math.round(s.bgm * 100);
  sSe.value = Math.round(s.se * 100);
  sBgmVal.textContent = `${sBgm.value}%`;
  sSeVal.textContent = `${sSe.value}%`;
  audio.bgmVolume = s.bgm;
  audio.seVolume = s.se;
  audio.setBgmVolume(s.bgm);
  audio.setSeVolume(s.se);
  audio.setEnabled(s.enabled);

  // toggle panel
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    panel.classList.toggle("hidden");
  });
  close.addEventListener("click", () => panel.classList.add("hidden"));
  // click outside to close
  document.addEventListener("click", (e) => {
    if (panel.classList.contains("hidden")) return;
    if (panel.contains(e.target) || btn.contains(e.target)) return;
    panel.classList.add("hidden");
  });

  // live wiring
  sBgm.addEventListener("input", () => {
    const v = sBgm.valueAsNumber / 100;
    sBgmVal.textContent = `${sBgm.value}%`;
    audio.setBgmVolume(v);
    s.bgm = v; saveSettings(s);
  });
  sSe.addEventListener("input", () => {
    const v = sSe.valueAsNumber / 100;
    sSeVal.textContent = `${sSe.value}%`;
    audio.setSeVolume(v);
    s.se = v; saveSettings(s);
    // small audible preview when the slider is released
  });
  // play a sample dahai SE on release so the user can hear the new level
  sSe.addEventListener("change", () => audio.playDahai());

  cbEnabled.addEventListener("change", () => {
    audio.setEnabled(cbEnabled.checked);
    s.enabled = cbEnabled.checked; saveSettings(s);
  });

  return s;
}
