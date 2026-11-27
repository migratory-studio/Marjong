// 通信対戦ロビー（テスト中）。
//
// ルーム待合室はサーバから届く席情報を随時描画する。マッチングは雀士を選んで
// 「対局開始」を押してから開始する。どちらも名簿の表示と通信の操作を分ける。
//
// showOnlineLobby(root, { mode, characters, audio, onStart, onBack })
//   mode: "room" | "match"
//   onStart({ charId, mode }) … 対局開始（main.js が CPU 補填で beginGame まで運ぶ）
//   onBack() … 通信対戦の入口（モード選択）へ戻る

import { mountCharacterCatalog } from "../ui/characterCatalog.js";
import { ROOM_CODE_CHARS, ROOM_CODE_LEN } from "./roomCodeModal.js";

export function makeCode(n = ROOM_CODE_LEN) {
  // UI 表示用の合言葉。決定論は不要（牌山seed等とは無関係）。
  let s = "";
  for (let i = 0; i < n; i++) s += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  return s;
}

function elt(tag, cls, props = {}) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  Object.assign(e, props);
  return e;
}

// マッチング対戦ロビーの戦績パネル。段位/RP（プロフィール）＋オンライン専用戦績（対局数/トップ率/
// 平均着順＝online_results集計）＋よく使う相棒（卓表示の代わり）。
function buildStatsPanel(stats) {
  const box = elt("div", "online-stats");
  const s = stats || {};
  const rpText = s.rankAtMax ? `RP ${s.tierRp ?? 0}` : `RP ${s.tierRp ?? 0} / ${s.rankNext ?? "?"}`;
  const o = s.online; // null=未ログイン/未取得 / {games:0}=記録なし
  const games = o?.games ?? 0;
  const topRate = (o && games) ? `${Math.round(o.firstRate * 100)}%` : "—";
  const avgRank = (o && games) ? o.avgRank.toFixed(2) : "—";
  box.innerHTML = `
    <div class="online-stats-head">あなたのオンライン戦績</div>
    <div class="ost-rank">
      <div class="ost-dan"><b>${s.rankTitle || "—"}</b><small>${s.rankKana || ""}</small></div>
      <div class="ost-gauge">
        <div class="ost-bar hpbar"><div class="hpfill high" style="width:${s.rankPct ?? 0}%"></div></div>
        <div class="ost-rp">${rpText}</div>
      </div>
    </div>
    <div class="ost-grid ost-grid-3">
      <div class="ost-cell"><span class="ost-k">対局数</span><span class="ost-v">${o ? games : "—"}</span></div>
      <div class="ost-cell"><span class="ost-k">トップ率</span><span class="ost-v">${topRate}</span></div>
      <div class="ost-cell"><span class="ost-k">平均着順</span><span class="ost-v">${avgRank}</span></div>
    </div>
    <div class="ost-buddy">
      <span class="ost-k">よく使う相棒</span>
      <span class="ost-buddy-v"></span>
    </div>`;
  const bv = box.querySelector(".ost-buddy-v");
  if (s.oshi) {
    const ic = s.oshi.icon
      ? elt("img", "ost-buddy-icon", { src: s.oshi.icon, alt: "" })
      : elt("span", "ost-buddy-icon ost-buddy-fb");
    if (!s.oshi.icon) ic.style.background = s.oshi.color || "#2a3f34";
    const nm = elt("span", "ost-buddy-name", { textContent: s.oshi.name });
    bv.append(ic, nm);
  } else {
    bv.appendChild(elt("span", "ost-buddy-none", { textContent: "まだいないよ" }));
  }
  return box;
}

