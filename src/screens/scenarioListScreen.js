// シナリオ一覧 (scenario-list) — major_update_specification.md §7.4 / §12 / Phase 3。
//
// アクティブなマイキャラの師匠に紐づく bond シナリオを一覧表示する。各行は解放判定
// （unlockEvaluator）で「未読 / 既読 / ロック（未達条件）」を出し分け、解放済みを選ぶと
// 親（main.js）が #scenario-screen で再生する。読了で既読化＋初回ソウルを付与する。
//
//   import { showScenarioList } from "./screens/scenarioListScreen.js";
//   showScenarioList(container, { repository, onPlay, onBack });
//     onPlay(scenarioId, onEnd): 親が playScenario して終了時に onEnd() を呼ぶ。
import { CHARACTER_MASTER } from "../data/characterMaster.js";
import { SCENARIO_MASTER } from "../data/scenarioMaster.js";
import { activeAvatar } from "../progression/avatarFactory.js";
import { buildUnlockContext, evaluateUnlock } from "../scenario/unlockEvaluator.js";
import { isScenarioRead, markScenarioRead } from "../progression/scenarioService.js";
import { isDebugMode } from "../app/debug.js";

const charById = (id) => CHARACTER_MASTER.find((c) => c.id === id) || null;
const titleOf = (id) => SCENARIO_MASTER.find((s) => s.scenarioId === id)?.title || id;

function elt(tag, cls, props = {}) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  Object.assign(e, props);
  return e;
}

// この師匠に属する有効シナリオを表示順で取得。
export function scenariosForMentor(mentorCharacterId) {
  return SCENARIO_MASTER.filter((s) => s.isEnabled && s.mentorCharacterId === mentorCharacterId)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function showScenarioList(container, { repository, onPlay, onBack } = {}) {
  const render = async (flash = null) => {
    const profile = await repository.loadProfile();
    const avatar = activeAvatar(profile);
    container.innerHTML = "";
    container.classList.add("mentor-screen");

    const head = elt("header", "menu-head");
    head.appendChild(elt("h1", "mentor-h1", { textContent: "シナリオ" }));
    container.appendChild(head);

    if (!avatar) {
      container.appendChild(elt("p", "lead", { textContent: "マイキャラがいません。" }));
      const back0 = elt("button", "ghost-back", { type: "button", textContent: "← 戻る" });
      back0.onclick = () => onBack?.();
      container.appendChild(back0);
      return;
    }

    const mentor = charById(avatar.mentorCharacterId);

    // 上段: ソウル + 師匠名
    const topbar = elt("div", "mh-topbar");
    const soul = elt("div", "mh-soul");
    soul.appendChild(elt("span", "mh-soul-label", { textContent: "ソウル" }));
    soul.appendChild(elt("span", "mh-soul-val", { textContent: String(profile.wallet?.soul ?? 0) }));
    topbar.appendChild(soul);
    topbar.appendChild(elt("span", "mh-summary", { textContent: `師匠：${mentor ? mentor.name : "—"}` }));
    container.appendChild(topbar);

    const debug = isDebugMode();
    if (debug) container.appendChild(elt("p", "sclist-debug", { textContent: "🛠 DEBUG：全シナリオ解放中" }));

    const flashLine = elt("p", "sclist-flash", { textContent: flash || "" });
    container.appendChild(flashLine);

    const list = scenariosForMentor(avatar.mentorCharacterId);
    const ctx = buildUnlockContext(profile);

    if (list.length === 0) {
      container.appendChild(elt("p", "sclist-empty", { textContent: "この師匠の物語は、まだありません。" }));
    } else {
      const wrap = elt("div", "sclist");
      list.forEach((s, idx) => {
        const read = isScenarioRead(profile, s.scenarioId);
        const ev = evaluateUnlock(s, ctx, titleOf);
        const unlocked = debug || ev.unlocked;
        const forced = debug && !ev.unlocked; // 本来ロックだがデバッグで解放

        const row = elt("button", "sclist-row", { type: "button", disabled: !unlocked });
        const main = elt("div", "sclist-main");
        main.appendChild(elt("span", "sclist-title", { textContent: unlocked ? s.title : "？？？" }));
        main.appendChild(elt("span", "sclist-sub", { textContent: `第${idx + 1}話` }));
        row.appendChild(main);

        const status = elt("span", "sclist-status");
        if (!unlocked) {
          status.classList.add("is-lock");
          status.textContent = `🔒 ${ev.unmet.join(" / ")}`;
        } else if (read) {
          status.classList.add("is-read");
          status.textContent = "既読";
        } else if (forced) {
          status.classList.add("is-new");
          status.textContent = "🔓 DEBUG解放";
        } else {
          status.classList.add("is-new");
          const soulR = s.firstReadReward?.soul ?? 0;
          status.textContent = soulR ? `NEW ・ ソウル+${soulR}` : "NEW";
        }
        row.appendChild(status);

        if (unlocked) {
          row.onclick = () => {
            onPlay?.(s.scenarioId, async () => {
              const fresh = await repository.loadProfile();
              const res = markScenarioRead(fresh, s);
              if (res.firstRead) await repository.saveProfile(res.profile);
              await render(res.soul ? `「${s.title}」を読了！　ソウル +${res.soul}` : null);
            });
          };
        } else {
          row.title = `解放条件：${ev.unmet.join(" / ")}`;
        }
        wrap.appendChild(row);
      });
      container.appendChild(wrap);
    }

    const back = elt("button", "ghost-back", { type: "button", textContent: "← 師弟ホームへ" });
    back.onclick = () => onBack?.();
    container.appendChild(back);
  };

  await render();
}
