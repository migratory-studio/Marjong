// メニュー画面にコンフィグへの遷移ボタンと画面サイズ切り替えボタンを設置
// スクリプト参照元「りまねの縦書き小説」さま（https://rimane-novels.net/）

var myobj = {

  // コンフィグ画面遷移用のオブジェクト
  config: function() {
    if (tyrano.plugin.kag.tmp.sleep_game != null) {
      return false;
    }
    TYRANO.kag.ftag.startTag("sleepgame", {
      storage: "../others/plugin/theme_kopanda_bth_09/config.ks",
      next: false
    });
    setTimeout(function() {
      $('.layer.layer_menu').css({
        'display': 'none'
      });
    }, 100);
  },
};

// システムボタン専用のhoverアニメ
$(document).on("mouseenter", ".role_button", function() {
  $(this).css("transform", "scale(1.03)");
  $(this).addClass("role_button_blink");
});

$(document).on("mouseleave", ".role_button", function() {
  $(this).css("transform", "scale(1)");
  $(this).removeClass("role_button_blink");
});
