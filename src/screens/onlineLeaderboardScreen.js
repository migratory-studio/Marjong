// 順位表画面 (online-leaderboard) — 今シーズンの段位ランキング。
//
// 段位は永続（個人の歩み）、シーズン順位表は「その季の活動量(seasonScore)」で競う＝回数が効く。
// 見た目はホーム同様の汎用クラス（menu-head / ghost-back）＋専用テーブル。固定ステージに収める
// ため上位は件数を絞り、自分が圏外なら末尾に「あなた」行を別途出す。
//
//   import { showOnlineLeaderboard } from "./screens/onlineLeaderboardScreen.js";
//   showOnlineLeaderboard(container, { seasonLabel, myUserId, load, onBack });
//     load(): Promise<{ top: Row[], me: { row, position }|null }>   Row={user_id,username,season_score,dan,tier_rp}
import { describeRank } from "../progression/onlineRank.js";

const STYLE_ID = "online-lb-style";

function elt(tag, cls, props = {}) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  Object.assign(e, props);
  return e;
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = `
#online-leaderboard-screen .menu-head { position: relative; margin-bottom: 4px; }
#online-leaderboard-screen .menu-head h1 { font-size: 24px; margin: 0; }
.lb-season { display:inline-block; margin-top:4px; color:var(--accent); font-weight:800; letter-spacing:.08em; font-size:13px; }
.lb-wrap { width: 720px; max-width: 92%; margin: 4px auto 0; }
.lb-table { display:flex; flex-direction:column; gap:3px; }
.lb-row { display:grid; grid-template-columns: 50px 1fr 118px 104px; align-items:center; gap:10px;
  padding:2px 14px; background: rgba(16,26,21,.85);
  border:7px solid transparent; border-image: url("graphic/ui/sc/plate.png") 14 18 fill / 6px 11px / 0 stretch; }
.lb-row.me { box-shadow: 0 0 0 2px var(--accent) inset, 0 0 16px rgba(255,200,90,.25); }
.lb-rank { font-size:19px; font-weight:900; color:#f4e3b4; text-align:center; }
.lb-row.r1 .lb-rank { color:#ffd86b; } .lb-row.r2 .lb-rank { color:#d8e0ea; } .lb-row.r3 .lb-rank { color:#e3a86a; }
.lb-name { font-size:15px; font-weight:700; color:var(--ink); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.lb-dan { font-size:14px; font-weight:800; color:#e7d9b4; text-align:center; line-height:1.15; }
.lb-dan small { display:block; font-size:9px; color:var(--muted); letter-spacing:.08em; }
.lb-score { text-align:right; font-variant-numeric:tabular-nums; }
.lb-score b { font-size:17px; color:#9be29b; } .lb-score span { font-size:10px; color:var(--muted); margin-left:3px; }
.lb-head-row { display:grid; grid-template-columns: 50px 1fr 118px 104px; gap:10px; padding:0 14px 2px; font-size:11px; color:var(--muted); letter-spacing:.1em; }
.lb-head-row .r{text-align:center;} .lb-head-row .s{text-align:right;}
.lb-me-sep { text-align:center; color:var(--muted); font-size:16px; line-height:1; margin:1px 0; }
.lb-msg { text-align:center; color:var(--muted); font-size:14px; padding:24px 0; }
.lb-note { text-align:center; color:var(--muted); font-size:11px; margin-top:8px; }
`;
  document.head.appendChild(s);
}

function rowEl(r, position, myUserId) {
  const info = describeRank({ dan: r.dan, tierRp: r.tier_rp });
  const me = r.user_id === myUserId;
  const row = elt("div", `lb-row r${position}` + (me ? " me" : ""));
  row.appendChild(elt("div", "lb-rank", { textContent: position }));
  row.appendChild(elt("div", "lb-name", { textContent: r.username + (me ? "（あなた）" : "") }));
  const dan = elt("div", "lb-dan");
  dan.innerHTML = `${info.title}<small>${info.kana}</small>`;
  row.appendChild(dan);
  const sc = elt("div", "lb-score");
  sc.innerHTML = `<b>${r.season_score}</b><span>pt</span>`;
  row.appendChild(sc);
  return row;
}

export function showOnlineLeaderboard(root, { seasonLabel, myUserId, load, onBack } = {}) {
  injectStyle();
  root.innerHTML = "";

  const head = elt("header", "menu-head");
  head.innerHTML = `<h1>順位表 <span class="test-badge">テスト中</span></h1>
    <div class="lb-season">${seasonLabel} シーズン</div>`;
  root.appendChild(head);

  const wrap = elt("div", "lb-wrap");
  const msg = elt("div", "lb-msg", { textContent: "読み込み中…" });
  wrap.appendChild(msg);
  root.appendChild(wrap);

  root.appendChild(elt("p", "lb-note", { textContent: "段位は永続。シーズン順位は「その季に積んだRP（活動量）」で競うよ。" }));

  const back = elt("button", "ghost-back", { type: "button", textContent: "← 戻る" });
  back.onclick = () => onBack?.();
  root.appendChild(back);

  load()
    .then(({ top, me }) => {
      wrap.innerHTML = "";
      if (!top || top.length === 0) {
        wrap.appendChild(elt("div", "lb-msg", { textContent: "まだ誰も登録されていないよ。最初の一局を打ってみよう！" }));
        return;
      }
      const headRow = elt("div", "lb-head-row");
      headRow.innerHTML = `<div class="r">順位</div><div>プレイヤー</div><div class="r">段位</div><div class="s">獲得RP</div>`;
      wrap.appendChild(headRow);

      const table = elt("div", "lb-table");
      const inTop = me?.row && top.some((r) => r.user_id === me.row.user_id);
      top.forEach((r, i) => table.appendChild(rowEl(r, i + 1, myUserId)));
      wrap.appendChild(table);

      // 自分が上位圏外なら末尾に自分の順位を別途。
      if (me?.row && !inTop && me.position) {
        wrap.appendChild(elt("div", "lb-me-sep", { textContent: "⋯" }));
        const sep = elt("div", "lb-table");
        sep.appendChild(rowEl(me.row, me.position, myUserId));
        wrap.appendChild(sep);
      }
    })
    .catch((e) => {
      console.warn("順位表の取得失敗", e);
      wrap.innerHTML = "";
      wrap.appendChild(elt("div", "lb-msg", { textContent: "順位表を読み込めなかった…通信状態を確認してね。" }));
    });
}
