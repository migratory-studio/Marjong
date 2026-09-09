# ツモノグリフ 〜牌と絆のアンサンブル〜

ブラウザで動く、キャラクター能力つき麻雀ゲーム。
**持ち点 = HP**。キャラクターごとの固有能力と物語を乗せ、ひとりで打つ麻雀を「相棒との共闘」に変えることを狙っています。

ビルド不要（依存ゼロ）。Node の標準機能だけで動きます。

> **テストプレイに参加する方へ** → [docs/testplay-guide.md](docs/testplay-guide.md)
> （遊びかた・動作環境・既知の未実装・不具合の報告方法）
> 公開先: https://migratory-studio.github.io/Marjong/ ／ 推奨ブラウザ: **Google Chrome（PC）**

## 収録モード

| モード | 内容 |
|---|---|
| **フリー対戦** | 4人麻雀 / 三人麻雀（三麻）/ **ペア戦**（2対2）/ **団体戦**（3人チーム）。対 CPU |
| **師弟モード** | マイキャラを作って師匠に弟子入りし、日々の育成と紙芝居シナリオで物語を進める育成モード |
| **楼光の館** | 3人パーティで塔を潜るローグライト。バフ・道具のドラフトと引き継ぎ |
| **オンライン対戦** | Cloudflare Worker + Durable Object の権威サーバによる通信対戦（合言葉ルーム / マッチング） |
| **大会（Mリーグ制）** | 8ユニットで節を戦うリーグ形式。個人 / ペア / 団体の全形式 |

## テスト版まわり（募集運用）

- バージョンは `src/config/appInfo.js` の `APP_VERSION` が唯一の出どころ。**修正を配ったら必ず上げる**
  （画面右下と設定画面に表示され、不具合報告の環境情報にも入る）
- 不具合の受け皿は **設定 → テスト版について / 不具合を報告**。送信先は Google フォーム
  「ツモノグリフ テストプレイ フィードバック」（`FEEDBACK_URL`）。空にすると導線は「環境情報をコピー」だけに縮退する
- 例外は `index.html` のインラインフック → `src/app/errorGuard.js` で拾い、右下トーストから報告へ繋ぐ
- 募集ページは [playtest.html](playtest.html)（GitHub Pages に同居する独立1ページ。画像は `press/`）。
  **版数・変更履歴・既知の問題を直書きしている**ので、`APP_VERSION` を上げたらここも直す
- 「既知の未実装」の文言は `appInfo.js` の `KNOWN_LIMITS` / [docs/testplay-guide.md](docs/testplay-guide.md) /
  [playtest.html](playtest.html) の3箇所。**更新時は3つとも**

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

`test/` にはこの他にも、能力ごとの回帰（`ambershield` / `zerosearch` / `muddylotus` ほか）、
進行・シナリオ（`progression` / `scenario` / `succession` / `leveldesign`）、通信対戦（`net*`）、
楼光の館のバランスシム（`roguelite-balance` / `balance-full`）などが入っています。いずれも
`node test/<name>.mjs` で単体実行でき、終了コードで成否を返します。

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

## キャラクターと能力

キャラクターはマスタ駆動です（`src/data/characterMaster.js` ＝ 名前・立ち絵・持ち点・保有能力、
`src/data/abilityMaster.js` ＝ 能力の説明、`src/data/characterVoiceMaster.js` ＝ セリフ）。
現在16人が実装済みで、それぞれ「持ち点＝HP」に効く固有能力を持ちます。

例:

| キャラ | 能力 |
|---|---|
| 詩玥（シ・ユエ） | **幸運のツモ** — ツモが手牌に有利な牌へ偏る |
| 凌雲（リンユン） | **琥珀の盾** — 満貫以上の打点だけを受け止める持続シールド |
| 真守 由紀 | **危険感知** — 自分の手牌に危険牌の警告を表示 |
| ルクス・ゼロ | **ゼロ・リサーチ** — 1シャンテンから確定で聴牌させる |
| 賭羽ルイナ | **大博打** — 点棒を前払いして賭ける |

能力は Lv1〜10 で伸び、Lv6以上の「超越帯」では相棒キャラの哲学が宿ります
（例: 幸運のツモ × 危険感知 ＝ 神算鬼謀）。

## 素材（グラフィック / サウンド）

すべて任意。ファイルが無くてもゲームは動作します（牌は手描き描画にフォールバック、
音は無音化）。読み込み・再生は `src/ui/assets.js` が担当します。

