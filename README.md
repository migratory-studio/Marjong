# 麻雀RPG プロトタイプ

ブラウザで動く、キャラクター能力つき麻雀ゲームのプロトタイプです。
**持ち点 = HP**、キャラクターごとに固有能力を持ち、リーチ麻雀準拠のルールで対局します。
**4人麻雀**と**3人麻雀（三麻）**を選択可能（対 簡易CPU）。

ビルド不要（依存ゼロ）。Node の標準機能だけで動きます。

## 起動方法

```bash
npm start
```

ブラウザで <http://localhost:5173> を開く → キャラクターを選んで「対局開始」。

> ES モジュールを使うため `file://` 直接open ではなく、上記の簡易サーバー経由で開いてください。

## 動作確認（ヘッドレステスト）

```bash
node test/smoke.mjs   # 4人戦: 和了判定・点数計算 + 40局自動対局
node test/sanma.mjs   # 3人戦: 牌構成108枚・チーなし・北抜き + 40局自動対局
```

和了判定・点数計算のユニットチェックと、全CPUによる40局の自動対局（クラッシュ／無限ループ検査）を実行します。

## 実装済みのルール（リーチ麻雀準拠）

- 4人東風/半荘戦・136牌・赤ドラ（各色5を1枚）
- **3人麻雀（三麻）**: 2萬〜8萬を除いた108牌・チーなし・**北抜き（抜きドラ）**・
  子ツモはツモ損あり・東1〜3局（半荘は南まで）。選択画面の「人数」で切替
- ツモ／打牌／ポン／チー／カン（明槓・暗槓・加槓）／リーチ／ロン／ツモ
- 和了形: 通常形（4面子1雀頭）・七対子・国士無双
- 役: 立直/一発/門前清自摸和/平和/断幺九/役牌/一盃口/二盃口/三色同順/三色同刻/
  一気通貫/対々和/三暗刻/混全帯幺九/純全帯幺九/混老頭/小三元/混一色/清一色 ほか、
  役満（四暗刻/大三元/字一色/緑一色/清老頭/大四喜/小四喜/九蓮宝燈/四槓子/国士無双）
- 符計算・飜・満貫〜役満、本場・供託・親流れ・流局時テンパイ料・フリテン（基本）

> プロトタイプにつき、一部の細則（複雑なフリテン、責任払い、ダブロン分配など）は簡略化しています。

## キャラクターと能力（現状）

| キャラ | 持ち点(HP) | 能力 |
|---|---|---|
| ツモラ | 22000 | **ツモ偏重** — ツモが手牌に有利な牌へ偏る |
| ヨビニン | 25000 | **牌寄せ** — 1局1回、欲しい牌を引き寄せる |
| クイオトシ | 28000 | **全方位チー** — 上家以外の捨て牌でもチー可能 |
| マモリ | 8000 | **危険感知** — 自分の手牌に危険牌の警告を表示 |

## 素材（グラフィック / サウンド）

すべて任意。ファイルが無くてもゲームは動作します（牌は手描き描画にフォールバック、
音は無音化）。読み込み・再生は `src/ui/assets.js` が担当します。

### 牌画像（`graphic/`）

96×128px の牌画像を自動で適用します。

- `man/m1〜m9.png`・`pin/p1〜p9.png`・`sou/s1〜s9.png` … 数牌 1〜9
- `man/m5r.png`・`pin/p5r.png`・`sou/s5r.png` … 赤5
- `zihai/ton,nan,shaa,pei,haku,hatsu,chun.png` … 東南西北白發中
- （`graphic/haku.png`・`hatsu.png` は `zihai/` と重複のため不使用。
  `man.png`・`pin.png`・`sou.png` は用途未確定のため現状不使用）

### サウンド（`sound/`）

- BGM: `sound/bgm/mahjong-ingame1,2.mp3` … **局ごとにランダムに1曲**をループ再生
  （`HAND_STARTED`、クロスフェード付き）
- 打牌SE: `sound/se/dahai/牌を置く・その１〜４.mp3` … **誰か（自分含む）の打牌ごとにランダムに1つ**（`TILE_DISCARDED`）
- 配牌SE: `sound/se/麻雀牌をまぜる.mp3`（`HAND_STARTED`）
- 鳴きSE: `sound/se/naki.mp3` … ポン/チー/カン共通（`MELD_CALLED`、卓に大きく演出テキスト＋ウェイト）
- 点数表示SE: `sound/se/金額表示.mp3`（和了画面の点数表示時）
- リーチ音: 専用ファイルが無いため WebAudio で生成したチャイム（`RIICHI_DECLARED`）

