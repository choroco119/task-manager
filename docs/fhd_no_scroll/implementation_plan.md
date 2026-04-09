# スクロールレス・レイアウト（FHD最適化）の実装計画

1920pxの解像度において、横スクロールを発生させずに全情報を一画面に収容するための調整を行います。

## 変更内容

### [工程管理システム](c:\Users\kohei\.gemini\antigravity\scratch\web_project_manager)

#### [MODIFY] [style.css](file:///c:/Users/kohei/.gemini/antigravity/scratch/web_project_manager/style.css)
- **レイアウト変数の微調整**:
    - `--sidebar-width`: 284px -> 240px（省スペース化）
    - `--col-width`: 240px -> `1fr`（可変幅へ変更）
- **グリッドコンテナの刷新**:
    - `grid-template-columns`: `var(--sidebar-width) repeat(7, 1fr) 100px` に変更し、親要素（scheduler-card）の幅に100%フィットさせます。
- **詳細パネル (`detail-panel`)**:
    - 幅を 480px -> 420px に調整し、中央のメイングリッドを広げます。
- **工程バー (`.bar`)**:
    - フォントサイズ: `0.8rem`
    - パディング: `0 6px`
    - 行間の最適化を行い、文字の重なりを最小限に抑えます。

#### [MODIFY] [app.js](file:///c:/Users/kohei/.gemini/antigravity/scratch/web_project_manager/app.js)
- **バー内のテキスト生成**:
    - 狭い幅でも情報が伝わるよう、アイコンを活用し、指令書Noの表示形式を整理します。

## 検証計画

### 手動確認
- [ ] 1920x1080の全画面表示で、横スクロールバーが出現しないことを確認。
- [ ] ウィンドウサイズを少し変えても、曜日の7列が均等に伸縮することを確認。
- [ ] 詳細パネルの情報が欠けることなく、420px幅で読み取れるか確認。
