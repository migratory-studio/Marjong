// Draw-manipulation abilities (hook: MODIFY_DRAW).
import { Ability } from "../ability.js";
import { Hooks } from "../hooks.js";
import { registerAbility } from "../registry.js";
import { abilityDef } from "../../data/abilityMaster.js";
import { tilesToCounts, isTerminalOrHonor, isSimple, kindLabel } from "../../core/tiles.js";
import { waits } from "../../core/rules/winCheck.js";
import { recomputeWithExtraDora } from "../../core/rules/score.js";
import { shanten } from "../../core/rules/shanten.js";
import { estimateDangerInfo, DANGER_SUPER, DANGER_HIGH, DANGER_WARN } from "./defenseAbilities.js";

// "ツモ偏重 / 幸運のツモ" — while active, biases each draw toward tiles that
// improve the hand the most. Looks ahead at the next few wall tiles and picks
// the one that brings the hand closest to a win.
// Manual: activate once per game; stays active for the rest of that hand.
//
// params（skillLevelMaster lv-lucky-draw の runtimeParams・§10.5 Phase 7）:
//   lookaheadDepth … 候補配列の先頭N件だけ走査する（候補窓 peekLive(8) は固定＝8が天井）
//   doraPreference … handPotential 同点ならドラ/赤5の候補を優先する（Lv9+）
//   dangerTier     … 超越帯: マモリの危険感知の副次付与 0〜3（Lv6+。パッシブ動作）
//   maxCharges / cooldown … abilityDef を上書き（maxChargesOverride 由来）
export class LuckyDrawAbility extends Ability {
  constructor(params = {}) {
    super({ ...abilityDef("lucky-draw"), ...params });
    this.lookaheadDepth = params.lookaheadDepth ?? 8;
    this.doraPreference = params.doraPreference ?? false;
    this.dangerTier = params.dangerTier ?? 0;
  }

  [Hooks.MODIFY_DRAW](ctx, api) {
    if (!this.isActive) return undefined;
    const player = ctx.player;
    const baseCounts = tilesToCounts(player.hand);
    // doraPreference: 同点タイブレーク用のドラ判定（赤5は tile.red）。
    const doraKinds = this.doraPreference ? new Set(ctx.wall?.doraKinds?.() ?? []) : null;
    const isDora = (t) => !!t && (t.red || doraKinds.has(t.kind));
    let best = ctx.defaultTile;
    let bestScore = -1;
    for (const tile of ctx.candidates.slice(0, this.lookaheadDepth)) {
      baseCounts[tile.kind]++;
      // score = how close to tenpai/win the hand becomes (cheap heuristic)
      const score = handPotential(baseCounts, player.melds.length);
      baseCounts[tile.kind]--;
      if (score > bestScore) {
        bestScore = score;
        best = tile;
      } else if (doraKinds && score === bestScore && isDora(tile) && !isDora(best)) {
        best = tile; // 伸びが同点ならドラ/赤5を引き寄せる
      }
    }
    if (best && best !== ctx.defaultTile) api.log(`有利牌を引き寄せた`);
    return best;
  }

  // 超越帯（Lv6+）の副次付与: マモリの危険感知が段階的に宿る。
  // tier1=超危険(赤)のみ / tier2=赤＋橙 / tier3=フル3段階（マモリ相当）。
  // 「常時」＝発動状態（isActive）に依存しないパッシブ動作。
  [Hooks.PROVIDE_DANGER_INFO](ctx, api) {
    if (!(this.dangerTier > 0)) return undefined;
    const minLevel =
      this.dangerTier >= 3 ? DANGER_WARN : this.dangerTier === 2 ? DANGER_HIGH : DANGER_SUPER;
    return estimateDangerInfo(api.opponents()).filter((d) => d.level >= minLevel);
  }
}

// 么九牌（1・9・字牌）の種類一覧。国士狙い判定と国士用ツモ候補に使う。
const YAOCHUU_KINDS = Array.from({ length: 34 }, (_, k) => k).filter(isTerminalOrHonor);
// 数牌スーツ（萬・筒・索）の先頭 kind。
const SUIT_BASES = [0, 9, 18];

