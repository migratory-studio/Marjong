// 休憩 (rest) — major_update_specification.md §11 / Phase 2B。
//
// 日次 1 回。師匠の一言を出し、現在 HP を最大 HP の範囲内で回復し、絆経験値と
// 少量ソウルを得る。実行済み日付は profile.daily.lastRestDate に保存（端末日付）。
// すでに今日休憩済みなら実行不可で案内だけ出す。
//
//   import { showRest } from "./screens/restScreen.js";
//   showRest(container, { repository, onBack });
import { CHARACTER_MASTER } from "../data/characterMaster.js";
import { activeAvatar } from "../progression/avatarFactory.js";
import { canRestToday, rest } from "../progression/progressionService.js";

const charById = (id) => CHARACTER_MASTER.find((c) => c.id === id) || null;

function elt(tag, cls, props = {}) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  Object.assign(e, props);
  return e;
}

export async function showRest(container, { repository, onBack } = {}) {
  const render = async () => {
    const profile = await repository.loadProfile();
    const avatar = activeAvatar(profile);
    container.innerHTML = "";
    container.classList.add("mentor-screen");

    const head = elt("header", "menu-head");
    head.appendChild(elt("h1", "mentor-h1", { textContent: "休憩" }));
    container.appendChild(head);

    if (!avatar) {
      container.appendChild(elt("p", "lead", { textContent: "マイキャラがいません。" }));
      const back = elt("button", "ghost-back", { type: "button", textContent: "← 戻る" });
      back.onclick = () => onBack?.();
      container.appendChild(back);
      return;
    }

    const mentor = charById(avatar.mentorCharacterId);
    const available = canRestToday(profile);
    const hpPct = Math.max(0, Math.min(100, Math.round((avatar.avatarHpCurrent / avatar.avatarHpMax) * 100)));

    const card = elt("div", "mentor-card");
    // 師匠の一言
    const bubble = elt("div", "mh-bubble mentor-card-bubble");
    bubble.appendChild(elt("span", "mh-bubble-name", { textContent: mentor ? mentor.name : "師匠" }));
    bubble.appendChild(elt("p", "mh-bubble-text", {
      textContent: available ? "ゆっくり休め。明日に備えるのも実力のうちだ。" : "今日はもう十分休んだ。また明日な。",
    }));
    card.appendChild(bubble);

    // 現在 HP ゲージ
    const hpRow = elt("div", "rest-hp");
    hpRow.appendChild(elt("span", "rest-hp-label", { textContent: "現在 HP" }));
    const hpBox = elt("div", "av-hp-box");
    const hpBar = elt("div", "av-hp-bar", {});
    hpBar.style.width = `${hpPct}%`;
    hpBox.appendChild(hpBar);
    hpBox.appendChild(elt("span", "av-hp-text", { textContent: `${avatar.avatarHpCurrent} / ${avatar.avatarHpMax}` }));
    hpRow.appendChild(hpBox);
    card.appendChild(hpRow);

    const msg = elt("p", "rest-result hidden");
    card.appendChild(msg);

    const restBtn = elt("button", "primary", { type: "button", textContent: available ? "休憩する" : "今日は休憩済み", disabled: !available });
    restBtn.onclick = async () => {
      try {
        const res = rest(profile);
        await repository.saveProfile(res.profile);
        const parts = [`HP +${res.healed} 回復`, `ソウル +${res.soul}`, `絆 +${res.bondExp}`];
        if (res.bondUp) parts.push(`絆 Lv ${res.bondLevel} に上昇！`);
        // 反映後の状態で描き直し（ボタンは休憩済みで無効になる）。
        await render();
        const m = container.querySelector(".rest-result");
        if (m) { m.textContent = parts.join(" ／ "); m.classList.remove("hidden"); }
      } catch (e) {
        msg.textContent = e?.message || "休憩に失敗しました。";
        msg.classList.remove("hidden");
      }
    };
    card.appendChild(restBtn);
    container.appendChild(card);

    const back = elt("button", "ghost-back", { type: "button", textContent: "← 師弟ホームへ" });
    back.onclick = () => onBack?.();
    container.appendChild(back);
  };

  await render();
}
