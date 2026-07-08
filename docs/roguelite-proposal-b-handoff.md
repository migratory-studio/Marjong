# 提案B 引継ぎ：楼光の館＝記憶の塔（Hades型ナラティブ）

> 新セッション用ハンドオフ。これ単体＋下記の正典ポインタで提案Bに着手できるように書く。
> 提案A（異能クラスター・全5流派）は**完了済み**。本書はもう一本の柱＝ナラティブの設計引継ぎ。

---

## 0. まず読むもの（正典ポインタ）
- **提案A〜全体の正典**：`docs/roguelite-fun-research-and-cluster-redesign.md`（リサーチ要約・設計原理P1〜P10・否決俗説・スライス記録）
- **ローグライト本体仕様**：`docs/shitei-calendar-and-roguelite.md` B章
- **世界観正典**：`scenario-forge/reference/world.md`（楼光＝記憶を映す塔／詩玥の素性／先代九蓮宝士）
- **方針メモ（記憶）**：`memory/` の `roguelite-cluster-redesign.md`（A進捗）・`voice-line-system.md`・`bond-display-hybrid-policy.md`・`companion-bond-system.md`・`kyuuren-houshi-worldview.md`・`yaochu-chunchan-and-grandmaster.md`・`zenpen-kouhen-shiyue-reconcile.md`・`direction-attachment-first.md`
- **プロジェクト最優先軸**：リポ直下 `CLAUDE.md`（キャラ愛着＝核。愛着の4原理＝蓄積×固有性×双方向×反転）

---

## 0.5 進捗ログ（提案B）

### 2026-06-24 §7論点ヒアリング → スライス1 実装完了
**握った方針（§7）:**
- **物語の枠**：大章選択ツリー（最初に大章を選ぶ→踏破で次の大章が解禁）。**シナリオは当面モック**。
  テーマ＝弟子（詩玥/凌雲/真守）＋御庭番（姚玖/春嬋）＋**今は亡き師匠（先代九蓮宝士＝詩玥の恩師）**をめぐる群像。
- **「覚えている」の粒度**：勝敗カウントだけ＝`profile.roguelite.bossTally:{charId:{w,l}}`。
- **セリフ生成**：現在モック（手書きの簡易フレーバー。詩玥/凌雲のみ固有先行例、他は汎用モック）。
- **物語ゲート**：P8厳守（難易度で物語を塞がない）。

**スライス1＝「ボスが覚えている」実装済み（回帰緑・実機feel確認済・QA1件修正反映）:**
- 新規 `src/roguelite/bossMemory.js`：純関数 `bossMemoryTier`(first/rematch/revenge)／`readBossTally`／`recordBossOutcome`／`withBossTally`。
  tier規約＝`first`:0-0／`revenge`:l>0（敗北の記憶を最優先）／`rematch`:w>0&l==0。
- `voiceLines.js`：`condMatches` に `cond.bossMemoryTier` を1行追加。
- `characterVoiceMaster.js`：event `rlBossIntro`。詩玥/凌雲に固有口上（3tier）＋`GENERIC_BOSS_INTRO` を `withBossIntro` で全キャラ補完（モック）。
- `run.js`：`previewBossChars(run, floorType, salt="")` をエクスポート（`enemyUnitForFloor` と同一決定論でボス先読み）。
- `rogueliteScreen.js`：`showRogueliteBossIntro`（純UIモーダル・立ち絵＋口上＋「対峙する」）。tier名はUIに出さず口上の変化で気づかせる（数値レス思想）。
- `styles.css`：`.rl-bossintro*`（ember調・1280×720収まり確認済）。
- `main.js` 結線：run開始/再開で `rogueliteState.bossTally` ロード／ボス階で `showBossIntroThenBattle`（口上→本戦）／`onRogueliteBattleEnd` で本戦（追撃除外）決着を `recordBossEncounter`＋`persistBossTally`／`finishRogueliteRun`＋carry保存で `bossTally` 保全（保存失敗時も `liveBossTally` フォールバック）。
- 回帰：`test/roguelite.mjs` 948 passed（bossMemory純関数＋voiceLines照合追加）／`roguelite-balance.mjs --assert` 12 passed／`smoke.mjs` ✅。

### 2026-06-24 スライス2 実装完了（相棒が履歴に反応＋群像の最小二人相槌）
**握った方針（§7 群像の深さ）**：固有性を主軸＋群像は最小の二人相槌（モック・2択なし）。双方向2択は後のスライスへ。
- **(A) 相棒が「あなたの潜行履歴」に反応（固有性）**：
  - `main.js` `rlVoiceCtx()`＝`rlMainCluster`（最多流派）・`rlCleared`（この潜行の踏破数）・`rlRetreatHabit`（過去撤退回数）・`rlDeepRun`（自己ベスト更新中）を供給。`rogueliteSpeak`/`rlPursue`/`rlRetreat`/`matchEnd(finish)` の vline に注入。
  - 履歴の源：run開始/再開で `rogueliteState.bestFloor`/`retreatCount` を profile からロード。撤退回数は `finishRogueliteRun` で `profile.roguelite.retreats` に永続（撤退ランのみ+1）。
  - `voiceLines.js condMatches`：`rlMainCluster`/`rlRetreatHabitMin`/`rlClearedMin`/`rlDeepRun` を追加。
  - `characterVoiceMaster.js`：詩玥に流派別 rlBuff・自己ベスト更新 rlPursue/rlBuff・撤退癖 rlRetreat（3/6回）を追加（条件付き＝無指定の汎用に上乗せ）。