// 手牌（counts）からカンチャン・ペンチャンのターツを判定し、それを埋める
// 「有効牌」の種類集合を返す。完成牌を未所持のターツだけを対象にする。
//   - ペンチャン: 1+2→3 / 8+9→7
//   - カンチャン: r と r+2 を持ち、間の r+1 が欠けている
// 国士無双狙い（手持ちの么九が7種以上）なら、手持ちにない么九牌を候補にする。
export function koninTargets(counts) {
  const heldYaochuu = YAOCHUU_KINDS.filter((k) => counts[k] > 0);
  if (heldYaochuu.length >= 7) {
    return new Set(YAOCHUU_KINDS.filter((k) => counts[k] === 0));
  }
  const wants = new Set();
  for (const b of SUIT_BASES) {
    // ペンチャン
    if (counts[b] > 0 && counts[b + 1] > 0 && counts[b + 2] === 0) wants.add(b + 2);
    if (counts[b + 8] > 0 && counts[b + 7] > 0 && counts[b + 6] === 0) wants.add(b + 6);
    // カンチャン
    for (let r = 0; r <= 6; r++) {
      const mid = b + r + 1;
      if (counts[b + r] > 0 && counts[b + r + 2] > 0 && counts[mid] === 0) wants.add(mid);
    }
  }
  return wants;
}

// "牌寄せ"（呼忍）— 1局1回。発動した「次のツモ」で、手牌のカンチャン/ペンチャンを
// 埋める有効牌を引き寄せる（国士狙いなら手持ちにない么九牌）。テンパイ時は発動不可。
// 引ける山（次の生牌候補）に有効牌が無ければ失敗し、通常ツモになる（使い切り）。
export class SummonTileAbility extends Ability {
  constructor(params = {}) {
    super(abilityDef("summon-tile"));
    this.targetKind = params.targetKind ?? null; // 指定があればその牌に固定（既定は自動）
  }

  // テンパイ（またはアガリ形）では発動できない。
  activationCondition(api) {
    const p = api.me;
    return shanten(p.counts(), p.numMeldSets()) > 0;
  }

  [Hooks.MODIFY_DRAW](ctx, api) {
    if (!this.isActive) return undefined;
    // 発動した次のツモ1回で解決する（命中・失敗どちらでも使い切り）。
    this.active = false;
    const wants = this.targetKind != null
      ? new Set([this.targetKind])
      : koninTargets(tilesToCounts(ctx.player.hand));
    if (wants.size === 0) {
      api.log(`牌寄せ失敗（呼べる有効牌が無い）`);
      return undefined;
    }
    const hit = ctx.candidates.find((t) => wants.has(t.kind));
    if (hit) {
      api.log(`有効牌「${kindLabel(hit.kind)}」を呼び寄せた`);
      return hit;
    }
    api.log(`牌寄せ失敗（山に有効牌なし・通常ツモ）`);
    return undefined;
  }
}

// "老頭ツモ" — while active, draws are biased toward 么九牌 (terminals/honors).
// Manual: 1ゲーム2局まで; active for the rest of the hand it is used in.
export class RootouAbility extends Ability {
  constructor() {
    super(abilityDef("rootou"));
  }
  [Hooks.MODIFY_DRAW](ctx, api) {
    if (!this.isActive) return undefined;
    const hit = ctx.candidates.find((t) => isTerminalOrHonor(t.kind));
    if (hit && hit !== ctx.defaultTile) api.log(`么九牌を引き寄せた`);
    return hit ?? undefined;
  }
}

// "中張ツモ" — while active, draws are biased toward 中張牌 (simples 2..8).
// Manual: 1ゲーム2局まで; active for the rest of the hand it is used in.
export class ChunchanAbility extends Ability {
  constructor() {
    super(abilityDef("chunchan"));
  }
  [Hooks.MODIFY_DRAW](ctx, api) {
    if (!this.isActive) return undefined;
    const hit = ctx.candidates.find((t) => isSimple(t.kind));
    if (hit && hit !== ctx.defaultTile) api.log(`中張牌を引き寄せた`);
    return hit ?? undefined;
  }
}

