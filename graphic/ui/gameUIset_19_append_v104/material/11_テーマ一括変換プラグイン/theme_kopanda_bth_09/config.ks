; 2020/08/31 @ko10panda edit
;=======================================================================================================================

; コンフィグ モード　画面作成

;=======================================================================================================================

[mask time="100"]

[layopt layer="message0" visible="false"]
[clearfix]
[stop_keyconfig]
[free_layermode time="10" wait="false"]
[reset_camera time="10" wait="false"]
[hidemenubutton]

[iscript]

$(".layer_camera").empty();
$("#bgmovie").remove();

TG.config.autoRecordLabel = "true";

/*
 * コンフィグ内のみで使用する変数
 *
 * tf.imgPath           画像類のパス
 * tf.uiConfig          画像のサイズや配置座標を格納したオブジェクト
 *
 * BGM_VOL_VALUES       BGM音量を格納している配列
 * SE_VOL_VALUES        効果音音量を格納している配列
 * CH_SPEED_VALUES      テキスト速度を格納している配列
 * AUTO_SPEED_VALUES    オート時のウェイトを格納している配列
 *
 * tf.configNumBgm      BGM音量のインデックス
 * tf.configNumSe       SE音量のインデックス
 * tf.configNumCh       テキスト速度のインデックス
 * tf.configNumAuto     オートウェイトのインデックス
 *
 * tf.currentBgmVol     BGM音量：現在のBGM音量
 * tf.currentSeVol      SE音量：現在のSE音量
 * tf.currentChSpeed    テキスト速度：現在のテキスト速度
 * tf.currentAutoSpeed  オートウェイト：現在のオートウェイト
 *
 * tf.textSkip          未読スキップ：現在の未読スキップの状態
 * tf.screenSize        画面サイズ：現在の画面サイズ
 *
 * sf.prevVolList       BGM、SE：BGMとSEの音量とインデックスを保存する配列
 *
*/

tf.imgPath = '../others/plugin/theme_kopanda_bth_09/image/config/';

tf.uiConfig = {
	imgBtn : tf.imgPath + 'c_btn.gif',

	gauge : {
		img     : tf.imgPath + 'gauge_act.png',
		imgHov  : tf.imgPath + 'gauge_hov.png',
		posx    : [0, 358, 422, 486, 550, 614, 678, 742, 806, 870, 934],
		posy    : [172, 252, 332, 412],
		width   : 48,
		height  : 48
	},

	mute : {
		imgBgm    : tf.imgPath + 'mute_act.png',
		imgSe     : tf.imgPath + 'mute_act.png',
		imgHov    : tf.imgPath + 'mute_hov.png',
		posBgm    : [1072, 172],
		posSe     : [1072, 252],
		width     : 48,
		height    : 48
	},

	skip : {
		imgOff    : tf.imgPath + 'skip_act.png',
		imgOn     : tf.imgPath + 'skip_act.png',
		imgHov    : tf.imgPath + 'skip_hov.png',
		posOff    : [360, 500],
		posOn     : [520, 500],
		width     : 132,
		height    : 32
	}
};

	// BGM Volume
	const BGM_VOL_VALUES    = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
	tf.currentBgmVol        = parseInt(TG.config.defaultBgmVolume);
	tf.configNumBgm         = BGM_VOL_VALUES.indexOf(tf.currentBgmVol);

	// SE Volume
	const SE_VOL_VALUES     = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
	tf.currentSeVol         = parseInt(TG.config.defaultSeVolume);
	tf.configNumSe          = SE_VOL_VALUES.indexOf(tf.currentSeVol);

	// Text Speed
	const CH_SPEED_VALUES   = [100, 80, 50, 40, 30, 25, 20, 11, 8, 5];
	tf.currentChSpeed       = parseInt(TG.config.chSpeed);
	tf.configNumCh          = CH_SPEED_VALUES.indexOf(tf.currentChSpeed);

	// Auto Text Speed
	const AUTO_SPEED_VALUES = [5000, 4500, 4000, 3500, 3000, 2500, 2000, 1300, 800, 500];
	tf.currentAutoSpeed     = parseInt(TG.config.autoSpeed);
	tf.configNumAuto        = AUTO_SPEED_VALUES.indexOf(tf.currentAutoSpeed);

	// 直前に選択していたBGM、SE音量を格納する配列
	sf.prevVolList = sf.prevVolList ?? [tf.currentBgmVol, tf.configNumBgm, tf.currentSeVol, tf.configNumSe];

	// 既読スキップの状態
	tf.text_skip ="ON";
		if(TG.config.unReadTextSkip != "true") {
			tf.text_skip ="OFF";
		}

