# 通信対戦 P0 設計：Intent / Event スキーマとイベントログ

本書は通信対戦の**土台（P0）**の確定設計。旗艦モードは**個人戦4人プライベート卓**、ただし
**ペア戦を無改修で載せる**ため、室内モデルを「席」ではなく**ユニット**単位で定義する。

- 通信モデルは**サーバ権威**（麻雀は隠匿情報＝山・他家手牌を持つため、seed配布によるロックステップは不可）。
- 権威は **1卓 = 1つの対局室（Cloudflare Durable Object想定）**、クライアントとは WebSocket。
- クライアントは「**意図（Intent）を送り、確定イベント（Event）を再生して描画するだけ**」のイベントソーシング型。
- エンジン（`src/core/`）はサーバ/クライアント共有モジュールとして使う。本書のEventは既存
  `src/core/events.js` の `Events`（`TILE_DRAWN` 等）と意図的にほぼ1:1で対応させる。

関連：[CLAUDE.md](../CLAUDE.md) の核（共闘・愛着）、`tournament-mleague-system`（ユニット制の先例）、
`deploy-privacy-plan`（Cloudflare移設）。

---

## 1. ユニットモデル（ペア戦への先回り設計）

室は **席（seat 0..N-1）** と **ユニット（unit）** の二層で持つ。順位・精算は**ユニット単位**で集計する。

```
Room
├─ units: [ Unit ]            // 個人戦=4ユニット / ペア戦=2ユニット
│   └─ Unit { unitId, seats:[seatIndex...], ownerUserId|null, mentorId, allyId|null }
└─ seats: [ Seat ]            // 物理席。常に game.players[seatIndex] と一致
    └─ Seat { seatIndex, unitId, occupant: {kind:'human'|'cpu', userId|null, characterId} }
```

| | 個人戦（旗艦/P1） | ペア戦（P4） |
|---|---|---|
| `unitSize` | 1 | 2 |
| ユニット数 | 4 | 2 |
| 席配置 | 任意 | ユニットの2席は**対面**（`pair-battle-plan`） |
| 点数集計 | ユニット＝席 | ユニット＝2席の合算 |

**P0で守る不変条件**：順位・トビ判定・結果配信は必ず `units` を介す。`seatIndex` 直参照で勝敗を出さない。
個人戦は `unitSize=1` の特殊形として実装し、ペア戦は `unitSize=2`＋対面配置＋合算を足すだけにする。

---

## 2. メッセージ全体像

```
Client ──INTENT──▶ Room(DO, 権威)        意図のみ。合法性はサーバが判定
Client ◀──EVENT── Room(DO, 権威)        確定済みの公開/自席イベント（隠匿情報は除去）
```

- **Intent**：プレイヤーが「やりたいこと」を宣言。サーバが既存ルール（`resolveCalls` / `_canRon` /
  `_riichiDiscards` / `actionOptions`）で検証し、合法なら適用→Eventを配信、非合法なら `REJECTED` を返す。
- **Event**：エンジンの状態変化を**シリアル化したもの**。全クライアントへ順序保証付きで配信。
  隠匿情報（他家手牌・未ツモ山）は宛先ごとに**除去（redaction）**して送る（§5）。

全メッセージ共通エンベロープ：

```jsonc
{
  "v": 1,                 // プロトコルバージョン
  "roomId": "AB12CD",     // ルームコード
  "seq": 1043,            // Event専用：室内通し番号（単調増加・順序/欠落検出）
  "type": "...",          // 下記スキーマ
  "ts": 0                 // サーバ打刻（クライアントのDate.nowは使わない）
}
```

---

## 3. Intent スキーマ（Client → Server）

`seatIndex` は送信者が自分の席を主張する値だが、**サーバはコネクション↔席の対応を真とし、詐称を無視する**。

| type | 主フィールド | 対応する既存API/フェーズ |
|---|---|---|
| `intent.discard` | `tileId` | `game.discard(tileId)`（`AWAIT_DISCARD`） |
| `intent.riichi` | `tileId`（リーチ宣言牌） | `_riichiDiscards` 検証→`discard` |
| `intent.tsumo` | — | `doTsumo()`（`AWAIT_DISCARD`、和了可能時） |
| `intent.kan` | `kind`, `kanType`(closed/added/open) | カン処理（`AWAIT_DISCARD` or `AWAIT_CALLS`） |
| `intent.kita` | — | 北抜き（三麻） |
| `intent.call` | `callType`(pon/chi/kan/ron), `tiles?` | `resolveCalls()`（`AWAIT_CALLS`） |
| `intent.pass` | — | 鳴き/ロンを見送る（`AWAIT_CALLS`） |
| `intent.ability` | `abilityId`, `params?` | 能力発動（§6でサーバ解決） |
| `intent.ackResult` | `handNumber` | 局結果の確認（次局へ進む同期） |

