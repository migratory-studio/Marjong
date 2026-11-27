// 今季の上位と、自分の順位（圏外も含む）をそれぞれ表示する。
import { describeRank } from "../progression/onlineRank.js";

export function showOnlineLeaderboard(root, { seasonLabel, myUserId, load, onBack } = {}) {
  root.innerHTML = `
    <header class="mode-heading">
      <button type="button" class="mode-back" aria-label="通信対戦へ戻る"></button>
      <h1>今季の順位表</h1><span class="mode-format"></span>
    </header>
    <div class="standings-layout">
      <aside class="standing-self"><h2>あなたの順位</h2><div class="standing-personal"></div></aside>
      <section class="standing-board" aria-label="シーズン順位">
        <h2>シーズン順位</h2><div class="standing-results" aria-live="polite"></div>
      </section>
    </div>`;
  root.querySelector(".mode-back").onclick = () => onBack?.();
  root.querySelector(".mode-format").textContent = `${seasonLabel} シーズン`;
  const personal = root.querySelector(".standing-personal");
  const results = root.querySelector(".standing-results");
  function element(tag, value) {
    const el = document.createElement(tag);
    el.textContent = value;
    return el;
  }
  async function refresh() {
    personal.replaceChildren(element("p", "集計を読み込み中…"));
    results.replaceChildren(element("p", "順位表を読み込み中…"));
    try {
      const { top = [], me, userId, personalUnavailable } = await load();
      const viewerId = userId || myUserId || me?.row?.user_id;
      const index = top.findIndex(r => viewerId && r.user_id === viewerId);
      const own = me?.row || top[index];
      personal.replaceChildren();
      if (own) {
        const place = me?.position ?? (index >= 0 ? index + 1 : null);
        const rank = describeRank({ dan: own.dan, tierRp: own.tier_rp });
        personal.append(element("strong", place ? `第${place}位` : "順位未確定"), element("h3", own.username),
          element("p", `段位　${rank.title}`), element("p", `${Number(own.season_score).toLocaleString()} pt`));
      } else if (personalUnavailable) {
        const retry = element("button", "再読み込み");
        retry.type = "button"; retry.className = "mode-button"; retry.onclick = refresh;
        personal.append(element("p", "あなたの順位を取得できませんでした。"), retry);
      } else {
        personal.append(element("strong", "—"), element("p", "今季の順位はまだありません。"));
      }
      if (!top.length) {
        results.replaceChildren(element("p", "今季の対局記録はまだありません。"));
        return;
      }
      const table = document.createElement("table");
      const head = table.createTHead().insertRow();
      for (const title of ["順位", "プレイヤー", "段位", "シーズンpt"]) {
        const th = element("th", title); th.scope = "col"; head.append(th);
      }
      const body = table.createTBody();
      top.forEach((r, i) => {
        const row = body.insertRow();
        const self = viewerId && r.user_id === viewerId;
        if (self) row.className = "is-self";
        const rank = describeRank({ dan: r.dan, tierRp: r.tier_rp });
        for (const value of [`${i + 1}`, `${r.username}${self ? "（あなた）" : ""}`, rank.title, Number(r.season_score).toLocaleString()]) {
          row.insertCell().textContent = value;
        }
      });
      results.replaceChildren(table);
    } catch {
      personal.replaceChildren(element("p", "順位を取得できませんでした。"));
      const retry = element("button", "再読み込み");
      retry.type = "button"; retry.className = "mode-button"; retry.onclick = refresh;
      results.replaceChildren(element("p", "通信状態を確認して、もう一度お試しください。"), retry);
    }
  }
  refresh();
}