// 通信対戦の候補はロビーから受け取る。ページ送りや検索中も自分の雀士を見出しに残す。
function mountOnlineRoster(right, characters, currentId, pick) {
  const head = elt("div", "online-roster-head");
  const title = elt("h2", "online-pick-head", { textContent: "あなたの雀士を選ぶ" });
  const selection = elt("span", "online-roster-current", { textContent: "未選択" });
  selection.setAttribute("role", "status");
  head.append(title, selection);
  const roster = elt("div", "online-roster");
  right.append(head, roster);
  const catalog = mountCharacterCatalog(roster, {
    characters: () => characters,
    isLocked: () => false,
    describe: (c) => ({ active: c.id === currentId() }),
    onPick: pick,
  });
  function refresh() {
    const picked = characters.find((c) => c.id === currentId());
    selection.textContent = picked ? `選択中　${picked.name}` : "未選択";
    catalog.refresh();
  }
  return refresh;
}

export function showOnlineLobby(root, { mode, characters, audio, onStart, onBack, joinCode = null, stats = null }) {
  root.innerHTML = "";

  let pickedId = null;
  const isRoom = mode === "room";
  const isJoin = isRoom && !!joinCode; // 合言葉で「参加」する側（ホストはコード発行）
  let code = null; // ルーム対戦のあいことば（onStart で部屋名に使う）
  const modeLabel = !isRoom ? "マッチング対戦" : isJoin ? "合言葉で参加" : "ルーム対戦";

  // --- header ---
  const head = elt("header", "mode-heading");
  head.innerHTML =
    `<button type="button" class="mode-back online-back" aria-label="通信対戦へ戻る"></button>` +
    `<h1>${modeLabel}</h1><span class="mode-format">四人打ち　東風戦</span>`;
  root.appendChild(head);
  head.querySelector(".online-back").onclick = () => { audio?.playClick?.(); onBack(); };

  const note = elt("p", "online-note");
  // 空席を埋めるまでの待ち時間はブラックボックス（秒数は書かない）。
  note.textContent = isRoom
    ? "※ 同じあいことばの相手と同卓します。"
    : "対戦に連れていく相棒をひとり選んでください。";
  root.appendChild(note);

  const body = elt("div", "online-body");
  root.appendChild(body);

  // --- 左カラム: ルーム=合言葉＋卓 / マッチング=戦績（卓表示はマッチング中と誤解されるため出さない） ---
  const left = elt("div", "online-col online-col-left");
  body.appendChild(left);
  const seatEls = []; // ルーム時のみ作る（参照は ?. でガード）

  if (isRoom) {
    code = joinCode || makeCode(4);
    const codeBox = elt("div", "online-codebox");
    codeBox.innerHTML =
      `<div class="online-codebox-k">あいことば</div>` +
      `<div class="online-code">${code}</div>` +
      `<div class="online-codebox-sub">${isJoin ? "この合言葉のルームに入ります" : "この合言葉を相手に伝えて招待（同じ合言葉で同卓）"}</div>`;
    left.appendChild(codeBox);

    const tableHead = elt("div", "online-table-head", { textContent: "卓（4人）" });
    left.appendChild(tableHead);
    const seatList = elt("div", "online-seats");
    left.appendChild(seatList);
    for (let i = 0; i < 4; i++) {
      const row = elt("div", "online-seat");
      const who = elt("span", "online-seat-who", { textContent: i === 0 ? "あなた" : `席 ${i + 1}` });
      const st = elt("span", "online-seat-state");
      if (i === 0) { st.textContent = "雀士を選択"; st.className = "online-seat-state is-you"; }
      else { st.textContent = "開始後に相手 / CPU"; }
      row.append(who, st);
      seatList.appendChild(row);
      seatEls.push({ row, who, st });
    }
  } else {
    const preview = elt("div", "lobby-partner");
    preview.innerHTML = '<span>対局する相棒</span><strong>名簿から選択</strong>';
    left.appendChild(preview);
    left.appendChild(buildStatsPanel(stats)); // 戦績パネル
  }

  // --- 右：自分の雀士を選ぶ ---
  const right = elt("div", "online-col online-col-right");
  body.appendChild(right);
  const refreshRoster = mountOnlineRoster(right, characters, () => pickedId, (c) => {
    audio?.playClick?.();
    pickedId = c.id;
    if (seatEls[0]) seatEls[0].st.textContent = c.name;
    const preview = left.querySelector(".lobby-partner");
    if (preview) {
      preview.querySelector("strong").textContent = c.name;
      let img = preview.querySelector("img");
      if (!img) { img = elt("img", "", { alt: "" }); preview.prepend(img); }
      img.hidden = !c.assets?.portrait;
      if (c.assets?.portrait) img.src = c.assets.portrait;
    }
    refreshRoster();
    updateStart();
  });

  // --- footer ---
  const footer = elt("div", "online-foot");
  const startBtn = elt("button", "primary online-start", { type: "button", textContent: isRoom ? "対局開始" : "この相棒で相手を探す", disabled: true });
  footer.appendChild(startBtn);
  root.appendChild(footer);

  // 雀士を選べば開始可能。実際の相手探し（人を待ち→空席は飛び入り＝CPU補填）は開始後にサーバ側で行う。
  const updateStart = () => { startBtn.disabled = !pickedId; };
  startBtn.onclick = () => {
    if (startBtn.disabled) return;
    audio?.playClick?.();
    onStart({ charId: pickedId, mode, code });
  };
  return { updateStats(fresh) { left.querySelector(".online-stats")?.replaceWith(buildStatsPanel(fresh)); } };
}