[endscript]

[cm]

;-----------------------------------------------------------------------------------------------------------------------
; 背景
;-----------------------------------------------------------------------------------------------------------------------
[image storage="&tf.imgPath +'config_bg.jpg'" layer="base" x="0" y="0" width="1280" height="720" time="10"]

;-----------------------------------------------------------------------------------------------------------------------
; 戻るボタン
;-----------------------------------------------------------------------------------------------------------------------
[button fix="true" graphic="&tf.imgPath + 'btn_back.png'" enterimg="&tf.imgPath + 'btn_back_hov.png'" activeimg="&tf.imgPath + 'btn_back_clk.png'" target="*backtitle" x="1168" y="20"]

[jump target="*config_page"]

*config_page
[clearstack]
;-----------------------------------------------------------------------------------------------------------------------
; BGM音量
;-----------------------------------------------------------------------------------------------------------------------
[button name="bgmvol" fix="true" target="*vol_bgm_change" graphic="&tf.uiConfig.imgBtn" enterimg="&tf.uiConfig.gauge.imgHov" width="&tf.uiConfig.gauge.width" height="&tf.uiConfig.gauge.height" x="&tf.uiConfig.gauge.posx[1]"  y="&tf.uiConfig.gauge.posy[0]" exp="tf.currentBgmVol =  10; tf.configNumBgm =  1"]
[button name="bgmvol" fix="true" target="*vol_bgm_change" graphic="&tf.uiConfig.imgBtn" enterimg="&tf.uiConfig.gauge.imgHov" width="&tf.uiConfig.gauge.width" height="&tf.uiConfig.gauge.height" x="&tf.uiConfig.gauge.posx[2]"  y="&tf.uiConfig.gauge.posy[0]" exp="tf.currentBgmVol =  20; tf.configNumBgm =  2"]
[button name="bgmvol" fix="true" target="*vol_bgm_change" graphic="&tf.uiConfig.imgBtn" enterimg="&tf.uiConfig.gauge.imgHov" width="&tf.uiConfig.gauge.width" height="&tf.uiConfig.gauge.height" x="&tf.uiConfig.gauge.posx[3]"  y="&tf.uiConfig.gauge.posy[0]" exp="tf.currentBgmVol =  30; tf.configNumBgm =  3"]
[button name="bgmvol" fix="true" target="*vol_bgm_change" graphic="&tf.uiConfig.imgBtn" enterimg="&tf.uiConfig.gauge.imgHov" width="&tf.uiConfig.gauge.width" height="&tf.uiConfig.gauge.height" x="&tf.uiConfig.gauge.posx[4]"  y="&tf.uiConfig.gauge.posy[0]" exp="tf.currentBgmVol =  40; tf.configNumBgm =  4"]
[button name="bgmvol" fix="true" target="*vol_bgm_change" graphic="&tf.uiConfig.imgBtn" enterimg="&tf.uiConfig.gauge.imgHov" width="&tf.uiConfig.gauge.width" height="&tf.uiConfig.gauge.height" x="&tf.uiConfig.gauge.posx[5]"  y="&tf.uiConfig.gauge.posy[0]" exp="tf.currentBgmVol =  50; tf.configNumBgm =  5"]
[button name="bgmvol" fix="true" target="*vol_bgm_change" graphic="&tf.uiConfig.imgBtn" enterimg="&tf.uiConfig.gauge.imgHov" width="&tf.uiConfig.gauge.width" height="&tf.uiConfig.gauge.height" x="&tf.uiConfig.gauge.posx[6]"  y="&tf.uiConfig.gauge.posy[0]" exp="tf.currentBgmVol =  60; tf.configNumBgm =  6"]
[button name="bgmvol" fix="true" target="*vol_bgm_change" graphic="&tf.uiConfig.imgBtn" enterimg="&tf.uiConfig.gauge.imgHov" width="&tf.uiConfig.gauge.width" height="&tf.uiConfig.gauge.height" x="&tf.uiConfig.gauge.posx[7]"  y="&tf.uiConfig.gauge.posy[0]" exp="tf.currentBgmVol =  70; tf.configNumBgm =  7"]
[button name="bgmvol" fix="true" target="*vol_bgm_change" graphic="&tf.uiConfig.imgBtn" enterimg="&tf.uiConfig.gauge.imgHov" width="&tf.uiConfig.gauge.width" height="&tf.uiConfig.gauge.height" x="&tf.uiConfig.gauge.posx[8]"  y="&tf.uiConfig.gauge.posy[0]" exp="tf.currentBgmVol =  80; tf.configNumBgm =  8"]
[button name="bgmvol" fix="true" target="*vol_bgm_change" graphic="&tf.uiConfig.imgBtn" enterimg="&tf.uiConfig.gauge.imgHov" width="&tf.uiConfig.gauge.width" height="&tf.uiConfig.gauge.height" x="&tf.uiConfig.gauge.posx[9]"  y="&tf.uiConfig.gauge.posy[0]" exp="tf.currentBgmVol =  90; tf.configNumBgm =  9"]
[button name="bgmvol" fix="true" target="*vol_bgm_change" graphic="&tf.uiConfig.imgBtn" enterimg="&tf.uiConfig.gauge.imgHov" width="&tf.uiConfig.gauge.width" height="&tf.uiConfig.gauge.height" x="&tf.uiConfig.gauge.posx[10]" y="&tf.uiConfig.gauge.posy[0]" exp="tf.currentBgmVol = 100; tf.configNumBgm = 10"]

