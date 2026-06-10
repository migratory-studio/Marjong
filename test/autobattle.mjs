// オートバトル ロジック核（読み合い相性 / 曖昧ヒント / リーチ裏ドラ）の回帰テスト（DOM不要）。
// 雀荘巡りフル改修（軸2・軸3）の決定論・整合性・方向性を確認する。
import {
  newMatch, resolveRound, oppHint, revealedOppStance, healAfterMatch,
  paramsFromLv, makeRng, AUTOBATTLE_CONFIG as CFG,
} from "../src/autobattle/autoBattle.js";

let fails = 0;
const ok = (label, cond) => { if (!cond) fails++; console.log(`${cond ? "PASS" : "FAIL"}: ${label}`); };

const FLAT = (v) => ({ fire: v, guard: v, read: v, gamble: v, speed: v, mental: v });

// --- 決定論: 同 seed → 同じ局展開 ---
{
  const run = () => {
    const m = newMatch({ self: FLAT(40), opp: paramsFromLv(3, "t"), hp: 20000, hpMax: 30000, seed: "det-1" });
    const out = [];
    for (const cmd of ["push", "watch", "pull", "push"]) {
      if (m.finished) break;
      const r = resolveRound(m, cmd);
      out.push([r.tookRound, r.delta, r.hand.han, r.hand.riichi, r.hand.ura, r.oppStance]);
    }
    return JSON.stringify(out);
  };
  ok("同 seed で結果列が完全一致", run() === run());
}

// --- HAN_TABLE 整合: han と points のペアが常にテーブル行と一致（裏ドラ込み） ---
{
  const PAIRS = new Set(["1:1000", "2:2600", "3:3900", "4:8000", "5:8000", "6:12000"]);
  let all = true, uraSeen = 0, riichiSeen = 0;
  for (let i = 0; i < 300; i++) {
    const m = newMatch({ self: FLAT(60), opp: FLAT(40), hp: 25000, hpMax: 30000, seed: `han-${i}`, uraRateAdd: 0.2 });
    while (!m.finished) {
      const r = resolveRound(m, ["push", "last", "watch", "pull"][m.round % 4]);
      const h = r.hand;
      if (!PAIRS.has(`${h.han}:${h.points}`)) all = false;
      if (!PAIRS.has(`${h.baseHan}:${h.basePoints}`)) all = false;
      if (h.ura > 0 && !h.riichi) all = false;          // 裏は立直時のみ
      if (h.han !== h.baseHan + h.ura) all = false;     // 昇格の整合
      if (h.ura > 0) uraSeen++;
      if (h.riichi) riichiSeen++;
    }
  }
  ok("全 hand の han↔points が HAN_TABLE と整合（base/final/ura）", all);
  ok("リーチ・裏ドラが実際に発生する", riichiSeen > 50 && uraSeen > 5);
}

// --- 相性の方向性（モンテカルロ）: 相手 push 固定に対し pull が watch より勝ち、被ダメも軽い ---
{
  const N = 4000;
  const winRate = (cmd, stance) => {
    let wins = 0, pay = 0, payN = 0;
    for (let i = 0; i < N; i++) {
      const m = newMatch({ self: FLAT(40), opp: FLAT(40), hp: 25000, hpMax: 30000, seed: `mc-${cmd}-${i}` });
      m.oppStance = stance; // スタンスを固定して相性のみ観測
      const r = resolveRound(m, cmd);
      if (r.tookRound) wins++;
      else if (r.delta < 0) { pay += -r.delta; payN++; }
    }
    return { win: wins / N, avgPay: payN ? pay / payN : 0 };
  };
  const pullVsPush = winRate("pull", "push");
  const watchVsPush = winRate("watch", "push");
  const pushVsWatch = winRate("push", "watch");
  const pushVsPull = winRate("push", "pull");
  ok(`引く⊳押す: pull の勝率(${pullVsPush.win.toFixed(3)}) > watch の勝率(${watchVsPush.win.toFixed(3)})`,
    pullVsPush.win > watchVsPush.win + 0.08);
  ok(`押す⊳様子見: push vs watch(${pushVsWatch.win.toFixed(3)}) > push vs pull(${pushVsPull.win.toFixed(3)})`,
    pushVsWatch.win > pushVsPull.win + 0.10);
  ok(`読み当て受けは被ダメが軽い: pull vs push 平均払い(${Math.round(pullVsPush.avgPay)}) < watch vs push(${Math.round(watchVsPush.avgPay)})`,
    pullVsPush.avgPay < watchVsPush.avgPay);
}