- **(B) 群像の二人相槌（最小・モック）**：
  - event `rlBanter`（口火）＋`rlBanterReply`（受け）。`GENERIC_BANTER` を `withBanter` で全キャラ補完＋詩玥/凌雲に固有。
  - `rogueliteScreen.js` `showRogueliteBanter`（相棒=左／相方=右の2吹き出し＋「続ける」・二言目はワンテンポ遅延）。`styles.css .rl-banter*`（1280×720収まり確認済）。
  - 発火：`maybePlayBanter`＝**休息フロア**の onDone で、相棒(先頭)＋控えにテーマ相方（`RL_THEMED_CAST`=詩玥/凌雲/真守/姚玖/春嬋）がいるとき seed×floor 決定論で半々。出さなければ素通り。
- 回帰：`test/roguelite.mjs` **990 passed**（固有性ctx照合＋全キャラbanter存在）／`roguelite-balance.mjs --assert` 12／`smoke.mjs` ✅。実機1280×720でバンターfeel＋ノースクロール確認・コンソールエラー0。

### 2026-06-24 スライス3 実装完了（死＝継続＋見守り・P7/P8）
**握った方針**：全滅を「罰」でなく「塔から記憶として弾かれた＝継続」に作り替える。到達深度で物語を塞がない見守り。
- **全滅の別れ際を継続フレーミングへ（P7）**：
  - `main.js finishRogueliteRun`：全滅の別れ際を matchEnd（敗北弁）流用→専用 `rlWipe` イベントへ。`vline(lead, retreated?"rlRetreat":"rlWipe", { ...rlVoiceCtx(), rlReached: reached })`。`reached` を partingLine より先に算出。
  - `characterVoiceMaster.js`：event `rlWipe`。`GENERIC_WIPE`+`withWipe` で全キャラ補完。詩玥/凌雲に固有（口癖反転×点棒嫌いを“送り出し”に転じる）。
  - `rogueliteScreen.js showRogueliteGameOver`：全滅 title/sub を非懲罰化（「没収」「力尽きた」を排し「塔に弾かれた——だが、記憶は還る／また登れる」）。`styles.css` 全滅バナー色 `--danger`(赤)→琥珀 `#e8c45d`。
- **見守り（P8）**：`voiceLines condMatches` に `rlReachedMin`/`rlReachedMax`（深さ帯フレーバー差・**物語ゲートではない**＝無指定フォールバック常在）。浅い帯=rlReachedMax:6（励まし）／深い帯=rlReachedMin:12（誇り）／rlDeepRun（自己ベスト更新中に散）。
- 回帰：`test/roguelite.mjs` **1011 passed**（rlWipe全キャラ存在・深さ帯・継続フレーミング懲罰語なし・浅セリフが深層で出ない）／`roguelite-balance.mjs --assert` 12／`smoke.mjs` ✅。実機1280×720で全滅画面feel（継続トーン）・ノースクロール・コンソールエラー0確認。QA違反0（要確認1=浅セリフ深層漏れ→rlReachedMaxで解消済）。

### 2026-06-24 大章選択ハブ 実装完了（§3.1 ①／解禁ツリーの足場・frontend-designスキル適用）
**握った方針**：物語層は当面モック。frontend-design スキルでハブUIを仕上げ（「例のスキル」指定）。
- **大章マスタ（モック）**：`src/data/rogueliteChapterMaster.js`。**章立て確定（2026-06-24）＝大1章「還らぬ師の記憶」(id=mentor)に師匠の群像を一本集約**（弟子3＋御庭番2＋今は亡き師＝cast 5名・unlock=null常時解禁）。**大2章(id=memory_two)は今のところ空＝`comingSoon:true` の「未だ綴られぬ記憶」予告枠（踏破しても開かない・中身を増やさない）**。各章 { id,index,title,subtitle,blurb,aim,cast,unlock,clearFloor,tone(gold/jade/ember/ash),comingSoon? }。helper：chapterById/firstChapterId/isChapterUnlocked(comingSoonは常に封)/chaptersWithState。
- **ハブUI（frontend-design）**：`showRogueliteChapterSelect`＝シグネチャ「記憶の塔」縦選択（column-reverse で第一を麓に積層・解禁=灯る/未解禁=封で翳る・麓から立ち上がる所作）＋右に詳細（明朝題字/登場チップ/ねらい/「この記憶を登る」or封理由）。色6種（闇/楼光金/青磁/燠火/象牙/灰＝記憶の感情色・AI定番3配色を回避）。`styles.css .rl-chapter*`。1280×720ノースクロール確認。
- **結線**：`openRoguelite`＝再開確認→**大章ハブ**→編成(戻る=ハブ)→`startRogueliteRun(party, chapterId)`。`newRun(party,seed,chapterId)`＋serialize/deserialize に chapterId 往復。`finishRogueliteRun`＝`reached>=chap.clearFloor` で `profile.roguelite.chaptersCleared` に追加→次章解禁（P8厳守＝物語ゲートでなく選択の解禁のみ）。carry保存onCloseもspreadで保全。
- 回帰：`test/roguelite.mjs` **1038 passed**（章マスタ整合＋解禁ツリー＋chapterId保存往復）／`roguelite-balance.mjs --assert` 12／`smoke.mjs` ✅。実機1280×720でハブfeel（塔・解禁/封・既定フォーカス=未踏破の最初の解禁章）・コンソールエラー0。