// ルーム対戦の「リアルタイム待合室」。入室と同時にWS接続し、サーバの evt.lobby で 4 枠を随時更新する。
// 自席とホストは配信された席番号で識別する。ホストだけが空き枠の CPU 化／対局開始を操作できる。
// 戻り値 { update(lobbyState) } を main 側が evt.lobby のたびに呼ぶ。
//   showRoomLobby(root, { code, isJoin, characters, audio, onSetChar, onSlot, onStart, onBack })
//     onSetChar(charId) … 待合室で雀士を変更（サーバへ intent.lobbySetChar）
//     onSlot(seat, "cpu"|"open") … 空き枠を CPU 化／解除（ホストのみ・intent.lobbySlot）
//     onStart() … 残り空き枠を CPU 補填して開始（ホストのみ・intent.lobbyStart）
export function showRoomLobby(root, { code, isJoin, characters, audio, onSetChar, onSlot, onStart, onBack }) {
  root.innerHTML = "";

  const head = elt("header", "mode-heading");
  head.innerHTML =
    `<button type="button" class="mode-back online-back" aria-label="待合室を退出"></button>` +
    `<h1>合言葉の待合室</h1><span class="mode-format">四人打ち　東風戦</span>`;
  root.appendChild(head);
  head.querySelector(".online-back").onclick = () => { audio?.playClick?.(); onBack(); };

  const note = elt("p", "online-note");
  note.textContent = "同じ合言葉で集まった人と打てます。開始時の空席にはCPUが座ります。";
  root.appendChild(note);

  const body = elt("div", "online-body");
  root.appendChild(body);

  // 左: 合言葉＋4枠（人間/CPU/空き）。
  const left = elt("div", "online-col online-col-left");
  body.appendChild(left);
  const codeBox = elt("div", "room-invitation");
  codeBox.innerHTML = '<span>卓の合言葉</span><strong class="online-code"></strong><button type="button" class="mode-button">コピー</button><small role="status"></small>';
  const codeValue = codeBox.querySelector("strong");
  codeValue.textContent = code;
  const copyMessage = codeBox.querySelector("small");
  copyMessage.textContent = isJoin ? "招待された卓の合言葉" : "この4文字を友だちに伝えてください。";
  codeBox.querySelector("button").onclick = async () => {
    try {
      await navigator.clipboard.writeText(code);
      copyMessage.textContent = "合言葉をコピーしました。";
    } catch {
      const range = document.createRange();
      range.selectNodeContents(codeValue);
      const selection = window.getSelection();
      selection.removeAllRanges(); selection.addRange(range);
      copyMessage.textContent = "合言葉を選択しました。端末のコピー操作で保存できます。";
    }
  };
  left.appendChild(codeBox);
  const tableHead = elt("div", "online-table-head", { textContent: "卓の顔ぶれ" });
  tableHead.setAttribute("role", "status");
  left.appendChild(tableHead);
  const seatList = elt("div", "online-seats");
  left.appendChild(seatList);

  // 右: 自分の雀士を選ぶ（待合室中はいつでも変更可・選択は随時共有）。
  const right = elt("div", "online-col online-col-right");
  body.appendChild(right);
  right.inert = true;
  let myChar = null;
  const refreshRoster = mountOnlineRoster(right, characters, () => myChar, (c) => {
    audio?.playClick?.();
    onSetChar(c.id);
  });

  // フッタ: ホスト=対局開始 / 非ホスト=開始待ち。
  const footer = elt("div", "online-foot");
  const waitLabel = elt("div", "online-wait-label", { textContent: "ホストの開始を待っています…" });
  const startBtn = elt("button", "primary online-start", { type: "button", textContent: "対局開始" });
  footer.append(waitLabel, startBtn);
  root.appendChild(footer);
  startBtn.onclick = () => { audio?.playClick?.(); onStart(); };

  function renderSlots(state) {
    const { members = [], hostSeat = -1, yourSeat = -1 } = state || {};
    const isHost = yourSeat >= 0 && yourSeat === hostSeat;
    right.inert = yourSeat < 0;
    tableHead.textContent = `卓の顔ぶれ　${members.filter(m => m.kind === "human").length} / 4 人`;
    const focusedSeat = seatList.contains(document.activeElement) ? document.activeElement.closest("[data-seat]")?.dataset.seat : null;
    seatList.innerHTML = "";
    for (const m of members) {
      const row = elt("div", "online-seat room-seat");
      row.dataset.seat = String(m.seat);
      const mark = elt("span", "seat-mark", { textContent: String(m.seat + 1) });
      const who = elt("span", "online-seat-who");
      const st = elt("span", "online-seat-state");
      if (m.kind === "human") {
        const you = m.seat === yourSeat;
        const character = characters.find(c => c.id === m.charId);
        if (character?.assets?.icon) mark.replaceChildren(elt("img", "", { src: character.assets.icon, alt: "" }));
        who.textContent = m.name || "名無し";
        const detail = [you && "あなた", m.seat === hostSeat && "ホスト", character?.name || "選択中"].filter(Boolean);
        st.textContent = detail.join("・");
        if (you) st.classList.add("is-you");
      } else if (m.kind === "cpu") {
        who.textContent = "CPU";
        if (isHost) {
          const b = elt("button", "online-slot-btn", { type: "button", textContent: "空ける" });
          b.onclick = () => { audio?.playClick?.(); onSlot(m.seat, "open"); };
          st.appendChild(b);
        } else { st.textContent = "コンピュータ"; }
      } else { // open
        who.textContent = "空き";
        if (isHost) {
          const b = elt("button", "online-slot-btn", { type: "button", textContent: "CPUにする" });
          b.onclick = () => { audio?.playClick?.(); onSlot(m.seat, "cpu"); };
          st.appendChild(b);
        } else { st.textContent = "入室待ち"; }
      }
      row.append(mark, who, st);
      seatList.appendChild(row);
      if (row.dataset.seat === focusedSeat) row.querySelector("button")?.focus({ preventScroll: true });
    }
    waitLabel.textContent = isHost ? "あなたがホストです。揃ったら対局を開始できます。" : "ホストが対局を始めるのを待っています。";
    waitLabel.style.display = "";
    startBtn.style.display = isHost ? "" : "none";
    const confirmed = members.find((m) => m.seat === yourSeat)?.charId || null;
    if (myChar !== confirmed) { myChar = confirmed; refreshRoster(); }
  }

  // 初期は接続中（evt.lobby 未着）。
  seatList.appendChild(elt("div", "online-seat online-seat-connecting", { textContent: "接続中…" }));
  waitLabel.style.display = "";
  waitLabel.textContent = "卓に接続しています…";
  startBtn.style.display = "none";

  return { update: (state) => renderSlots(state) };
}