> 使用素材の出典・帰属表示は **[CREDITS.md](CREDITS.md)** にまとめています（BGM: PeriTune／SE: 効果音ラボ／UI: こぱんだ屋 ほか）。

### 牌画像（`graphic/`）

96×128px の牌画像を自動で適用します。

- `man/m1〜m9.png`・`pin/p1〜p9.png`・`sou/s1〜s9.png` … 数牌 1〜9
- `man/m5r.png`・`pin/p5r.png`・`sou/s5r.png` … 赤5
- `zihai/ton,nan,shaa,pei,haku,hatsu,chun.png` … 東南西北白發中
- （`graphic/haku.png`・`hatsu.png` は `zihai/` と重複のため不使用。
  `man.png`・`pin.png`・`sou.png` は用途未確定のため現状不使用）

### サウンド（`sound/`）

- BGM: `sound/bgm/amacha_ouun.mp3` / `amacha_uchiagehanabi.mp3` … **局ごとにランダムに1曲**をループ再生
  （`HAND_STARTED`、クロスフェード付き）。甘茶の音楽工房「桜雲」「打ち上げ花火」
- 打牌SE: `sound/se/dahai/牌を置く・その１〜４.mp3` … **誰か（自分含む）の打牌ごとにランダムに1つ**（`TILE_DISCARDED`）
- 配牌SE: `sound/se/麻雀牌をまぜる.mp3`（`HAND_STARTED`）
- 鳴きSE: `sound/se/naki.mp3` … ポン/チー/カン共通（`MELD_CALLED`、卓に大きく演出テキスト＋ウェイト）
- 点数表示SE: `sound/se/shakiin2.mp3`（和了画面の点数表示時）
- リーチ音: 専用ファイルが無いため WebAudio で生成したチャイム（`RIICHI_DECLARED`）

> ファイル名に日本語/全角を含むため `enc()`（URLエンコード）経由で取得。和了演出は画面中央に
> 大きく表示し、役を1つずつ表示（スキップ可）→ 点数表示。点棒増減は「次の局へ」で各席に +N/−N が浮かびます。

> ブラウザの自動再生制限のため、BGMは「対局開始」ボタン押下（ユーザー操作）を起点に再生開始します。
> 音量は `AudioManager` の `bgmVolume` / `seVolume` で調整できます。

### シナリオ紙芝居の演出素材（BGM / SE / 背景）

師弟シナリオの紙芝居は、行データの `bgmId` / `seId` / `backgroundId` を見て演出を切り替えます
（レジストリは `src/data/scenarioAudioMaster.js`・`src/data/backgroundMaster.js`、再生は
`src/scenario/scenarioPlayer.js`）。いずれも任意でグレースフル——素材が無ければ no-op／
グラデーション表示にフォールバックし、進行は崩れません。

- シナリオBGM: `sound/bgm/scenario/bgm-<mood>.mp3`（`bgm-daily` / `bgm-playful` /
  `bgm-tension` / `bgm-night` / `bgm-sorrow` / `bgm-resolve`）。感情の節目で行に `bgmId` を置くと
  クロスフェード切替。`bgm-none` で停止。シナリオ終了時は入室前のBGMへ復帰。
- シナリオSE: `seId` のワンショット。新規同梱素材を再利用（`se-door`＝襖、`se-step`＝畳の足音、
  `se-flash`/`se-tsumo`＝シャキーン、`se-success`＝指パッチン 等）。
- 背景画像: `graphic/bg/<id>.png`（あれば cover で表示・無ければ各IDのCSSグラデーション）。
  現状 `bg-dojo`（和室）・`bg-street`（住宅街）を同梱。

> 音源クレジット: BGMは **PeriTune**（https://peritune.com）の楽曲を使用（CC BY 4.0）。
> メニュー/タイトル＝`Hanadoki`、キャラ選択＝`Amenoshita3`、師弟ホーム＝`Otogi4`。
> シナリオ・ムード別: `bgm-warm`＝`Otogi3`、`bgm-mystery`＝`Foreboding`、
> `bgm-battle`＝`Wuxia3`、`bgm-victory`＝`Folk_Chinese`（他 `daily`/`night`/`playful`/
> `resolve`/`sorrow`/`tension` も PeriTune）。
> サードパーティ音源の帰属表示は本節にまとめて記載すること。

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

## ライセンス

**専有（All Rights Reserved）** — 無断の複製・再配布・改変・フォークを禁止します。詳細は [LICENSE](LICENSE)。
第三者素材（PeriTune / こぱんだ屋 / みんちりえ / FluffyStuff）は各権利者のライセンスに従います。
