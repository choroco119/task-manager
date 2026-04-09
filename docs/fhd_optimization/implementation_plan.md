# FHD環境へのUIデザイン最適化の実装計画

FHD（1920x1080）ディスプレイをメイン環境とし、プロフェッショナルな管理ツールにふさわしい視認性とレイアウトを実現します。

## 変更内容

### [工程管理システム](c:\Users\kohei\.gemini\antigravity\scratch\web_project_manager)

#### [MODIFY] [style.css](file:///c:/Users/kohei/.gemini/antigravity/scratch/web_project_manager/style.css)
- **レイアウト変数の更新**:
    - `--sidebar-width`: 280px に拡張し、氏名の視認性を向上。
    - `--row-height`: 120px に拡張し、縦方向の情報の密度を最適化。
- **コンテナ・カードの調整**:
    - `main` のパディングを `2rem` に調整し、広い画面でのゆとりを演出。
    - `scheduler-card` の影とボーダーを調整し、立体感を向上。
- **詳細パネル (`detail-panel`)**:
    - 幅を 480px に拡張。
    - フォントサイズを調整し、大画面での読みやすさを追求。
- **製番リスト (`pj-view` / `m-table`)**:
    - 表全体の横幅を 100% に固定しつつ、各列の優先度に応じた幅（min-width）を設定。
    - ヘッダーを `sticky` 固定にし、縦スクロール時も項目を見失わないように改善。
    - 入力フィールド (`textarea`) のフォントサイズを `0.95rem` に。

#### [MODIFY] [app.js](file:///c:/Users/kohei/.gemini/antigravity/scratch/web_project_manager/app.js)
- **バー描画ロジック (`drawBars`)**:
    - 高さ `120px` に合わせたバーの垂直位置計算を微調整。
    - バー内のテキストにアイコンや適切な余白を追加。

## 検証計画

### 手動確認
- [ ] FHD画面で横スクロールが発生した際の操作感が滑らかか。
- [ ] 製番リストを最大化した際、1920pxの広さを活かして全11列が重ならずに読み取れるか。
- [ ] 詳細パネルの情報（納期、客先等）が以前より強調され、把握しやすくなっているか。