### 2026-06-24 ボス陣・相棒・縦軸の結びつけ＋章intro口上 実装完了
**握った方針**：機構のみ実装。**シナリオの肉付けはしない**（姚玖/春嬋のキャラ設定が未完のため）。章intro/姚玖春嬋のボス口上は既存の汎用モックのまま＝固有の作り込みを避ける。
- **ボス陣＝記憶の群像**：`run.bossPool`（章の cast id 群）を newRun/serialize に追加。`pickBossChars` は bossPool 指定時その群像からだけ選ぶ（2人未満に枯れたら全プレイアブルにフォールバック＝必ず2人立つ安全側）。`startRogueliteRun` で `chap.cast` から bossPool を設定。→ スライス1の bossTally と自然合流（登る記憶の面々を相手取り、覚えられていく）。
- **縦軸の結びつけ**：`rlVoiceCtx` に `rlChapter`（章id）追加、`voiceLines condMatches` に `cond.rlChapter`（章ごと専用セリフの足場）。
- **章intro口上**：`showRogueliteChapterIntro`（記憶へ入る導入＝章題/blurb＋相棒の一言＋「記憶に入る」・記憶の色調 tone）。event `rlChapterIntro`（`GENERIC_CHAPTER_INTRO`+`withChapterIntro` 全キャラ補完＋詩玥/凌雲固有）。`startRogueliteRun` で1階の前に一度だけ（resumeは出さない）。語り口は相棒(well-defined)＋章フレーミングに限定＝姚玖/春嬋の作り込み不要。
- 回帰：`test/roguelite.mjs` **1059 passed**（bossPool 保存往復＋群像から選出＋rlChapterIntro 全キャラ）／balance/smoke 緑。実機で記憶ハブ→登る→編成→出発→**章intro口上(還らぬ師の記憶＋詩玥導入)**→1階、までの通しと1280×720・章intro feel を確認（詩玥の対局ボイス404は既存の音声未収録で本件無関係）。

### 2026-06-24 ①双方向2択＋②宝珠で章解禁（仕組み）実装完了
**①双方向2択（§3.2-5・プレイヤーが返す→キャラが覚える）**：
- 別れ際（全滅/撤退の game over）に「また登る／今は休む」の2択。`showRogueliteGameOver` に `resolveChoices`/`onResolve`。選ぶと相棒が `rlResolve`（cond.resolveChoice climb/rest・汎用 withResolve＋詩玥/凌雲固有）で返す→選択肢は消えて返しを表示。
- **覚える**：`persistRogueliteResolve` で `profile.roguelite.resolve.{climb,rest}` を通算。run開始/再開で `rogueliteState.resolveClimb` ロード→`rlVoiceCtx.rlResolveClimb`→`cond.rlResolveClimbMin`。詩玥/凌雲の rlChapterIntro に「いつも"また登る"って言うネ」(climbMin:3)＝挑み続ける性分を次ラン以降に織り込む。
- voiceLines condMatches に `resolveChoice`/`rlResolveClimbMin`。
**②宝珠で章解禁（提案D・仕組みのみ／大2は触らない）**：
- `rogueliteChapterMaster`：`isChapterUnlocked(ch, cleared, orbUnlockedIds)`（宝珠先行解禁も解禁扱い・comingSoonは常に封）／`canOrbUnlock`（封・非comingSoon・orbUnlockCost付き・所持十分・未解禁）／`chaptersWithState` に orbUnlocked 付与。
- ハブUI：封・非comingSoon・値付き章にだけ「宝珠 N で解く」ボタン（所持不足は disabled）。`openRoguelite` で orbs/chaptersUnlocked を渡し、`orbUnlockChapter` が宝珠を払い `profile.roguelite.chaptersUnlocked` を永続→ハブ再描画。
- **大2は comingSoon（空）のままなので宝珠ボタンは出ない＝大2不可侵**。合成の内容付き封章では「宝珠30で解く」が出て発火することを実機確認＝将来章で有効化。
- finishRogueliteRun の保存に `chaptersUnlocked`/`resolve` を明示引き継ぎ（ドロップ防止）。
- 回帰：`test/roguelite.mjs` **1103 passed**（rlResolve全キャラ・climb覚える閾値・宝珠解禁ロジック・comingSoonは宝珠でも封）／balance 12／smoke ✅。実機で別れ際2択（climb→詩玥返し）・大2に宝珠ボタン無し・合成封章に宝珠ボタン有りを確認。コンソールエラー0。

