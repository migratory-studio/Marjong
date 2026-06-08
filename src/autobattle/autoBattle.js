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
  // 和了の種別抽選（点棒移動のバリエーション）。
  selfTsumoRate: 0.40,      // 自分が和了 → ツモ（相手 3 人が払う）になる率（残りはロン）
  oppTsumoRate: 0.30,       // 相手が和了 → ツモ（自分含む全員が払う）
  oppRonYouRate: 0.40,      // 相手が和了 → 自分へロン（自分が払う）。残り＝他家へロン（自分は無傷）
  // 能力発動（弟子の必殺）。勝率・和了質を大きく底上げする。
  abilityWinBonus: 0.45,    // 局取り確率を超 UP
  abilityWinFloor: 0.92,    // 弱くても発動時は最低この勝率（必殺がほぼ必ず映える）
  abilityHanBoost: 0.55,    // 打点/和了質の引きを上げる（rollHand へ加算）
  abilityTsumoRate: 0.70,   // 能力発動時はツモ（全員払い）に寄せる＝派手
  conditionWinStep: 0.02,   // 当日の調子（bias ±2）→ 局取り確率に軽く反映（±0.04）
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
// 弟子の param は低スタート（合計 ~74）→ 育成で ~594 まで伸びる。相手はこのレンジに合わせる。
// base=3+lv*8 ＝ lv0≈3(合計~18・激弱), lv1≈11, lv3≈27, lv5≈43, lv10≈83。
// 楽勝雀荘＝低 lv（弟子より弱い）／進捗で lv を上げて難度を保つ（§4.6.8）。
export function paramsFromLv(lv, seed = "opp") {
  const rng = makeRng(`${seed}:${lv}`);
  const base = 3 + lv * 8;
  const p = {};
  for (const k of PARAM_KEYS) p[k] = Math.round(clamp(base + (rng() * 2 - 1) * 6, 1, 99));
  return p;
}

