import { CHARACTER_MASTER } from "../data/characterMaster.js";
import { presetById } from "../data/avatarPresetMaster.js";
import { monthInfo } from "../data/calendarMaster.js";

// 師弟ホームから開く手帳と物語。内容の更新中も見出しと戻る操作は同じ位置に置く。
export function mountTrainingPage(root, { title, profile, avatar, mentorSide = false, onBack }) {
  root.classList.add("training-page");
  root.innerHTML = `
    <header class="mode-heading"><button type="button" class="mode-back" aria-label="師弟ホームへ戻る"></button>
      <h1></h1><span class="mode-format"></span></header>
    <div class="training-spread">
      <aside class="training-person"><div class="training-person-art"></div>
        <div class="training-caption"><span></span><h2></h2><p></p></div></aside>
      <div class="training-page-content"></div>
    </div>`;
  root.querySelector(".mode-back").onclick = () => onBack?.();
  root.querySelector("h1").textContent = title;
  const content = root.querySelector(".training-page-content");
  if (!avatar) return content;
  const mentor = CHARACTER_MASTER.find(c => c.id === avatar.mentorCharacterId);
  const month = monthInfo(profile.dayCount || 1);
  root.querySelector(".mode-format").textContent = `${month.year}年目　${month.gameMonth}月`;
  const art = root.querySelector(".training-person-art");
  const standing = presetById(avatar.presetIds?.standing);
  const icon = presetById(avatar.presetIds?.icon);
  const src = mentorSide ? mentor?.assets?.portrait : standing?.assetPath || icon?.assetPath;
  if (src) {
    const img = document.createElement("img"); img.alt = ""; img.src = src;
    art.append(img);
  }
  const caption = root.querySelector(".training-caption");
  caption.querySelector("span").textContent = mentorSide ? "師匠" : "あなた";
  caption.querySelector("h2").textContent = mentorSide ? mentor?.name || "師匠" : avatar.name;
  caption.querySelector("p").textContent = mentorSide ? (mentor?.reading !== mentor?.name ? mentor?.reading || "" : "") : avatar.profileText || `師匠　${mentor?.name || "—"}`;
  if (!mentorSide && icon?.assetPath) {
    const face = document.createElement("img"); face.alt = ""; face.src = icon.assetPath;
    face.style.borderColor = presetById(avatar.presetIds?.frame)?.css || "";
    face.style.background = presetById(avatar.presetIds?.background)?.css || "";
    caption.prepend(face);
  }
  return content;
}
