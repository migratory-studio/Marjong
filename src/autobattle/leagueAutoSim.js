// 大会オート節シミュレータ — 「大一番」構造（道中の節=オート観戦可・最終節=手動）の決着エンジン。
//
// 実対局エンジンは使わず、ユニット強度（弟子=育成6パラメータ平均＋師匠補正 / 相手=oppLv）で
// 局ごとの和了者と点移動を抽選する。雀荘オートと同じ「観るだけ」のテンポ感で消化し、
// 出力は手動対局と同じ形（standings / graph.history / graph.players）に揃えて
// main.js の onTournamentMatchDone へそのまま合流する（ウマ配分・擬似加算・順位表は共通）。
//
// 設計メモ:
//   - 点はユニット単位で動かす（ペア=2ユニット/卓・団体=3〜4ユニット/卓でも同じループ）。
//   - 点の総和は保存される（ツモは等分払い・ロンは一人払い）＝順位表の素点が破綻しない。
//   - 強度差は「局取り重み」と「打点スケール」に効くが、運で覆る範囲に圧縮する
//     （パラメータ負けでも手動で覆せる、の逆＝オートでも全敗はしない）。
//   - 決定論: rng 注入式。回帰は test/leaguesim.mjs。
export const LEAGUE_SIM = {
  weightBase: 20,          // 局取り重みの下駄（運の床）
  weightPerStrength: 0.35, // 強度1あたりの重み（差は出るが支配しない）
  tsumoRate: 0.45,         // ツモ和了の割合（残りはロン）
  drawRate: 0.08,          // 流局率（テンポ用・点移動なし）
  valueMin: 1000,
  valueMax: 12000,
  bigWin: 8000,            // これ以上は「大物手」（観戦演出・師匠相槌のフック）
};

// units: [{ id, name, color, isHuman, start, strength }]
// seats: 卓の席数（局ラベル用。東1〜東seats → 南1…）。hands: 総局数（東風=seats×rounds）。
export function simulateLeagueSection({ units, seats = 4, hands = 4, rng = Math.random }) {
  const pts = units.map((u) => u.start);
  const history = [{ label: "開始", points: [...pts] }];
  const steps = [];
  const winds = ["東", "南", "西", "北"];
  const weights = units.map((u) => LEAGUE_SIM.weightBase + Math.max(0, u.strength || 0) * LEAGUE_SIM.weightPerStrength);
  // 重み抽選（excl の添字を除く）。
  const pick = (excl = -1) => {
    let tot = 0;
    for (let i = 0; i < units.length; i++) if (i !== excl) tot += weights[i];
    let r = rng() * tot;
    for (let i = 0; i < units.length; i++) {
      if (i === excl) continue;
      if ((r -= weights[i]) < 0) return i;
    }
    return excl === 0 ? Math.min(1, units.length - 1) : 0;
  };
  for (let h = 0; h < hands; h++) {
    const label = `${winds[Math.floor(h / seats) % 4]}${(h % seats) + 1}局`;
    if (rng() < LEAGUE_SIM.drawRate) {
      steps.push({ label, draw: true, points: [...pts] });
      history.push({ label, points: [...pts] });
      continue;
    }
    const w = pick();
    const tsumo = rng() < LEAGUE_SIM.tsumoRate;
    // 打点: 低めに寄った分布 × 強度スケール（強いユニットほど手が高い）。100点単位に丸める。
    const scale = 1 + Math.max(-0.3, ((units[w].strength || 0) - 30) / 160);
    let value = Math.round(((LEAGUE_SIM.valueMin + Math.pow(rng(), 1.6) * (LEAGUE_SIM.valueMax - LEAGUE_SIM.valueMin)) * scale) / 100) * 100;
    let victim = -1;
    if (tsumo && units.length > 1) {
      const share = Math.max(100, Math.round(value / (units.length - 1) / 100) * 100);
      value = share * (units.length - 1); // 等分払い＝総和保存
      for (let i = 0; i < units.length; i++) if (i !== w) pts[i] -= share;
      pts[w] += value;
    } else {
      victim = pick(w);
      pts[victim] -= value;
      pts[w] += value;
    }
    steps.push({ label, winner: w, victim, tsumo, value, big: value >= LEAGUE_SIM.bigWin, points: [...pts] });
    history.push({ label, points: [...pts] });
  }
  return {
    standings: units.map((u, i) => ({ id: u.id, isHuman: !!u.isHuman, points: pts[i] })),
    steps,
    history,
    players: units.map((u) => ({ name: u.name, color: u.color || "#9bb3a6", isHuman: !!u.isHuman })),
  };
}