; BGMミュート
[button name="bgmvol" fix="true" target="*vol_bgm_mute" graphic="&tf.uiConfig.imgBtn" enterimg="&tf.uiConfig.mute.imgHov" width="&tf.uiConfig.mute.width" height="&tf.uiConfig.mute.height" x="&tf.uiConfig.mute.posBgm[0]" y="&tf.uiConfig.mute.posBgm[1]"]

;-----------------------------------------------------------------------------------------------------------------------
; SE音量
;-----------------------------------------------------------------------------------------------------------------------
[button name="sevol" fix="true" target="*vol_se_change" graphic="&tf.uiConfig.imgBtn" enterimg="&tf.uiConfig.gauge.imgHov" width="&tf.uiConfig.gauge.width" height="&tf.uiConfig.gauge.height" x="&tf.uiConfig.gauge.posx[1]"  y="&tf.uiConfig.gauge.posy[1]" exp="tf.currentSeVol =  10; tf.configNumSe =  1"]
[button name="sevol" fix="true" target="*vol_se_change" graphic="&tf.uiConfig.imgBtn" enterimg="&tf.uiConfig.gauge.imgHov" width="&tf.uiConfig.gauge.width" height="&tf.uiConfig.gauge.height" x="&tf.uiConfig.gauge.posx[2]"  y="&tf.uiConfig.gauge.posy[1]" exp="tf.currentSeVol =  20; tf.configNumSe =  2"]
[button name="sevol" fix="true" target="*vol_se_change" graphic="&tf.uiConfig.imgBtn" enterimg="&tf.uiConfig.gauge.imgHov" width="&tf.uiConfig.gauge.width" height="&tf.uiConfig.gauge.height" x="&tf.uiConfig.gauge.posx[3]"  y="&tf.uiConfig.gauge.posy[1]" exp="tf.currentSeVol =  30; tf.configNumSe =  3"]
[button name="sevol" fix="true" target="*vol_se_change" graphic="&tf.uiConfig.imgBtn" enterimg="&tf.uiConfig.gauge.imgHov" width="&tf.uiConfig.gauge.width" height="&tf.uiConfig.gauge.height" x="&tf.uiConfig.gauge.posx[4]"  y="&tf.uiConfig.gauge.posy[1]" exp="tf.currentSeVol =  40; tf.configNumSe =  4"]
[button name="sevol" fix="true" target="*vol_se_change" graphic="&tf.uiConfig.imgBtn" enterimg="&tf.uiConfig.gauge.imgHov" width="&tf.uiConfig.gauge.width" height="&tf.uiConfig.gauge.height" x="&tf.uiConfig.gauge.posx[5]"  y="&tf.uiConfig.gauge.posy[1]" exp="tf.currentSeVol =  50; tf.configNumSe =  5"]
[button name="sevol" fix="true" target="*vol_se_change" graphic="&tf.uiConfig.imgBtn" enterimg="&tf.uiConfig.gauge.imgHov" width="&tf.uiConfig.gauge.width" height="&tf.uiConfig.gauge.height" x="&tf.uiConfig.gauge.posx[6]"  y="&tf.uiConfig.gauge.posy[1]" exp="tf.currentSeVol =  60; tf.configNumSe =  6"]
[button name="sevol" fix="true" target="*vol_se_change" graphic="&tf.uiConfig.imgBtn" enterimg="&tf.uiConfig.gauge.imgHov" width="&tf.uiConfig.gauge.width" height="&tf.uiConfig.gauge.height" x="&tf.uiConfig.gauge.posx[7]"  y="&tf.uiConfig.gauge.posy[1]" exp="tf.currentSeVol =  70; tf.configNumSe =  7"]
[button name="sevol" fix="true" target="*vol_se_change" graphic="&tf.uiConfig.imgBtn" enterimg="&tf.uiConfig.gauge.imgHov" width="&tf.uiConfig.gauge.width" height="&tf.uiConfig.gauge.height" x="&tf.uiConfig.gauge.posx[8]"  y="&tf.uiConfig.gauge.posy[1]" exp="tf.currentSeVol =  80; tf.configNumSe =  8"]
[button name="sevol" fix="true" target="*vol_se_change" graphic="&tf.uiConfig.imgBtn" enterimg="&tf.uiConfig.gauge.imgHov" width="&tf.uiConfig.gauge.width" height="&tf.uiConfig.gauge.height" x="&tf.uiConfig.gauge.posx[9]"  y="&tf.uiConfig.gauge.posy[1]" exp="tf.currentSeVol =  90; tf.configNumSe =  9"]
[button name="sevol" fix="true" target="*vol_se_change" graphic="&tf.uiConfig.imgBtn" enterimg="&tf.uiConfig.gauge.imgHov" width="&tf.uiConfig.gauge.width" height="&tf.uiConfig.gauge.height" x="&tf.uiConfig.gauge.posx[10]" y="&tf.uiConfig.gauge.posy[1]" exp="tf.currentSeVol = 100; tf.configNumSe = 10"]

