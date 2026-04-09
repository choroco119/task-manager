# 逆順割り当てフローの実装計画

製番リストで製番を選んだ後、工程表のセルをクリックして割り当てを行う「逆順フロー」を実装します。

## 変更内容

### [工程管理システム](c:\Users\kohei\.gemini\antigravity\scratch\web_project_manager)

#### [MODIFY] [index.html](file:///c:/Users/kohei/.gemini/antigravity/scratch/web_project_manager/index.html)
- 案内用バー `<div id="assignHint" class="assign-hint"></div>` をグリッド上部に追加します。

#### [MODIFY] [style.css](file:///c:/Users/kohei/.gemini/antigravity/scratch/web_project_manager/style.css)
- `.assign-hint` のスタイル（絶対配置、アニメーション、アクセントカラー）を定義します。

#### [MODIFY] [app.js](file:///c:/Users/kohei/.gemini/antigravity/scratch/web_project_manager/app.js)
- `this.pendingPid = null`: 状態管理用のプロパティを追加。
- `clearPendingPid()`: 状態をリセットし、案内バーを隠す関数を追加。
- `selectPjFromSub(signalValue)`: 
    - `pendingAssign`（先にセルを選んでいた場合）がない場合、`this.pendingPid` にセットし、案内バーを表示。
- `showA(idx, sid, ...)`: 
    - `this.pendingPid` がある場合はその製番を使って詳細設定を開くように分岐を追加。

## 検証計画

### 手動確認
- [ ] 別窓リストから「選択」した際、メイン画面に案内バーが出現するか。
- [ ] 案内バーが出ている状態でセルをクリックし、そのまま曜日選択画面へ遷移するか。
- [ ] 曜日選択を保存して正常に工程が作成されるか。
- [ ] 案内バーの「キャンセル」で元の状態に戻るか。
