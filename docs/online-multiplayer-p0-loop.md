# 通信対戦 P0 設計：`loop()` のイベント駆動化

[online-multiplayer-p0.md](./online-multiplayer-p0.md) の DoD「エンジンの同期 `loop()` をイベント駆動に置換」の具体方針。

## 0. 前提の訂正：`loop()` は既に非同期ポンプ

`src/main.js:2059` の `loop()` は同期ブロックではなく、**フェーズで分岐して再入する状態機械ポンプ**：
- CPU席：`setTimeout(() => { cpuDiscard(index); loop(); }, wait)`（`main.js:2097`）
- 人間席：`showHumanActions()` →（DOMクリック）→`onCanvasClick`→`game.discard`→`loop()`
- 鳴き窓：`handleCalls()`→`setTimeout(loop, ...)` or 人間ボタン→`resolveHumanCall`→`loop()`
- 自動ツモ切り：`autoTsumogiri()`→`setTimeout`→`game.discard`→`loop()`

→ 課題は「async化」ではなく、`loop()` が融合している**3つの関心事の分離**：

| 関心事 | 現状の所在 | オフライン | オンライン権威(DO) | オンラインClient |
|---|---|---|---|---|
| **(A) 決定の供給** 誰が打牌/鳴きを選ぶか | CPU=`decideDiscard`／人間=DOMクリック | 両方ローカル | CPU=ローカルAI／人間=Intent待ち | 自席人間のみ→Intent送信 |
| **(B) 状態の変更** ルール実行・state遷移 | `game.discard/resolveCalls/doTsumo` | ローカルで実行 | **ここだけが唯一の真実** | **実行しない**（Event適用のみ） |
| **(C) 演出と進行** render/バナー/タイマー | render＋`setTimeout(...WAIT)` | ローカル | しない（即進行） | ローカルでEventキュー再生 |

**設計の芯**：
- **(B) のミューテータ（`game.discard` 等）は権威でしか走らない。** Clientは同じ `Game` クラスを“レプリカ”として持つが、ミューテータを呼ばず、**Eventを適用して可視フィールドを書き換えるだけ**。
- レプリカは適用時に**既存と同じ `game.bus` イベントを再emit**する。これで `main.js:1997-2026` の render／SE／セリフ／相棒ボード／カットインの配線が**全て無改修で動く**（最重要の省力ポイント）。

---

## 1. 抽象化：`Controller` と `applyEvent` の二点導入

### Controller インタフェース（(A) を外出し）
ポンプが決定を**await で要求**する口。`loop()` 内の `decideDiscard`/DOM待ち/`decideCall` をこの裏に隠す。

```js
// 決定の供給源。実装を差し替えるだけでオフライン/権威/オンラインを切替
interface Controller {
  // 自席の手番（打牌/ツモ/カン/北/リーチ宣言）。timeoutは権威のみ意味を持つ
  decideTurn(game, seat, options): Promise<TurnDecision>;
  // 鳴き窓：callers全員ぶんの決定（pon/chi/kan/ron/pass）
  decideCalls(game, callers): Promise<CallDecision[]>;
  // 能力の自動/手動発動（既存 decideAbilityActivations 相当）
  decideAbilities(game, seat): Promise<AbilityActivation[]>;
}
```

| 実装 | decideTurn | decideCalls |
|---|---|---|
| `LocalController`（オフライン現状維持） | 人間席=DOM Promise／CPU席=`decideDiscard` | 人間=ボタンPromise＋CPU=`decideCall`（現 `handleCalls` 相当） |
| `AuthorityController`（DO・サーバ） | 人間席=該当Clientへ `evt.awaitDiscard` 送信→`intent.*` を await（**考慮時間 timeout→自動ツモ切り**）／CPU席=`decideDiscard` | 同様にIntent収集＋CPUローカル |

リーチ中／`forcedTsumogiri`（JaneDoe）の自動ツモ切り（`main.js:2075-2083`）は **権威側 `decideTurn` の責務に移す**（状態を持つのは権威）。Clientは打牌Eventの `tsumogiri:true` フラグを見てヒント表示するだけ。

### `applyEvent(game, evt)`（(B) の結果適用＝Client専用リデューサ）
権威が確定したEventを、レプリカ `Game` の可視フィールドへ反映し、**対応する `game.bus.emit` を呼ぶ**。ルールは再実行しない（隠匿情報を持たないため不可能かつ不要）。

