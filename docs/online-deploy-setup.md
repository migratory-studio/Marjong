# 通信対戦を“ネットに公開”する手順（L4c-2 ①c 準備）

いまの状態：ブラウザ↔ローカル WS サーバ（`server-online.mjs`）で通信対戦が**最後まで動く**ところまで完成（テスト中）。
あとは「その WS サーバを**インターネット上に置く**」だけ。ここでは**あなたがやる作業**と**私（コード）がやる作業**を分けて手順化する。

> 用語：**WS=WebSocket**（対局のリアルタイム通信）／**権威サーバ**＝`server-online.mjs`（卓を回す本体）／**静的サイト**＝ブラウザゲーム本体（今は GitHub Pages）。

---

## 0. 結論（どっちのルートで行くか）

| | **Path A：Node ホストにそのまま置く（最短）** | **Path B：Cloudflare Worker + Durable Object（本命）** |
|---|---|---|
| コード改修 | ほぼ無し（`0.0.0.0` バインドの小修正だけ・私がやる） | あり（`server-online.mjs` を DO へ移植＝私がやる、①c 本体） |
| あなたの手間 | アカウント1つ＋デプロイ数コマンド | Cloudflare＋wrangler＋DO 設定 |
| 月額 | 無料枠あり（ただし無料枠は“眠る”罠あり→後述）。常時起動は ~$5/月 | 無料枠で始めやすい。規模が出たら Workers Paid ~$5/月 |
| スケール/堅牢性 | 1プロセスが全卓を抱える（再起動で全対局消える） | 1卓=1 DO で隔離・自動スケール |
| 既存計画との整合 | 静的サイトは現状のまま | `deploy-privacy-plan`（Cloudflare 移行）と一致 |

**おすすめ：まず Path A で“公開して友達と打てる”状態にする → 手応えを見て Path B に移す。**
Path B のコードは Path A と**同じ `serveRoom` を使い回す**ので、後から移しても作業は少ない。

---

## 1. いますぐやれる下準備（共通・あなた）

1. **GitHub アカウント**：たぶん既にあり（今 GitHub Pages 公開中）。無ければ作成。
2. **Node**：このPCは導入済み（確認済み Node v24）。デプロイ作業は基本このPCから。
3. **「友達と試す」前提の確認**：通信対戦は**2人目以降のプレイヤーがいて意味が出る**が、いまは「自分＋CPU補填」で1人でも成立する。まずは自分1人で公開先に繋がるかを確認 → 後でマッチング（複数人）を詰める。

---

## 2. Path A：Node ホストに公開（最短ルート）

ホスト候補（無料枠あり・WebSocket対応）：**Render / Railway / Fly.io** のどれか1つ。ここでは例として進める（実際の画面は各社のダッシュボード）。

### あなたがやること
1. **ホストのアカウント作成**（Render/Railway/Fly のいずれか1つ。メール＋GitHub連携でOK）。
2. **このリポジトリを GitHub に push**（私がコミットは作る。push は権限の都合であなた、または私が指示）。
   - ※リポジトリは現在 public。`deploy-privacy-plan` 的には完成後に非公開化予定だが、デプロイ自体は public のままでも可。
3. **ホストで「新しい Web Service」を作成** → GitHub リポジトリを連携 → 設定：
   - **Build command**：`npm install`
   - **Start command**：`node server-online.mjs`
   - **環境変数**：`PORT`（ホストが自動で割り当てる値を使う。`server-online.mjs` は `PORT` を読む実装済み）
4. **デプロイ**実行 → `https://あなたのアプリ.onrender.com`（等）の URL が発行される。
   - WS の URL は **`wss://あなたのアプリ.onrender.com`**（`https`→`wss`、TLS は各社が自動付与）。
5. その URL を私に教えてくれれば、**ブラウザ側がその `wss://…` へ接続するよう設定**する（私がやる）。

### 私がやること（あなたが Path A を選んだら）
- `wsServer` の待受を **`0.0.0.0`**（外部公開用）にする小修正（今は `127.0.0.1` 固定）。
- `package.json` に `"start": "node server-online.mjs"`（ホストの慣習に合わせる）など微調整。
- ブラウザの接続先 URL を**設定化**（今は `window.__ONLINE_WS_URL` のデバッグ用フックなので、本番URLを差せる形に）。
- 必要なら簡単な「合言葉ルームに同じURLで2人入る」導線。

