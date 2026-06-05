;=======================================================================================================================

; 回想モード 画面作成

;=======================================================================================================================
*start

[mask time="100"]

; 初期化
[layopt layer="message0" visible="false"]
[layopt layer="0" visible="true"]
[hidemenubutton]

[clearfix]
[cm]

[iscript]

tf.page                = 0   // ページ番号
tf.selected_replay_obj = ""; // 選択されたリプレイを一時的に保管

tf.replay_img_path     = "../image/replay_bth09/"; // 画像のパス

// 未開放サムネ画像
tf.replay_thumb = {
	img    : tf.replay_img_path + 'lock.png',
	width  : 320,
  height : 180,
	posx   : [152, 480, 808],
  posy   : [232, 420]
};

// 前ページボタン
tf.btn_prev = {
	img     : tf.replay_img_path + 'btn_prev.png',
	img_hov : tf.replay_img_path + 'btn_prev_hov.png',
	img_clk : tf.replay_img_path + 'btn_prev_clk.png',
	posx    : 56,
	posy    : 372
};

// 次ページボタン
tf.btn_next = {
	img     : tf.replay_img_path + 'btn_next.png',
	img_hov : tf.replay_img_path + 'btn_next_hov.png',
	img_clk : tf.replay_img_path + 'btn_next_clk.png',
	posx    : 1176,
  posy    : 350
};

// 回想モード終了ボタン
tf.replay_close = {
	img     : tf.replay_img_path + 'btn_back.png',
	img_hov : tf.replay_img_path + 'btn_back_hov.png',
	img_clk : tf.replay_img_path + 'btn_back_clk.png',
	posx    : 1168,
  posy    : 24
};

[endscript]

;-----------------------------------------------------------------------------------------------------------------------
; ページネーション（ページ数が変わるときはtextの中身を修正してね）
;-----------------------------------------------------------------------------------------------------------------------
[macro name="pagination"]
  [layopt layer="0" visible="true"]
  [free layer="0" name="pagination" time="1"]
  [ptext layer="0" name="pagination" text="&tf.page + 1 + '/3'" x="0" y="634" size="18" color="0xEEEEEE" bold="bold" width="1280" align="center"]
[endmacro]

;-----------------------------------------------------------------------------------------------------------------------
; 背景読込
;-----------------------------------------------------------------------------------------------------------------------
[bg storage="&tf.replay_img_path + 'recollection_bg.jpg'" time="100" wait="false"]

[jump target="*replaypage"]

;-----------------------------------------------------------------------------------------------------------------------
*replaypage
[cm]

; 回想モード終了
[button name="back_btn" graphic="&tf.replay_img_path + 'btn_back.png'" enterimg="&tf.replay_img_path + 'btn_back_hov.png'" activeimg="&tf.replay_img_path + 'btn_back_clk.png'" target="*backtitle" x="&tf.replay_close.posx" y="&tf.replay_close.posy"]

[iscript]
	tf.target_page = "page_"+tf.page;
[endscript]

*replayview

[jump target="&tf.target_page"]

;-----------------------------------------------------------------------------------------------------------------------
*page_0
;-----------------------------------------------------------------------------------------------------------------------
; 1ページ目
[replay_image_button name="" graphic="" no_graphic="&tf.replay_thumb.img" x="&tf.replay_thumb.posx[0]" y="&tf.replay_thumb.posy[0]" width="&tf.replay_thumb.width" height="&tf.replay_thumb.height"]
[replay_image_button name="" graphic="" no_graphic="&tf.replay_thumb.img" x="&tf.replay_thumb.posx[1]" y="&tf.replay_thumb.posy[0]" width="&tf.replay_thumb.width" height="&tf.replay_thumb.height"]
[replay_image_button name="" graphic="" no_graphic="&tf.replay_thumb.img" x="&tf.replay_thumb.posx[2]" y="&tf.replay_thumb.posy[0]" width="&tf.replay_thumb.width" height="&tf.replay_thumb.height"]

[replay_image_button name="" graphic="" no_graphic="&tf.replay_thumb.img" x="&tf.replay_thumb.posx[0]" y="&tf.replay_thumb.posy[1]" width="&tf.replay_thumb.width" height="&tf.replay_thumb.height"]
[replay_image_button name="" graphic="" no_graphic="&tf.replay_thumb.img" x="&tf.replay_thumb.posx[1]" y="&tf.replay_thumb.posy[1]" width="&tf.replay_thumb.width" height="&tf.replay_thumb.height"]
[replay_image_button name="" graphic="" no_graphic="&tf.replay_thumb.img" x="&tf.replay_thumb.posx[2]" y="&tf.replay_thumb.posy[1]" width="&tf.replay_thumb.width" height="&tf.replay_thumb.height"]

; 次ページへ
[button graphic="&tf.btn_next.img" enterimg="&tf.btn_next.img_hov" activeimg="&tf.btn_next.img_clk" width="&tf.btn_next.width" height="&tf.btn_next.height" x="&tf.btn_next.posx" y="&tf.btn_next.posy" target="*nextpage"]

; ページネーション
[pagination]

; 共通処理へ
[jump target ="*common"]

;-----------------------------------------------------------------------------------------------------------------------
*page_1
;-----------------------------------------------------------------------------------------------------------------------
; 2ページ目
[replay_image_button name="" graphic="" no_graphic="&tf.replay_thumb.img" x="&tf.replay_thumb.posx[0]" y="&tf.replay_thumb.posy[0]" width="&tf.replay_thumb.width" height="&tf.replay_thumb.height"]
[replay_image_button name="" graphic="" no_graphic="&tf.replay_thumb.img" x="&tf.replay_thumb.posx[1]" y="&tf.replay_thumb.posy[0]" width="&tf.replay_thumb.width" height="&tf.replay_thumb.height"]
[replay_image_button name="" graphic="" no_graphic="&tf.replay_thumb.img" x="&tf.replay_thumb.posx[2]" y="&tf.replay_thumb.posy[0]" width="&tf.replay_thumb.width" height="&tf.replay_thumb.height"]