### 2026-06-24 大1章 完成のための scenario-forge 制作要件を発行
- 要件書＝`E:/AI/scenario-forge/masters/rouko-ch1.requirements.md`（自己完結ハンドオフ）。
- 章＝群像劇（1:1濃厚は師弟の領分／大2章は触らない）。現状＝機構実装済・セリフはモック。これを群像5人の固有セリフへ置換するのがゴール。
- **ブロッカー**：①scenario-forge `reference/characters.json` の同期（凌雲/真守の旧名が残存）②world.md に楼光（記憶の塔）を追記③**姚玖/春嬋のキャラ設計（未設計・最優先・character-designer→承認→apply）**。
- **語彙拡張**：voice-lines.md / voice-vocab.json に楼光イベント群 `roguelite`（rlBossIntro×3tier・rlChapterIntro・rlBanter/Reply・rlWipe×深さ・rlResolve×choice・rlBuff/rlPursue/rlRetreat）と cond 語彙を登録。
- **制作物**：群像5人×楼光イベントを各slot≥2本（emphasis＝詩玥rlWipe点棒嫌い反転/rlResolve climb/覚えるchapterIntro、凌雲護り、御庭番は守る側の距離感）。数値レス＝tier名はセリフに出さない。
- **取り込み**：emit-voice-master→voiceLineMaster.js→本体。固有が入れば withBossIntro 等の汎用フォールバックが自動で出なくなる。DoD＝同tierボスが別文・群像相槌固有・test/proposalB-sim.mjs で初遭遇→再戦→雪辱が固有口調に。

### 2026-06-26 大章ごとの難度オーバーライド（tuning スキャフォルド）実装
**握った方針**：clearFloor は既に大章ごと。**敵HP・被ダメ深度・一撃死上限・与ダメ深度・踏破回復も大章ごとに出せる土台**を組む（`bossFloors` と同じ「章データを run に通す」パターン）。mentor は無指定＝既定のまま挙動ゼロ変化。
- **マージ方式**：`run.js` に `tv(tuning, key, fallback)` を新設＝`run.tuning[key] ?? 既定`。深度関数を tuning 受け取りに：`floorEnemyHp`/`floorEnemyLv`/`floorDamageMul`/`dealDepthMul`/`lethalCapFrac`（+ damageContext の guardCap フェードも tuning 参照）。call site（`enemyUnitForFloor`/`damageContext`）は `run.tuning` を渡す。`main.js` の踏破回復も `run.tuning?.regenFrac ?? REGEN_FRAC`。
- **配線**：`newRun(...,tuning)` ＋ serialize/deserialize で往復。`startRogueliteRun` が `chap.tuning` を渡す。
- **対応キー**：baseEnemyHp/enemyHpSlope/enemyHpCapFloor/enemyLvSlope（敵）・floorDmgStart/Slope/Knee/Accel（被ダメ深度）・lethalCapBase/FadeStart/FadeSlope（一撃死上限）・dealDepthStart/Slope（与ダメ深度）・regenFrac（踏破回復）。**章は変えたいノブだけ書く**（章マスタ header にキー一覧＋例：殺意高め/やさしい入門）。
- **注意（運用）**：章ごとに難度を変えたら、その章のクリア率は `CLEARFLOOR=○ node test/roguelite-balance.mjs --clearrate` で要確認（harness は今もグローバル既定基準＝tuning章は別途検証 or 将来 harness を章tuning対応に拡張）。
- 回帰：`roguelite.mjs` **1129 passed**（tuning=null は既定一致・tv 上書き/fallback・敵HP/被ダメ/一撃死の上書き・保存往復・enemyUnitForFloor 反映・mentorは無指定）／smoke ✅／sim完走／`balance --assert` **12 passed**（既定章はtuning無し＝グローバル不変＝後方互換）。

### 2026-06-26 バランス：無バフ「下手プレイ」の間口を広げる（踏破回復 0.18→0.32）
**握った方針（ヒアリング）**：`--assert` の2 FAIL（無策noneの到達が浅い＝中堅 中央値15／目標25〜85）を**実態に合わせて緩めるのでなく、間口を広げる方向で解消**（下手でも~25-40潜れる健全カーブへ）。
- **診断**：無策と最適(greedy)の差が **×9.5**（none中央値15 vs greedy142・max/p90は測定上限201張り付き）。原因は深度設計の転換（`floorDmgSlope` 4.0→0.25・難度の主役を翻数係数とF40開のlethalCapへ移行）で**greedyだけ深く伸び、無バフ勢は底上げされず**。
- **鍵**：greedyは深層の壁(lethalCapフェード/二次加速)で死ぬ→早中盤をいじっても不変／無策はF15の早中盤消耗で死ぬ→**早中盤の回復だけ底上げすれば無策だけ伸びる**。掃引で実証（REGEN/GROWHP/DSTART比較）＝`regenFrac` が最もクリーン。
- **適用**：`RL_TUNE.regenFrac 0.18→0.32`（`run.js`）。結果＝中堅none 中央値 15→**28**（p10 18・assert 25-85/p10≥15を余裕で満たす）、greedy 141→**145 で不変**（上限は壊さない）。バランスharness の合計HP敗北ペナルティも前段の「着卓2人のみ」へ整合済み。
- 回帰：`roguelite-balance.mjs --assert` **12 passed**（既存2 FAIL 解消）／`roguelite.mjs` 1116／smoke ✅。
- **残（任意）**：greedy の p90 が測定上限201に張り付く（最適勢の1割超が200階枠内で死なない）＝「必ず終わる」は深層の壁頼み。気になれば別途 `floorDmgKnee/Accel` や `lethalCapFadeSlope` で深層の壁を締める回（今回はユーザー方針＝間口拡大に絞って未対応）。

