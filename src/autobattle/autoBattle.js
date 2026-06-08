// オートバトル ロジック核 — major_update_specification.md §4.6（プロトタイプ）。
//
// 師弟モード内の RPG 風オートバトル。麻雀対局エンジンには一切触れない純粋ロジック。
//   - 6 パラメータ（火力/守備/読み/勝負勘/速度/メンタル）。対局エンジン非反映（§3.1）。
//   - 1 試合＝東風 4 局。毎局 4 コマンド（押す/引く/様子を見る/次ラスで！）を選ぶ。
//   - HP（点棒）は試合中は減る一方のダメージバー。局を取れば被害ゼロ、負ければダメージ。
//   - 速度＝先制、メンタル＝ブレ圧縮、読み＝相手スタンスの事前開示（読み合い）。
//   - 試合終了ごとに一定回復（呼び出し側で healAfterMatch を使う）。
//
// 数値はすべて CFG に集約（§25 同様チューニング前提・暫定値）。乱数は注入可能（テスト用）。

export const PARAM_KEYS = ["fire", "guard", "read", "gamble", "speed", "mental"];
export const PARAM_LABELS = {
  fire: "火力", guard: "守備", read: "読み", gamble: "勝負勘", speed: "速度", mental: "メンタル",
};

export const COMMANDS = [
  { id: "push",  label: "押す",       sub: "火力で押し切る" },
  { id: "pull",  label: "引く",       sub: "守備で受ける" },
  { id: "watch", label: "様子を見る", sub: "読みで立て直す" },
  { id: "last",  label: "次ラスで！", sub: "勝負勘の一発" },
];

// 6 段階評価（自 param 合計 / 相手合計 の比）。min 以上で最初に当たる帯。
export const TIERS = [
  { id: "yusei",       label: "優勢",     min: 1.25 },
  { id: "yaya_yusei",  label: "やや優勢", min: 1.10 },
  { id: "kakko",       label: "拮抗",     min: 0.92 },
  { id: "yaya_ressei", label: "やや劣勢", min: 0.78 },
  { id: "ressei",      label: "劣勢",     min: 0.62 },
  { id: "dai_ressei",  label: "大劣勢",   min: 0 },
];

// チューニング値（暫定）。
const CFG = {
  rounds: 4,                 // 東風 4 局
  baseWin: 0.5,              // 局を取る基礎確率
  diffScale: 60,            // param 差 → 確率への効き
  speedWinBonus: 0.0025,    // 速度 1 につき局取り確率 +
  watchBonus: 0.10,         // 様子見スタックが次局の取り確率に乗る量
  revealMargin: 8,          // 読み − 相手読み がこの差以上で相手スタンス開示
  mentalVarReduce: 0.006,   // メンタル 1 につき乱数の振れ幅を縮める
  healAfterMatch: 0.15,     // 試合終了ごとの自動回復（最大 HP 比）
  // コマンドごとの「自分の効くparam / 相手の抵抗param / 取り確率係数 / 負け時ダメージ基準」
  cmd: {
    push:  { self: "fire",   opp: "guard", k: 1.0, dmgLose: 7000,  win: 3 },
    pull:  { self: "guard",  opp: "fire",  k: 0.5, dmgLose: 2200,  win: 1 },
    watch: { self: "read",   opp: "read",  k: 0.6, dmgLose: 1500,  win: 1 },
    last:  { self: "gamble", opp: "guard", k: 1.2, dmgLose: 12000, win: 5 },
  },
  // 相手スタンス抽選の重み元（相手 param → コマンド傾向）
  oppStanceParam: { push: "fire", pull: "guard", watch: "read", last: "gamble" },
};

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export function paramTotal(p) { return PARAM_KEYS.reduce((s, k) => s + (p[k] || 0), 0); }

export function evaluateTier(self, opp) {
  const ratio = paramTotal(self) / Math.max(1, paramTotal(opp));
  const tier = TIERS.find((t) => ratio >= t.min) || TIERS[TIERS.length - 1];
  return { ratio, tier };
}

