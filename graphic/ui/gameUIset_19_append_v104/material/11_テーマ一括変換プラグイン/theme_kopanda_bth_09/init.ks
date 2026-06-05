;--------------------------------------------------------------------------------
; ティラノスクリプト テーマプラグイン theme_kopanda_bth_09
; 作者:こ・ぱんだ
; https://kopacurve.blog.fc2.com/
;--------------------------------------------------------------------------------

[iscript]

mp.font_color    = mp.font_color    || "0xEEEEEE";
mp.name_color    = mp.name_color    || "0xF2E3CE";
mp.frame_opacity = mp.frame_opacity || "255";
mp.font_color2   = mp.font_color2   || "0xEEEEEE";
mp.glyph         = mp.glyph         || "on";

if(TG.config.alreadyReadTextColor != "default") {
	TG.config.alreadyReadTextColor = mp.font_color2;
}

[endscript]

; 名前部分のメッセージレイヤ削除
[free name="chara_name_area" layer="message0"]

; メッセージウィンドウの設定
[position layer="message0" width="1280" height="228" top="492" left="0"]
[position layer="message0" frame="../others/plugin/theme_kopanda_bth_09/image/frame_message.png" margint="70" marginl="160" marginr="140" opacity="&mp.frame_opacity" page="fore"]

; 名前枠の設定
[ptext name="chara_name_area" layer="message0" color="&mp.name_color" size="26" x="0" y="498" width="500" align="center"]
[chara_config ptext="chara_name_area"]

; デフォルトのフォントカラー指定
[font color="&mp.font_color"]
[deffont color="&mp.font_color"]

; クリック待ちグリフの設定（on設定時のみ有効）
[if exp="mp.glyph == 'on'"]
[glyph line="../../../data/others/plugin/theme_kopanda_bth_09/image/system/nextpage.png"]
[endif]

;=================================================================================

; 機能ボタンを表示するマクロ

;=================================================================================

; 機能ボタンを表示したいシーンで[add_theme_button]と記述してください（消去は[clearfix]タグ）
[macro name="add_theme_button"]

; 歯車ボタン（メニューボタン）非表示
[hidemenubutton]

[iscript]

	tf.sysbtnImgPath   = '../others/plugin/theme_kopanda_bth_09/image/button/';
	tf.sysbtnPosx      = [212, 308, 404, 500, 596, 692, 788, 884, 980];
	tf.sysbtnPosy      = 686;

[endscript]

; セーブ
[button name="role_button" role="save" graphic="&tf.sysbtnImgPath + 'save.png'" enterimg="&tf.sysbtnImgPath + 'save2.png'" activeimg="&tf.sysbtnImgPath + 'save3.png'" x="&tf.sysbtnPosx[0]" y="&tf.sysbtnPosy"]

; ロード
[button name="role_button" role="load" graphic="&tf.sysbtnImgPath + 'load.png'" enterimg="&tf.sysbtnImgPath + 'load2.png'" activeimg="&tf.sysbtnImgPath + 'load3.png'" x="&tf.sysbtnPosx[1]" y="&tf.sysbtnPosy"]

; オート
[button name="role_button" role="auto" graphic="&tf.sysbtnImgPath + 'auto.png'" enterimg="&tf.sysbtnImgPath + 'auto2.png'" activeimg="&tf.sysbtnImgPath + 'auto3.png'" autoimg="&tf.sysbtnImgPath + 'auto4.png'" x="&tf.sysbtnPosx[2]" y="&tf.sysbtnPosy"]

; スキップ
[button name="role_button" role="skip" graphic="&tf.sysbtnImgPath + 'skip.png'" enterimg="&tf.sysbtnImgPath + 'skip2.png'" activeimg="&tf.sysbtnImgPath + 'skip3.png'" skipimg="&tf.sysbtnImgPath + 'skip4.png'" x="&tf.sysbtnPosx[3]" y="&tf.sysbtnPosy"]

; バックログ
[button name="role_button" role="backlog" graphic="&tf.sysbtnImgPath + 'log.png'" enterimg="&tf.sysbtnImgPath + 'log2.png'" activeimg="&tf.sysbtnImgPath + 'log3.png'" x="&tf.sysbtnPosx[4]" y="&tf.sysbtnPosy"]

; スクリーン
[button name="role_button" role="fullscreen" graphic="&tf.sysbtnImgPath + 'screen.png'" enterimg="&tf.sysbtnImgPath + 'screen2.png'" activeimg="&tf.sysbtnImgPath + 'screen3.png'" x="&tf.sysbtnPosx[5]" y="&tf.sysbtnPosy"]

; コンフィグ
[button name="role_button" role="sleepgame" graphic="&tf.sysbtnImgPath + 'sleep.png'" enterimg="&tf.sysbtnImgPath + 'sleep2.png'" activeimg="&tf.sysbtnImgPath + 'sleep3.png'" storage="../others/plugin/theme_kopanda_bth_09/config.ks" x="&tf.sysbtnPosx[6]" y="&tf.sysbtnPosy"]

; メニュー
[button name="role_button" role="menu" graphic="&tf.sysbtnImgPath + 'menu.png'" enterimg="&tf.sysbtnImgPath + 'menu2.png'" activeimg="&tf.sysbtnImgPath + 'menu3.png'" x="&tf.sysbtnPosx[7]" y="&tf.sysbtnPosy"]

; タイトル
[button name="role_button" role="title" graphic="&tf.sysbtnImgPath + 'title.png'" enterimg="&tf.sysbtnImgPath + 'title2.png'" activeimg="&tf.sysbtnImgPath + 'title3.png'" x="&tf.sysbtnPosx[8]" y="&tf.sysbtnPosy"]

; テキスト非表示
[button name="role_button" role="window" graphic="&tf.sysbtnImgPath + 'close.png'" enterimg="&tf.sysbtnImgPath + 'close2.png'" activeimg="&tf.sysbtnImgPath + 'close3.png'" x="1240" y="552"]

[endmacro]


;=================================================================================

; システムで利用するHTML,CSSの設定

;=================================================================================
; セーブ画面
[sysview type="save" storage="./data/others/plugin/theme_kopanda_bth_09/html/save.html"]

; ロード画面
[sysview type="load" storage="./data/others/plugin/theme_kopanda_bth_09/html/load.html"]

; バックログ画面
[sysview type="backlog" storage="./data/others/plugin/theme_kopanda_bth_09/html/backlog.html"]

; メニュー画面
[sysview type="menu" storage="./data/others/plugin/theme_kopanda_bth_09/html/menu.html"]

; CSS
[loadcss file="./data/others/plugin/theme_kopanda_bth_09/css/bth09.css"]
[loadcss file="./data/others/plugin/theme_kopanda_bth_09/css/bth09_anim.css"]

; メニュー画面からコンフィグを呼び出すための設定ファイル
[loadjs storage="plugin/theme_kopanda_bth_09/setting.js"]

;=================================================================================

; テストメッセージ出力プラグインの読み込み

;=================================================================================
[loadjs storage="plugin/theme_kopanda_bth_09/testMessagePlus/gMessageTester.js"]
[loadcss file="./data/others/plugin/theme_kopanda_bth_09/testMessagePlus/style.css"]

[macro name="test_message_start"]
[eval exp="gMessageTester.create()"]
[endmacro]

[macro name="test_message_end"]
[eval exp="gMessageTester.destroy()"]
[endmacro]

[macro name="test_message_reset"]
[eval exp="gMessageTester.currentTextNumber=0;gMessageTester.next(true)"]
[endmacro]


[return]
