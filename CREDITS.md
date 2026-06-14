# クレジット / 使用素材一覧

本作で使用している第三者素材の出典・帰属表示。**配布元の利用規約に従って表記すること**。
（※「要確認」は出所が未記入の項目。判明したら追記してください。）

---

## 🎵 BGM

### PeriTune（ペリチューン）
- サイト: https://peritune.com/
- ライセンス: 多くが **CC BY 4.0**（帰属表示「PeriTune」＋リンクが必要）。各曲ページの表記に従う。
- クレジット例: `Music: PeriTune（https://peritune.com/）`

| 用途 | ファイル | 曲名 / 出典 |
|---|---|---|
| タイトル / ホーム | `sound/bgm/Peritune_Hanadoki.mp3` | PeriTune「Hanadoki（花時）」 |
| キャラ選択 / 大会T3 | `sound/bgm/PerituneMaterial_Amenoshita3.mp3` | PeriTune「天ノ下（Amenoshita）」https://peritune.com/blog/2015/07/03/amenoshita/ |
| 師弟ホーム | `sound/bgm/PerituneMaterial_Otogi4.mp3` | PeriTune「Otogi（御伽）」 |
| 大会 T1（登竜門級） | `sound/bgm/PerituneMaterial_Kengeki.mp3` | PeriTune「剣戟（Kengeki）」https://peritune.com/blog/2021/08/17/kengeki/ |
| 大会 T2（役満級） | `sound/bgm/PerituneMaterial_EpicBattle_J.mp3` | PeriTune「EpicBattle」https://peritune.com/blog/2021/09/16/epicbattle_j/ |

### 要確認（出所未記入）
| 用途 | ファイル | 出典 |
|---|---|---|
| 対局中（汎用2曲） | `sound/bgm/mahjong-ingame1.mp3` / `mahjong-ingame2.mp3` | ❓要確認 |
| 紙芝居シナリオ用 | `sound/bgm/scenario/bgm-*.mp3`（battle/daily/mystery/night/playful/resolve/sorrow/tension/victory/warm） | ❓要確認 |

---

## 🔊 効果音（SE）

### 効果音ラボ
- サイト: https://soundeffect-lab.info/
- ライセンス: 商用・非商用問わず無料。**帰属表示は任意**（任意でクレジット歓迎）。
- 注意: **音源ファイル単体での再配布は禁止**（作品に組み込んだ形での同梱は可）。公開リポジトリでの素材同梱は配布方針（後述）に留意。
- クレジット例: `効果音: 効果音ラボ（https://soundeffect-lab.info/）`

使用例（`sound/se/` 配下）: 麻雀牌をまぜる / 牌を置く・その1〜4 / naki・nakitaku / シャキーン1・2 / 金額表示 / 各種生活音（ドア・襖・畳・歩く・書く 等、紙芝居 SE 用）。

---

## 🖼 UI（和風 UI セット）

### こぱんだ屋 — gameUIset_19
- 採用: 和風 UI 一式（`graphic/ui/sc/` 配下：ボタン/パネル/ゲージ/メッセージ枠 等）。
- ライセンス: **配布元の利用規約に従う**（原本パックは再配布防止のためリポジトリ追跡外。使用分のみ同梱）。
- 出典 URL: ❓要確認（こぱんだ屋の配布ページを記入）

---

## 🔡 フォント

- 埋め込みフォントは未使用。**OS 標準フォント**（游明朝 / 游ゴシック / ヒラギノ / Noto 等）を CSS で指定するのみ＝**ライセンス対応不要**。

---

## 🀄 グラフィック（牌 / キャラ / 背景 等）

| 種別 | 場所 | 出典 |
|---|---|---|
| 牌画像（萬子/筒子/索子/字牌・赤5・裏牌） | `graphic/tiles/`（`*.svg`） | **FluffyStuff / Riichi Mahjong Tiles** — **CC0**（パブリックドメイン／商用可・帰属表示不要）。https://github.com/FluffyStuff/riichi-mahjong-tiles |
| キャラ立ち絵・アイコン | `graphic/chars/` | **r-id 氏（BOOTH）** の立ち絵素材がほとんど（https://booth.pm/ ＋「r-id」）。※各素材の利用規約（**商用利用・改変の可否**）は要確認 |
| モブ（シルエット） | `graphic/chars/mobs/` | ❓要確認 |
| 背景 | `graphic/bg/` | ❓要確認 |
| 表情・エモート | `graphic/emo/` | ❓要確認 |

---

## 📦 配布方針（重要）

- 本リポジトリは公開（GitHub Pages）。**素材の一括 DL / 再配布リスク**を避けるため、完成後に
  **リポジトリ非公開化＋Cloudflare Pages 移設**を予定（メモリ: deploy-privacy-plan）。
- 効果音ラボ・こぱんだ屋は「素材単体の再配布」を禁じている点に留意。原本パックは追跡外（.gitignore）。
- PeriTune（CC BY）は帰属表示を満たせば配布可。**本ファイルの表記を維持すること。**
