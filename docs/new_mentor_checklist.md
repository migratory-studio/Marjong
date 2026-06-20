# 新師匠キャラ展開チェックリスト

詩玥（シ・ユエ）編がフルセットの完成形。別師匠（ビビ／賭羽ルイナ／将来の追加キャラ）に着手するとき、
ここにあるものを順に揃えれば「師弟編→覇道編→エピローグ→スタッフロール」までの一連の体験が成立する。

> 充足状況の調べ方: `grep -rn "［テンプレ］" src/` が残っている箇所＝未執筆。
> mentor別マップは `grep -n "<mentorId>" src/data/*.js` で漏れが見える。

---

## A. 正典・物語設計（scenario-forge 側）

| # | 成果物 | 場所 | 内容 | ビビ | ルイナ |
|---|---|---|---|---|---|
| A1 | キャラ確定設定 | `scenario-forge/design/<mentor>.json` | 素性アーク・口癖・能力の物語的意味・固有イベント | ✅ bibi.json | ❌ |
| A2 | world.md 整合 | `scenario-forge/reference/world.md` | 縦軸（九蓮宝士世界観）との突き合わせ。**口癖の反転に相当する軸**を必ず設計する（詩玥=「ツモれば勝ち」） | 部分 | 部分 |
| A3 | bond シナリオ 全20話 | `masters/mentor-<id>-bond-*.brief.json` → emit | 構成の型: **師弟編1〜12話**（12話=フィナーレ・読了で覇道編移行）／**覇道編13〜19話**／**20話=エピローグ（tournament_won 9 解禁・優勝後の物語）** | ✅ 全20話（emit/本体登録済。ep13=`scenario_read_prev_month`／ep20 gate=won9） | ❌ |
| A4 | 解禁条件のレベルデザイン | brief の unlockConditions | avatarLevel / skillLevel / bondLevel / tournament_won の階段。**詩玥の表を雛形に**（ep3=avatarLv4 … ep11=won1, ep12=won2, 覇道編=won2〜6, エピローグ=won9）。一気見防止＝同月3話以上固まらない | ❌ | ❌ |
| A5 | 背景・音 | brief | 背景は**実リソースのみ**（bg-dojo / bg-street / 黒）。BGM/SE・standingId のギャップ回避は scenario-forge 側の既存作法に従う | — | — |
| A6 | 対局セリフ | `characterVoiceMaster.js`（voice-lines 経由） | matchStart/agari/damage/matchEnd ＋ 局中反応。詩玥のみ本実装（`［テンプレ］` 6箇所） | ✅ パイプライン（output/voice-bibi.json・40行・全event） | ❌ |

## B. 本体マスタ（mentor-scoped。詩玥に存在する全項目）

| # | 項目 | 場所 | ビビ | ルイナ |
|---|---|---|---|---|
| B1 | キャンペーン（宝の順序＋oppLv＋requireScenario） | `mentorCampaignMaster.MENTOR_CAMPAIGN` | ✅（シナリオ確定後に requireScenario / oppLv 再調整） | ✅（同左） |
| B2 | 覇道編移行点 | `MENTOR_FINALE_SCENARIO`（=師弟編最終章ID） | ✅ mentor-bibi-bond-12 | ❌ |
| B3 | エピローグ章（読了でスタッフロール） | `MENTOR_EPILOGUE_SCENARIO` | ✅ mentor-bibi-bond-20 | ❌ |
| B4 | 技Lvの軌跡（5→10・シナリオ同期） | `MENTOR_SKILL_TRACK` | ✅ ep15→6 / ep17→7 / ep18→8 / ep19→9 / ep20→10（超越帯=焔の火） | ❌ |
| B5 | 初期段位 | `tournamentMaster.MENTOR_TREASURE_RANK` | ✅ 5（最年少五蓮・停滞が正典） | ✅ 5 |
| B6 | 段位の軌跡 | `tournamentMaster.MENTOR_RANK_TRACK` | **設計判断**: ビビは停滞が正典＝「無し」が正。動かすなら昇段セリフ（B8）とセット | ❌（要設計） |
| B7 | スキルLvテーブル本設計 | `skillLevelMaster.js`（lv-iron-guard 等4本が仮=runtimeParams空）＋能力側の params 対応（Phase 7結線） | ✅ lv-iron-guard 本設計＋BibiAbility結線（基準帯=守りの窓3→6・charges1→2／超越帯=焔の火 winMultiplier 1.1→1.5）。test/ironguard.mjs | ❌ |
| B8 | 師匠ボイス（ホーム） | `mentorVoiceMaster.js` | greeting/restTalk/praise=✅。**battle quips / 昇段 / 大一番口上 / duo誘い / 雀荘 =テンプレ**。phase:hadou行・cleared行・treasuresMin行・bondMin高絆行（口調崩れ）も拡充 | battle quips/大一番/duo/雀荘=✅。**昇段は段位停滞(B6)ゆえ非該当**。phase:hadou等の拡充は残 | 同左 |
| B9 | 大会敗北の2択 | `mentorVoiceMaster`（leagueLossTalk） | ✅ | ✅ |
| B10 | 団体戦の3人目 | `main.js ALLY_BY_MENTOR` | ✅ 焔 | ✅ ドラニエ |
| B11 | キャラ本体（立ち絵/アイコン/能力/持ち点） | `characterMaster.js` | ✅ | ✅ |
| B12 | スタッフロールの締めの一言 | `creditsMaster.lastLineByMentor` | ✅（『沈まない』主語反転＋いってきます） | ❌ |
| B13 | キャラ固有イベント | 例: ビビ=ep12団体優勝＋ep20弟子個人戦単独優勝で殻破り（design/bibi.json） | システム側フックの要否を着手時に判断 | — |

## C. 回帰・検証

- `test/leveldesign.mjs` は**詩玥前提のペーシング回帰**。新師匠は (a) シムを mentorId でパラメタ化するか (b) 専用の検証ブロックを追加（章解禁月・宝の間隔・絆/技Lvの到達月・エピローグ=優勝後）
- `grep -rn "［テンプレ］" src/` が新師匠ぶん 0 件になること（執筆完了の機械的判定）
- 通しQA（qa agent）＋実機で: 覇道編テーマ切替 / 修行成長 / 昇段演出 / 大一番口上 / エピローグ→スタッフロール

## D. 推奨着手順

1. **A1 design/<mentor>.json 確定**（world.md と突き合わせ。口癖の反転軸・素性の段階開示の階段を先に決める）
2. **A3+A4 章構成と解禁レベルデザイン**（詩玥の階段を雛形に20話＋エピローグ）→ brief 一括 → emit
3. **B7 スキルテーブル本設計**（skill-smith）＋ Phase 7 結線（能力側の params 解釈）
4. **B2〜B4, B6, B12 の mentor別マップ**（各1〜5行。エピローグ／覇道編移行／技Lv軌跡／段位軌跡／締めの一言）
5. **B8+A6 ボイス拡充**（テンプレ撲滅。文言はメインセッション=ディレクション領域）
6. **C 回帰**（leveldesign 拡張＋通しQA）

> 文言（セリフ・ナラティブ）はサブエージェントに丸投げしない（CLAUDE.md 作業スタイル）。
> 設計の物差しは愛着4原理: 蓄積 × 固有性 × 双方向 × 反転。
