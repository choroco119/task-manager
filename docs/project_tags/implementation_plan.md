# 製番へのタグ登録・選択機能（マスター管理方式）の実装計画

ユーザーがあらかじめ登録したタグの中から、各案件（製番）に対して1つだけタグを選択できるようにします。また、タグによるフィルタリングや詳細表示にも対応します。

## ユーザー要求事項の整理

- [x] **マスター管理**: タグは事前に登録したものから選択する。
- [x] **単一選択**: 1つの案件に付与できるタグは1つのみ。
- [x] **ドロップダウン検索**: フィルタリングはプルダウンメニューで行う。
- [x] **レイアウト指定**:
    - リストでは「備考」と「操作」の間にタグ列を追加。
    - 「タグ管理」ボタンをヘッダー（上部）に配置。

## 変更内容

### app.js (ロジック・データ管理)

#### [MODIFY] [app.js](file:///c:/Users/kohei/.gemini/antigravity/scratch/web_project_manager/app.js)
- `state` に `tags` 配列を追加（マスターデータ用）。
- `pjFilters` に `tagId` を追加。
- `memberModal` に「タグ設定」タブを追加し、タグの追加・編集・削除を行えるようにします。
- `renderProjectBody` を更新し、備考列の後にタグ選択用の `<select>` を追加します。
- `showPjDetail` を更新し、選択されたタグをバッジ形式で表示します。
- `validateIntegrity` で、削除されたタグを参照している案件のクリーンアップ処理を追加します。

### index.html (UI構成)

#### [MODIFY] [index.html](file:///c:/Users/kohei/.gemini/antigravity/scratch/web_project_manager/index.html)
- ヘッダーのコントロールエリアに「タグ管理」ボタンを追加します。
- 検索バー（`pj-search-bar`）に、タグ選択用の `<select id="fltTag">` を追加します。
- `memberModal` のタブ構成に「タグ設定」を追加します。

### style.css (デザイン)

#### [MODIFY] [style.css](file:///c:/Users/kohei/.gemini/antigravity/scratch/web_project_manager/style.css)
- `.tag-badge` のデザイン定義。
- タグ列（`.col-tag`）の幅設定と、ドロップダウンメニューのスタイル調整。

## 検証プラン

### 自動テスト (ブラウザ操作)
- [ ] タグ管理から新しいタグを登録し、保存されることを確認。
- [ ] 製番リストで登録したタグを選択し、詳細パネルに反映されることを確認。
- [ ] 検索バーのドロップダウンでタグを選択し、フィルタリングが正しく機能することを確認。

### 手動確認
- タグを削除した際、そのタグが付与されていた案件の表示が適切（「未設定」など）に戻ることを確認。
