# 作業完了報告：データ全削除ボタンの追加

ブラウザに保存されたデータをユーザーが意図的に一括消去できる機能を追加しました。

## 実施内容

### 1. UIの変更
ヘッダーの操作エリアに「データを全削除」ボタンを追加しました。
- 他の操作と区別できるよう、赤色の境界線（hover時に赤背景）の「danger」スタイルを適用しています。
- [index.html](file:///c:/Users/kohei/.gemini/antigravity/scratch/web_project_manager/index.html)

### 2. ロジックの実装
`app.js` に `clearAllData()` メソッドを実装しました。
- 実行前にブラウザ標準の確認ダイアログを表示し、誤操作を防止します。
- 確定後は `localStorage` をクリアし、ページをリロードして初期状態に戻します。
- [app.js](file:///c:/Users/kohei/.gemini/antigravity/scratch/web_project_manager/app.js)

### 3. スタイルの改善
`.btn-danger` クラスに対し、ホバー時の視覚フィードバックを強化しました。
- [style.css](file:///c:/Users/kohei/.gemini/antigravity/scratch/web_project_manager/style.css)

## 検証結果

### 動作確認済
- [x] ボタンがヘッダーの期待通りの位置に表示されている。
- [x] クリック時に「削除しますか？」の確認ダイアログが出る。
- [x] 「OK」を押すとデータが完全に消え、画面が初期状態にリセットされる。
- [x] ホバー時にボタンが赤く塗りつぶされ、危険な操作であることが視覚的にわかる。

---
> [!IMPORTANT]
> この操作を行うと、ブラウザ内に保存された**すべての情報（プロジェクト、案件、スケジュール、メンバー）が消去されます**。重要なデータがある場合は、「データを出力」ボタンであらかじめJSONバックアップを取っておくことをお勧めします。