### 2026-06-26 大1章 踏破階＝F30化＋踏破演出 実装完了（周回案・ディレクション確定）
**握った方針（ヒアリング）**：F10踏破＝1ボスで薄い → **周回案（1周＝数滴のドリップ）に倒し、踏破階を F30 へ**。F10/F20/F30 の3ボスに群像を段階配置し、F30 の主を退けて「第一の記憶を読み切った」＝踏破。**シナリオ本文は別途**＝今回は「踏破演出（器）」だけ実装（leadLine 等はモック・差し替え前提）。
- **clearFloor 10→30**（`rogueliteChapterMaster.js` mentor章）。`nextChapterAfter(chapId)` ヘルパ新設＝踏破で「開く中身のある次章（unlock一致＆非comingSoon）」を返す。大2は comingSoon ＝ null → 踏破演出は「やがて綴られる」予告に留め、空の予告枠を解禁済みと偽らない。
- **踏破モーメントを mid-run で確定＆祝祭**（ラン終了の `reached>=clearFloor` 記録より先）：`isChapterClearMoment`（clearFloor ちょうどのボス本戦を初踏破・追撃除外・既踏破除外・ラン内1回）／`markChapterClearedNow`（run.chapterCleared＋rogueliteState.chaptersCleared＋`persistChapterCleared` で即永続＝死んでも踏破は残る）。`onRogueliteBattleEnd` の `proceedAfterBattle` で**ドラフトの前に一拍**挟む（`showDraft` 関数化してゲート）。エンドレスは継続＝踏破はゴールでなく節目。
- **演出モーダル** `showRogueliteChapterClear`（`rogueliteScreen.js`）：「踏 破」印（金グロー脈動）＋明朝の章題＋相棒の締めセリフ＋次章ノート（解禁 or 予告）＋「記憶を胸に、なお登る ›」。章intro語彙を踏襲（`.rl-chapclear*`・tone別・1280×720）。
- **セリフ器**（既存スライス同作法・モック）：event `rlChapterClear`＝`GENERIC_CHAPTER_CLEAR`+`withChapterClear` で全キャラ補完＋詩玥/凌雲に固有2本（gold＝温かさと喪失。詩玥は師匠/ツモれば勝ち、凌雲は護り）。`rogueliteState` 開始/再開で `chaptersCleared` をロード（mid-run 同期判定用）。
- **フロア別ボス配役（2026-06-26 確定）**：mentor章に `bossFloors` を追加＝**F10＝真守＋ネームドモブ（門番）／F20＝詩玥・凌雲（兄弟弟子）／F30＝姚玖・春嬋（御庭番＝締め）**。塔を登るほど核心の群像へ。
  - `run.js`：`newRun`/serialize/deserialize に `bossFloors` を往復。`plannedBossSlots(run,floor)`＝配役を `{kind:"char"|"mob"}` へ解決（`"$mob"`＝ネームドモブ枠／配役キャラが**編成中なら自動でモブ枠に退避**＝卓は必ず2人埋まる）。`pickBossChars` は配役floorでプレイアブル枠だけ返す（口上/記憶tally対象）。`enemyUnitForFloor` の boss枝は配役を順に建てる（char→本人ボス／$mob→eliteモブ）。配役外の深層ボス階（F40+）は従来どおり `bossPool` から決定論ランダム。
  - `startRogueliteRun` が `chap.bossFloors` を newRun へ渡す。
- 回帰：`test/roguelite.mjs` **1116 passed**（clearFloor=30・nextChapterAfter・**フロア別配役F10/20/30＋モブ退避＋保存往復**）／smoke ✅／全キャラ rlChapterClear 補完OK／`proposalB-sim.mjs` 完走（第5潜行で F10真守→F20→F30姚玖春嬋→**踏破**を再生）。**balance の2 FAIL（無策cohortの到達浅）は clean tree でも同一再現＝本変更と無関係の既存ドリフト**（balance sim は本変更ファイルを一切importしない）。
- **残**：①実機 F30 まで登っての feel 確認（深いランが要るため未実施）②scenario-forge で `rlChapterClear` の群像固有セリフ本実装（詩玥/凌雲以外＝特に F30 を締める姚玖/春嬋）③F20 ボス＝詩玥・凌雲の固有 rlBossIntro（現状は汎用モック）。

**次の着手候補**：①scenario-forge で上記要件を実行（姚玖/春嬋 design から）②双方向2択を章intro/群像相槌へ拡張③提案Dの宝珠ショップ本体との統合④踏破演出の F30 実機feel確認＋群像固有 rlChapterClear。