// 新しい試合状態を作る。self/opp は 6 パラメータ。hp は試合開始時の現在 HP。
// conditionBias は当日の調子（-2..+2）。局取り確率に軽く反映する。
export function newMatch({ self, opp, hp, hpMax, seed = Date.now(), conditionBias = 0, oppHpMax = 25000 }) {
  const rng = makeRng(seed);
  const state = {
    self, opp, hp, hpMax,
    conditionBias,
    rng,
    round: 0,                 // 0..rounds
    rounds: CFG.rounds,
    selfPlacementPts: 0,      // 着順用ポイント（局を取った重みの累積）
    oppPlacementPts: 0,
    oppHp: [oppHpMax, oppHpMax, oppHpMax], // 相手 3 人の点棒（席バー演出用）
    oppHpMax,
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

// 和了の翻/点/役を引く。
// 火力が「狙える翻の上限（幅）」を決める＝低火力はほぼ 1〜2 翻、火力が伸びるほど満貫・跳満まで幅が出る。
// 勝負勘・攻撃性・能力 boost が上振れ（同じ幅の中で高い方を引きやすく）。
function rollHand(p, aggression, rng, boost = 0) {
  const power = clamp((p.fire || 0) / 99, 0, 1);                 // 火力 0..1
  const maxIdx = clamp(Math.round(power * 5) + Math.round(boost * 2), 1, HAN_TABLE.length - 1); // 低火力=1(2翻まで)…高火力=5
  const lift = clamp((p.gamble || 0) / 99 * 0.3 + aggression * 0.4 + boost * 0.5 + rng() * 0.6, 0, 1.2);
  const idx = clamp(Math.floor(lift * (maxIdx + 1)), 0, maxIdx);
  const e = HAN_TABLE[idx];
  const yaku = e.yaku[Math.floor(rng() * e.yaku.length)];
  return { han: e.han, points: e.pts, yaku };
}

// 点棒移動を 1 件適用する（from 席 → to 席、amount 点）。HP/相手バーを更新し、明細を積む。
// seat 0 = 自分、1..3 = 相手。amount<=0 は無視。
function applyPayment(state, from, to, amount, payments) {
  if (amount <= 0) return;
  if (from === 0) state.hp = clamp(state.hp - amount, 0, state.hpMax);
  else state.oppHp[from - 1] = clamp(state.oppHp[from - 1] - amount, 0, state.oppHpMax);
  if (to === 0) state.hp = clamp(state.hp + amount, 0, state.hpMax);
  else state.oppHp[to - 1] = clamp(state.oppHp[to - 1] + amount, 0, state.oppHpMax);
  payments.push({ from, to, amount });
}

// 自分が払うときの軽減（引く＝守備で受ける／メンタルで振れ幅圧縮）。
function selfPayAmount(state, base, command) {
  const guardMul = command === "pull" ? clamp(1 - state.self.guard / 160, 0.4, 1) : 1;
  const spread = clamp(0.25 - state.self.mental * CFG.mentalVarReduce, 0.05, 0.25);
  const noise = 1 + (state.rng() * 2 - 1) * spread;
  return Math.round(base * guardMul * noise);
}

// 自分の取りポイント（着順用）の合計＝seat 0 への純増。表示用。
function playerDelta(payments) {
  let d = 0;
  for (const p of payments) { if (p.to === 0) d += p.amount; if (p.from === 0) d -= p.amount; }
  return d;
}

// ランダムに 1..3 の相手席を 1 つ返す（exclude を避ける）。
function pickOpp(rng, exclude = 0) {
  let s = 1 + Math.floor(rng() * 3);
  if (s === exclude) s = (s % 3) + 1;
  return s;
}

// 1 局を解決する。command はプレイヤーのコマンド id。opts.ability で能力発動（超強化）。
// 戻り値: { tookRound, hand, delta, payments, hp, oppHp, finished, result }
//   hand: { winnerSeat(0=自分,1..3=相手), winType('tsumo'|'ron'), han, points, ronTarget? }
//   payments: [{ from, to, amount }] … 点棒移動の明細（演出はこれを順に飛ばす）
//   delta: 自分の点棒（HP）増減（＋＝獲得 / −＝放銃・被ツモ / 0＝無関係＝難を逃れた）
export function resolveRound(state, command, opts = {}) {
  if (state.finished) return null;
  const ability = !!opts.ability;
  const c = CFG.cmd[command] || CFG.cmd.push;

  // 局を取る確率：自分の効きparam − 相手の抵抗param、＋速度先制、＋様子見スタック、＋能力。
  let prob = CFG.baseWin
    + c.k * (state.self[c.self] - state.opp[c.opp]) / CFG.diffScale
    + state.self.speed * CFG.speedWinBonus
    + state.watchStack * CFG.watchBonus
    + (state.conditionBias || 0) * CFG.conditionWinStep
    + (ability ? CFG.abilityWinBonus : 0);
  prob = clamp(prob, 0.05, ability ? 0.99 : 0.95);
  if (ability) prob = Math.max(prob, CFG.abilityWinFloor); // 必殺は弱くても映える

  const tookRound = state.rng() < prob;
  // 様子見スタックの更新（様子見で +1、他コマンドで消費）。
  state.watchStack = command === "watch" ? state.watchStack + 1 : 0;

  const payments = [];
  let hand, winnerSeat, winType;
  if (tookRound) {
    // 自分の和了。ツモ（相手 3 人払い）かロン（1 人払い）かを抽選。能力でツモ＆高打点に寄る。
    const h = rollHand(state.self, AGGR[command] ?? 0.5, state.rng, ability ? CFG.abilityHanBoost : 0);
    winnerSeat = 0;
    const tsumoRate = ability ? CFG.abilityTsumoRate : CFG.selfTsumoRate;
    if (state.rng() < tsumoRate) {
      winType = "tsumo";
      const each = Math.round(h.points / 3);
      for (let s = 1; s <= 3; s++) applyPayment(state, s, 0, each, payments);
    } else {
      winType = "ron";
      applyPayment(state, pickOpp(state.rng), 0, h.points, payments);
    }
    hand = { winnerSeat, winType, han: h.han, points: h.points };
    state.selfPlacementPts += c.win + (ability ? 2 : 0);
  } else {
    // 相手の和了。ツモ（全員払い）／自分へロン／他家へロン（自分は無傷）を抽選。
    winnerSeat = pickOpp(state.rng);
    const h = rollHand(state.opp, 0.6, state.rng);
    const roll = state.rng();
    if (roll < CFG.oppTsumoRate) {
      winType = "tsumo";
      const each = Math.round(h.points / 3);
      applyPayment(state, 0, winnerSeat, selfPayAmount(state, each, command), payments); // 自分の被ツモ
      for (let s = 1; s <= 3; s++) if (s !== winnerSeat) applyPayment(state, s, winnerSeat, each, payments);
    } else if (roll < CFG.oppTsumoRate + CFG.oppRonYouRate) {
      winType = "ron";
      applyPayment(state, 0, winnerSeat, selfPayAmount(state, h.points, command), payments); // 自分の放銃
    } else {
      // 他家へのロン：自分は無関係（点棒移動は相手同士）。
      winType = "ron";
      const target = pickOpp(state.rng, winnerSeat);
      hand = { winnerSeat, winType, han: h.han, points: h.points, ronTarget: target };
      applyPayment(state, target, winnerSeat, h.points, payments);
    }
    if (!hand) hand = { winnerSeat, winType, han: h.han, points: h.points };
    state.oppPlacementPts += 2;
  }
  const delta = playerDelta(payments);
  state.log.push({ round: state.round + 1, command, ability, tookRound, delta, hand });
  state.round += 1;

  const oppBust = state.oppHp.some((h) => h <= 0); // 相手が飛んだ＝トビ終了（こちらの勝ち）
  if (state.hp <= 0) {
    state.finished = true; state.result = "down";
  } else if (oppBust) {
    state.finished = true; state.result = "bust_win";
  } else if (state.round >= state.rounds) {
    state.finished = true; state.result = "clear";
  } else {
    startRound(state);
  }

  return { tookRound, hand, delta, payments, hp: state.hp, oppHp: state.oppHp.slice(), finished: state.finished, result: state.result };
}

// 試合の最終着順（1〜4 の概算）。プレイヤーの取りポイントを相手平均と比べる簡易版。
export function finalPlacement(state) {
  if (state.result === "bust_win") return 1; // 相手を飛ばした＝1着
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
