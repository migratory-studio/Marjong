// 育成 (growth) — major_update_specification.md §10.2 / §10.5 / Phase 2B。
//
// ソウルを消費して「キャラ Lv（= HP 成長）」と「スキル Lv」を個別購入する。
// ソウル不足・最大 Lv では強化不可。強化後は保存して即時に再描画する。
//
//   import { showGrowth } from "./screens/growthScreen.js";
//   showGrowth(container, { repository, onBack });
import { skillTemplateById } from "../data/skillTemplateMaster.js";
import { activeAvatar } from "../progression/avatarFactory.js";
import { avatarLevelInfo, skillLevelInfo, levelUpAvatar, upgradeSkill } from "../progression/progressionService.js";

function elt(tag, cls, props = {}) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  Object.assign(e, props);
  return e;
}

export async function showGrowth(container, { repository, onBack } = {}) {
  const render = async () => {
    const profile = await repository.loadProfile();
    const avatar = activeAvatar(profile);
    container.innerHTML = "";
    container.classList.add("mentor-screen");

    const head = elt("header", "menu-head");
    head.appendChild(elt("h1", "mentor-h1", { textContent: "育成" }));
    container.appendChild(head);

    if (!avatar) {
      container.appendChild(elt("p", "lead", { textContent: "マイキャラがいません。" }));
      const back = elt("button", "ghost-back", { type: "button", textContent: "← 戻る" });
      back.onclick = () => onBack?.();
      container.appendChild(back);
      return;
    }

    const soulNow = profile.wallet?.soul ?? 0;
    const tmpl = skillTemplateById(avatar.skillTemplateId);

    // ソウル残高
    const soulBar = elt("div", "growth-soul");
    soulBar.appendChild(elt("span", "mh-soul-label", { textContent: "ソウル" }));
    soulBar.appendChild(elt("span", "mh-soul-val", { textContent: String(soulNow) }));
    container.appendChild(soulBar);

    const err = elt("p", "av-error growth-err hidden");
    container.appendChild(err);

    const cards = elt("div", "growth-cards");
    container.appendChild(cards);

    const buy = async (action) => {
      err.classList.add("hidden");
      try {
        const res = action(profile);
        await repository.saveProfile(res.profile);
        await render();
      } catch (e) {
        err.textContent = e?.message || "強化に失敗しました。";
        err.classList.remove("hidden");
      }
    };

    // ---- キャラ Lv（HP 成長）----
    const lvInfo = avatarLevelInfo(profile);
    {
      const card = elt("div", "growth-card");
      card.appendChild(elt("div", "growth-card-title", { textContent: "キャラ Lv（HP 成長）" }));
      card.appendChild(elt("div", "growth-card-now", { textContent: `現在: Lv ${lvInfo.current}  最大HP ${lvInfo.currentHpMax}` }));
      if (lvInfo.next) {
        const gain = lvInfo.next.avatarHpMax - lvInfo.currentHpMax;
        card.appendChild(elt("div", "growth-card-next", { textContent: `→ Lv ${lvInfo.next.avatarLevel}  最大HP ${lvInfo.next.avatarHpMax}（+${gain}）` }));
        const afford = soulNow >= lvInfo.next.soulCost;
        const btn = elt("button", "primary growth-buy", { type: "button", disabled: !afford,
          textContent: `強化（ソウル ${lvInfo.next.soulCost}）` });
        if (!afford) btn.title = "ソウルが足りません";
        btn.onclick = () => buy(levelUpAvatar);
        card.appendChild(btn);
      } else {
        card.appendChild(elt("div", "growth-card-max", { textContent: "最大 Lv に到達しています。" }));
      }
      cards.appendChild(card);
    }

    // ---- スキル Lv ----
    const skInfo = skillLevelInfo(profile);
    {
      const card = elt("div", "growth-card");
      card.appendChild(elt("div", "growth-card-title", { textContent: `スキル Lv（${tmpl ? tmpl.name : "能力"}）` }));
      card.appendChild(elt("div", "growth-card-now", { textContent: `現在: スキル Lv ${skInfo.current}` }));
      if (skInfo.next) {
        card.appendChild(elt("div", "growth-card-next", { textContent: `→ Lv ${skInfo.next.skillLevel}：${skInfo.next.unlockDescription}` }));
        const afford = soulNow >= skInfo.next.soulCost;
        const btn = elt("button", "primary growth-buy", { type: "button", disabled: !afford,
          textContent: `強化（ソウル ${skInfo.next.soulCost}）` });
        if (!afford) btn.title = "ソウルが足りません";
        btn.onclick = () => buy(upgradeSkill);
        card.appendChild(btn);
      } else {
        card.appendChild(elt("div", "growth-card-max", { textContent: "スキル Lv は最大（師匠相当）です。" }));
      }
      cards.appendChild(card);
    }

    const back = elt("button", "ghost-back", { type: "button", textContent: "← 師弟ホームへ" });
    back.onclick = () => onBack?.();
    container.appendChild(back);
  };

  await render();
}