```js
function applyEvent(game, evt) {
  switch (evt.type) {
    case "evt.tileDrawn":
      game.players[evt.seat].drawnTileId = evt.tileId; // 他席は null
      game.wall.remaining = evt.wallRemaining;
      game.bus.emit(Events.TILE_DRAWN, { player: game.players[evt.seat] });
      break;
    case "evt.tileDiscarded":
      const p = game.players[evt.seat];
      p.discards.push(evt.tileId); p.drawnTileId = null;
      if (evt.riichiDeclared) p.riichi = true;
      game.bus.emit(Events.TILE_DISCARDED, { player: p, tsumogiri: evt.tsumogiri });
      break;
    case "evt.meldCalled":   /* melds 更新 → MELD_CALLED emit */ break;
    case "evt.handWon":      /* score/deltas 反映 → HAND_WON emit */ break;
    // ... 全Event（§ online-multiplayer-p0.md 4）に1対応
  }
  game.emitState(); // STATE_CHANGED → 既存 render() がそのまま走る
}
```

ポイント：レプリカは `Game` クラスをそのまま器に使う（`roundLabel()` 等の純表示メソッドは生きる）。**`discard/resolveCalls/doTsumo` を呼ばない**ことだけが規律。スコア・役・裏ドラは権威が計算して `evt.handWon` に載せるのでClientは表示専念。

---

## 2. ポンプの再構成：`loop()` → `runMatch(controller)`

`loop()` のフェーズ分岐を、Controller を await する async ポンプに書き換える（**権威とオフラインで共有**するコード）。

```js
async function runMatch(game, controller) {
  while (!game.isGameOver()) {
    switch (game.phase) {
      case Phase.AWAIT_DISCARD: {
        const seat = game.turn, opts = game.actionOptions(seat);
        await controller.decideAbilities(game, seat).then(acts =>
          acts.forEach(a => game.activateAbility(seat, a.id, a.params)));
        const d = await controller.decideTurn(game, seat, opts); // ← 人間はここで待つ
        applyTurnDecision(game, d); // game.discard / doTsumo / declareKan / nukiKita
        break;
      }
      case Phase.AWAIT_CALLS: {
        const decisions = await controller.decideCalls(game, game.pendingCalls.callers);
        game.resolveCalls(decisions);
        break;
      }
      case Phase.HAND_OVER: return "hand-over"; // 結果提示は呼び出し側
    }
  }
  return "game-over";
}
```

- **オフライン**：`runMatch(game, new LocalController(...))`。`game.*` ミューテータがローカルで走り、bus経由で従来どおり描画。挙動は現状と同一。
- **権威(DO)**：`runMatch(authGame, new AuthorityController(connections))`。各ミューテータが emit したbusイベントを**捕捉→宛先別 redaction→`seq` 付与→broadcast**（§下記3）。
- **Client(オンライン)**：`runMatch` を**走らせない**。受信Eventを `applyEvent` でレプリカへ流すだけ。自席の手番は `evt.awaitDiscard{you:true}` 受信で `showHumanActions()`（既存）を出し、クリックで `intent.discard` 送信。

---

## 3. 演出ペーシング (C) はClient側のEventキューへ

現状の `CPU_DELAY` / `NAKI_WAIT` / `ABILITY_CUTIN_WAIT` / `AUTO_TSUMOGIRI_DELAY`（`main.js:2093,2102,2156` 等）は**演出の間**であり、権威の進行速度とは無関係にすべき。

- **権威**：ルール解決でき次第すぐ次のEventを出す（待たない）。唯一の待ちは**人間の考慮時間 deadline**のみ。
- **Client**：受信Eventを**キュー**に積み、`applyEvent` を演出ウェイト込みで順次再生（カットイン中は次Event適用を保留＝既存の `abilityCutInFlag`/`meldCalledFlag` のウェイトをここへ移植）。`seq` 順を厳守。

これにより、回線速度に演出が引きずられず、かつ全Clientで見た目の尺が揃う。

---

## 4. 段階移行（各段でオフライン版を壊さない）