; SEミュート
[button name="sevol" fix="true" target="*vol_se_mute" graphic="&tf.uiConfig.imgBtn" enterimg="&tf.uiConfig.mute.imgHov" width="&tf.uiConfig.mute.width" height="&tf.uiConfig.mute.height" x="&tf.uiConfig.mute.posSe[0]" y="&tf.uiConfig.mute.posSe[1]"]

;-----------------------------------------------------------------------------------------------------------------------
; テキスト速度
;-----------------------------------------------------------------------------------------------------------------------
[button name="ch" fix="true" target="*ch_speed_change" graphic="&tf.uiConfig.imgBtn" enterimg="&tf.uiConfig.gauge.imgHov" width="&tf.uiConfig.gauge.width" height="&tf.uiConfig.gauge.height" x="&tf.uiConfig.gauge.posx[1]"  y="&tf.uiConfig.gauge.posy[2]" exp="tf.setChSpeed =100; tf.configNumCh = 0"]
[button name="ch" fix="true" target="*ch_speed_change" graphic="&tf.uiConfig.imgBtn" enterimg="&tf.uiConfig.gauge.imgHov" width="&tf.uiConfig.gauge.width" height="&tf.uiConfig.gauge.height" x="&tf.uiConfig.gauge.posx[2]"  y="&tf.uiConfig.gauge.posy[2]" exp="tf.setChSpeed = 80; tf.configNumCh = 1"]
[button name="ch" fix="true" target="*ch_speed_change" graphic="&tf.uiConfig.imgBtn" enterimg="&tf.uiConfig.gauge.imgHov" width="&tf.uiConfig.gauge.width" height="&tf.uiConfig.gauge.height" x="&tf.uiConfig.gauge.posx[3]"  y="&tf.uiConfig.gauge.posy[2]" exp="tf.setChSpeed = 50; tf.configNumCh = 2"]
[button name="ch" fix="true" target="*ch_speed_change" graphic="&tf.uiConfig.imgBtn" enterimg="&tf.uiConfig.gauge.imgHov" width="&tf.uiConfig.gauge.width" height="&tf.uiConfig.gauge.height" x="&tf.uiConfig.gauge.posx[4]"  y="&tf.uiConfig.gauge.posy[2]" exp="tf.setChSpeed = 40; tf.configNumCh = 3"]
[button name="ch" fix="true" target="*ch_speed_change" graphic="&tf.uiConfig.imgBtn" enterimg="&tf.uiConfig.gauge.imgHov" width="&tf.uiConfig.gauge.width" height="&tf.uiConfig.gauge.height" x="&tf.uiConfig.gauge.posx[5]"  y="&tf.uiConfig.gauge.posy[2]" exp="tf.setChSpeed = 30; tf.configNumCh = 4"]
[button name="ch" fix="true" target="*ch_speed_change" graphic="&tf.uiConfig.imgBtn" enterimg="&tf.uiConfig.gauge.imgHov" width="&tf.uiConfig.gauge.width" height="&tf.uiConfig.gauge.height" x="&tf.uiConfig.gauge.posx[6]"  y="&tf.uiConfig.gauge.posy[2]" exp="tf.setChSpeed = 25; tf.configNumCh = 5"]
[button name="ch" fix="true" target="*ch_speed_change" graphic="&tf.uiConfig.imgBtn" enterimg="&tf.uiConfig.gauge.imgHov" width="&tf.uiConfig.gauge.width" height="&tf.uiConfig.gauge.height" x="&tf.uiConfig.gauge.posx[7]"  y="&tf.uiConfig.gauge.posy[2]" exp="tf.setChSpeed = 20; tf.configNumCh = 6"]
[button name="ch" fix="true" target="*ch_speed_change" graphic="&tf.uiConfig.imgBtn" enterimg="&tf.uiConfig.gauge.imgHov" width="&tf.uiConfig.gauge.width" height="&tf.uiConfig.gauge.height" x="&tf.uiConfig.gauge.posx[8]"  y="&tf.uiConfig.gauge.posy[2]" exp="tf.setChSpeed = 11; tf.configNumCh = 7"]
[button name="ch" fix="true" target="*ch_speed_change" graphic="&tf.uiConfig.imgBtn" enterimg="&tf.uiConfig.gauge.imgHov" width="&tf.uiConfig.gauge.width" height="&tf.uiConfig.gauge.height" x="&tf.uiConfig.gauge.posx[9]"  y="&tf.uiConfig.gauge.posy[2]" exp="tf.setChSpeed =  8; tf.configNumCh = 8"]
[button name="ch" fix="true" target="*ch_speed_change" graphic="&tf.uiConfig.imgBtn" enterimg="&tf.uiConfig.gauge.imgHov" width="&tf.uiConfig.gauge.width" height="&tf.uiConfig.gauge.height" x="&tf.uiConfig.gauge.posx[10]" y="&tf.uiConfig.gauge.posy[2]" exp="tf.setChSpeed =  5; tf.configNumCh = 9"]