[replay_image_button name="" graphic="" no_graphic="&tf.replay_thumb.img" x="&tf.replay_thumb.posx[0]" y="&tf.replay_thumb.posy[1]" width="&tf.replay_thumb.width" height="&tf.replay_thumb.height"]
[replay_image_button name="" graphic="" no_graphic="&tf.replay_thumb.img" x="&tf.replay_thumb.posx[1]" y="&tf.replay_thumb.posy[1]" width="&tf.replay_thumb.width" height="&tf.replay_thumb.height"]
[replay_image_button name="" graphic="" no_graphic="&tf.replay_thumb.img" x="&tf.replay_thumb.posx[2]" y="&tf.replay_thumb.posy[1]" width="&tf.replay_thumb.width" height="&tf.replay_thumb.height"]

; 前ページへ
[button graphic="&tf.btn_prev.img" enterimg="&tf.btn_prev.img_hov" activeimg="&tf.btn_prev.img_clk" width="&tf.btn_prev.width" height="&tf.btn_prev.height" x="&tf.btn_prev.posx" y="&tf.btn_prev.posy" target="*backpage"]
; 次ページへ
[button graphic="&tf.btn_next.img" enterimg="&tf.btn_next.img_hov" activeimg="&tf.btn_next.img_clk" width="&tf.btn_next.width" height="&tf.btn_next.height" x="&tf.btn_next.posx" y="&tf.btn_next.posy" target="*nextpage"]

; ページネーション
[pagination]

; 共通処理へ
[jump target ="*common"]

;-----------------------------------------------------------------------------------------------------------------------
*page_2
;-----------------------------------------------------------------------------------------------------------------------
; 3ページ目
[replay_image_button name="" graphic="" no_graphic="&tf.replay_thumb.img" x="&tf.replay_thumb.posx[0]" y="&tf.replay_thumb.posy[0]" width="&tf.replay_thumb.width" height="&tf.replay_thumb.height"]
[replay_image_button name="" graphic="" no_graphic="&tf.replay_thumb.img" x="&tf.replay_thumb.posx[1]" y="&tf.replay_thumb.posy[0]" width="&tf.replay_thumb.width" height="&tf.replay_thumb.height"]
[replay_image_button name="" graphic="" no_graphic="&tf.replay_thumb.img" x="&tf.replay_thumb.posx[2]" y="&tf.replay_thumb.posy[0]" width="&tf.replay_thumb.width" height="&tf.replay_thumb.height"]

[replay_image_button name="" graphic="" no_graphic="&tf.replay_thumb.img" x="&tf.replay_thumb.posx[0]" y="&tf.replay_thumb.posy[1]" width="&tf.replay_thumb.width" height="&tf.replay_thumb.height"]
[replay_image_button name="" graphic="" no_graphic="&tf.replay_thumb.img" x="&tf.replay_thumb.posx[1]" y="&tf.replay_thumb.posy[1]" width="&tf.replay_thumb.width" height="&tf.replay_thumb.height"]
[replay_image_button name="" graphic="" no_graphic="&tf.replay_thumb.img" x="&tf.replay_thumb.posx[2]" y="&tf.replay_thumb.posy[1]" width="&tf.replay_thumb.width" height="&tf.replay_thumb.height"]

; 前ページへ
[button graphic="&tf.btn_prev.img" enterimg="&tf.btn_prev.img_hov" activeimg="&tf.btn_prev.img_clk" width="&tf.btn_prev.width" height="&tf.btn_prev.height" x="&tf.btn_prev.posx" y="&tf.btn_prev.posy" target="*backpage"]

; ページネーション
[pagination]

; 共通処理へ
[jump target ="*common"]

;-----------------------------------------------------------------------------------------------------------------------
*common
;-----------------------------------------------------------------------------------------------------------------------

[mask_off time="300"]

[s]

;-----------------------------------------------------------------------------------------------------------------------
; 回想モード終了
;-----------------------------------------------------------------------------------------------------------------------
*backtitle

[mask time="200"]

[cm]
[freeimage layer="0"]
[freeimage layer="1"]
[freeimage layer="base"]

[iscript]

  tf.system.flag_replay = false; // 回想モード判定解除

[endscript]

[mask_off time="200"]

[jump storage="title.ks"]

;-----------------------------------------------------------------------------------------------------------------------
; 次ページに移動
;-----------------------------------------------------------------------------------------------------------------------
*nextpage
[emb exp="tf.page++;"]
[jump target="*replaypage"]

;-----------------------------------------------------------------------------------------------------------------------
; 前ページに移動
;-----------------------------------------------------------------------------------------------------------------------
*backpage
[emb exp="tf.page--;"]
[jump target="*replaypage"]

;-----------------------------------------------------------------------------------------------------------------------
; サムネイルをクリックした
;-----------------------------------------------------------------------------------------------------------------------
*clickcg
[cm]

[iscript]
    tf.system.flag_replay = true; // 回想モードを true に
[endscript]

; ラベルとページネーション削除
[free layer="0" name="label_replay"]
[free layer="0" name="pagination"]

; 回想シナリオへジャンプ
[jump storage="&tf.selected_replay_obj.storage" target="&tf.selected_replay_obj.target"]
[s]

;-----------------------------------------------------------------------------------------------------------------------
; 未開放のサムネイルをクリックした場合は何もしない
;-----------------------------------------------------------------------------------------------------------------------
*no_image
[jump  target="*replaypage"]