// --- edge 判定が matchup と一致 ---
{
  const m = newMatch({ self: FLAT(40), opp: FLAT(40), hp: 25000, hpMax: 30000, seed: "edge-1" });
  m.oppStance = "push";
  const r = resolveRound(m, "pull"); // matchup.pull.push.p = +0.10 → win
  ok("有利相性で edge='win'", r.edge === "win");
  const m2 = newMatch({ self: FLAT(40), opp: FLAT(40), hp: 25000, hpMax: 30000, seed: "edge-2" });
  m2.oppStance = "pull";
  const r2 = resolveRound(m2, "push"); // matchup.push.pull.p = −0.10 → lose
  ok("不利相性で edge='lose'", r2.edge === "lose");
}

// --- ヒント: read 差で的中率が単調に上がる／revealed は常に確定 ---
{
  const accuracy = (selfRead) => {
    let hit = 0, n = 0;
    for (let i = 0; i < 3000; i++) {
      const self = { ...FLAT(40), read: selfRead };
      const m = newMatch({ self, opp: FLAT(40), hp: 25000, hpMax: 30000, seed: `hint-${selfRead}-${i}` });
      const h = oppHint(m);
      if (h && h.vague) { n++; if (h.stance === m.oppStance) hit++; }
    }
    return hit / Math.max(1, n);
  };
  const lo = accuracy(30);   // read 差 −10
  const hi = accuracy(46);   // read 差 +6（revealMargin 8 未満なので曖昧のまま）
  ok(`曖昧ヒントの的中率が read 差に単調 (low=${lo.toFixed(3)} < high=${hi.toFixed(3)})`, lo < hi);

  const self = { ...FLAT(40), read: 60 }; // read 差 +20 ≥ revealMargin 8 → 開示
  const m = newMatch({ self, opp: FLAT(40), hp: 25000, hpMax: 30000, seed: "rev-1" });
  const h = oppHint(m);
  ok("開示時は hint=実スタンス・vague=false", h && !h.vague && h.stance === m.oppStance && revealedOppStance(m) === m.oppStance);
}

// --- healAfterMatch の倍率（まかない） ---
{
  const base = healAfterMatch(10000, 30000);
  const fed = healAfterMatch(10000, 30000, 2.0);
  ok(`healAfterMatch mul=2 で回復が倍 (base=+${base - 10000}, fed=+${fed - 10000})`,
    fed - 10000 === (base - 10000) * 2);
  ok("healAfterMatch は最大を超えない", healAfterMatch(29900, 30000, 2.0) === 30000);
}

// --- uraRateAdd が裏ドラ率を実際に上げる ---
{
  const uraCount = (add) => {
    let c = 0;
    for (let i = 0; i < 800; i++) {
      const m = newMatch({ self: FLAT(60), opp: FLAT(30), hp: 25000, hpMax: 30000, seed: `ura-${add}-${i}`, uraRateAdd: add });
      while (!m.finished) {
        const r = resolveRound(m, "last");
        if (r.hand.ura > 0) c++;
      }
    }
    return c;
  };
  const plain = uraCount(0), rich = uraCount(0.4);
  ok(`uraRateAdd で裏ドラ増 (plain=${plain} < rich=${rich})`, rich > plain * 1.5);
}

// --- oppHpMaxSeats: レア客席だけ点棒が太い ---
{
  const m = newMatch({ self: FLAT(40), opp: FLAT(40), hp: 25000, hpMax: 30000, seed: "seat-1",
    oppHpMax: 6000, oppHpMaxSeats: [6000, 12000, 6000] });
  ok("席ごとの初期点棒が oppHpMaxSeats に従う",
    m.oppHp[0] === 6000 && m.oppHp[1] === 12000 && m.oppHp[2] === 6000);
  let capped = true;
  for (let i = 0; i < 200 && capped; i++) {
    const mm = newMatch({ self: FLAT(20), opp: FLAT(60), hp: 25000, hpMax: 30000, seed: `seat-cap-${i}`,
      oppHpMax: 6000, oppHpMaxSeats: [6000, 12000, 6000] });
    while (!mm.finished) {
      resolveRound(mm, "push");
      if (mm.oppHp[0] > 6000 || mm.oppHp[1] > 12000 || mm.oppHp[2] > 6000) capped = false;
    }
  }
  ok("回復/獲得しても席ごとの上限を超えない", capped);
}

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