;-----------------------------------------------------------------------------------------------------------------------
; オートウェイト
;-----------------------------------------------------------------------------------------------------------------------
[button name="auto" fix="true" target="*auto_speed_change" graphic="&tf.uiConfig.imgBtn" enterimg="&tf.uiConfig.gauge.imgHov" width="&tf.uiConfig.gauge.width" height="&tf.uiConfig.gauge.height" x="&tf.uiConfig.gauge.posx[1]"  y="&tf.uiConfig.gauge.posy[3]" exp="tf.setAutoSpeed = 5000; tf.configNumAuto = 0"]
[button name="auto" fix="true" target="*auto_speed_change" graphic="&tf.uiConfig.imgBtn" enterimg="&tf.uiConfig.gauge.imgHov" width="&tf.uiConfig.gauge.width" height="&tf.uiConfig.gauge.height" x="&tf.uiConfig.gauge.posx[2]"  y="&tf.uiConfig.gauge.posy[3]" exp="tf.setAutoSpeed = 4500; tf.configNumAuto = 1"]
[button name="auto" fix="true" target="*auto_speed_change" graphic="&tf.uiConfig.imgBtn" enterimg="&tf.uiConfig.gauge.imgHov" width="&tf.uiConfig.gauge.width" height="&tf.uiConfig.gauge.height" x="&tf.uiConfig.gauge.posx[3]"  y="&tf.uiConfig.gauge.posy[3]" exp="tf.setAutoSpeed = 4000; tf.configNumAuto = 2"]
[button name="auto" fix="true" target="*auto_speed_change" graphic="&tf.uiConfig.imgBtn" enterimg="&tf.uiConfig.gauge.imgHov" width="&tf.uiConfig.gauge.width" height="&tf.uiConfig.gauge.height" x="&tf.uiConfig.gauge.posx[4]"  y="&tf.uiConfig.gauge.posy[3]" exp="tf.setAutoSpeed = 3500; tf.configNumAuto = 3"]
[button name="auto" fix="true" target="*auto_speed_change" graphic="&tf.uiConfig.imgBtn" enterimg="&tf.uiConfig.gauge.imgHov" width="&tf.uiConfig.gauge.width" height="&tf.uiConfig.gauge.height" x="&tf.uiConfig.gauge.posx[5]"  y="&tf.uiConfig.gauge.posy[3]" exp="tf.setAutoSpeed = 3000; tf.configNumAuto = 4"]
[button name="auto" fix="true" target="*auto_speed_change" graphic="&tf.uiConfig.imgBtn" enterimg="&tf.uiConfig.gauge.imgHov" width="&tf.uiConfig.gauge.width" height="&tf.uiConfig.gauge.height" x="&tf.uiConfig.gauge.posx[6]"  y="&tf.uiConfig.gauge.posy[3]" exp="tf.setAutoSpeed = 2500; tf.configNumAuto = 5"]
[button name="auto" fix="true" target="*auto_speed_change" graphic="&tf.uiConfig.imgBtn" enterimg="&tf.uiConfig.gauge.imgHov" width="&tf.uiConfig.gauge.width" height="&tf.uiConfig.gauge.height" x="&tf.uiConfig.gauge.posx[7]"  y="&tf.uiConfig.gauge.posy[3]" exp="tf.setAutoSpeed = 2000; tf.configNumAuto = 6"]
[button name="auto" fix="true" target="*auto_speed_change" graphic="&tf.uiConfig.imgBtn" enterimg="&tf.uiConfig.gauge.imgHov" width="&tf.uiConfig.gauge.width" height="&tf.uiConfig.gauge.height" x="&tf.uiConfig.gauge.posx[8]"  y="&tf.uiConfig.gauge.posy[3]" exp="tf.setAutoSpeed = 1300; tf.configNumAuto = 7"]
[button name="auto" fix="true" target="*auto_speed_change" graphic="&tf.uiConfig.imgBtn" enterimg="&tf.uiConfig.gauge.imgHov" width="&tf.uiConfig.gauge.width" height="&tf.uiConfig.gauge.height" x="&tf.uiConfig.gauge.posx[9]"  y="&tf.uiConfig.gauge.posy[3]" exp="tf.setAutoSpeed =  800; tf.configNumAuto = 8"]
[button name="auto" fix="true" target="*auto_speed_change" graphic="&tf.uiConfig.imgBtn" enterimg="&tf.uiConfig.gauge.imgHov" width="&tf.uiConfig.gauge.width" height="&tf.uiConfig.gauge.height" x="&tf.uiConfig.gauge.posx[10]" y="&tf.uiConfig.gauge.posy[3]" exp="tf.setAutoSpeed =  500; tf.configNumAuto = 9"]