> ファイル名に日本語/全角を含むため `enc()`（URLエンコード）経由で取得。和了演出は画面中央に
> 大きく表示し、役を1つずつ表示（スキップ可）→ 点数表示。点棒増減は「次の局へ」で各席に +N/−N が浮かびます。

> ブラウザの自動再生制限のため、BGMは「対局開始」ボタン押下（ユーザー操作）を起点に再生開始します。
> 音量は `AudioManager` の `bgmVolume` / `seVolume` で調整できます。

## アーキテクチャ（拡張性の肝）

```
src/
  core/                エンジン（UI非依存・同期的な純ロジック）
    tiles.js           牌モデル（34種×4 = 136牌）
    wall.js            山・王牌・ドラ・嶺上（シード対応）
    meld.js            副露（チー/ポン/カン）
    game.js            ゲーム状態と局進行
    events.js          イベントバス
    rules/
      winCheck.js      和了形の分解・テンパイ判定
      yaku.js          役判定
      score.js         符・飜・点数
      shanten.js       シャンテン数・受け入れ（AI用）
  abilities/           ★ 能力システム（フック方式）
    hooks.js           エンジンが公開するフック点の定義
    ability.js         能力の基底クラス（チャージ/クールダウン対応）
    registry.js        能力レジストリ + エンジン連携ディスパッチャ
    builtins/          サンプル能力（ツモ偏重・牌寄せ・全方位チー・危険感知）
  characters/
    characters.js      キャラ定義（HP=持ち点、保有能力ID）
  ai/
    simpleAI.js        シャンテン/受け入れベースの簡易CPU
  ui/
    canvasRenderer.js  Canvas描画（状態を変更しない純描画）
  main.js              コントローラ（選択画面・ゲームループ・入力）
```

### 能力システムの設計

エンジンは能力を**直接呼びません**。要所に置かれた「フック点」で
`AbilityManager` に処理を委譲し、各プレイヤーの能力がそこへ介入します。
このため **新しい能力の追加でエンジンを書き換える必要がありません**。

公開フック（`src/abilities/hooks.js`）:

| フック | 種別 | 用途（例） |
|---|---|---|
| `MODIFY_DRAW` | modify | ツモる牌を決める（ツモ偏重・牌寄せ） |
| `MODIFY_CALL_ELIGIBILITY` | modify | 鳴ける条件を拡張（全方位チー） |
| `PROVIDE_DANGER_INFO` | modify | UIへ危険牌情報を渡す（危険感知） |
| `MODIFY_SCORE` | modify | 確定した点数を補正する |
| `ON_HAND_START` / `ON_TURN_START` / `ON_DRAW` / `ON_DISCARD` / `ON_MELD` / `ON_WIN` / `ON_HAND_END` | notify | ライフサイクル通知 |

### 新しい能力を追加する手順

1. `src/abilities/builtins/` に能力クラスを作る（`Ability` を継承し、使うフックメソッドだけ実装）

   ```js
   import { Ability } from "../ability.js";
   import { Hooks } from "../hooks.js";
   import { registerAbility } from "../registry.js";

   export class MyAbility extends Ability {
     constructor() { super({ id: "my-ability", name: "新能力", desc: "...", maxCharges: 1 }); }
     [Hooks.MODIFY_DRAW](ctx, api) {
       // ctx.candidates から1枚返すと、その牌をツモる
       // api.log("発動！"); api.me / api.opponents() で状態参照
     }
   }
   registerAbility("my-ability", () => new MyAbility());
   ```

2. `src/abilities/builtins/index.js` に `import "./myAbility.js";` を追加
3. `src/characters/characters.js` のキャラの `abilityIds` に `"my-ability"` を足す

エンジン側の変更は不要です。

### 新しいキャラクターを追加する

`src/characters/characters.js` の `CHARACTERS` に1件追加するだけ
（`startingPoints` が持ち点=HP、`abilityIds` が保有能力）。

## 既知の制限 / 今後の拡張余地

- 3人麻雀（実装済み）: 選択画面の「人数」で 4人/3人 を切替。簡略化点として、北抜きの
  補充は生牌山先頭から引く／抜きドラと表ドラの二重加算は未対応
- CPUは簡易（守備は最低限）。`ai/simpleAI.js` を差し替え可能
- 役満の複合・一部細則は簡略化
- Canvas描画は最小限（左右家の手牌は牌裏のみ等）
```