### Path A の注意（重要）
- **無料枠は“眠る”**：Render などの無料 Web サービスは無アクセスが続くと**スリープ**し、次の接続で起動に十数秒かかる＝WS が切れる/待たされる。**常時起動したいなら最小有料（~$5/月）** か、Fly.io の常時起動枠を検討。
- **必ず `wss://`**：公開した静的サイトは `https`。`https` ページから **`ws://`（非TLS）は接続ブロック**される。`wss://` を使うこと（ホストのTLS付きドメインでOK）。ローカル検証は `http://localhost`＋`ws://127.0.0.1` は例外的に許可される。
- 1プロセスが全卓を抱えるので、**サーバ再起動＝進行中の全対局が消える**。テスト段階は許容。

---

## 3. Path B：Cloudflare Worker + Durable Object（本命）★コードは完成・ローカル検証済み

**私の担当分（①c 本体）は実装＆ローカル検証まで完了**：`wrangler.toml` / `worker/index.js`（WS を 合言葉(room)ごとの DO へルーティング）/ `worker/room.js`（`MahjongRoom` Durable Object＝`WebSocketPair` で接続をラップし既存 `serveRoom` を呼ぶ）を追加。`npx wrangler dev`（ローカルの workerd＝本番と同じ実行系）で **ブラウザ↔実DO で対局が動くことを確認済み**（接続→join→welcome→人間打牌→CPU進行）。`wrangler` は `devDependency` 導入済み。

→ あとは **あなたの Cloudflare 作業（アカウント＋ログイン＋デプロイ）だけ**。

### あなたがやること（順番に）
1. **Cloudflare アカウント作成**：dash.cloudflare.com・無料・メール認証。
2. **（任意・推奨）ローカルで動作確認**：このPCで `npx wrangler dev` → ブラウザの開発者ツールで `window.__ONLINE_WS_URL = "ws://127.0.0.1:8787/ws?room=test"` をセット → 通信対戦で対局できる（私が検証した手順と同じ）。※ローカルはログイン不要。
3. **ログイン**：`npx wrangler login`（ブラウザが開いて Cloudflare 認可）。
4. **デプロイ**：`npx wrangler deploy`
   - 成功すると `https://mahjong-online.<あなたのサブドメイン>.workers.dev` のような URL が出る。
   - WS の接続先は **`wss://mahjong-online.<…>.workers.dev/ws?room=合言葉`**。
5. **その URL を私に教える** → ゲーム本体（ロビー）が**その `wss://…` に自動接続する設定**を私が入れる（今は手動フックなので本番URLを既定化する）。
6. （任意・計画どおり）**静的サイトを Cloudflare Pages へ移設**（`deploy-privacy-plan`）。同一 Cloudflare 内で完結。

### DO プラン確認（唯一の不確定点）
- いまの設定は **SQLite ストレージ版 DO**（`wrangler.toml` の `new_sqlite_classes`）＝**無料プランで使えるはず**。
- ただし Cloudflare の無料枠条件は**変わりやすい**。`wrangler deploy` 時に「Durable Objects は有料プランが必要」と出たら、そこで **Workers Paid（~$5/月）** を有効化するか判断。←ここだけ実際にやってみないと確定しない。

### Path B の注意
- **DO のライフサイクル**：`AuthorityRoom` の進行は**メモリ上の状態＋`setTimeout`**で回る。DO が**接続中はメモリに留まる**前提なら素直に動く。ただし Cloudflare の**ハイバネーション（無通信時の退避）**を有効にすると進行中の卓状態が飛ぶので、**対局中は退避させない**実装にする（最初はこれで十分）。
- 料金は無料枠で始められるが、WS メッセージ数・DO 稼働で**Workers Paid (~$5/月)** に乗る可能性。←要確認（時期で変動）。

---

## 4. どっちでも共通の「公開後チェック」

1. 友達（or 別ブラウザ/別端末）に**公開URLの静的サイト**を開いてもらう。
2. 通信対戦 →（合言葉 or マッチング）→ 対局開始 → **2人とも同じ卓に入って打てるか**。
3. 片方が離脱しても**CPU が代打ちで対局が続くか**（実装済み）。
4. うまく行かないとき私に伝えてほしい情報：ブラウザの**コンソールエラー**、サーバ側の**ログ**、使った**URL（wss://…）**。

---

## 5. 役割分担まとめ

