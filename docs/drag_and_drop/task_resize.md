# タスク状況: ドラッグによる期間変更（リサイズ）機能

- [x] `style.css` に `.resize-handle-left` と `.resize-handle-right` のスタイルを追加
- [x] `app.js` の `drawBars` で各 `.bar` に左右のハンドルDOM要素を追加
- [x] `app.js` にリサイズ用のマウスイベントリスナー（mousedown, mousemove, mouseup）の基盤を追加
- [x] リサイズ中のピクセル移動量からグリッド上のマス（日数）の変動を計算するロジックを実装
- [x] リサイズ操作中は親要素である `.bar` のドラッグ（D&D）を無効化する制御を追加
- [x] `mouseup` 時に `task.startIdx` や `task.endIdx` を更新し保存・再描画
- [x] 動作確認
- [x] `walkthrough.md` の更新