ロビー/接続系：
| type | 主フィールド |
|---|---|
| `intent.join` | `roomCode`, `authToken`(Supabase JWT), `discipleId` |
| `intent.ready` | `ready`(bool) |
| `intent.resync` | `fromSeq`（再接続時、欠落分を要求） |
| `intent.leave` | — |

**入力キューイング**：ローカルUIは先行描画してよいが、確定は必ずサーバの対応Event受信時。
往復中の追加入力はキューし、`REJECTED` 受信時にロールバック（巻き戻し描画）。

---

## 4. Event スキーマ（Server → Client）

既存 `src/core/events.js::Events` と対応。クライアントは受信Eventを**ローカルの`Game`/描画に反映**するだけ。

| Event type | 既存Events | payload（公開分） |
|---|---|---|
| `evt.handStarted` | `HAND_STARTED` | `handNumber`, `roundWind`, `kyoku`, `honba`, `dealerSeat`, `unitsPublic`, `yourHand`(自席のみ §5) |
| `evt.turnStarted` | (loop) | `seat` |
| `evt.tileDrawn` | `TILE_DRAWN` | `seat`, `tileId`(**自席のみ実値／他席はnull**), `wallRemaining` |
| `evt.tileDiscarded` | `TILE_DISCARDED` | `seat`, `tileId`, `tsumogiri`(bool), `riichiDeclared`(bool) |
| `evt.meldCalled` | `MELD_CALLED` | `seat`, `meld`(type/tiles/from), `calledTile` |
| `evt.riichiDeclared` | `RIICHI_DECLARED` | `seat`, `kyotaku` |
| `evt.handWon` | `HAND_WON` | `winnerSeat`, `loserSeat?`(ロン), `yaku`, `han`, `fu`, `score`, `deltasByUnit`, `pointsByUnit` |
| `evt.handDrawn` | `HAND_DRAWN` | `tenpaiSeats`, `deltasByUnit`, `nagashi?` |
| `evt.abilityUsed` | `ABILITY_USED` | `seat`, `abilityId`, `publicEffect`（見せてよい範囲のみ §6） |
| `evt.gameOver` | (gameOver) | `finalRankingByUnit`, `bustUnit?` |
| `evt.log` | `LOG` | `msg` |

意思決定を促す制御Event：
| Event type | payload | 意味 |
|---|---|---|
| `evt.awaitDiscard` | `seat`, `you`(bool), `options`(`actionOptions()`相当), `deadlineTs` | 自席なら入力受付・考慮時間開始 |
| `evt.awaitCalls` | `eligibleSeats`, `you`(bool), `options`, `deadlineTs` | 鳴き/ロン窓 |
| `evt.rejected` | `intentType`, `reason` | 直前Intentが非合法（クライアントはロールバック） |
| `evt.snapshot` | §7 完全状態 | join/resync時の同期 |

**重要：精算は必ず `deltasByUnit` / `pointsByUnit`（ユニット単位）で配る。** 席単位の点数は描画用に併送してよいが、
勝敗・順位の真はユニット。これでペア戦（合算）が同じEvent形のまま成立する。

---

## 5. 隠匿情報の除去（redaction）— チート対策の本丸

サーバは**宛先ごとに別内容のEvent**を作る。原則：「そのプレイヤーが実卓で知り得ない情報は一切送らない」。

| 情報 | 配信ポリシー |
|---|---|
| 自分の手牌 | 実値（`evt.handStarted.yourHand`, 自席`tileDrawn.tileId`） |
| 他家の手牌 | **送らない**（`tileDrawn.tileId=null`、枚数のみ） |
| 未ツモの山 | **送らない**。`wallRemaining` の枚数だけ |
| 王牌/裏ドラ | 表ドラは公開。裏ドラは**和了確定時のみ**全員へ |
| 鳴き牌・河 | 公開（実卓どおり） |
| 能力の内部状態 | 自分の能力のグレーアウト等は自席のみ（§6） |

これにより、クライアント改造で得られる最大の不正は「自分の手牌を綺麗に並べる」程度に縮小される。
seedも山も渡さないので**積み込み・先読みは原理的に不可能**。

---

## 6. 能力フックの server/client タグ棚卸し（P0で開始）

