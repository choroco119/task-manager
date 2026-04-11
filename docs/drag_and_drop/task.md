# タスクリスト: JSONドラッグ＆ドロップ競合修正

- [x] (1) `app.js` に `app.isFileDrag(e)` メソッドを実装
- [x] (2) `initDragAndDrop` を `this.isFileDrag(e)` を使うように修正
- [x] (3) 以下の各種ハンドラに `if (this.isFileDrag(e)) return;` を追加
    - [x] `handleDragOver`
    - [x] `handleDragEnter`
    - [x] `handleDragLeave`
    - [x] `handleDrop`
- [x] (4) 実機相当の動作確認（コードロジックの再点検）
- [x] (5) `walkthrough.md` の作成