;-----------------------------------------------------------------------------------------------------------------------
; 未読スキップ
;-----------------------------------------------------------------------------------------------------------------------
; 未読スキップ-OFF
[button name="unread_off" fix="true" target="*skip_off" graphic="&tf.uiConfig.imgBtn" enterimg="&tf.uiConfig.skip.imgHov" width="&tf.uiConfig.skip.width" height="&tf.uiConfig.skip.height" x="&tf.uiConfig.skip.posOff[0]" y="&tf.uiConfig.skip.posOff[1]"]

; 未読スキップ-ON
[button name="unread_on" fix="true" target="*skip_on"  graphic="&tf.uiConfig.imgBtn" enterimg="&tf.uiConfig.skip.imgHov" width="&tf.uiConfig.skip.width" height="&tf.uiConfig.skip.height" x="&tf.uiConfig.skip.posOn[0]" y="&tf.uiConfig.skip.posOn[1]"]

;-----------------------------------------------------------------------------------------------------------------------
; コンフィグ起動時に読み込み
;-----------------------------------------------------------------------------------------------------------------------
[layopt layer="0" visible="true"]

[call target="*load_bgm_img"]
[call target="*load_se_img"]
[call target="*load_ch_img"]
[call target="*load_auto_img"]
[call target="*load_skip_img"]

