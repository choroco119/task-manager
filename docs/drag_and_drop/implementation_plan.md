# JSONドラッグ＆ドロップの競合修正

工程表のセル（click-cell）上でJSONファイルをドロップした際に無視されてしまう問題を修正します。

## 現状の課題
現在、工程表のセルには「バーの移動」のためのドラッグ＆ドロップ用ハンドラ（`handleDragOver`, `handleDrop`など）が設定されています。これらのハンドラ内で `e.stopPropagation()` や `e.preventDefault()` が無条件に実行されているため、ファイルドロップ時にブラウザ全体のイベントハンドラまでイベントが到達せず、JSON読み込み機能が動作していません。

## 修正内容

### 1. 判定ロジックの共通化 [app.js](file:///c:/Users/kohei/.gemini/antigravity/scratch/web_project_manager/app.js)
`initDragAndDrop` 内に閉じていた「ファイルドラッグ判定」を `app.isFileDrag(e)` メソッドとして抽出し、他のハンドラからも参照可能にします。

### 2. グリッド用ハンドラの改修
以下のメソッドに「ファイルドラッグ時は何もしない（イベントを透過させる）」処理を追加します。
- `handleDragOver`
- `handleDragEnter`
- `handleDragLeave`
- `handleDrop`

これにより、ファイルをセル上に持っていった際は、セルのハイライトなどは行われず、背景にあるグローバルな「JSONドロップオーバーレイ」が正しく反応するようになります。

## 実施手順
1. `app.isFileDrag(e)` メソッドを新規追加。
2. `initDragAndDrop` を `this.isFileDrag(e)` を使うように修正。
3. `handleDragOver`, `handleDragEnter`, `handleDragLeave`, `handleDrop` の冒頭に `if (this.isFileDrag(e)) return;` を追加。

## 検証項目
- [ ] 工程表のセル上にJSONファイルをドロップして、データが読み込まれること。
- [ ] バー（予定）のドラッグ＆ドロップ移動が引き続き正常に動作すること。
- [ ] セルの外（ヘッダーなど）へのドロップも引き続き機能すること。