`src/abilities/builtins/` 全能力に1行のメタを付け、フックを二分する。

```js
// 例（メタの形・実値はP3で詰める）
{ id: "lucky-draw",  authority: "server" }   // ツモ差し替え＝隠匿情報に触れる→サーバ解決
{ id: "zero-search", authority: "server" }   // 確定聴牌＝山操作→サーバ解決
{ id: "danger-info", authority: "client" }   // 既に自分へ送った情報の可視化のみ→クライアント可
```

| 分類 | 該当フック | 扱い |
|---|---|---|
| **状態を変える系（必ずサーバ）** | `MODIFY_DRAW` / `MODIFY_CALL_ELIGIBILITY` / `MODIFY_SCORE` / `MODIFY_CAN_WIN` / `MODIFY_POINT_DELTA` / リコールの河↔手牌交換 | サーバの権威`Game`で解決し、結果のみEvent化。`evt.abilityUsed.publicEffect`は公開可分だけ |
| **自分の見え方だけ系（クライアント可）** | `PROVIDE_DANGER_INFO`（山読み/危険感知のグレーアウト） | サーバが自席へ既に送った情報の描画。新規の隠匿情報を引かないもののみ |

P0の成果物は**全能力の `authority` タグ一覧表**（実解決の実装はP3）。ここを曖昧にしたままP1を進めると、
P3で能力を入れた瞬間に desync とチート経路が同時に開くため、棚卸しだけ先に確定させる。

---

## 7. イベントログ・順序・再接続

### イベントログ（イベントソーシング）
- 室は確定Eventを `seq` 昇順で**全保存**（リプレイ・観戦・監査の単一の真実）。
- クライアントの`Game`状態は「`snapshot` + それ以降のEvent列」で**完全に再構築可能**。
- 局のseedは既存どおり `seed + handNumber`（`game.js:117`）。**ただしseedはサーバ内部のみ**、クライアントへは出さない。

### 順序保証
- WebSocketは順序保証されるが、再接続をまたぐ欠落に備え `seq` で検出。
- クライアントは受信`seq`が連続でなければ `intent.resync { fromSeq }` を送り、室は欠落分 or `snapshot` を返す。

### 再接続・離席（既存資産が綺麗に嵌まる箇所）
- 室はステートフル（DO）。切断しても状態は残る。再接続は `snapshot`/差分で復帰。
- **考慮時間タイムアウト → 自動ツモ切り**。麻雀はターン制なので往復遅延数百msは無害（rollback netcode不要）。
- **離席・長時間切断 → `simpleAI` がその席を代打ち**。席は元々 `isHuman` で切替可能（`game.js:31`）なので、
  人間↔CPUの差し替えが自然に成立する。復帰したら人間に戻す。

### snapshot の中身（join/resync時）
```jsonc
{
  "type": "evt.snapshot",
  "seq": 1043,
  "room": { "units": [...], "seats": [...], "rules": {...} },
  "hand": { "handNumber": 7, "roundWind": 27, "kyoku": 3, "honba": 0,
            "dealerSeat": 2, "phase": "await-discard", "turnSeat": 0 },
  "you":  { "seat": 0, "hand": ["m1","m2",...], "melds": [...], "riichi": false },
  "public": { "discardsBySeat": [...], "meldsBySeat": [...],
              "pointsByUnit": [...], "doraIndicators": [...], "wallRemaining": 42 }
}
```
※ `you` 以外の手牌は含めない（§5）。

---

## 8. P0 の完了条件（Definition of Done）

1. `src/core/` がサーバ（Node/Workers）でそのまま動く共有モジュールとして切り出されている。
2. エンジンの同期 `loop()` を**イベント駆動**に置換（自席入力＝サーバ確認待ち、CPU席＝即決のまま）。詳細方針＝[online-multiplayer-p0-loop.md](./online-multiplayer-p0-loop.md)。
3. 本書の Intent / Event / envelope / `seq` を実装した**スキーマ定義モジュール**が存在。
4. 室モデルが**ユニット二層**（§1）で、精算・順位が `units` 経由。
5. **redactionテスト**：任意のEventに他席手牌・未ツモ山が混入しないことを検証する自動テスト。
6. 全能力の `authority` タグ一覧（§6）が確定（解決実装はP3）。
7. `snapshot`→Event再生で状態が完全一致する**決定論再構築テスト**。

P1（旗艦＝個人戦4人プライベート卓）は、この土台の上で「DO権威＋WS＋合言葉ロビー＋考慮時間＋切断CPU代打ち」を
能力なしの素の4人打ちで通すことをゴールにする。
