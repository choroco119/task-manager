# 工程割り当てフローの改善計画

工程表のセルを選択した際に、製番リストから選択し、続いて期間（曜日）を設定して確定するステップバイステップの操作フローを実装します。

## ユーザーレビューが必要な項目

> [!IMPORTANT]
> 製番リストは従来別ウィンドウで開いていましたが、今回の改修で同一ウィンドウ内の大型モーダルとしても表示できるようにします。別ウィンドウ版も引き続き利用可能ですが、セルクリック時のデフォルトはモーダルになります。

## 修正・新規作成ファイルの一覧

### [工程管理システム](c:\Users\kohei\.gemini\antigravity\scratch\web_project_manager)

#### [MODIFY] [index.html](file:///c:/Users/kohei/.gemini/antigravity/scratch/web_project_manager/index.html)
- `pj-view` をモーダルとして表示するために、既存の `overlay` ロジックと統合するか、専用のコンテナを追加します。
- `pj-view` 内に「閉じる」ボタンやタイトルバー（モーダル表示時用）を追加します。

#### [MODIFY] [style.css](file:///c:/Users/kohei/.gemini/antigravity/scratch/web_project_manager/style.css)
- `pj-view` をモーダルとして表示する際のスタイルを追加。
- 画面幅を最大限利用する大型モーダル用のスタイルを定義します。

#### [MODIFY] [app.js](file:///c:/Users/kohei/.gemini/antigravity/scratch/web_project_manager/app.js)
- `showA`: 新規セルのクリック時、直接製番リストモーダルを開くように変更。
- `selectSelf`: 同一ウィンドウ内での選択時に、自動的に割り当て詳細設定モーダル（`assignModal`）を開くように調整。
- `saveSchedule`: 新規割り当てが完了した際に `pendingAssign` をクリアし、適切に再描画する処理を確実にします。

## 検証計画

### 手動確認
- [ ] 空のセルをクリックして、製番リストがモーダルで開くか
- [ ] 製番を選択した後、直ちに割り当てモーダル（曜日選択）が開くか
- [ ] 曜日を調整して保存し、工程表に正しく反映されるか
- [ ] 既存の工程バーをクリックした際の編集フローが壊れていないか
- [ ] 既存の「別窓で開く」機能が、別ウィンドウモードで正常に動作するか