[test_message_start]

[mask_off time="300"]

[s]

;-----------------------------------------------------------------------------------------------------------------------
; コンフィグモード終了
;-----------------------------------------------------------------------------------------------------------------------
*backtitle
[mask time="250"]

[cm]
[layopt layer="message1" visible="false"]
[freeimage layer="0"]
[freeimage layer="base"]
[clearfix]
[clearstack]
[start_keyconfig]

[iscript]
	$(".layer_free").empty();
[endscript]

[mask_off time="10"]

[awakegame]



;=======================================================================================================================

; ボタンクリック時の処理

;=======================================================================================================================
;-----------------------------------------------------------------------------------------------------------------------
; BGM音量
;-----------------------------------------------------------------------------------------------------------------------
*vol_bgm_mute
[iscript]

if(tf.currentBgmVol != 0) {
	sf.prevVolList[0] = tf.currentBgmVol;
	sf.prevVolList[1] = tf.configNumBgm;
	tf.currentBgmVol = 0;
	tf.configNumBgm  = 0;
} else {
	tf.currentBgmVol = sf.prevVolList[0];
	tf.configNumBgm  = sf.prevVolList[1];
}

[endscript]

*vol_bgm_change
[free layer="0" name="bgmvol" time="0" wait="true"]
[call target="*load_bgm_img"]
[bgmopt volume="&tf.currentBgmVol"]

[return]

;-----------------------------------------------------------------------------------------------------------------------
; SE音量
;-----------------------------------------------------------------------------------------------------------------------
*vol_se_mute
[iscript]

if( tf.currentSeVol != 0 ) {
	sf.prevVolList[2] = tf.currentSeVol;
	sf.prevVolList[3] = tf.configNumSe;
	tf.currentSeVol = 0;
	tf.configNumSe  = 0;
} else {
	tf.currentSeVol = sf.prevVolList[2];
	tf.configNumSe  = sf.prevVolList[3];
}

[endscript]

*vol_se_change
[free layer="0" name="sevol" time="0" wait="true"]
[call target="*load_se_img"]
[seopt volume="&tf.currentSeVol"]

[return]

;-----------------------------------------------------------------------------------------------------------------------
; テキスト速度
;-----------------------------------------------------------------------------------------------------------------------
*ch_speed_change
[eval exp="tf.currentChSpeed = tf.setChSpeed"]
[free layer="0" name="ch" time="0" wait="true"]
[call target="*load_ch_img"]
[configdelay speed="&tf.setChSpeed"]
[test_message_reset]