| Step | 作業 | 完了確認 |
|---|---|---|
| **L1** ✅実装済 | `loop()`→`async runHand()` ＋ステップ関数（`stepTurn`/`stepCalls`/`applyTurnDecision`）へ分解。人間の決定は resolver（`waitHumanTurn`/`waitHumanCall`）で受け、終端ボタン(打牌/ツモ/カン・ロン/ポン/チー/スキップ)が解決。オート切替は `SWITCH_TO_AI`。間合いは `await delay()` で従来尺を保持。`cpuActionPending`/`pendingCpuCallDecisions` は不要化し削除 | **検証済**：実機で人間打牌(canvas)→CPU自動進行→鳴き窓(チー提示)→パス→人間復帰→オート切替(SWITCH_TO_AI)→1局完走→結果→次局再入を東風戦4局フル＋終局まで通し、コンソールエラーゼロ。既存test(leveldesign/autobattle/smoke)全PASS |
| **L2** ✅実装済 | `LocalController`(`decideTurn`/`decideCalls`/`decideAbilities`)を確立し `let controller = LocalController` を差し替え点に。`stepTurn`/`stepCalls` は決定(A)を `controller` 経由で取り、状態変更(B=`applyTurnDecision`/`resolveCalls`/`activateAbility`)はポンプ側に固定。自動ツモ切り/forced/リーチ自動切りは `decideTurn` 内へ集約し、`autoTsumogiri` は適用せず**決定を返す**形に。決定関数(`decideDiscard`/`decideCall`/`decideAbilityActivations`)の直接参照は `LocalController` 内のみ | **検証済**：実機で CPU親→人間手番待ち(`controller.decideTurn`)→人間打牌→オート切替(`SWITCH_TO_AI`で AI が手番引継ぎ)→1局完走→結果→次局再入。コンソールエラーゼロ。既存test(leveldesign/autobattle/smoke/rounds)全PASS。`node --check` OK |
| **L3** ✅実装済 | `src/net/eventLog.js`（`attachRecorder`/`publicSnapshot`/`fullSnapshot` ＝bus購読→JSON可能な wire Event 列に捕捉）と `src/net/applyEvent.js`（レプリカGameへ適用するリデューサ、ルール非再実行）を新規追加。**main.js は無改変**（オフライン無影響、計装は将来の権威/クライアントが使う）。河↔手牌を書く能力(recall-deal)は `abilityUsed` に当該席の手牌/河を載せ再同期（granular化はL4/§6） | **検証済**：`test/eventlog.mjs`＝全CPU自動対局を10シード回し、**全Eventごと**にレプリカ再構築が権威の真と一致（手牌/河/面子/リーチ/点数）。42局・4041イベント・能力発火54件込みで緑＋全Event JSON往復OK（p0 DoD#7）。`riichiDeclared` は discard 途中の過渡(牌抜き済み・河未push)のため手牌比較のみ見送り、直後の tileDiscarded で自己回復と明記。既存test全PASS(sanmaは低速だが正常) |
| **L4a** ✅実装済 | トランスポート抽象＋同一プロセス内ループバックで権威⇄クライアントを Intent/Event で疎結合。`src/net/transport.js`(`createLoopback`＝JSON境界＋microtask配送)／`src/net/authorityRoom.js`(`AuthorityRoom`＝実Gameを回すヘッドレス・ポンプ＋決定層：CPU席=ローカルAI・遠隔席=awaitX送信→Intent待ち/timeout自動ツモ切り、bus→wire Event 配信、結果ack待ちで次局へ)／`src/net/clientSession.js`(レプリカ＋applyEvent＋自明ポリシー：ツモ切り/常時パス)。`attachRecorder` に `onEvent` を追加。**main.js は無改変** | **検証済**：`test/netloop.mjs`＝ループバックで権威＋遠隔席0クライアントを結線し東風戦を完走（5シード）。discard Intent 252件・鳴き窓57件が往復し、クライアント・レプリカが権威の公開状態(河/面子/リーチ/点数)＋自席手牌に一致。親/局は最終Eventのpubと一致(権威は配信後 `_endHand` で次局用に進めるため、終局時の内部値ではなく配信値で照合)。eventlog/smoke 含む既存test全PASS |
| **L4b** ✅実装済 | redaction（p0 §5）：`src/net/redact.js`(`redactFor(rec,seat)`＝他席の配牌/ツモ牌/手牌スナップショットを伏せる。河/面子/点数/ドラ/手牌枚数は公開)。`publicSnapshot` に公開情報 `handCounts` を追加。`applyEvent(game,evt,{viewpoint})` に redaction モード（自席=実tile tracking、他席=`handCounts` ぶんの伏せ札）。`AuthorityRoom._broadcast` が宛先席ごとに `redactFor`、`ClientSession` は `viewpoint=自席` で適用。**設計判断**：本番でクライアントはAIを動かさない（CPU席のAIは権威側／人間席は人間UI＝L4c）。L4b の自明ポリシーは「常にツモ切りする人間」の妥当なスタンドイン | **検証済**：`test/netredact.mjs`＝席0へ配信された全Event(5ゲーム・2399件)に他席の隠匿情報・seed・wall が**一切混入なし**。かつレプリカが公開状態(河/面子/リーチ/点数)＋自席手牌＋他席枚数で権威と一致し、他席手牌は伏せ札(id=null)＝中身を知り得ない。既存 eventlog/netloop は redaction 有効化後も緑 |
| **L4b+** (任意・後段) | 遠隔席の能力発動を intent 化／Intent の合法性検証＆拒否（現状クライアント信頼）／観戦(席なし viewpoint) | 不正 Intent を権威が弾くテスト |
| **L4c-1** ✅実装済 | 実ソケット・トランスポート＋卓ホスト＋切断耐性（ローカル実回線。WS/DO のスタンドイン）。`src/net/socketTransport.js`(`createSocketServer`/`connectSocket`＝Node `net`TCP・改行JSON・部分フレーム/受信バッファ。依存ゼロ)。`src/net/onlineServer.js`(`serveRoom`＝接続に `welcome`{席割,roster}送信→AuthorityRoom起動→切断で `dropSeat`)。`AuthorityRoom.dropSeat`(切断/離席→CPU代打ち：以後ローカルAI・ack待ち対象外・手番待ちはnull解決で即進行)。`ClientSession` に `makeSeated`＋`welcome` 対応(席割が事前に分からない実回線向け)。**ブラウザ/main.js 無改変** | **検証済**：`test/netsocket.mjs`＝実TCP越しに3ゲーム完走＋1切断。1103メッセージ漏洩なし・公開/自席/他席枚数で整合・**切断→CPUが引き継いで対局完走**。netloop/netredact/eventlog 回帰なし |
| **L4c-2 ③** ✅実装済 | **ブラウザのクライアント化**（ループバック）。画面の `game`＝レプリカ（`applyEvent`駆動・自席手牌のみ実値/他席は伏せ札）、権威は別インスタンス authGame で `AuthorityRoom` が回す。`applyEvent` に **emitモード**（レプリカ bus へエンジン同等イベントを再発火＝既存の描画/SE/相棒ボード/カットイン配線が動く）＋ `lastDiscard` 追跡＋wall スタブに `doraKinds`(公開)/`uraKinds`→[](裏は和了まで隠す)。`handWon/handDrawn` は**完全な lastResult をシリアライズ**して結果画面を再現。権威の `awaitDiscard` が UI 材料(options/abilityStatus/danger)を同梱→`showHumanActions`/`currentDanger`/`riichiKindsNow` が online 時はそれを使う。手動能力発動はテスト中は未対応(チップ表示のみ)。**オフラインは `online=null` で全分岐が従来経路** | **検証済(headless+preview)**：`test/applyemit.mjs`＝emit発火/結果復元/options同梱。preview＝オンラインで自席実値・他席伏せ札・人間打牌(intent往復)・CPU進行・和了→結果→次の局へ(ack)→次局・東2局まで進行、エラー無。オフライン回帰(フリー対戦・打牌・autoボタン表示)無傷。netloop/netredact/netsocket/eventlog 緑 |
| **L4c-2 ①a** ✅実装済 | WebSocket トランスポート。`src/net/wsTransport.js`(`connectWebSocket`＝**依存ゼロ**・ブラウザ/Node24 とも組込 `WebSocket`・1フレーム=1JSON・受信バッファ＝socketTransport と同 I/F)。`src/net/wsServer.js`(`createWsServer`＝**ローカル用** `ws`/devDependency。`serveRoom` をそのまま載せる)。**本番は Cloudflare DO の WebSocketPair に差し替え＝`ws` は本番に載らない** | **検証済**：`test/netws.mjs`＝実WS越しに3ゲーム完走＋1切断、1103msg 漏洩なし・整合・切断→CPU代打ち。クライアント I/F(ブラウザ相当)＋WS 経路を検証 |
| **L4c-2 ①b** ✅実装済 | join プロトコル(`intent.join`{charId}→server が席0=その雀士＋CPU補填で卓構築→`welcome`{seat,roster})＋スタンドアロン `server-online.mjs`(ws・`node server-online.mjs`)＋ブラウザの online を `wsTransport` へ(`window.__ONLINE_WS_URL` 設定時。未設定はループバック)。`onlineClientMessage` が welcome でレプリカ構築→`beginGame({online,ws})`。**バグ修正**：`awaitDiscard`/`awaitCalls` 受信時に `game.phase`/`turn` を確定＋`render()`（pub.phase は emit 時点で前フェーズが残り、親=自席で最初に打つ場合に打牌ガード＆ヒットボックスが死んでいた。ループバックは親ランダムで偶々未発覚） | **検証済(headless+preview)**：`test/netws.mjs`＝実WS3ゲーム＋1切断・漏洩なし。preview＝`server-online.mjs`(ws://127.0.0.1:8799)へブラウザ実接続→join→welcome→人間打牌(親含む)→CPU→鳴きskip→和了→結果→次の局へ(ack)→東2局・エラー無。ループバック/オフライン回帰無傷 |
| **L4c-2 ①c** ✅コード実装済(デプロイは要ユーザ) | Cloudflare Worker + Durable Object 移植。`wrangler.toml`(DOバインド・`new_sqlite_classes`=無料枠版)／`worker/index.js`(WS を 合言葉(room)ごとの DO へルーティング)／`worker/room.js`(`MahjongRoom` DO＝`WebSocketPair` を transport 端点にラップ→既存 `serveRoom` 呼び出し。`src/net/*`/`src/core/*` は純JSで workerd 動作)。`wrangler` を devDependency 追加・`.wrangler/` gitignore | **検証済(ローカル workerd)**：`npx wrangler dev` で `GET /ws 101`、ブラウザ↔実DO で接続→join→welcome→レプリカ描画→**親番の人間打牌(intent over WS→DO)→CPU進行(DOのsetTimeoutペーシング生存)**、エラー無。残=**ユーザ作業のみ**(Cloudflareアカウント＋`wrangler login`＋`wrangler deploy`→URL を既定化)。手順=docs/online-deploy-setup.md |
| **L4c-2 ①c** (本番) | `server-online.mjs` を Cloudflare Worker + Durable Object(WebSocketPair・1卓1DO)へ移植。`wrangler dev` でローカル実行→デプロイ | 別マシン2クライアントで実WS対戦が完走（P1へ接続） |

L1〜L3は**ネットワーク無しで完結**し、オフライン版の回帰だけで検証できる。L4a/L4b は**ループバック**、L4c-1 は**実ソケット(ローカル)**＝いずれもブラウザ無改変のヘッドレス検証。実インフラ(Cloudflare)とブラウザのクライアント化が絡むのは L4c-2 のみ＝リスクを土台側に閉じ込める。

---

## 5. 注意点

- **`decideCalls` の多人数同時性**：複数家がロン/ポン可能なとき、現 `resolveCalls` は優先度（ロン>ポン/カン>チー）で裁く。権威は全callersのIntentを `evt.awaitCalls` の deadline まで収集→揃ったら一括 `resolveCalls`。未応答は `pass` 扱い（現 `handleCalls` の「与えた決定のみ作用」と整合、`main.js:2138-2146`）。
- **能力の (A)/(B) 境界**：`decideAbilities` は「発動するか」の決定（Client/権威）だが、効果の解決（ツモ差替・スコア改変）は **(B)=権威の `game.activateAbility`**。p0 §6 の server/client タグはここに効く。
- **レプリカに無い情報を描画要求しない**：renderer が他家手牌を引かないこと（伏せ牌描画）。`actionOptions` は自席ぶんを `evt.awaitDiscard.options` で受領するので Client で再計算不要。
- **オフライン版の存続**：`LocalController` は恒久的に残す（1人用＝育成・大会・シナリオ戦の本体）。オンラインは Controller 差し替えで同居する。
