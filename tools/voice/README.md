# 師匠ボイス ⇄ スプレッドシート ワークフロー

師匠の文言（mentorVoiceMaster）を、人がスプシ/Excelで編集できるようにする土台。
検証（語彙・必須欄・テンプレ残置・口調lint）は**スプシのマクロではなくこのリポジトリのコード**
（`tools/voiceSheet.mjs`）に置く＝テストで守れる・git履歴に残る。

## 種データを書き出す（マスタ → CSV）
```
node tools/voice-export.mjs shiyue   → tools/voice/shiyue.csv
```

## スプシで編集する
1. Google スプレッドシート →「ファイル → インポート → アップロード」で `tools/voice/<char>.csv` を開く
   （または Drive の CSV を右クリック →「アプリで開く → Google スプレッドシート」）
2. 1行＝1セリフ。`type` 列で種別を見分ける:
   - `greet`（ホーム挨拶）/ `praise`（大成功の素出し）/ `battle`（見守り相槌）/ `parlor`（雀荘帰り） … `text` を書く
   - `rest`（休憩2択） … `text`＝問いかけ、`a_*`/`b_*` に選択肢2つ
   - `battle` は `key`＝event（matchStart 等）、`parlor` は `key`＝tier（bigWin/win/rough）
3. `cond_*`（phase/condTier/bondMin/time/lastOutcome/afterChoice/cleared/treasuresMin）は空欄＝無条件

## 取り込む（CSV → 検証 → マスタ）
編集後のCSVを `tools/voice/<char>.csv` に置き、ディレクター（Claude）に「ボイス取り込んで」と頼む。
`validateRows` がエラー（語彙ミス・必須欄欠落・テンプレ残置）を**行番号つきで**報告し、
問題なければ `.js` 反映 → テスト → コミットまで回す。

> 取り込みの本体結線（生成データを mentorVoiceMaster がマージする形）は次の増分で実装予定。
> 現状は「往復が壊れない＋検証が効く」ことを `test/voicesheet.mjs` で保証済み。

## 語彙の正典
`tools/voiceSheet.mjs` の `VOCAB`。条件キーや event/tier を増やすときはここに足す
（本体 `gMatch`/イベント定義と揃える）。
