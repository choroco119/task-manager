# 工数集計機能の実装計画

工程管理の透明性を高めるため、個人単位の週合計工数と、チーム単位の統計情報（合計・平均）を表示する機能を実装します。

## 変更内容

### [工程管理システム](c:\Users\kohei\.gemini\antigravity\scratch\web_project_manager)

#### [MODIFY] [index.html](file:///c:/Users/kohei/.gemini/antigravity/scratch/web_project_manager/index.html)
- グリッド下部に集計情報を表示するためのコンテナ `<div id="statsArea"></div>` を追加します。

#### [MODIFY] [style.css](file:///c:/Users/kohei/.gemini/antigravity/scratch/web_project_manager/style.css)
- `grid-container` の列定義を修正し、右端に `120px` の合計列を追加します。
- 合計列（`.col-total`、`.grid-total-cell`）のスタイルを追加。
- 集計エリア（`#statsArea`）のグリッド配置やカードスタイルの詳細を定義します。

#### [MODIFY] [app.js](file:///c:/Users/kohei/.gemini/antigravity/scratch/web_project_manager/app.js)
- `parseManHours(str)`: 「30Hx2」などの文字列から数値を算出するヘルパー関数を実装します。
- `renderGrid`: 各行に個人合計を計算し表示するロジックを追加。
- `renderStats`: チームごとの合計・平均工数を集計し、描画する関数を追加。
- `render`: `renderStats` を最後に呼び出すように更新。

## 検証計画

### 手動確認
- [ ] 各個人の右側に正しく合計工数が表示されているか
- [ ] 下部の集計エリアにチーム名のリストと、それぞれの合計・平均工数が表示されているか
- [ ] 数値を含まない工数データ（空文字など）が計算結果を壊さないか