[return]

;-----------------------------------------------------------------------------------------------------------------------
; オート時のウェイト
;-----------------------------------------------------------------------------------------------------------------------
*auto_speed_change
[eval exp="tf.currentAutoSpeed = tf.setAutoSpeed"]
[free layer="0" name="auto" time="0" wait="true"]
[call target="*load_auto_img"]
[autoconfig speed="&tf.setAutoSpeed"]

[return]

;-----------------------------------------------------------------------------------------------------------------------
; スキップ処理-ON
;-----------------------------------------------------------------------------------------------------------------------
*skip_on
[free layer="0" name="unread_off" time="10"]
[image layer="0" name="unread_on" storage="&tf.uiConfig.skip.imgOn" x="&tf.uiConfig.skip.posOn[0]" y="&tf.uiConfig.skip.posOn[1]"]
[config_record_label skip="true"]

[return]

;-----------------------------------------------------------------------------------------------------------------------
; スキップ処理-OFF
;-----------------------------------------------------------------------------------------------------------------------
*skip_off
[free layer="0" name="unread_on" time="10"]
[image layer="0" name="unread_off" storage="&tf.uiConfig.skip.imgOff" x="&tf.uiConfig.skip.posOff[0]" y="&tf.uiConfig.skip.posOff[1]"]
[config_record_label skip="false"]

[return]

;=======================================================================================================================

; 画像更新

;=======================================================================================================================
;-----------------------------------------------------------------------------------------------------------------------
*load_bgm_img
;-----------------------------------------------------------------------------------------------------------------------
[if exp="tf.configNumBgm == 0"]
	[image layer="0" name="bgmvol" storage="&tf.uiConfig.mute.imgBgm" x="&tf.uiConfig.mute.posBgm[0]" y="&tf.uiConfig.mute.posBgm[1]"]
[else]
	[image layer="0" name="bgmvol" storage="&tf.uiConfig.gauge.img" x="&tf.uiConfig.gauge.posx[tf.configNumBgm]" y="&tf.uiConfig.gauge.posy[0]"]
[endif]

[return]

;-----------------------------------------------------------------------------------------------------------------------
*load_se_img
;-----------------------------------------------------------------------------------------------------------------------
[if exp="tf.configNumSe == 0"]
	[image layer="0" name="sevol" storage="&tf.uiConfig.mute.imgSe" x="&tf.uiConfig.mute.posSe[0]" y="&tf.uiConfig.mute.posSe[1]"]
[else]
	[image layer="0" name="sevol" storage="&tf.uiConfig.gauge.img" x="&tf.uiConfig.gauge.posx[tf.configNumSe]" y="&tf.uiConfig.gauge.posy[1]"]
[endif]

[return]

;-----------------------------------------------------------------------------------------------------------------------
*load_ch_img
;-----------------------------------------------------------------------------------------------------------------------
[image layer="0" name="ch" storage="&tf.uiConfig.gauge.img" x="&tf.uiConfig.gauge.posx[tf.configNumCh + 1]" y="&tf.uiConfig.gauge.posy[2]"]

[return]

;-----------------------------------------------------------------------------------------------------------------------
*load_auto_img
;-----------------------------------------------------------------------------------------------------------------------
[image layer="0" name="auto" storage="&tf.uiConfig.gauge.img" x="&tf.uiConfig.gauge.posx[tf.configNumAuto + 1]" y="&tf.uiConfig.gauge.posy[3]"]

[return]

;-----------------------------------------------------------------------------------------------------------------------
*load_skip_img
;-----------------------------------------------------------------------------------------------------------------------
[if exp="tf.textSkip == 'ON'"]
	[image layer="0" name="unread_on" storage="&tf.uiConfig.skip.imgOn" x="&tf.uiConfig.skip.posOn[0]" y="&tf.uiConfig.skip.posOn[1]"]
[else]
	[image layer="0" name="unread_off" storage="&tf.uiConfig.skip.imgOff" x="&tf.uiConfig.skip.posOff[0]" y="&tf.uiConfig.skip.posOff[1]"]
[endif]

[return]
