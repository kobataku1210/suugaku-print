// =====================================================
//   生徒画面のいじり対策（A案：警告メッセージ + キー無効化）
// =====================================================
// 注：admin.html では読み込まないこと（先生は開発者ツールが使えなくなる）

(function() {
  'use strict';

  // ① コンソールに大きな警告メッセージを出す
  const warn1 = '%c⚠️ ちょっとまって！';
  const style1 = 'color:#ff3344;font-size:36px;font-weight:900;text-shadow:2px 2px 0 #000;background:#ffe;padding:6px 18px;border-radius:8px;';
  const warn2 = '%cここはプログラムを動かす画面だよ！';
  const style2 = 'color:#222;font-size:18px;font-weight:700;background:#ffd200;padding:4px 12px;border-radius:6px;';
  const warn3 = '%c勝手にコードを書き換えたり、データをいじるのは絶対にダメ！\n見つけたら先生に報告するから、すぐ閉じてね。';
  const style3 = 'color:#c00;font-size:14px;font-weight:600;background:#fff;padding:6px 12px;border-radius:6px;line-height:1.6;';
  console.log(warn1, style1);
  console.log(warn2, style2);
  console.log(warn3, style3);
  console.log('%c勉強がんばろう！🌱', 'color:#4ade80;font-size:14px;font-weight:700;');

  // ② キーボードショートカットを無効化
  //   F12 / Ctrl+Shift+I (Inspect) / Ctrl+Shift+J (Console)
  //   Ctrl+Shift+C (Element picker) / Ctrl+U (View source)
  document.addEventListener('keydown', function(e) {
    const k = (e.key || '').toLowerCase();
    if (k === 'f12') {
      e.preventDefault();
      return false;
    }
    if (e.ctrlKey && e.shiftKey && (k === 'i' || k === 'j' || k === 'c')) {
      e.preventDefault();
      return false;
    }
    if (e.ctrlKey && k === 'u') {
      e.preventDefault();
      return false;
    }
  });

  // ③ 右クリックメニューを無効化（入力欄では許可してコピペ可能に）
  document.addEventListener('contextmenu', function(e) {
    const tag = (e.target && e.target.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA') return; // 入力欄では右クリック有効
    e.preventDefault();
    return false;
  });
})();
