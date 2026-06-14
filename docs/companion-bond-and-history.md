# 相棒絆（companion bond）＋ プレイヤー履歴（player history）— 確定仕様

セリフ/シナリオを量産する前に通す「土台＝セリフ駆動の受け皿」。
目的は CLAUDE.md の愛着4原理のうち **蓄積（bondMin で段階解放）** と **固有性（"あなた"を見ている履歴）** を、
対局セリフ `pickVoiceLine` の `ctx` に供給できるようにすること。**この段階では文言は増やさない。器だけ通す。**

設計判断（確定済み）:
- 絆は **相棒キャラごと**（本人 × キャラ）。既存 `avatar.bondLevel`（弟子→師匠）とは **別軸**。
- **師弟編で九蓮宝士（宝9個）を獲ると、その相棒との絆が大きめにジャンプ**。「共に宝を獲った」を絆に刻む。
- フリー対戦の「相棒」＝プレイヤーが操作するキャラ（`selectedCharId`）。詩玥を選べば詩玥と絆が貯まる。
- 履歴ctxは3つ積む：連勝/連敗カウント・前局の結果・多用する打ち筋。

---

## 1. データモデル

すべて **profile 直下**（アカウント本人レベル＝全弟子横断）。`onlineRank` と同じ扱いで、
`RUN_FIELDS`（avatarRun.js）には **入れない**。保存は既存 `profileRepo.saveProfile(profile)` でそのまま乗る。
初期化は `createDefaultProfile`（src/progression/profileRepository.js:15-31）。
既存セーブには無いので、**読込時に欠損を既定で補完**（マイグレーション）すること。

### 1-1. companionBonds（相棒絆マップ）
```js
profile.companionBonds = {
  // charId（CHARACTER_MASTER の id。例 "shiyue"） → 絆の状態
  shiyue: { level: 1, exp: 0 },
};
```
- `level` 初期 1、`exp` 初期 0。
- exp→level の計算は **既存の師弟絆と同じ式を流用**（progressionService.js:64-70 の `bondExpPerLevel * level` 累積）。
  純関数 `companionLevelFromExp(exp)` として切り出す（テスト可能に）。

### 1-2. playerHistory（永続履歴）
```js
profile.playerHistory = {
  winStreak: 0,        // 連勝（対局=match 単位。トップ=勝ち）
  loseStreak: 0,       // 連敗（ラス=負け）
  maxWinStreak: 0,     // 最高連勝（記録用）
  lastPlacement: null, // 直近対局の順位（0=1位）。null=未対局
  totalMatches: 0,     // 通算対局数
  styleCounts: {       // 打ち筋タグの累積カウント（多用判定の母数）
    // riichi: 0, meld: 0, aggressive: 0, defensive: 0 ...
  },
};
```
- 連勝/連敗は **対局（match）単位**。勝ち=最終1位、負け=最終ラス、その他は両ストリークを 0 リセット。
- `styleCounts` は対局ごとに `detectPlayStyle` の結果を加算。「多用」は累積比率で判定（後述）。

### 1-3. 前局の結果（transient・保存しない）
「前の **局**（1ハンド）の結果」は対局内セッション状態で持つ。profile に保存しない。
既存の `matchTalk`（main.js のマッチ進行ステート）に 1 フィールド足す:
```js
matchTalk.lastHandResult = "agari" | "dealIn" | "tsumoLoss" | "draw" | null;
```
- これにより「さっき放銃したばかりなのに…」のような **局の連続感** を相槌で出せる。

---

## 2. ctx 語彙（pickVoiceLine に渡す）

`vline(charId, event, ctx)`（main.js:74）が組み立てて渡す。**無い値は未供給＝その条件は不成立**（既存の voiceSet と同じ思想）。

| ctx キー | 由来 | 用途 |
|---|---|---|
| `companionBondLevel` | `companionBonds[相棒id].level` | 絆で段階解放 |
| `winStreak` / `loseStreak` | `playerHistory` | 連勝/連敗の相槌 |
| `lastPlacement` | `playerHistory` | 前回の順位参照 |
| `lastHandResult` | `matchTalk`（transient） | 前局の結果参照 |
| `playStyleTag` | `topPlayStyle(playerHistory)` | 多用する打ち筋への言及 |

相棒id の解決:
- フリー対戦: プレイヤーが操作するキャラ（`game.players[humanIndex].character.id`＝`selectedCharId`）。
- 師弟系（本気/二人/大会）: 同じく自キャラだが、絆加算は相棒id基準で行う（§4）。

---