| 作業 | 誰 |
|---|---|
| アカウント作成（ホスト/Cloudflare）・ログイン認可 | **あなた**（対話/ブラウザ操作が要るため） |
| デプロイ用の小修正（0.0.0.0 / start / URL設定化） | 私 |
| Cloudflare DO への移植（①c 本体） | 私 |
| `wrangler deploy` / ホストのデプロイ実行 | あなた（または私が手順を出して一緒に） |
| 公開後の動作確認 | 一緒に |

---

## 6. まず私に決めてほしいこと（次の一手）

- **Path A（最短・まず動かす）** で行くか、**Path B（Cloudflare 本命）** から行くか。
- Path A なら **どのホスト**（Render / Railway / Fly）にするか（こだわり無ければ私の推奨で）。

決めてくれたら、その場で必要なコード修正（私の担当分）を入れて、あなたのデプロイ手順を**そのルート専用にもう一段細かく**出す。

## 公開卓の常連AI

公開マッチングの `match3` が64人のプロフィールをDurable ObjectのSQLiteに保存する。HNは確認済みの候補を初回にシャッフルする。推し80%、二番手15%、ほか5%。活動帯、休み、1日の対局枠、再戦までの休憩は日本時間。19時から24時の同時着席上限は16人、それ以外は8人。選び方は `worker/regulars.js` にある。

人間4人なら即開始。それ以外は15秒待ち、直近3卓で同席していない常連を優先する。常連が足りない席は従来の飛び入りCPUが埋める。Cronは5分ごとに同じ公開卓を起こす。AI同士は前の自動対局から15分以上経ち、4人の活動帯が重なると対局する。人数が足りなければ5分後にもう一度探す。合言葉の部屋には派遣しない。

戦績と段位は全対局で更新する。AIの公開順位ptは、AIだけの卓では1位6pt・2位2pt・3位以下0pt。人が実際に操作した卓では、日本時間で各AIの最初の2戦に通常の順位ptがつく。負けても1戦として数える。両方を合わせてAIごとに1シーズン120ptが上限。同点では人間を先に表示する。プロフィール更新と送信待ち結果は同じSQLiteトランザクションで確定する。次のCronでSupabaseへ届け、応答が失われても対局IDとAI IDで重複を防ぐ。

デプロイ順はSupabaseの `online_regular_results` マイグレーション、Edge Function `record-regular-result`（JWT検証オン）、Worker、静的サイト。Workerの `REGULAR_WRITE_TOKEN` は32ランダムバイトの標準Base64で、対応するSHA-256の16進値だけをEdge Functionの `writerDigest` に置く。送信先のEdge Functionはこの鍵を検証し、指定した対局IDの成績を固定のWorker URLから取り寄せる。DBの管理鍵はSupabase側でのみ使用する。別環境ではWorker URL・Supabase URL・公開JWT・送信鍵と検証値の組をその環境用に変更する。

確認は `node test/regulars.mjs`（Node 24）、CloudflareのCron実行履歴、Supabaseの `online_regular_results` の順。戦績行の `ranking_eligible` と `season_score` は混卓の加点対象と累計を表す。公開順位表 `online_season_standings` はそこにAI卓の着順から求めたptを加え、上限を適用する。過去のAI卓も集計に含む。Cronの送信失敗は次回以降に再試行する。

増員時は既存プロフィールのID・名前・推し・戦績・日次枠・休憩時刻を維持し、不足する `regular-1` 〜 `regular-64` だけを同一SQLiteトランザクションで追加する。保存済みプロフィールや送信待ち結果、Cronの時刻は初期化しない。初回反映のログ `regulars roster expanded` で追加前・追加数・追加後・既存データ一致を確認でき、再起動しても再抽選や重複追加はしない。

増員は常連候補と顔ぶれを増やすもので、人間のマッチング待機15秒や4人揃えば即開始する動作は変わらない。AI自主対局は最短15分間隔でも、活動帯・日次上限・休憩・同時着席枠によって見送られる。自主対局も同じ日次枠と休憩を消費するので、常に常連が増える保証や待ち時間の短縮はない。


### 常連AIの配点・昇降段（2026-11-11）

常連AIの段位RPは `worker/regularRank.js` の専用計算で、1位+80・2位+25・3位−10・4位−45。4着順合計は従来と同じ+50で、勝敗による差を広げる。段位バーが0未満になれば1段下がり、不足分を下位段の満タン量から差し引く。初段は0で止まり、最高段は9。昇段時は従来どおりバーを0に戻す。季替わりだけで段位は変えず、既存の段位・RP・対局履歴を初期化／再計算しない。適用は反映後の対局から。人間の段位計算と降段なしの仕様は変更しない。