### 2026-07-07 大1章シナリオ確定＋記憶ビート（紙芝居）実装完了
**握った方針（たたき承認）**：章の縦軸の答え＝「塔の記憶は、亡き師が弟子たちを見ていたまなざし」。
F30 のペイオフ＝**空席の卓**（空いていたのは“次の世代の席”＝プレイヤーは試されていたのでなく**待たれていた**＝章スケールの反転）。
師は声のみ（名・顔なし＝正典どおり盛らない）。正典＝`docs/roguelite-ch1-scenario-draft.md`（設計意図）＋`src/data/rogueliteBeatMaster.js`（本文）。
- **記憶ビート3本**（B1=F10「降りない人」違和感／B2=F20「同期三人」確信／B3=F30「空席の卓」反転→踏破演出へ接続）。
  姚玖/春嬋は scenario-forge design **確定済みだった**（yao_chu/chun_chan designVersion2）＝確定口調で本実装
  （姚玖「揃うと、いいな」・春嬋「間に合わせる」の口癖反転を B3 の締めに使用）。
- **器（S1）**：`rogueliteBeatMaster.js`（lines＝scenarioPlayer 行形式・`beatForFloor`）＋ `playScenario(null,{lines})` インライン再生。
  発火＝`proceedAfterBattle` 末尾（配役ボス階×本戦×勝利×初回）。B3 は踏破演出モーダルの**前**。
  既読＝`profile.roguelite.beatsSeen[]`（bossTally と同作法・観終わった時に既読化・finishRogueliteRun で liveBeatsSeen 保全）。
- **DEBUGプレビュー**：?debug=tsumoreba → 🐛 → 「楼光の館 記憶ビート」で3本を本番同経路（playScenario）再生（既読には触れない）。
- 回帰：`test/roguelite.mjs` **1424 passed**（ビートマスタ整合＝背景/BGM/SE/立ち絵の実在・話者=章cast限定・先代=声のみ・踏破階にB3）／smoke ✅。
  実機1280×720で B1/B2/B3 通し再生・立ち絵差分（廃墟→和室の回想で三人）・？？？表示・終了復帰・ノースクロール・コンソールエラー0確認。
  ※ `roguelite-balance.mjs --assert` は9 passed＋1 FAIL（中堅greedy p10≥55=21）だが **clean tree(HEAD)でも同一再現＝既存ドリフト**
  （balance simは本変更ファイルを一切importしない）。別途バランス回で扱う。
- **残（次スライス候補）**：S2「最奥の一局」（章踏破後・シルエット先代と二麻1局の儀式マス）／S3 記憶の欠片（bossTally言語化）／
  S4 F20ペア掛け合い口上／B4 周回ドリップ（雪辱・通算節目の小記憶片）／大2章題材＝案a「灯を継がぬ者たち」推し（実装しない・たたきのみ）。

---

## 1. 現在地（提案A 完了済み）
楼光の館に「流派(クラスター)」システムを実装済み。5流派（速攻/染め么九/打点ドラ/守備/博打）がしきい値シナジーで稼働、データで均衡実証（スプレッド1.03）、シナジーUIもlegible、通しQAクリア。
- 正典コード：`src/data/rogueliteCardMaster.js`（CLUSTER_META/CLUSTER_SYNERGY）／`src/roguelite/cardEffects.js`（clusterDealMul/clusterTakeCapFrac/clusterTakeRaiseFrac/clusterProgress/clusterPickPreview/recomputeClusterCount）／`src/roguelite/run.js`（被ダメ層）／`src/main.js`（rlApplyDynamicBuffs・計測ログ）／`src/screens/rogueliteScreen.js`（UI）。
- 回帰：`node test/roguelite.mjs`（883）／`node test/roguelite-balance.mjs --assert`（12）／`node test/smoke.mjs`。

**提案Bは提案Aと非衝突**。流派＝戦い方、提案B＝物語層。むしろ相乗（流派＝キャラの哲学→ボス/相棒の物語に接続できる）。

---

## 2. 提案B とは（ねらいと研究根拠）
**楼光の館を「記憶の塔」という設定どおり、ランそのものを物語ビートにする**。本作の最優先軸（キャラ愛着）が、最新モードでほぼ未使用＝最大の空白を埋める。

検証済み設計原理（`docs/roguelite-fun-research...md` Part1 より・Hades一次資料）:
- **P6**：死と再走を「物語の継続」へ転換。主人公は本当には死なない／**ボスは前回を覚え勝敗をカウント**／関係と履歴の蓄積。
- **P7**：死は罰でなく非懲罰的な遷移。物語が死を越えて持続し、ランに費やした時間が無駄に感じられない。
- **P8**：**難易度が物語進行をゲートしない**。story動機のプレイヤーは技量に関わらず先へ。
- 否決俗説（使わない）：「失敗ラン用の永続"ご褒美"が必須」→**棄却**。物語継続(P6/P7)で代替するのが正。ご褒美で釣らない。

---

## 3. 設計の骨子

