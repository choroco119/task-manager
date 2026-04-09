# データ全削除ボタンの追加

ユーザーがブラウザ内に保存されたすべてのデータを一括で削除できる機能を追加します。

## ユーザーレビューが必要な項目

> [!CAUTION]
> **データの完全消去について**
> 「データを全削除」を実行すると、ブラウザの `localStorage` に保存されているすべてのプロジェクト、案件、スケジュール、メンバー情報が削除され、復元はできません（バックアップがある場合を除く）。誤操作防止のため、実行前に確認ダイアログを表示します。

## 変更内容

### UI構成

#### [MODIFY] [index.html](file:///c:/Users/kohei/.gemini/antigravity/scratch/web_project_manager/index.html)
- ヘッダーの `controls` エリアに「データを全削除」ボタンを追加します。誤操作を防ぐため、他のボタンから少し離れた位置、または目立つ赤色（dangerスタイル）で配置します。

### アプリケーションロジック

#### [MODIFY] [app.js](file:///c:/Users/kohei/.gemini/antigravity/scratch/web_project_manager/app.js)
- `clearAllData()` メソッドの実装
    - `confirm()` によりユーザーに最終確認を行います。
    - `this.state` を初期状態（空の配列など）にリセットします。
    - `localStorage.removeItem('scheduler_app_state')` を実行、または空の状態で `saveConfig()` を呼び出します。
    - `location.reload()` または `render()` を呼び出して画面を初期化します。

### スタイル

#### [MODIFY] [style.css](file:///c:/Users/kohei/.gemini/antigravity/scratch/web_project_manager/style.css)
- `.btn-danger` のホバースタイルを調整し、危険な操作であることが視覚的に伝わるようにします（ホバー時に背景を赤くするなど）。

## 検証計画

### 手動確認
1. ヘッダーに「データを全削除」ボタンが表示されていることを確認。
2. ボタンをクリックした際、ブラウザの確認ダイアログが表示されることを確認。
3. 「キャンセル」を押した場合はデータが残っていることを確認。
4. 「OK」を押した後、画面上のすべてのデータ（グリッドの予定、製番リスト、メンバー）が消去され、初期状態に戻ることを確認。
5. 再読み込みしてもデータが空のままであること（正常にストレージがクリアされていること）を確認。