// 文字列/数値 seed → 0..1 の決定論乱数生成器（mulberry32）。
export function makeRng(seed = Date.now()) {
  let a = (typeof seed === "string"
    ? seed.split("").reduce((h, c) => (Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0), 2166136261)
    : seed) >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 相手の 6 パラメータを Lv から決定論生成（mobLvBand → 個体 Lv → 6 param）。
// lv 1〜10 を素直に param 帯へ写像し、seed で各キーに小さなばらつきを足す。
export function paramsFromLv(lv, seed = "opp") {
  const rng = makeRng(`${seed}:${lv}`);
  const base = 12 + lv * 7; // lv1≈19, lv10≈82
  const p = {};
  for (const k of PARAM_KEYS) p[k] = Math.round(clamp(base + (rng() * 2 - 1) * 10, 5, 99));
  return p;
}

// 新しい試合状態を作る。self/opp は 6 パラメータ。hp は試合開始時の現在 HP。
export function newMatch({ self, opp, hp, hpMax, seed = Date.now() }) {
  const rng = makeRng(seed);
  const state = {
    self, opp, hp, hpMax,
    rng,
    round: 0,                 // 0..rounds
    rounds: CFG.rounds,
    selfPlacementPts: 0,      // 着順用ポイント（局を取った重みの累積）
    oppPlacementPts: 0,
    oppHp: [25000, 25000, 25000], // 相手 3 人の点棒（席バー演出用）
    oppHpMax: 25000,
    watchStack: 0,
    finished: false,
    result: null,             // 'clear' | 'down'（HP0）
    log: [],
    oppStance: null,          // 今局の相手スタンス
    revealed: false,          // 読み合いで開示されたか
  };
  startRound(state);
  return state;
}

// 局頭：相手スタンスを決め、読みが高ければ開示する。
function startRound(state) {
  if (state.finished || state.round >= state.rounds) return;
  state.oppStance = pickOppStance(state);
  state.revealed = (state.self.read - state.opp.read) >= CFG.revealMargin;
}

function pickOppStance(state) {
  const o = state.opp;
  const weights = COMMANDS.map((c) => ({ id: c.id, w: Math.max(1, o[CFG.oppStanceParam[c.id]] || 1) }));
  const sum = weights.reduce((s, x) => s + x.w, 0);
  let r = state.rng() * sum;
  for (const x of weights) { if ((r -= x.w) <= 0) return x.id; }
  return "push";
}

// 開示されていれば相手の今局スタンス、未開示なら null。
export function revealedOppStance(state) {
  return state.revealed ? state.oppStance : null;
}

// 翻 → 点数 ＆ 役名（フレーバー）。子のロン相当の概算。
const HAN_TABLE = [
  { han: 1, pts: 1000,  yaku: ["立直", "平和ドラ"] },
  { han: 2, pts: 2600,  yaku: ["立直ツモ", "タンヤオドラ1"] },
  { han: 3, pts: 3900,  yaku: ["タンヤオ三色", "ドラ3"] },
  { han: 4, pts: 8000,  yaku: ["混一色ドラ", "対々和"] },
  { han: 5, pts: 8000,  yaku: ["満貫"] },
  { han: 6, pts: 12000, yaku: ["跳満"] },
];
// コマンドの攻撃性（高いほど高打点を狙う）。
const AGGR = { push: 0.7, pull: 0.1, watch: 0.2, last: 1.0 };

// 和了の翻/点/役を引く。power（火力・勝負勘）と攻撃性が高いほど高打点へ寄る。
function rollHand(p, aggression, rng) {
  const power = (p.fire + p.gamble) / 2 / 99;           // 0..1
  const t = power * 0.5 + aggression * 0.4 + rng() * 0.5; // 0..~1.4
  const idx = clamp(Math.floor(t * HAN_TABLE.length), 0, HAN_TABLE.length - 1);
  const e = HAN_TABLE[idx];
  const yaku = e.yaku[Math.floor(rng() * e.yaku.length)];
  return { han: e.han, points: e.pts, yaku };
}

// 1 局を解決する。command はプレイヤーのコマンド id。
// 戻り値: { tookRound, hand, delta, hp, finished, result }
//   hand: { winnerSeat(0=自分,1..3=相手), han, yaku, points }
//   delta: 自分の点棒（HP）増減（＋＝獲得 / −＝放銃・被ツモ）
export function resolveRound(state, command) {
  if (state.finished) return null;
  const c = CFG.cmd[command] || CFG.cmd.push;

  // 局を取る確率：自分の効きparam − 相手の抵抗param、＋速度先制、＋様子見スタック。
  let prob = CFG.baseWin
    + c.k * (state.self[c.self] - state.opp[c.opp]) / CFG.diffScale
    + state.self.speed * CFG.speedWinBonus
    + state.watchStack * CFG.watchBonus;
  prob = clamp(prob, 0.05, 0.95);

  const tookRound = state.rng() < prob;
  // 様子見スタックの更新（様子見で +1、他コマンドで消費）。
  state.watchStack = command === "watch" ? state.watchStack + 1 : 0;

  let hand, delta, winnerSeat;
  if (tookRound) {
    // 自分の和了：点を獲得（HP 増）。相手の誰か 1 人が払う。
    const h = rollHand(state.self, AGGR[command] ?? 0.5, state.rng);
    const amount = h.points;
    winnerSeat = 0;
    const payer = 1 + Math.floor(state.rng() * 3);
    delta = amount;
    state.hp = clamp(state.hp + amount, 0, state.hpMax);
    state.oppHp[payer - 1] = clamp(state.oppHp[payer - 1] - amount, 0, state.oppHpMax);
    hand = { winnerSeat, payerSeat: payer, han: h.han, points: amount };
    state.selfPlacementPts += c.win;
  } else {
    // 相手の和了：自分が払う（HP 減）。引く＝守備で軽減、メンタルで振れ幅圧縮。
    const h = rollHand(state.opp, 0.6, state.rng);
    const guardMul = command === "pull" ? clamp(1 - state.self.guard / 160, 0.4, 1) : 1;
    const spread = clamp(0.25 - state.self.mental * CFG.mentalVarReduce, 0.05, 0.25);
    const noise = 1 + (state.rng() * 2 - 1) * spread;
    const amount = Math.round(h.points * guardMul * noise);
    winnerSeat = 1 + Math.floor(state.rng() * 3);
    delta = -amount;
    state.hp = clamp(state.hp - amount, 0, state.hpMax);
    state.oppHp[winnerSeat - 1] = clamp(state.oppHp[winnerSeat - 1] + amount, 0, state.oppHpMax);
    hand = { winnerSeat, payerSeat: 0, han: h.han, points: amount };
    state.oppPlacementPts += 2;
  }
  state.log.push({ round: state.round + 1, command, tookRound, delta, hand });
  state.round += 1;

  if (state.hp <= 0) {
    state.finished = true; state.result = "down";
  } else if (state.round >= state.rounds) {
    state.finished = true; state.result = "clear";
  } else {
    startRound(state);
  }

  return { tookRound, hand, delta, hp: state.hp, oppHp: state.oppHp.slice(), finished: state.finished, result: state.result };
}

// 試合の最終着順（1〜4 の概算）。プレイヤーの取りポイントを相手平均と比べる簡易版。
export function finalPlacement(state) {
  const self = state.selfPlacementPts;
  const opp = state.oppPlacementPts / 1.5; // 相手 3 人ぶんの目安
  if (self >= opp + 6) return 1;
  if (self >= opp) return 2;
  if (self >= opp - 4) return 3;
  return 4;
}

// 試合終了ごとの自動回復（§4.6.3）。次試合へ持ち越す HP を返す。
export function healAfterMatch(hp, hpMax) {
  return Math.min(hpMax, hp + Math.round(hpMax * CFG.healAfterMatch));
}

export { CFG as AUTOBATTLE_CONFIG };