### 3.0 ナラティブの役割分担（楼光 ⇔ 師弟）【ディレクション確定 2026-06-24】
2モードで物語の役割を分ける（被らせない）:
- **楼光の館＝群像劇**：**キャラ同士のやりとり**が主軸で、そこに**マイキャラ(プレイヤー)が時折絡む**。塔＝記憶を辿りながら、兄弟弟子・恩師・ライバル達の関係をプレイヤーが見届け・揺らす。Hades型(NPC同士の関係を主人公が観て・影響する)とそのまま噛む。
- **師弟モード＝一人称1:1**：キャラ（師匠）と**マイキャラ(弟子)の一人称的シナリオ**で、濃い愛着を形成（既存の師弟＝失敗しないサクセス育成）。
- → 楼光で**一人称1:1の愛着劇をやらない**（それは師弟の領分）。楼光は「関係network」を描く。設計時はこの線引きを基準に判断する。

### 3.1 二層構造（大シナリオ選択・解禁 × Hadesドリップ）【ディレクション確定 2026-06-24】
Hades型は「長い1本の台本」ではなく**小さな反応の集積**。だが**選べる大シナリオ(章)**を上の層に重ねる：

| 層 | 役割 | 中身 |
|---|---|---|
| **① 大シナリオ（選択・解禁ツリー）** | ランの**枠／テーマ** | 「どの"記憶"を登るか」を最初に選ぶ。各大シナリオに固有の縦軸・ボス陣・相棒・ゴール。**踏破=解禁で次の大シナリオが開く**（解禁ツリー＝リプレイ性＋メタ通貨「宝珠」の用途にも接続＝提案D） |
| **② Hadesドリップ（ラン内の反応）** | 枠の中を**生かす** | ボスが覚える／相棒が履歴に反応／死=継続。小さな断片が周回で積み上がる |

「大シナリオ＝容器、ドリップ＝中で起きる生きた反応」。選んだ大シナリオがボス顔ぶれ・相棒・目的を決め、その中で毎ランHades的な蓄積が起きる。**楼光＝記憶を映す塔＝複数の記憶(大シナリオ)を選んで登る**、が自然。

### 3.2 Hadesドリップ層の4要素（②の中身）
1. **ボスが"覚えている"**（P6・最小で最大効果）：ボス＝プレイアブルキャラ。**そのキャラ相手の通算勝敗をプロフィールに記録**し対局前口上が変化（初遭遇／再戦／雪辱）。これだけでHadesの核が立つ。
2. **相棒が"あなたの履歴"に反応**（固有性）：連勝・撤退癖・多用する流派（提案Aの mainCluster）・最深到達を周回参照し、相棒（先頭キャラ）のセリフに織り込む。
3. **死＝継続**（P7）：全滅は罰でなく「塔から記憶として弾かれる」演出。**数値でなく関係/物語が持続**（共闘で絆が少し上がる土台あり）。別れ際を物語化。
4. **難易度で物語を塞がない**（P8）：浅い到達でも会話は進む見守り設計。物語フラグは到達深度でゲートしない。

**ナラティブ素材（world.md）**：楼光＝記憶を映す塔。詩玥の素性アーク（深謀遠慮＝読みの達人だった過去／恩師の喪失／点棒嫌い＝自罰）。**先代九蓮宝士＝詩玥の恩師（故人・同一人物確定）**。口癖「ツモれば勝ち」の反転。**兄弟弟子＝詩玥/凌雲/真守**（群像の核）。塔を登る＝記憶を辿る縦軸。

> ⚠️ コンテンツ量は大きい（大シナリオを複数本）。**作る順番が肝**：枠＋ドリップ機構を先に立て、大シナリオは「選択ハブ＋1本目」から始めて**解禁報酬として1本ずつ継ぎ足す**（§6）。最初に何本も書こうとしない。**まず「どんな大シナリオを作るか」の企画から**（§7）。

---

## 4. 守るべき軸・ガードレール（不可侵）
- **守る文脈**：麻雀 × 異能 × ローグライト。これ以外は根本変更可（ユーザー方針）。
- **固定ステージ 1280×720・内部スクロール禁止**（[[fixed-stage-no-scroll]]）。新UIは必ず実機で `scrollHeight===clientHeight` と要素が範囲内かを確認。
- **マスタ駆動・単一情報源**：文言/数値はマスタ、挙動はロジック、UIは表示のみ。セリフは `characterVoiceMaster.js` ＋ `voiceLines.js`（`pickVoiceLine`/`condMatches`）。新event/条件は `condMatches` に1行足すパターン（`bondMin`/`skillLevelMin` が前例）。
- **絆は数値レス**（[[bond-display-hybrid-policy]]）：絆/親密度は数値で見せない（帯名＋上げ方）。※流派の数値表示はゲーム機構なのでOK＝混同しない。
- **ランは必ず終わる**：物語フラグや報酬で終端保証（被ダメ青天井・lethalCap深度フェード・守備cap減衰）を壊さない。
- **キャラ固有(signature)異能は札配りしない**（提案Aの決定③。amber-shield/charybdis/bibi 等）。
- **弟子（CompletedAvatar）は団体/ペア非対応**等の既存ルール踏襲。

---