// "ドラ寄せ" — 発動するたびに新ドラ表示牌を1枚めくる即時効果型（apply）。リンシャンは
// 引かない。裏ドラ表示牌は wall 側で同じ doraRevealed を参照するため自動で連動する。
// めくりは全プレイヤーに影響し、和了時は「その局の発動回数」枚分の確定ドラ（飜）が
// 自分の手にだけ後付けされる（MODIFY_SCORE）。ドラは役ではないので、役無しでは和了
// できない挙動はそのまま（確定ドラを足すだけでスコアの valid 判定はいじらない）。
// 場の槓ドラめくり総数が5に達したときの四開槓流局は game 側が判定する。
// Manual: 1局に2回（chargeScope hand / maxCharges 2）かつ 1ゲーム2局まで。
// hand スコープの回数だけでは「使える局数」を縛れないので、ゲーム単位で
// 「発動した局数」を数え、2局を超えたら新しい局では発動できないようにする。
const DORA_PULL_MAX_HANDS = 2;
export class DoraPullAbility extends Ability {
  constructor() {
    super(abilityDef("dora-pull"));
    this._handsUsed = 0;          // この能力を使った局数（ゲーム通算）
    this._usedThisHand = false;   // 今の局で1回でも発動したか
    this._activationsThisHand = 0; // 今の局の発動回数（＝後付けする確定ドラ枚数）
  }
  resetForGame() {
    super.resetForGame();
    this._handsUsed = 0;
    this._usedThisHand = false;
    this._activationsThisHand = 0;
  }
  resetForHand() {
    super.resetForHand(); // hand スコープ: charges を 2 に補充・active を false に
    this._usedThisHand = false;
    this._activationsThisHand = 0;
  }
  // 既にこの局で使っていれば（回数が残る限り）継続OK。未使用の局では、
  // まだ使用局数が上限未満のときだけ新規に発動できる。
  activationCondition(_api) {
    return this._usedThisHand || this._handsUsed < DORA_PULL_MAX_HANDS;
  }
  // 即時効果: 新ドラ表示牌を1枚めくる（リンシャンは引かない）。めくりの主体（自分の
  // 席index）を game に渡し、四開槓の通算カウントに参入させる。四開槓で流局した場合も
  // めくり自体は成立しているので true を返す（発動は成功＝チャージ消費）。
  apply(game, player, _params) {
    this._activationsThisHand++;
    // 発動回数で口上を出し分ける（確定ドラ枚数＝この発動回数と一致）。
    if (this._activationsThisHand === 1) {
      game.log(`【${player.character.name}】「賭けを吊り上げる」——新たなドラ表示牌が1枚、めくれた`);
    } else {
      game.log(`【${player.character.name}】「止まれると思ったか？」——ドラ表示牌がもう1枚、めくれた`);
    }
    game.revealKanDoraFrom(player.index);
    return true;
  }
  activate() {
    const ok = super.activate();
    if (ok) {
      // 即時効果型ゆえ持続する「発動状態」を持たない。super.activate() が立てた
      // active を毎回下ろし、局内の次の発動（最大2回）を canActivate が塞がない
      // ようにする。回数は charges（maxCharges=2）が縛る。
      this.active = false;
      if (!this._usedThisHand) {
        this._usedThisHand = true;
        this._handsUsed++;
      }
    }
    return ok;
  }
  // 和了時、その局の発動回数ぶんの確定ドラ（飜）を自分の手にだけ後付けする。
  // 役満は飜計算の対象外なので素通しする（確定ドラは役満点に影響しない）。
  [Hooks.MODIFY_SCORE](ctx, api, result) {
    // 即時効果型ゆえ active は発動直後に下ろす（isActive では判定できない）。確定ドラの
    // 有無は「その局の発動回数」で判定する。発動回数=後付けする確定ドラ枚数。
    if (this._activationsThisHand <= 0 || !result || !result.valid) return undefined;
    if (result.isYakuman) return undefined;
    const extra = this._activationsThisHand;
    const out = recomputeWithExtraDora(result, extra, {
      isDealer: ctx.winner.isDealer,
      tsumo: result.tsumoEach != null,
      honba: api.state.honba || 0,
    });
    api.log(`ドラ寄せ：確定ドラ${extra}（手の打点に上乗せ）`);
    return out;
  }
}

// Heuristic: higher when the 14-tile shape (hand + candidate) is closer to a win.
// shanten が主軸（和了形=-1 が最高）。テンパイ同士は「最良打牌後の待ち種数」で
// 広いテンパイを好む。
// ※旧実装は14枚 counts に waits() を直接当てていたが、waits は「あと1枚」前提
//   なので14枚では常に空＝全候補同点＝先頭固定（実質no-op）だった。
function handPotential(counts, numMelds) {
  const s = shanten(counts, numMelds);
  let breadth = 0;
  if (s === 0) {
    for (let d = 0; d < 34; d++) {
      if (counts[d] === 0) continue;
      counts[d]--;
      const w = waits(counts, numMelds).length;
      counts[d]++;
      if (w > breadth) breadth = w;
    }
  }
  return -s * 100 + breadth;
}

registerAbility("lucky-draw", (params) => new LuckyDrawAbility(params));
registerAbility("summon-tile", (params) => new SummonTileAbility(params));
registerAbility("rootou", () => new RootouAbility());
registerAbility("chunchan", () => new ChunchanAbility());
registerAbility("dora-pull", () => new DoraPullAbility());