## 3. condMatches 拡張（src/data/voiceLines.js）

`mentorVoiceMaster.gMatch`（実装済みのお手本）と語彙を揃える。`condMatches` に1行ずつ足すだけ:
```js
if (cond.companionBondMin != null && !((Number(ctx.companionBondLevel) || 1) >= cond.companionBondMin)) return false;
if (cond.winStreakMin   != null && !(Number(ctx.winStreak)  >= cond.winStreakMin))  return false;
if (cond.loseStreakMin  != null && !(Number(ctx.loseStreak) >= cond.loseStreakMin)) return false;
if (cond.lastHandResult && cond.lastHandResult !== ctx.lastHandResult) return false;
if (cond.playStyleTag   && cond.playStyleTag   !== ctx.playStyleTag)   return false;
```
- `bondMin` は使わず `companionBondMin` に統一（師弟側の `bondMin` と意味が違う＝相棒絆なので、名前で区別する）。
- ヘッダコメントの ctx 語彙表も更新する。

---

## 4. 加算フック（対局後）

純関数を1本用意し、各終局経路から呼ぶ:
```js
// 戻り値は新しい profile（イミュータブル）。companion絆 + 履歴をまとめて更新。
applyMatchToCompanion(profile, { companionId, placement, numPlayers, styleTags, treasureJustCleared })
```
内部:
1. companion exp 加算（仮の経済・後でチューニング可）: 1位 +12 / 2位 +6 / 3位 +3 / ラス +2（負けても一緒に戦った分は増える）。
2. `treasureJustCleared`（九蓮達成と同時）なら **大きめ加算** +120（仮）。
3. `playerHistory` 更新（連勝/連敗/最高/通算/lastPlacement/styleCounts）。

差し込み箇所:
- **フリー対戦**: `showGameOver`（main.js:3802-3937）。プレイヤーがログイン/弟子未作成でも companionBonds は profile 直下なので動く。未ログイン時も Local profile に保存。
- **師弟・本気/二人/大会**: `progressionService` の結果確定（applyHonestResult / applyDuoResult / applyLeagueResult）。
  - 九蓮ジャンプは `applyLeagueResult`（progressionService.js:431-435）の treasures 更新地点で `treasureJustCleared=true` を判定（更新後 `treasures.length>=9` かつ 直前は <9）。

---

## 5. 打ち筋検出（detectPlayStyle）

1対局のスナップショットから導出（局中の順序情報は game に無い＝下記のみ）。素材:
- `game.players[i].riichi` / `.riichiTurn`（リーチしたか）
- `game.players[i].melds.length`（鳴き数）
- `game.lastResult.winner / loser / tsumo / deltas`（和了/放銃）

純関数 `detectPlayStyle(player, lastResult) -> string[]`。当面のタグ集合:
- `riichi`（リーチ宣言あり）
- `meld`（鳴き2つ以上）
- `aggressive`（自分が和了 or 高打点志向）
- `defensive`（放銃せず & 和了せず＝ベタオリ的）

`topPlayStyle(playerHistory)`: `styleCounts` で **通算の最頻タグ**を返す（母数が少ないうちは null）。
「多用」と言えるだけの試行（例 totalMatches>=5 かつ そのタグ比率 >= 0.4）を満たすまで null。

---

## 6. 実装ステップ（手戻り防止のため分割）

**ステップ1（純ロジック＋テスト・UI非接続＝巻き戻しやすい）** ← 先にこれ
- スキーマ初期化＋マイグレーション（profileRepository）
- `companionLevelFromExp` / `applyMatchToCompanion` / `detectPlayStyle` / `topPlayStyle`（純関数）
- `condMatches` 拡張（voiceLines.js）＋ ヘッダコメント更新
- test 追加（test/companionbond.mjs）: exp→level、連勝/連敗遷移、九蓮ジャンプ、condMatches 各キー、detectPlayStyle

**ステップ2（配線・main.js / progressionService に接続）**
- `vline` で ctx 組み立て（相棒id解決＋history＋transient）
- 各終局経路で `applyMatchToCompanion` 呼び出し
- `matchTalk.lastHandResult` の更新を局確定地点に差す

**ステップ3（文言・ここからが本来のセリフ量産）**
- 詩玥のセリフを `companionBondMin` で段階化（Lv3/6/9/12 目安。口調が崩れる最高絆は特別報酬）
- 履歴参照セリフ（連勝/前局/打ち筋）を足す

数値（exp配分・九蓮ジャンプ量・段階Lv閾値）はすべて **仮値**。ステップ3のセリフ設計と合わせて後調整する。
