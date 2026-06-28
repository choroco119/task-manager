# 週別データ保存機能の仕様変更 実装計画

ユーザー様からの追加のご要望に基づき、以下の変更を実施します。

## 1. 変更内容

### A. 全てのデータを週データ固有とする
- これまで `teams`, `staff`, `projects` などを「共有データ」として切り替え先でも維持する形にしていましたが、**全てのデータ（チーム、スタッフ、プロジェクト、タグ、スケジュール、休日設定等すべて）を週固有データ**とします。
- 週を切り替えると、その週のファイル（`data_yyyymmdd.json`）に保存されている状態に完全に切り替わります。

### B. 引き継ぎダイアログキャンセル時の挙動変更
- 週を切り替える際、切り替え先の週データファイルが存在しない場合にダイアログを表示します。
  - **[OK]**: 現在の週のすべてのデータを引き継いで、切り替え先の新規週ファイルを作成し、週を切り替えます。
  - **[キャンセル]**: 新規ファイルは作成せず、**週の切り替え処理自体をキャンセルして元の週にとどまります**。

### C. データ全削除機能の削除
- `index.html` にある「データ全削除」ボタンを削除します。
- `app.js` に定義されている `clearAllData()` メソッドを削除します。

---

## 2. 具体的なファイル修正箇所

### [MODIFY] [sync-manager.js](file:///c:/Users/kohei/.gemini/antigravity-ide/scratch/web_project_manager/js/sync-manager.js)
- `saveCurrentWeekAndLoadNew(newMondayISO)` の修正:
  - 変更先の週ファイルが存在しない場合のダイアログ文言を変更。
  - キャンセル選択時は、現在の週の保存処理は行うかもしれませんが、最終的に `_applyWeekData(newMondayISO)` を呼ばず、エラーメッセージやトーストを出さずに元の週の表示を維持します。
  - `_applyWeekData(mondayISO)` の修正:
    - 以前は `teams` や `staff` などの一部データをマージする（または保持する）ような処理を行っていましたが、全てのデータを上書きする単純な適用処理に変更します。

### [MODIFY] [app.js](file:///c:/Users/kohei/.gemini/antigravity-ide/scratch/web_project_manager/app.js)
- `clearAllData()` メソッドの削除。
- `moveWeek(n)` 内で `saveCurrentWeekAndLoadNew` がキャンセルされた場合に、ローカルの `app.state.monday` が切り替わってしまわないように戻す、もしくは `SyncManager.saveCurrentWeekAndLoadNew` の戻り値で成否を判定できるようにします。

### [MODIFY] [index.html](file:///c:/Users/kohei/.gemini/antigravity-ide/scratch/web_project_manager/index.html)
- `データ全削除` ボタン（`id` なし、`onclick="app.clearAllData()"`）のタグを削除。

---

## 3. 検証計画
- （検証はユーザー様側で行われるため、本フェーズでのテストコマンド実行は行いません）