公開順位ptは段位RPとは別。自主対局の6pt/2ptと季上限120ptは保存済み対局も再集計する。混卓の最初の2戦の公開加点は従来の1位60pt・2位20ptのままで、AI専用RPの変更では増やさない。シーズンの区切り、権限、既存プロフィール、対局頻度・日次／同時上限は変更しない。確認: `node test/regularrank.mjs`、`node test/regulars.mjs`、`node test/onlinerank.mjs`。

## 接続切れの診断（test.6以降）

静的サイトとWorkerの両方を反映すると、ブラウザの「環境情報をコピー」とCloudflareのログを共通IDで照合できる。
`wrangler.toml` の `[observability]` でログ保存を有効化。URL中の部屋の合言葉を保存しないよう、呼出し情報の自動ログは `invocation_logs = false` とし、アプリの構造化ログを使う。
この設定もWorkerの再デプロイで反映される。稼働中の卓の状態はメモリにあるので、反映時には対局中断の影響を考慮する。

### 再発時の手順

1. 再接続画面の「診断情報を確認」または設定の不具合報告から「環境情報をコピー」。ブラウザ診断は同じタブのsessionStorageに直近120件・24時間分を保持し、F5でも残る。保存が制限される環境ではメモリ内のみとなる。
2. 報告の `connection diagnostics (UTC)` を確認。時刻はUTC（日本時間は+9時間）。発生した操作、スリープやタブ切替の有無も記録する。
3. Cloudflareの Workers & Pages → mahjong-online → Observability で、該当時刻と `connectionId` を検索する。`scope: mahjong-online` がこのゲームのカスタム診断。
4. `matchId` で対局の開始・終了・例外を追う。`instanceId` はDOのメモリが作り直されるたびに変わる。復帰前後の `server_connection` でこれが変わり `rejoin_missing` が続く場合、元のメモリが失われた可能性が高い。同じ接続先への復帰だったことも確認する。
5. `match_crashed` は対局処理の例外、`match_finalize_failed` は完了後の処理の失敗。`errorName` と `frames`（ソース位置）をその `build` のコードと照合する。

### 判断できることと限界

| 記録 | 判断の手掛かり |
|---|---|
| `network_offline` → `ws_close` | ブラウザがオフラインを検知。ただしWi-Fi機器や回線事業者のどちらが原因かまでは分からない |
| `page_hidden` / `visibility_changed` → 受信間隔の増大 | タブ移動・スリープとの関連を確認する。非表示だけで切断原因と断定しない |
| `localClose: true` | クライアントが明示的にcloseを要求した。直前の再試行・退出・タイムアウトの記録と照合 |
| 終了コード1006 | Closeフレームを受け取れない異常終了。回線断、サーバー停止等のどれかはコード単独では判別できない |
| `match_finished` → `rejoin_missing` | 対局終了後に元の卓へ戻ろうとした |
| `match_crashed` → `rejoin_missing` | 対局処理の例外で復帰先が失われた |
| `instanceId`の変化 | サーバーのメモリが作り直された手掛かり。デプロイ履歴・Cloudflareのエラー／CPU指標と照合 |

CPU制限や基盤の強制終了では、アプリが最後のログを書けない場合がある。全原因をこのログだけで断定せず、Cloudflare側の指標・デプロイ履歴も確認する。保存期限や上限はプランに依存するため、再発後は早めに回収する。

診断用IDは認証・復帰に使えない乱数。追加する診断には表示名・メール・手牌・全メッセージ本文・復帰token・部屋名・URLを入れない。例外も名前とソース位置だけを記録する。ブラウザ診断は自動送信せず、既存の環境情報コピーに含める。

確認コマンド: `node --test test/netdiagnostics.mjs test/netreconnect-client.mjs test/netreconnect-race.mjs test/netreconnect-ui.mjs`、`node test/netws.mjs`、`node test/netreconnect.mjs`、`npx wrangler deploy --dry-run`。

参考: [Cloudflare Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)、[Durable Objectsの障害調査](https://developers.cloudflare.com/durable-objects/observability/troubleshooting/)、[WebSocket終了コード](https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent/code)。
