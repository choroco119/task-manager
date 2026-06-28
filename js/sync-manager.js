/**
 * 同期管理マネージャー
 * File System Access API を使用したファイルの読み書き、同期、ロック制御を担当します。
 * v2.0: 週別データ保存対応 (data_yyyymmdd.json)
 */

const SyncManager = {
    // 定数
    DB_NAME: 'SchedulerSyncDB',
    STORE_NAME: 'Settings',
    KEY_NAME: 'sync-directory',
    LEGACY_FILE: 'data.json', // 旧ファイル名（後方互換）

    // 同期状態変数
    dirHandle: null,
    lastLoadedData: null, // 競合検知用
    lastFsModified: 0, // ファイルシステム上の最終更新時刻
    syncInterval: null, // 自動同期のタイマー
    isSaving: false, // 二重保存防止

    // ─────────────────────────────────────────
    // 週別ファイル ユーティリティ
    // ─────────────────────────────────────────

    /**
     * 月曜日のISO文字列からファイル名を生成
     * @param {string} mondayISO  例: "2026-06-22T00:00:00.000Z"
     * @returns {string}          例: "data_20260622.json"
     */
    getWeekFileName(mondayISO) {
        const d = new Date(mondayISO);
        // ローカル時刻で yyyymmdd を生成
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `data_${yyyy}${mm}${dd}.json`;
    },

    /**
     * 月曜日のISO文字列から yyyymmdd 文字列を生成
     * @param {string} mondayISO
     * @returns {string}  例: "20260622"
     */
    getMondayKey(mondayISO) {
        const d = new Date(mondayISO);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}${mm}${dd}`;
    },

    /**
     * 指定週のファイルが存在するか確認
     * @param {string} mondayISO
     * @returns {Promise<boolean>}
     */
    async weekFileExists(mondayISO) {
        if (!this.dirHandle) return false;
        try {
            await this.dirHandle.getFileHandle(this.getWeekFileName(mondayISO), { create: false });
            return true;
        } catch (e) {
            return false;
        }
    },

    /**
     * 指定週のデータを読み込む（存在しなければ null を返す）
     * @param {string} mondayISO
     * @returns {Promise<object|null>}
     */
    async loadWeek(mondayISO) {
        if (!this.dirHandle) return null;
        const fileName = this.getWeekFileName(mondayISO);
        try {
            const fileHandle = await this.dirHandle.getFileHandle(fileName, { create: false });
            const file = await fileHandle.getFile();
            const content = await file.text();
            if (!content || content.trim() === '') return null;
            return JSON.parse(content);
        } catch (e) {
            return null;
        }
    },

    // ─────────────────────────────────────────
    // フォルダ接続
    // ─────────────────────────────────────────

    /**
     * 保存されたフォルダハンドルを確認し、可能であれば接続する
     */
    async checkStoredFolder() {
        try {
            const handle = await this.getStoredHandle();
            if (handle) {
                // 保存されたハンドルがある場合、UIを更新
                const quickSyncBtn = document.getElementById('quick-sync-btn');
                if (quickSyncBtn) {
                    quickSyncBtn.style.display = 'inline-flex';
                    quickSyncBtn.title = `記憶されたフォルダ: ${handle.name}`;
                }
                
                // 権限があるか確認
                if (await handle.queryPermission({ mode: 'readwrite' }) === 'granted') {
                    await this.connectToFolder(handle);
                }
            }
        } catch (e) {
            console.error('Failed to check stored folder:', e);
        }
    },

    /**
     * フォルダに接続する（新規選択または保存済みからの復元）
     * @param {FileSystemDirectoryHandle} existingHandle 
     */
    async connectToFolder(existingHandle = null) {
        // APIサポートチェック
        if (!window.showDirectoryPicker) {
            alert('お使いのブラウザ環境では同期機能（File System Access API）がサポートされていません。\nHTTPS接続、または localhost でのアクセスが必要です。');
            return;
        }

        try {
            if (existingHandle) {
                this.dirHandle = existingHandle;
                if (await this.dirHandle.queryPermission({ mode: 'readwrite' }) !== 'granted') {
                    if (await this.dirHandle.requestPermission({ mode: 'readwrite' }) !== 'granted') {
                        return;
                    }
                }
            } else {
                this.dirHandle = await window.showDirectoryPicker();
                await this.storeHandle(this.dirHandle);
                const quickSyncBtn = document.getElementById('quick-sync-btn');
                if (quickSyncBtn) {
                    quickSyncBtn.style.display = 'inline-flex';
                    quickSyncBtn.title = `記憶されたフォルダ: ${this.dirHandle.name}`;
                }
            }
            
            await this.loadFromFolder();
            this.updateSyncStatusUI('connected');
            this.showToast('同期フォルダに接続しました');
            this.startAutoSync();
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error('Folder connection failed:', err);
                alert('フォルダ接続に失敗しました: ' + err.message);
            }
        }
    },

    // ─────────────────────────────────────────
    // データ読み込み
    // ─────────────────────────────────────────

    /**
     * 共有フォルダから現在の週のデータを読み込む
     * 旧 data.json からの移行も処理する
     */
    async loadFromFolder() {
        if (!this.dirHandle) return;
        const mondayISO = app.state.monday;
        const weekFileName = this.getWeekFileName(mondayISO);

        try {
            let fileHandle;
            let isLegacy = false;

            // 週別ファイルを優先して探す
            try {
                fileHandle = await this.dirHandle.getFileHandle(weekFileName, { create: false });
            } catch (e) {
                // 週別ファイルがない場合、旧 data.json を確認（移行処理）
                try {
                    fileHandle = await this.dirHandle.getFileHandle(this.LEGACY_FILE, { create: false });
                    isLegacy = true;
                } catch (e2) {
                    // どちらもない場合は現在のstateを新週ファイルとして保存
                    await this.saveWeekToFolder(mondayISO, app.state);
                    return;
                }
            }

            const file = await fileHandle.getFile();
            const content = await file.text();

            if (!content || content.trim() === '') {
                // 空ファイルの場合は現在のstateを保存
                await this.saveWeekToFolder(mondayISO, app.state);
                return;
            }

            const data = JSON.parse(content);

            if (data.projects) {
                // monday と team は共有データに含まないため、ロード前のローカル状態を保持する
                const localMonday = app.state.monday;
                const localTeam = app.state.team;

                // 状態を上書き
                Object.assign(app.state, data);

                // ローカル状態を再設定
                if (localMonday) app.state.monday = localMonday;
                if (localTeam) app.state.team = localTeam;

                // 競合検知用のバックアップを保存
                this.lastLoadedData = JSON.parse(JSON.stringify(data));
                this.lastFsModified = file.lastModified;

                // UIの更新と整合性チェック
                app.validateIntegrity();
                app.render();

                this.updateSyncStatusUI('connected');

                // バックアップ作成
                await this.saveToDailyBackup(data);

                // 旧ファイルからの移行: 週別ファイルとして保存
                if (isLegacy) {
                    await this.saveWeekToFolder(mondayISO, data);
                    this.showToast('旧データを週別形式へ移行しました');
                }
            }
        } catch (err) {
            console.error('Loading failed:', err);
            this.showToast('データの読み込みに失敗しました');
        }
    },

    // ─────────────────────────────────────────
    // 週切り替え
    // ─────────────────────────────────────────

    /**
     * 現在の週データを保存してから指定週に切り替える
     * 対象週のファイルが存在しない場合はダイアログで確認
     * @param {string} newMondayISO  切り替え先の月曜日のISO文字列
     */
    async saveCurrentWeekAndLoadNew(newMondayISO) {
        if (!this.dirHandle) return false;

        const currentMondayISO = app.state.monday;

        try {
            // 1. 現在の週データを保存
            const saveData = this._buildSaveData(currentMondayISO);
            await this.saveWeekToFolder(currentMondayISO, saveData);
            this.showToast('現在の週データを保存しました');
        } catch (err) {
            console.error('Save current week failed:', err);
            this.showToast('現在週の保存に失敗しました');
        }

        // 2. 切り替え先のファイルが存在するか確認
        const exists = await this.weekFileExists(newMondayISO);

        if (exists) {
            // 既存ファイルを読み込む
            await this._applyWeekData(newMondayISO);
            return true;
        } else {
            // 新週: ユーザーに引き継ぎを確認
            const newMon = new Date(newMondayISO);
            const currentMon = new Date(currentMondayISO);
            const fmt = d => `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;

            const inherit = confirm(
                `📅 ${fmt(newMon)} 週のデータが存在しません。\n\n` +
                `現在の週 (${fmt(currentMon)}) のデータを引き継いで新しい週のデータを作成しますか？\n\n` +
                `[OK] 引き継いで作成　　[キャンセル] 週の変更を中止する`
            );

            if (inherit) {
                // 現在のデータを引き継いで新週ファイル作成
                const newData = this._buildSaveData(currentMondayISO);
                newData.lastUpdated = new Date().toISOString();
                await this.saveWeekToFolder(newMondayISO, newData);
                this.showToast('データを引き継いで新しい週を作成しました');
                
                // 作成したファイルを読み込む
                await this._applyWeekData(newMondayISO);
                return true;
            } else {
                // キャンセルした時は週を変更しない
                return false;
            }
        }
    },

    /**
     * 週データをstateに適用してUIを更新する（内部用）
     * @param {string} mondayISO
     */
    async _applyWeekData(mondayISO) {
        const data = await this.loadWeek(mondayISO);
        if (data && data.projects) {
            const localTeam = app.state.team;

            // 完全に state を週データで上書きする（すべてのデータを週固有とする）
            Object.assign(app.state, data);

            // ローカル状態を再設定
            app.state.monday = mondayISO;
            app.state.team = localTeam;

            this.lastLoadedData = JSON.parse(JSON.stringify(data));

            try {
                const fileHandle = await this.dirHandle.getFileHandle(this.getWeekFileName(mondayISO));
                const file = await fileHandle.getFile();
                this.lastFsModified = file.lastModified;
            } catch (e) {}

            app.validateIntegrity();
            app.render();
        } else {
            // データがない場合はmondayだけ更新して全てのデータを空にする
            app.state.monday = mondayISO;
            app.state.teams = [];
            app.state.staff = [];
            app.state.tags = [];
            app.state.projects = [];
            app.state.deletedProjects = [];
            app.state.specialItems = [];
            app.state.schedule = [];
            app.state.holidays = [];
            
            app.validateIntegrity();
            app.render();
        }
    },

    // ─────────────────────────────────────────
    // データ保存
    // ─────────────────────────────────────────

    /**
     * 同期保存（ロック制御・競合チェックを含む）
     * @param {boolean} isAutoSave 
     */
    async saveWithSync(isAutoSave = false) {
        if (!this.dirHandle) {
            if (!isAutoSave) alert('同期フォルダが設定されていません。');
            return;
        }

        if (this.isSaving) return;
        this.isSaving = true;
        this.updateSyncStatusUI('locked');

        const mondayISO = app.state.monday;
        const weekFileName = this.getWeekFileName(mondayISO);

        try {
            // 1. ロック制御
            const locked = await this.acquireLock();
            if (!locked) {
                this.isSaving = false;
                this.updateSyncStatusUI('connected');
                return;
            }

            // 2. 競合チェック
            let fileHandle;
            try {
                fileHandle = await this.dirHandle.getFileHandle(weekFileName, { create: false });
            } catch (e) {
                // 週別ファイルがまだない場合はスキップ
                fileHandle = null;
            }

            if (fileHandle) {
                const file = await fileHandle.getFile();
                const content = await file.text();
                if (content && content.trim()) {
                    const currentFileData = JSON.parse(content);
                    if (currentFileData.lastUpdated && this.lastLoadedData && currentFileData.lastUpdated !== this.lastLoadedData.lastUpdated) {
                        alert('編集中に他の人がデータを更新しました。最新データを読み込みます。');
                        await this.releaseLock();
                        await this.loadFromFolder();
                        this.isSaving = false;
                        this.updateSyncStatusUI('connected');
                        return;
                    }
                }
            }

            // 3. 書き込み
            const saveData = this._buildSaveData(mondayISO);
            saveData.lastUpdated = new Date().toISOString();
            await this.saveWeekToFolder(mondayISO, saveData);

            this.lastLoadedData = JSON.parse(JSON.stringify(saveData));

            const updatedHandle = await this.dirHandle.getFileHandle(weekFileName, { create: false });
            const updatedFile = await updatedHandle.getFile();
            this.lastFsModified = updatedFile.lastModified;

            // 4. ロック解除
            await this.releaseLock();
            if (!isAutoSave) {
                this.showToast('データを同期しました');
            }

        } catch (err) {
            console.error('Sync failed:', err);
            alert('同期に失敗しました：' + err.message);
        } finally {
            this.isSaving = false;
            this.updateSyncStatusUI('connected');
        }
    },

    /**
     * 保存用のデータオブジェクトを構築（monday, team を除外）
     * @param {string} mondayISO
     * @returns {object}
     */
    _buildSaveData(mondayISO) {
        const saveData = JSON.parse(JSON.stringify(app.state));
        delete saveData.monday;
        delete saveData.team;
        return saveData;
    },

    /**
     * 週別ファイルへの書き込み
     * @param {string} mondayISO
     * @param {object} data
     */
    async saveWeekToFolder(mondayISO, data) {
        if (!this.dirHandle) return;
        const fileName = this.getWeekFileName(mondayISO);
        const fileHandle = await this.dirHandle.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(data, null, 2));
        await writable.close();
    },

    /**
     * 純粋なファイル書き込み（旧API互換、内部用）
     * @deprecated saveWeekToFolder を使用してください
     */
    async saveToFolder(data) {
        await this.saveWeekToFolder(app.state.monday, data);
    },

    // ─────────────────────────────────────────
    // ロック制御
    // ─────────────────────────────────────────

    /**
     * ロックファイルの作成
     */
    async acquireLock() {
        try {
            let lockHandle;
            try {
                lockHandle = await this.dirHandle.getFileHandle('lock.json', { create: false });
                const lockFile = await lockHandle.getFile();
                const now = Date.now();
                
                // 5分以上古いロックファイルは自動解除
                if (now - lockFile.lastModified > 5 * 60 * 1000) {
                    await this.dirHandle.removeEntry('lock.json');
                } else {
                    alert('現在、他の人が保存中です。');
                    return false;
                }
            } catch (e) {}

            lockHandle = await this.dirHandle.getFileHandle('lock.json', { create: true });
            const writable = await lockHandle.createWritable();
            await writable.write(JSON.stringify({ user: 'active-user', time: Date.now() }));
            await writable.close();
            return true;
        } catch (e) {
            console.error('Lock failed:', e);
            return false;
        }
    },

    /**
     * ロックファイルの削除
     */
    async releaseLock() {
        try {
            await this.dirHandle.removeEntry('lock.json');
        } catch (e) {
            console.error('Unlock failed:', e);
        }
    },

    // ─────────────────────────────────────────
    // バックアップ
    // ─────────────────────────────────────────

    /**
     * デイリーバックアップの作成
     */
    async saveToDailyBackup(data) {
        if (!this.dirHandle) return;
        try {
            const backupsDir = await this.dirHandle.getDirectoryHandle('backups', { create: true });
            const now = new Date();
            const today = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
            const fileName = `daily_${today}.json`;
            
            let exists = false;
            try {
                await backupsDir.getFileHandle(fileName, { create: false });
                exists = true;
            } catch (e) {}

            if (!exists) {
                const backupFile = await backupsDir.getFileHandle(fileName, { create: true });
                const writable = await backupFile.createWritable();
                await writable.write(JSON.stringify(data, null, 2));
                await writable.close();
                await this.cleanupOldBackups(backupsDir);
            }
        } catch (err) {
            console.error('Backup failed:', err);
        }
    },

    /**
     * 古いバックアップの削除（30日分保持）
     */
    async cleanupOldBackups(backupsDir) {
        try {
            const entries = [];
            for await (const entry of backupsDir.values()) {
                if (entry.kind === 'file' && entry.name.startsWith('daily_')) {
                    entries.push(entry);
                }
            }
            entries.sort((a, b) => a.name.localeCompare(b.name));
            const MAX_BACKUPS = 30;
            if (entries.length > MAX_BACKUPS) {
                const toDelete = entries.slice(0, entries.length - MAX_BACKUPS);
                for (const entry of toDelete) {
                    await backupsDir.removeEntry(entry.name);
                }
            }
        } catch (e) {
            console.error('Cleanup failed:', e);
        }
    },

    // ─────────────────────────────────────────
    // 自動同期
    // ─────────────────────────────────────────

    /**
     * 自動同期（ポーリング）の開始
     */
    startAutoSync() {
        if (this.syncInterval) clearInterval(this.syncInterval);
        this.syncInterval = setInterval(async () => {
            if (!this.dirHandle || this.isSaving) return;
            try {
                const weekFileName = this.getWeekFileName(app.state.monday);
                const fileHandle = await this.dirHandle.getFileHandle(weekFileName, { create: false });
                const file = await fileHandle.getFile();
                if (file.lastModified !== this.lastFsModified) {
                    const content = await file.text();
                    const remoteData = JSON.parse(content);
                    if (remoteData.lastUpdated !== app.state.lastUpdated) {
                        await this.loadFromFolder();
                        this.showToast('最新データを自動読み込みしました');
                    }
                }
            } catch (e) {}
        }, 30000); // 30秒間隔
    },

    /**
     * 他のアクション前の簡易リフレッシュチェック
     */
    async refreshIfRemoteUpdated() {
        if (!this.dirHandle || this.isSaving) return;
        try {
            const weekFileName = this.getWeekFileName(app.state.monday);
            const fileHandle = await this.dirHandle.getFileHandle(weekFileName, { create: false });
            const file = await fileHandle.getFile();
            if (file.lastModified !== this.lastFsModified) {
                const content = await file.text();
                const remoteData = JSON.parse(content);
                if (remoteData.lastUpdated !== app.state.lastUpdated) {
                    await this.loadFromFolder();
                    this.showToast('最新データを読み込みました');
                }
            }
        } catch (e) {}
    },

    // ─────────────────────────────────────────
    // UI ヘルパー
    // ─────────────────────────────────────────

    /**
     * UIの同期ステータス表示を更新する
     * @param {string} status 
     */
    updateSyncStatusUI(status) {
        const syncStatusEl = document.getElementById('sync-status');
        if (!syncStatusEl) return;
        
        syncStatusEl.className = 'sync-status ' + status;
        
        if (status === 'connected') {
            syncStatusEl.innerHTML = `<i data-lucide="cloud-check"></i> 同期中: ${app.state.lastUpdated ? this.formatTime(app.state.lastUpdated) : '接続済'}`;
        } else if (status === 'locked') {
            syncStatusEl.innerHTML = `<i data-lucide="lock"></i> 同期処理中...`;
        } else {
            syncStatusEl.innerHTML = `<i data-lucide="cloud-off"></i> フォルダ未接続`;
        }
        if (window.lucide) {
            window.lucide.createIcons({ root: syncStatusEl });
        }
    },

    formatTime(isoStr) {
        if (!isoStr) return '';
        const d = new Date(isoStr);
        return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
    },

    /**
     * トースト通知を表示する
     * @param {string} message 
     */
    showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = `<i data-lucide="check-circle" style="width:16px;height:16px;color:#10b981;vertical-align:middle;margin-right:4px;"></i> ${message}`;
        document.body.appendChild(toast);
        
        if (window.lucide) {
            window.lucide.createIcons({ root: toast });
        }

        setTimeout(() => toast.classList.add('show'), 10);

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },

    // ─────────────────────────────────────────
    // IndexedDB ハンドル管理
    // ─────────────────────────────────────────

    /**
     * IndexedDBをオープンする（汎用ヘルパー）
     */
    async openDB(dbName, storeName) {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(dbName, 1);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(storeName)) {
                    db.createObjectStore(storeName);
                }
            };
            request.onsuccess = (e) => resolve(e.target.result);
            request.onerror = (e) => reject(e.target.error);
        });
    },

    /**
     * IndexedDBへのハンドル保存
     */
    async storeHandle(handle) {
        const db = await this.openDB(this.DB_NAME, this.STORE_NAME);
        const tx = db.transaction(this.STORE_NAME, 'readwrite');
        tx.objectStore(this.STORE_NAME).put(handle, this.KEY_NAME);
        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    },

    /**
     * IndexedDBからのハンドル取得
     */
    async getStoredHandle() {
        const db = await this.openDB(this.DB_NAME, this.STORE_NAME);
        const tx = db.transaction(this.STORE_NAME, 'readonly');
        const request = tx.objectStore(this.STORE_NAME).get(this.KEY_NAME);
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
};

// グローバルに公開
window.SyncManager = SyncManager;
