# タスクリスト

- [x] 実装計画の作成・承認
- [x] `index.html` から「データ全削除」ボタンを削除
- [x] `app.js` から `clearAllData()` を削除
- [x] `js/sync-manager.js` の修正
  - [x] 全てのデータを週固有として読み込み・保存するよう修正
  - [x] `saveCurrentWeekAndLoadNew` でキャンセル時に週変更を中止するよう修正
- [x] `app.js` の `moveWeek` と `SyncManager.saveCurrentWeekAndLoadNew` の連携調整（キャンセル時に元の週に戻す/維持する）
- [x] ウォークスルー更新