## 5. コード接続点（提案Bで触る所）
- **ボス生成**：`src/roguelite/run.js` `pickBossChars`(326) / `bossMemberFromChar`(335) / `enemyUnitForFloor`(349・kind==="boss")。ボスのキャラidがここで決まる→「覚えている」の記録キー。
- **プロフィール永続**：`src/main.js` `finishRogueliteRun`(〜2492) で `profile.roguelite = { bestFloor, runs, carry }` を misc jsonb 保存（2532行）。**ボス通算勝敗 `bossTally:{charId:{w,l}}` をここに足す**（マイグレ不要）。
- **対局前口上／対局中セリフ**：セリフ駆動は `src/data/voiceLines.js` `pickVoiceLine(charId, event, ctx)`。新event（例 `rlBossIntro`）を足し、ctx にボス勝敗・相棒履歴を渡す。トースト＝`showRogueliteSpeak`（rogueliteScreen.js）。ボス層入場は `enterFloor`／`advanceRoguelite`（main.js）。
- **相棒（先頭キャラ）**：`rlLead = () => rogueliteState?.run?.party?.[0]?.char`（main.js 2022付近）。既に rlBuff/rlPursue/rlRetreat で発話する土台あり。
- **共闘で絆**：`addCompanionBondExp`（`src/progression/companionBond.js`）。ラン終了時に各員へ加算済み（main.js 2533）。
- **計測（提案Aで追加）**：`run_end` ログに `mainCluster`/`cardIds`/`clusters` あり＝相棒が「多用する打ち筋」を参照する素にできる。
- **遭遇イベント**：`src/data/rogueliteEventMaster.js`（会話＋2択＝双方向の既存土台）。物語イベントの追加先。
- **背景/BGM**：`enterRogueliteAmbience`（bg-ruins＋探索BGM）。**背景は実リソースのみ**（[[real-resources-only-bg]]）。

---

## 6. 進め方（提案Aで確立した作法）
- **スライス制**（レビュー可能な縦切り）で、各スライス末に `test/roguelite.mjs` と `--assert` を緑に保ち、**実機で feel 確認**（npm start → localhost:5173 → 対戦ホーム→楼光の館。playwright/preview で確認可）。
- 大きめ差分の直後に**読み取り専用QAエージェント**（`.claude/agents/qa.md`）で不変条件チェック（提案Aで実バグを実際に検出した）。
- 実機確認は viewport を**1280×720に固定**して測る（ビューポート非固定だと誤検出する）。
- セリフ量産は `scenario-forge` 連携（[[content-gen-projects]]）も選択肢。詩玥で先行実装→他キャラ横展開が現実的。

### 最初のスライス案（二層構造ベース・小さく価値の高い順）
0. **スライス0＝大シナリオの企画**（コードでなく設計）：1本目の大シナリオの題材・群像の登場人物・縦軸・ゴール・解禁条件を決める。**ここから始まる**（§7の論点を握る）。群像＝兄弟弟子(詩玥/凌雲/真守)や恩師/先代の関係が有力。
1. **スライス1＝選択ハブ(ガワ)＋1本目の枠＋ボス記憶ドリップ**：楼光トップに「記憶(大シナリオ)を選ぶ」ハブを置き、1本目を選んで登れる。`profile.roguelite.bossTally:{charId:{w,l}}` を新設しボス対局前に勝敗参照の口上（初遭遇/再戦/雪辱）。**「記憶を選ぶ→登る→キャラが反応」の縦切り**で群像＋ドリップの核が一度に立つ。回帰＝tally純関数＋voiceLines照合。
2. **スライス2＝相棒が履歴に反応＋群像の絡み**：mainCluster/連勝/最深/撤退癖を ctx 化。キャラ同士のやりとり（群像）にマイキャラが時折絡む会話を1本目へ。
3. **スライス3＝死＝継続＋見守り**：全滅/撤退の別れ際を物語化（P7）。難易度で物語を塞がない（P8）。
4. **スライス4＝解禁ツリー**：1本目踏破で2本目の大シナリオを解禁（宝珠連携も検討＝提案D）。以降、大シナリオを解禁報酬として継ぎ足す運営型。

---

## 7. 着手前に握る論点（新セッションで AskUserQuestion 推奨）
- **1本目の大シナリオの題材**（最重要・ここから）：群像の中心は何か（兄弟弟子の記憶／恩師・先代をめぐる関係／別軸）。楼光＝群像、師弟＝1:1 の役割分担(§3.0)を崩さないこと。
- **大シナリオの本数感と解禁順**：何本構想するか、解禁ツリーは一直線か分岐か。
- **群像へのマイキャラの絡み方**：どの程度プレイヤーが介入するか（観るだけ寄り↔選択で揺らす寄り）。
- **物語の主役と範囲**：詩玥を縦軸の中心にするか（推し）、複数キャラ群像で分散か。
- **「覚えている」の粒度**：勝敗カウントだけ（軽い・即効）か、章立て進行（重い・濃い）か。
- **セリフ生成**：手書きか scenario-forge 連携か。
- **物語のゲート**：難易度非ゲート(P8)を厳守か、一部マイルストンに到達条件を許すか。
