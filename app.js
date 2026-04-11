const app = {
    state: {
        monday: null,
        team: 'all',
        teams: [],
        staff: [],
        tags: [],
        projects: [],
        deletedProjects: [],
        specialItems: [],
        schedule: [],
        holidays: []
    },
    isPjMode: false,
    activeEid: null,
    activeSid: null,
    pjFilters: { jobNo: '', customer: '', name: '', team: '', person: '', tagId: '' }, // 複数項目フィルタ
    pendingAssign: null, // 新規入力時のコンテキスト保持
    pendingPid: null,    // 製番先行選択時のID保持

    // HTMLエスケープヘルパー 
    esc(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    // ファイルドロップかどうかを判定する共通関数
    isFileDrag(e) {
        if (!e.dataTransfer) return false;
        // ドラッグ終了後や一部ブラウザでは dataTransfer.files が空になることがあるため types も併用
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) return true;
        if (e.dataTransfer.types) {
            for (let i = 0; i < e.dataTransfer.types.length; i++) {
                const t = e.dataTransfer.types[i].toLowerCase();
                if (t === 'files' || t === 'application/x-moz-file') return true;
            }
        }
        return false;
    },

    // 工数解析ヘルパー 
    parseManHours(str) {
        if (!str) return 0;
        // 「30Hx2」のような形式を解析
        const m = str.match(/([\d.]+)\s*H?\s*x\s*(\d+)/i);
        if (m) {
            return parseFloat(m[1]) * parseInt(m[2]);
        }
        // 単純な数値抽出
        const n = str.match(/([\d.]+)/);
        return n ? parseFloat(n[0]) : 0;
    },

    init() {
        // モード判定
        const params = new URLSearchParams(window.location.search);
        if (params.get('mode') === 'pj') {
            this.isPjMode = true;
            document.body.classList.add('pj-view-active');
        } else {
            // メイン画面に固有の名前を付与 
            window.name = 'MainProcessManager';
        }

        this.loadConfig();
        this.setInitialWeek();
        this.render();
        this.initDragAndDrop();

        // 別ウィンドウ同期
        window.addEventListener('storage', (e) => {
            if (e.key === 'scheduler_app_state') {
                this.loadConfig();
                this.render();
            }
            // 別窓からの選択信号 
            if (e.key === 'pj_select_signal' && e.newValue) {
                this.loadConfig();
                this.selectPjFromSub(e.newValue);
            }
        });

        // 右クリックメニューの無効化 (v3.25)
        window.addEventListener('contextmenu', e => e.preventDefault());
    },

    saveConfig() {
        this.validateIntegrity();
        localStorage.setItem('scheduler_app_state', JSON.stringify(this.state));
    },

    clearAllData() {
        if (confirm('ブラウザ内に保存されているすべてのデータを削除しますか？\n（案件、スケジュール、メンバー情報がすべて消去されます。この操作は取り消せません）')) {
            localStorage.removeItem('scheduler_app_state');
            location.reload();
        }
    },

    loadConfig() {
        const conf = localStorage.getItem('scheduler_app_state');
        if (conf) {
            try {
                Object.assign(this.state, JSON.parse(conf));
                this.validateIntegrity();
            } catch (e) {
                console.error("Load Error", e);
            }
        }
    },

    validateIntegrity() {
        if (!this.state.teams) this.state.teams = [];
        if (!this.state.staff) this.state.staff = [];
        if (!this.state.projects) this.state.projects = [];
        if (!this.state.deletedProjects) this.state.deletedProjects = [];
        if (!this.state.tags) this.state.tags = [];
        if (!this.state.schedule) this.state.schedule = [];
        if (!this.state.holidays) this.state.holidays = [];
        if (!this.state.specialItems) {
            this.state.specialItems = [
                { id: 'si1', name: '休暇', order: 0 },
                { id: 'si2', name: '出張', order: 1 },
                { id: 'si3', name: '会議', order: 2 },
                { id: 'si4', name: '欠勤', order: 3 }
            ];
        }

        // 旧形式（日付文字列）のクリーンアップ (v3.20)
        if (this.state.holidays.some(h => typeof h === 'string' && h.includes('-'))) {
            this.state.holidays = [];
        }

        // スケジュールの整合性チェック (v3.26)
        this.state.schedule = this.state.schedule.filter(item => {
            // プロジェクトIDがあるが実在しない場合は特別項目（旧データ救済）として扱うか、
            // 空文字などの不正なIDをクリーンアップ
            if (item.projectId === "" || item.projectId === "null") {
                item.projectId = null;
            }
            return true;
        });

        const teamIds = new Set(this.state.teams.map(t => t.id));
        const staffIds = new Set(this.state.staff.map(s => s.id));
        const tagIds = new Set(this.state.tags.map(t => t.id));
        const pjIds = new Set(this.state.projects.map(p => p.id));

        // 整合性チェック: IDが消えた予定を削除
        this.state.staff.forEach((s, idx) => {
            if (s.order === undefined) s.order = idx;
            if (s.teamId && !teamIds.has(s.teamId)) s.teamId = '';
        });

        // No.の振り直しとカラー設定
        this.state.projects.forEach((p, idx) => {
            p.no = (idx + 1).toString();
            if (!p.color) {
                const colors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6'];
                p.color = colors[idx % colors.length];
            }
            if (p.tagId && !tagIds.has(p.tagId)) p.tagId = '';
        });

        this.state.schedule = this.state.schedule.filter(l => {
            const hasStaff = staffIds.has(l.staffId);
            const isProjectValid = pjIds.has(l.projectId);
            const isSpecialValid = !l.projectId && !!l.specialTitle;
            return hasStaff && (isProjectValid || isSpecialValid);
        });
    },

    setInitialWeek() {
        if (!this.state.monday || isNaN(new Date(this.state.monday).getTime())) {
            const d = new Date();
            d.setDate(d.getDate() - (d.getDay() || 7) + 1); // 月曜日
            d.setHours(0, 0, 0, 0);
            this.state.monday = d.toISOString();
        }
    },

    render() {
        this.saveConfig();
        this.renderMenuBadges(); // 特別項目バッジの描画
        if (this.isPjMode) {
            this.renderProjectBody();
            return;
        }

        // チームタブ
        const elTabs = document.getElementById('teamTabs');
        if (elTabs) {
            let h = `<div class="tab ${this.state.team === 'all' ? 'active' : ''}" onclick="app.setT('all')">すべて</div>`;
            this.state.teams.forEach(t => {
                h += `<div class="tab ${this.state.team === t.id ? 'active' : ''}" onclick="app.setT('${t.id}')">${this.esc(t.name)}</div>`;
            });
            elTabs.innerHTML = h;
        }

        this.renderGrid();
        this.renderStats(); // 統計エリアの描画 
        this.updateWeekRangeDisplay();
    },

    renderStats() {
        const el = document.getElementById('statsArea');
        if (!el) return;

        let teams = this.state.teams;
        if (this.state.team !== 'all') {
            teams = teams.filter(t => t.id === this.state.team);
        }

        let h = '';
        teams.forEach(t => {
            const teamStaff = this.state.staff.filter(s => s.teamId === t.id);
            if (teamStaff.length === 0) return;

            const totalH = teamStaff.reduce((sum, s) => {
                const staffTasks = this.state.schedule.filter(l => l.staffId === s.id);
                return sum + staffTasks.reduce((sSum, task) => {
                    const pj = this.state.projects.find(p => p.id === task.projectId);
                    return sSum + this.parseManHours(pj?.manHours);
                }, 0);
            }, 0);

            const avgH = (totalH / teamStaff.length).toFixed(1);

            h += `
                <div class="stats-card">
                    <div class="stats-team-name">
                        <span>👥 ${this.esc(t.name)}</span>
                        <small style="font-size:0.7rem; opacity:0.6;">${teamStaff.length} 名</small>
                    </div>
                    <div class="stats-grid">
                        <div class="stats-item">
                            <div class="stats-label">合計工数</div>
                            <div class="stats-value">${totalH}h</div>
                        </div>
                        <div class="stats-item">
                            <div class="stats-label">平均工数</div>
                            <div class="stats-value">${avgH}h</div>
                        </div>
                    </div>
                </div>`;
        });

        el.innerHTML = h || '<div style="color:var(--text-secondary); font-size:0.9rem;">(この条件に該当するデータはありません)</div>';
    },

    updateWeekRangeDisplay() {
        const mon = new Date(this.state.monday);
        const sun = new Date(mon);
        sun.setDate(mon.getDate() + 6);
        const fmt = d => `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
        const el = document.getElementById('weekRange');
        if (el) el.textContent = `${fmt(mon)} - ${fmt(sun)}`;
    },

    toggleHoliday(dayIdx) {
        const idx = this.state.holidays.indexOf(dayIdx);
        if (idx === -1) {
            this.state.holidays.push(dayIdx);
        } else {
            this.state.holidays.splice(idx, 1);
        }
        this.render();
    },

    setT(id) {
        this.state.team = id;
        this.render();
    },

    moveWeek(n) {
        const d = new Date(this.state.monday);
        d.setDate(d.getDate() + (n * 7));
        this.state.monday = d.toISOString();
        this.render();
    },

    renderGrid() {
        const el = document.getElementById('grid');
        if (!el) return;

        const mon = new Date(this.state.monday);
        let h = `<div class="grid-header">担当者</div>`;
        for (let i = 0; i < 7; i++) {
            const d = new Date(mon);
            d.setDate(mon.getDate() + i);
            const isHoliday = this.state.holidays.includes(i);
            const isToday = new Date().toDateString() === d.toDateString();
            
            h += `
                <div class="grid-header ${isHoliday ? 'is-holiday' : ''}" 
                     style="${isToday ? 'background:rgba(99,102,241,0.1)' : ''}; cursor:pointer;" 
                     onclick="app.toggleHoliday(${i})" 
                     title="クリックで休日を切り替え">
                    <b>${['月', '火', '水', '木', '金', '土', '日'][i]}</b>
                    <span style="color:${isHoliday ? 'white' : (i === 5 ? 'var(--saturday-color)' : (i === 6 ? 'var(--danger-color)' : 'var(--text-secondary)'))}">
                        ${d.getMonth() + 1}/${d.getDate()}
                    </span>
                    ${isHoliday ? '<div class="holiday-label">休日</div>' : ''}
                </div>`;
        }
        h += `<div class="grid-header grid-total-header">合計工数</div>`;

        let list = [...this.state.staff].sort((a, b) => a.order - b.order);
        if (this.state.team !== 'all') {
            list = list.filter(s => s.teamId === this.state.team);
        }

        list.forEach(s => {
            const teamName = this.state.teams.find(t => t.id === s.teamId)?.name || '未所属';

            const sIdStr = String(s.id);
            // この週の工数を算出 
            const staffTasks = this.state.schedule.filter(l => String(l.staffId) === sIdStr);
            const uniquePjIds = new Set();
            let totalH = 0;
            staffTasks.forEach(t => {
                const tPjId = String(t.projectId);
                if (tPjId && tPjId !== "null" && tPjId !== "undefined" && tPjId !== "") {
                    if (!uniquePjIds.has(tPjId)) {
                        uniquePjIds.add(tPjId);
                        const pj = this.state.projects.find(p => String(p.id) === tPjId);
                        totalH += this.parseManHours(pj?.manHours);
                    }
                }
            });

            h += `
                <div class="grid-row">
                    <div class="grid-sidebar" id="sidebar-${s.id}">
                        <div class="staff-name">${s.isLeader ? '<span style="color:var(--leader-color)">★</span>' : ''} ${this.esc(s.name)}</div>
                        <div class="staff-team">${this.esc(teamName)}</div>
                    </div>
                    <div class="content-area" id="content-${s.id}">
                        <div class="click-grid">
                            ${[0, 1, 2, 3, 4, 5, 6].map(i => {
                                const hol = this.state.holidays.includes(i);
                                return `<div class="click-cell ${hol ? 'is-holiday' : ''}" 
                                             data-day="${i}" data-staff="${s.id}"
                                             onclick="app.showA(${i}, '${s.id}')"
                                             oncontextmenu="app.showA(${i}, '${s.id}', null, null, event)"
                                             ondragover="app.handleDragOver(event)"
                                             ondragenter="app.handleDragEnter(event, this)"
                                             ondragleave="app.handleDragLeave(event, this)"
                                             ondrop="app.handleDrop(event, ${i}, '${s.id}')"></div>`;
                            }).join('')}
                        </div>
                        <div class="bars-layer" id="bars-${s.id}"></div>
                    </div>
                    <div class="grid-total-cell">${totalH}h</div>
                </div>`;
        });


        el.innerHTML = h;
        list.forEach(s => this.drawBars(s.id));
    },

    drawBars(sid) {
        const layer = document.getElementById(`bars-${sid}`);
        if (!layer) return;

        const sidStr = String(sid);
        const tasks = this.state.schedule.filter(l => String(l.staffId) === sidStr);
        console.log(`[Debug] drawBars: sid=${sidStr}, foundTasks=${tasks.length}`);
        
        const stacks = [];
        let maxLv = 0;

        tasks.sort((a, b) => (Number(a.startIdx) || 0) - (Number(b.startIdx) || 0)).forEach(task => {
            // 重なり判定
            let lv = 0;
            while (true) {
                if (!stacks[lv]) stacks[lv] = [];
                const isOverlapping = stacks[lv].some(ex => (task.startIdx <= ex.endIdx && task.endIdx >= ex.startIdx));
                if (!isOverlapping) {
                    stacks[lv].push(task);
                    if (lv > maxLv) maxLv = lv;
                    break;
                }
                lv++;
            }

            const pjId = task.projectId || null;
            const pj = (pjId && pjId !== '') ? this.state.projects.find(p => p.id === pjId) : null;
            
            // 特別項目の背景色
            const color = pj ? (pj.color || '#6366f1') : '#6b7280'; // プロジェクトなら設定色、特別ならグレー
            const tag = pj && pj.tagId ? this.state.tags.find(t => t.id === pj.tagId) : null;
            const tagName = tag ? tag.name : '';
            
            // 特記タイトル（プロジェクトがない場合は specialTitle を優先表示）
            let title = '';
            if (pj) {
                // ご要望：No.（リスト上の順番）、製品名、タグ（タグは後続のHTMLで付与される）
                title = `${pj.no || '---'} / ${pj.name || '無題'}`;
            } else {
                title = `★ ${task.specialTitle || '予定なし'}`;
            }

            const bar = document.createElement('div');
            bar.className = 'bar' + (pj ? '' : ' bar-special');
            
            const start = Number(task.startIdx) || 0;
            const end = Number(task.endIdx) || 0;
            
            bar.style.left = `calc(${(start / 7) * 100}% + 2px)`;
            bar.style.width = `calc(${((end - start + 1) / 7) * 100}% - 4px)`;
            bar.style.top = `${lv * 35 + 8}px`;
            bar.style.backgroundColor = color;
            bar.style.pointerEvents = 'auto'; // 確実にマウス反応させる

            bar.innerHTML = this.esc(title);
            if (tagName) {
                bar.innerHTML += ` <span style="font-size:0.6rem; opacity:0.8; background:rgba(0,0,0,0.2); padding:1px 4px; border-radius:3px; margin-left:4px;">${this.esc(tagName)}</span>`;
            }

            // --- Drag & Drop 処理 ---
            bar.draggable = true;
            bar.ondragstart = (e) => {
                e.stopPropagation();
                this.clearPjDetail();
                const duration = end - start;
                e.dataTransfer.setData('text/plain', JSON.stringify({
                    id: task.id,
                    duration: duration,
                    originalStaff: sidStr
                }));
                e.dataTransfer.effectAllowed = 'move';
                setTimeout(() => { bar.style.opacity = '0.5'; }, 0);
            };
            bar.ondragend = (e) => {
                bar.style.opacity = '1';
                document.querySelectorAll('.click-cell').forEach(c => {
                    c.style.backgroundColor = ''; // クリーンアップ 
                });
            };

            bar.onclick = (e) => {
                e.stopPropagation();
                this.showA(start, sid, task.id);
            };
            
            bar.onmouseover = () => pj ? this.showPjDetail(pj.id) : this.showSpecialDetail(task);
            // ご要望：他のバーに乗るまで詳細表示を維持するため onmouseout を削除

            // リサイズハンドルの追加
            const leftHandle = document.createElement('div');
            leftHandle.className = 'resize-handle left';
            leftHandle.onmousedown = (e) => this.startBarResize(e, task.id, 'left');
            
            const rightHandle = document.createElement('div');
            rightHandle.className = 'resize-handle right';
            rightHandle.onmousedown = (e) => this.startBarResize(e, task.id, 'right');

            bar.appendChild(leftHandle);
            bar.appendChild(rightHandle);

            layer.appendChild(bar);
        });

        // 行の高さを段数に合わせて動的に拡張 
        const finalHeight = Math.max(120, (maxLv + 1) * 35 + 24);
        const elSide = document.getElementById(`sidebar-${sid}`);
        const elCont = document.getElementById(`content-${sid}`);
        if (elSide) elSide.style.height = `${finalHeight}px`;
        if (elCont) elCont.style.height = `${finalHeight}px`;
    },
    // セル選択待ち状態の解除 
    clearPendingPid() {
        this.pendingPid = null;
        const hint = document.getElementById('assignHint');
        if (hint) hint.style.display = 'none';
    },

    showA(idx, sid, eid = null, pid = null, event = null) {
        if (event) {
            event.preventDefault();
        }
        
        // 先行して製番が選ばれている場合 
        if (this.pendingPid && !pid && !event) {
            const selectedPid = this.pendingPid;
            this.clearPendingPid();
            this.showA(idx, sid, null, selectedPid);
            return;
        }

        this.activeEid = eid;
        this.activeSid = sid;
        this.activeAssignTab = 'project'; // 初期設定を強制 

        // 新規入力時、まだ製番が決まっていない且つ右クリックでないならリストを表示 
        if (!eid && !pid && !event) {
            this.pendingAssign = { idx, sid };
            this.showPjModal();
            return;
        }

        this.pendingAssign = null;
        this.refreshPjSelect();

        const sidStr = String(sid);
        const staff = this.state.staff.find(s => String(s.id) === sidStr);
        document.getElementById('targetStaff').innerText = `${this.esc(staff?.name || '不明')} さんの予定設定`;

        if (eid) {
            const it = this.state.schedule.find(x => x.id === eid);
            document.getElementById('dayS').value = it.startIdx;
            document.getElementById('dayE').value = it.endIdx;
            
            if (it.projectId) {
                this.switchAssignTab('project');
                const sel = document.getElementById('pSel');
                if (sel) sel.value = it.projectId;
            } else {
                this.switchAssignTab('special');
                const titleInp = document.getElementById('sTitle');
                if (titleInp) titleInp.value = it.specialTitle || '';
            }
            document.getElementById('delBtn').style.display = 'block';
            const elComp = document.getElementById('compBtn');
            if (elComp) elComp.style.display = it.projectId ? 'block' : 'none';
        } else {
            document.getElementById('dayS').value = idx;
            document.getElementById('dayE').value = idx;
            const titleInp = document.getElementById('sTitle');
            if (titleInp) titleInp.value = '';
            
            if (event && event.type === 'contextmenu') {
                this.switchAssignTab('special');
            } else {
                this.switchAssignTab('project');
                const sel = document.getElementById('pSel');
                if (sel) sel.value = pid || '';
            }
            document.getElementById('delBtn').style.display = 'none';
            const elComp = document.getElementById('compBtn');
            if (elComp) elComp.style.display = 'none';
        }

        document.getElementById('assignModal').style.display = 'flex';
    },

    switchAssignTab(mode) {
        this.activeAssignTab = mode;
        const pTab = document.getElementById('atb-p');
        const sTab = document.getElementById('atb-s');
        const pSec = document.getElementById('assign-p-sec');
        const sSec = document.getElementById('assign-s-sec');
        
        if (mode === 'project') {
            if (pTab) pTab.classList.add('active');
            if (sTab) sTab.classList.remove('active');
            if (pSec) pSec.style.display = 'block';
            if (sSec) sSec.style.display = 'none';
        } else {
            if (pTab) pTab.classList.remove('active');
            if (sTab) sTab.classList.add('active');
            if (pSec) pSec.style.display = 'none';
            if (sSec) sSec.style.display = 'block';
        }
    },

    refreshPjSelect() {
        const el = document.getElementById('pSel');
        if (!el) return;
        const currentVal = el.value;
        el.innerHTML = `<option value="">選択してください...</option>` +
            this.state.projects.map(p => `
                <option value="${p.id}">[No.${p.no}] ${p.jobNo || '---'} / ${p.customer || '---'} / ${p.name}</option>
            `).join('');
        el.value = currentVal;
    },

    // --- 特別項目 CRUD ---
    addSpecialItem() {
        const title = document.getElementById('nsSI')?.value.trim();
        if (!title) return;
        this.state.specialItems.push({ id: 'si' + Date.now(), name: title, order: this.state.specialItems.length });
        this.saveConfig();
        this.renderMemberBody('specialItem');
        this.renderMenuBadges(); // 予定設定の中身も可能なら直ちに再描画
    },
    upSpecialItemN(id, v) {
        const item = this.state.specialItems.find(x => x.id === id);
        if (item) { item.name = v.trim(); this.saveConfig(); this.renderMenuBadges(); }
    },
    delSpecialItem(id) {
        if (!confirm('本当に削除しますか？')) return;
        this.state.specialItems = this.state.specialItems.filter(x => x.id !== id);
        this.saveConfig();
        this.renderMemberBody('specialItem');
        this.renderMenuBadges();
    },
    upSpecialItemOrder(id, dir) {
        const list = this.state.specialItems;
        list.sort((a, b) => a.order - b.order);
        const idx = list.findIndex(x => x.id === id);
        if (idx < 0) return;
        const targetIdx = idx + dir;
        if (targetIdx >= 0 && targetIdx < list.length) {
            const temp = list[idx].order;
            list[idx].order = list[targetIdx].order;
            list[targetIdx].order = temp;
            this.saveConfig();
            this.renderMemberBody('specialItem');
            this.renderMenuBadges();
        }
    },
    
    // --- 特別項目バッジの生成 ---
    renderMenuBadges() {
        const container = document.getElementById('specialItemsContainer');
        if (!container) return;
        
        const sorted = [...this.state.specialItems].sort((a, b) => a.order - b.order);
        container.innerHTML = sorted.map(item => 
            `<span class="tag-badge" style="cursor:pointer;" onclick="document.getElementById('sTitle').value='${this.esc(item.name)}'">${this.esc(item.name)}</span>`
        ).join('');
    },

    // --- 各種フォーマッタ・ユーティリティ ---
    showPjDetail(pid) {
        const pj = this.state.projects.find(p => p.id === pid);
        const panel = document.getElementById('detailPanel');
        if (!pj || !panel) return;

        const teamName = this.state.teams.find(t => t.id === pj.team)?.name || '未設定';
        const staffName = this.state.staff.find(s => s.id === pj.person)?.name || '未設定';

        const pjTag = this.state.tags.find(t => t.id === pj.tagId);

        panel.innerHTML = `
            <div class="detail-card">
                <div class="detail-header">
                    <div class="detail-no">
                        <span>Project No.${this.esc(pj.no)}</span>
                        ${pjTag ? `<span class="tag-badge">${this.esc(pjTag.name)}</span>` : ''}
                    </div>
                    <div class="detail-title">${this.esc(pj.name)}</div>
                </div>
                <div class="detail-grid">
                    <div class="detail-item">
                        <div class="detail-label">指令書No.</div>
                        <div class="detail-value">${this.esc(pj.jobNo) || '---'}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">客先</div>
                        <div class="detail-value">${this.esc(pj.customer) || '---'}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">所属 / 担当</div>
                        <div class="detail-value">${this.esc(teamName)} / ${this.esc(staffName)}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">納期</div>
                        <div class="detail-value" style="color:var(--danger-color); font-weight:700;">${this.esc(pj.deadline) || '---'}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">向先 / 数量 / 工数</div>
                        <div class="detail-value">${this.esc(pj.destination) || '---'} / ${this.esc(pj.qty) || 0} / ${this.esc(pj.manHours) || 0}h</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">備考 / メモ</div>
                        <div class="detail-notes">${this.esc(pj.notes) || 'なし'}</div>
                    </div>
                </div>
            </div>`;
    },

    showSpecialDetail(task) {
        const panel = document.getElementById('detailPanel');
        if (!panel) return;
        panel.innerHTML = `
            <div class="detail-card" style="border-left-color: #475569;">
                <div class="detail-header">
                    <div class="detail-no">特別項目 / 休暇・予定等</div>
                    <div class="detail-title">${this.esc(task.specialTitle)}</div>
                </div>
                <div style="padding:1.5rem; opacity:0.8; font-size:0.9rem; line-height:1.6;">
                    個人別に設定された特別な予定です。<br>
                    休暇、出張、内部会議などの用途で利用可能です。
                </div>
            </div>`;
    },

    clearPjDetail() {
        const panel = document.getElementById('detailPanel');
        if (panel) {
            panel.innerHTML = `
                <div class="detail-empty">
                    <div style="font-size:2rem; opacity:0.3; margin-bottom:1rem;">ℹ️</div>
                    工程バーをマウスオーバーすると<br>詳細情報が表示されます
                </div>`;
        }
    },

    saveSchedule() {
        const s = parseInt(document.getElementById('dayS').value);
        const e = parseInt(document.getElementById('dayE').value);
        
        let pId = "";
        let sTitle = "";

        // タブに応じたデータ取得 
        if (this.activeAssignTab === 'project') {
            pId = document.getElementById('pSel').value;
            if (!pId) { alert('製番を選択してください'); return; }
        } else {
            sTitle = document.getElementById('sTitle').value.trim();
            if (!sTitle) { alert('テキストを入力してください'); return; }
        }

        const data = {
            startIdx: s,
            endIdx: e,
            projectId: pId,
            specialTitle: sTitle
        };

        if (this.activeEid) {
            const item = this.state.schedule.find(sc => sc.id === this.activeEid);
            if (item) Object.assign(item, data);
        } else {
            this.state.schedule.push({
                id: 'sc' + Date.now(),
                staffId: this.activeSid,
                ...data
            });
        }
        
        console.log(`[Debug] Save Complete. Current schedule count: ${this.state.schedule.length}`);
        this.saveConfig();
        this.hideModal('assignModal');
        this.render();
    },

    delSchedule() {
        if (confirm('割当を解除しますか？')) {
            this.state.schedule = this.state.schedule.filter(s => s.id !== this.activeEid);
            this.hideModal('assignModal');
            this.saveConfig();
            this.render();
        }
    },

    completeSchedule() {
        if (confirm('この割り当てを完了（解除）し、自動的に製番リストからも削除（ゴミ箱へ移動）しますか？')) {
            const task = this.state.schedule.find(s => s.id === this.activeEid);
            if (task && task.projectId) {
                const pjIdx = this.state.projects.findIndex(p => p.id === task.projectId);
                if (pjIdx >= 0) {
                    const pj = this.state.projects.splice(pjIdx, 1)[0];
                    pj.deletedAt = new Date().toLocaleString();
                    this.state.deletedProjects.push(pj);
                }
            }
            this.state.schedule = this.state.schedule.filter(s => s.id !== this.activeEid);
            this.hideModal('assignModal');
            this.saveConfig();
            this.render();
        }
    },

    // --- Drag & Drop 実装 ---
    handleDragOver(e) {
        if (this.isFileDrag(e)) return; // ファイルドロップ時は上位(window)の処理に任せる
        e.preventDefault(); // ドロップを許可 
        e.dataTransfer.dropEffect = 'move';
    },

    handleDragEnter(e, el) {
        if (this.isFileDrag(e)) return; // ファイルドロップ時はハイライトしない
        e.preventDefault();
        el.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
    },

    handleDragLeave(e, el) {
        if (this.isFileDrag(e)) return;
        el.style.backgroundColor = '';
    },

    handleDrop(e, dayIdx, staffId) {
        if (this.isFileDrag(e)) return; // ファイルドロップ時は上位(window)の処理に任せるため stopPropagation しない
        e.preventDefault();
        e.stopPropagation();
        
        // ハイライトの解除 
        document.querySelectorAll('.click-cell').forEach(c => c.style.backgroundColor = '');

        const dataStr = e.dataTransfer.getData('text/plain');
        if (!dataStr) return;

        try {
            const data = JSON.parse(dataStr);
            const task = this.state.schedule.find(t => t.id === data.id);
            if (!task) return;

            const oldStaff = task.staffId;
            const oldStart = task.startIdx;

            if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) {
                // Ctrlキー等が押されている場合はコピーとして扱う
                // (ブラウザ制約上、右クリックD＆Dが困難なため代替手段)
                const newTask = { ...task, id: 'sc' + Date.now() };
                newTask.staffId = staffId;
                newTask.startIdx = dayIdx;
                newTask.endIdx = dayIdx + data.duration;
                if (newTask.endIdx > 6) newTask.endIdx = 6;
                this.state.schedule.push(newTask);
            } else {
                // 通常の移動
                task.staffId = staffId;
                task.startIdx = dayIdx;
                task.endIdx = dayIdx + data.duration;

                // 週(0-6)をはみ出した場合は縮める (切り捨て方式)
                if (task.endIdx > 6) {
                    task.endIdx = 6;
                }

                // 同一セル内でのドロップ（位置が変わっていない場合）は並び順の入れ替え（最後尾へ移動）を行う
                if (oldStaff === staffId && oldStart === dayIdx) {
                    this.state.schedule = this.state.schedule.filter(t => t.id !== task.id);
                    this.state.schedule.push(task);
                }
            }
            
            this.saveConfig();
            this.render();
        } catch (err) {
            console.error("Drop Parse Error:", err);
        }
    },

    // --- バーのリサイズ (期間延長・短縮) 実装 ---
    startBarResize(e, taskId, edge) {
        e.preventDefault();
        e.stopPropagation(); // ドラッグ移動やクリックを防止

        const task = this.state.schedule.find(t => t.id === taskId);
        if (!task) return;

        // グリッド全体の幅から1日あたりのピクセル数を算出
        const gridEl = e.target.closest('.content-area');
        if (!gridEl) return;
        const  dayWidth = gridEl.getBoundingClientRect().width / 7;

        const startX = e.clientX;
        const originalStartIdx = task.startIdx;
        const originalEndIdx = task.endIdx;
        
        const barEl = e.target.closest('.bar');

        const onMouseMove = (moveEvent) => {
            const diffX = moveEvent.clientX - startX;
            const deltaDays = Math.round(diffX / dayWidth);

            if (edge === 'right') {
                let newEnd = originalEndIdx + deltaDays;
                if (newEnd > 6) newEnd = 6;
                if (newEnd < originalStartIdx) newEnd = originalStartIdx;
                
                // 視覚的なフィードバック (CSS widthの更新)
                if (barEl) {
                    barEl.style.width = `calc(${((newEnd - originalStartIdx + 1) / 7) * 100}% - 4px)`;
                }
            } else if (edge === 'left') {
                let newStart = originalStartIdx + deltaDays;
                if (newStart < 0) newStart = 0;
                if (newStart > originalEndIdx) newStart = originalEndIdx;
                
                if (barEl) {
                    barEl.style.left = `calc(${(newStart / 7) * 100}% + 2px)`;
                    barEl.style.width = `calc(${((originalEndIdx - newStart + 1) / 7) * 100}% - 4px)`;
                }
            }
        };

        const onMouseUp = (upEvent) => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);

            const diffX = upEvent.clientX - startX;
            const deltaDays = Math.round(diffX / dayWidth);

            if (edge === 'right') {
                let newEnd = originalEndIdx + deltaDays;
                if (newEnd > 6) newEnd = 6;
                if (newEnd < originalStartIdx) newEnd = originalStartIdx;
                task.endIdx = newEnd;
            } else if (edge === 'left') {
                let newStart = originalStartIdx + deltaDays;
                if (newStart < 0) newStart = 0;
                if (newStart > originalEndIdx) newStart = originalEndIdx;
                task.startIdx = newStart;
            }

            this.saveConfig();
            this.render(); // 位置や重なりが変わる可能性があるため全体を再描画
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    },

    // --- ウィンドウ間連携 / モーダル表示 ---
    showProjectMng() {
        const url = window.location.href.split('?')[0] + '?mode=pj';
        const w = screen.availWidth;
        const h = screen.availHeight;
        const win = window.open(url, 'pjMgr', `width=${w},height=${h},top=0,left=0,resizable=yes,scrollbars=yes`);
        if (win) {
            win.moveTo(0, 0);
            win.resizeTo(w, h);
            win.focus();
        }
    },


    showPjModal() {
        this.renderProjectBody();
        document.getElementById('pjOverlay').style.display = 'flex';
    },

    hidePjModal() {
        if (this.isPjMode) {
            window.close();
        } else {
            document.getElementById('pjOverlay').style.display = 'none';
        }
    },

    selectPjFromSub(signalValue) {
        if (!signalValue) return;
        const pid = signalValue.split('|')[0];

        // 1. 直前に入力モード（pendingAssign）だった場合は期間設定へ遷移 (v2.80)
        if (this.pendingAssign) {
            const { idx, sid } = this.pendingAssign;
            this.hidePjModal();
            this.showA(idx, sid, null, pid); // 期間設定を開く
            return;
        }

        // 2. セル選択待ちモードへの移行 (v2.95)
        // 別窓リスト起動時、かつ現在割り当て作業中でない場合
        if (!this.pendingAssign) {
            this.pendingPid = pid;
            const pj = this.state.projects.find(p => p.id === pid);
            const hint = document.getElementById('assignHint');
            const hintText = document.getElementById('assignHintText');
            if (hint && hintText) {
                hintText.innerText = `製番 [${pj?.jobNo || pid}] を割り当てるセルを選択してください`;
                hint.style.display = 'flex';

                // メイン画面を手前に引き寄せる
                try { window.focus(); } catch (e) { }
            }

            // リストを閉じる (自身のウィンドウがサブウィンドウなら)
            this.hidePjModal();
            return;
        }

        // 3. それ以外（編集中の再選択など）の場合はモーダルを閉じ、選択値を反映 (v2.80)
        this.hidePjModal();

        // メイン画面を手前に引き寄せる (積極的フォーカス)
        try { window.focus(); } catch (e) { }

        this.refreshPjSelect();
        const el = document.getElementById('pSel');
        if (el) {
            el.value = pid;
        }
    },

    selectSelf(pid) {
        const signal = pid + '|' + Date.now();

        // 1. 同一ウィンドウ（モーダル形式）なら自身に信号を送る (v2.80)
        if (!this.isPjMode) {
            this.selectPjFromSub(signal);
            return;
        }

        // 2. 別ウィンドウならメインウィンドウを引き寄せ、信号を送る (v2.37)
        try {
            const mainWin = window.open('', 'MainProcessManager');
            if (mainWin) mainWin.focus();

            if (window.opener && window.opener.app) {
                window.opener.app.selectPjFromSub(signal);
            }
        } catch (e) {
            console.warn("Opener naming focus failed, falling back to storage signal.");
        }

        // 3. シグナルを送信 (storage event経由)
        localStorage.setItem('pj_select_signal', signal);
    },

    // --- 管理画面 ---
    showAdminMng() {
        document.getElementById('memberModal').style.display = 'flex';
        this.switchMemberTab('staff');
    },

    switchMemberTab(t) {
        document.querySelectorAll('.m-tab').forEach(el => el.classList.remove('active'));
        const tabMap = { staff: 's', team: 't', tag: 'tag', deleted: 'del', specialItem: 'si' };
        const elTab = document.getElementById('mtb-' + (tabMap[t] || t));
        if (elTab) elTab.classList.add('active');
        this.renderMemberBody(t);
    },

    renderMemberBody(t) {
        const b = document.getElementById('memberBody');
        if (!b) return;

        if (t === 'team') {
            b.innerHTML = `
                <div class="form-g" style="display:flex;gap:10px;margin:1rem;background:rgba(255,255,255,0.03);padding:1.25rem;border-radius:12px;">
                    <input id="ntN" placeholder="新しいチーム名" style="flex:1">
                    <button class="btn btn-primary" onclick="app.addTeam()">チーム追加</button>
                </div>
                <table class="m-table">
                    <thead><tr><th>チーム名</th><th style="width:100px">順序</th><th style="width:60px">操作</th></tr></thead>
                    <tbody>${this.state.teams.map((x, idx) => `
                        <tr>
                            <td><input class="edit-field" value="${this.esc(x.name)}" oninput="app.upTeamN('${this.esc(x.id)}', this.value)"></td>
                            <td>
                                <div style="display:flex;gap:4px;">
                                    <button class="btn btn-icon" onclick="app.moveTeam(${idx},-1)">▲</button>
                                    <button class="btn btn-icon" onclick="app.moveTeam(${idx},1)">▼</button>
                                </div>
                            </td>
                            <td><button class="btn btn-danger btn-icon" onclick="app.delTeam('${this.esc(x.id)}')">×</button></td>
                        </tr>`).join('')}
                    </tbody>
                </table>`;
        } else if (t === 'tag') {
            b.innerHTML = `
                <div class="form-g" style="display:flex;gap:10px;margin:1rem;background:rgba(255,255,255,0.03);padding:1.25rem;border-radius:12px;">
                    <input id="ntagN" placeholder="新しいタグ名" style="flex:1">
                    <button class="btn btn-primary" onclick="app.addTag()">タグ登録</button>
                </div>
                <table class="m-table">
                    <thead><tr><th>タグ名</th><th style="width:100px">順序</th><th style="width:60px">操作</th></tr></thead>
                    <tbody>${this.state.tags.map((x, idx) => `
                        <tr>
                            <td><input class="edit-field" value="${this.esc(x.name)}" oninput="app.upTagN('${this.esc(x.id)}', this.value)"></td>
                            <td>
                                <div style="display:flex;gap:4px;">
                                    <button class="btn btn-icon" onclick="app.moveTag(${idx},-1)">▲</button>
                                    <button class="btn btn-icon" onclick="app.moveTag(${idx},1)">▼</button>
                                </div>
                            </td>
                            <td><button class="btn btn-danger btn-icon" onclick="app.delTag('${this.esc(x.id)}')">×</button></td>
                        </tr>`).join('')}
                    </tbody>
                </table>`;
        } else if (t === 'specialItem') {
            let sorted = [...this.state.specialItems].sort((a, b) => a.order - b.order);
            b.innerHTML = `
                <div class="form-g" style="display:grid;grid-template-columns:1fr auto;gap:15px;padding:1.5rem;background:rgba(255,255,255,0.03);border-radius:12px;margin:1rem;">
                    <div><label>特別項目の名称</label><input id="nsSI" placeholder="特別項目名を入力"></div>
                    <button class="btn btn-primary" style="align-self:end" onclick="app.addSpecialItem()">特別項目を追加</button>
                </div>
                <table class="m-table">
                    <thead><tr><th>名称</th><th style="width:110px">順序</th><th style="width:60px">操作</th></tr></thead>
                    <tbody>${sorted.map((item, idx) => `
                        <tr>
                            <td><input class="edit-field" value="${this.esc(item.name)}" oninput="app.upSpecialItemN('${this.esc(item.id)}', this.value)"></td>
                            <td>
                                <div style="display:flex;gap:4px">
                                    <button class="btn btn-sm" ${idx === 0 ? 'disabled' : ''} onclick="app.upSpecialItemOrder('${this.esc(item.id)}', -1)">▲</button>
                                    <button class="btn btn-sm" ${idx === sorted.length - 1 ? 'disabled' : ''} onclick="app.upSpecialItemOrder('${this.esc(item.id)}', 1)">▼</button>
                                </div>
                            </td>
                            <td style="text-align:center"><button class="btn btn-danger btn-icon" onclick="app.delSpecialItem('${this.esc(item.id)}')">×</button></td>
                        </tr>
                    `).join('')}</tbody>
                </table>`;
        } else if (t === 'deleted') {
            const list = this.state.deletedProjects;
            b.innerHTML = `
                <div style="padding:1rem;">
                    <p style="margin-bottom:1rem; font-size:0.85rem; color:var(--text-secondary);">※ 復元すると製番リストの最後尾に追加されます（No.は自動で振り直されます）。</p>
                    <table class="m-table">
                        <thead>
                            <tr>
                                <th style="width:110px;">削除日時</th>
                                <th style="width:110px;">指令書No</th>
                                <th>客先 / 製品名</th>
                                <th style="width:140px;">操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${list.length === 0 ? '<tr><td colspan="3" style="text-align:center; padding:2rem; opacity:0.5;">ゴミ箱は空です</td></tr>' : ''}
                            ${list.map(p => `
                                <tr>
                                    <td style="font-size:0.8rem; opacity:0.8;">${this.esc(p.deletedAt)}</td>
                                    <td>${this.esc(p.jobNo)}</td>
                                    <td>
                                        <div style="font-weight:bold; font-size:0.85rem;">${this.esc(p.customer)}</div>
                                        <div style="font-size:0.75rem; opacity:0.7;">${this.esc(p.name)}</div>
                                    </td>
                                    <td style="text-align:center;">
                                        <div style="display:flex; gap:8px; justify-content:center; align-items:center;">
                                            <button class="btn btn-success btn-sm" style="padding:4px 12px; font-size:0.75rem; min-width:60px; height:28px; line-height:1;" onclick="app.restorePj('${this.esc(p.id)}')">復元</button>
                                            <button class="btn btn-danger btn-icon" style="width:28px; height:28px; padding:0; display:flex; align-items:center; justify-content:center; flex-shrink:0;" onclick="app.clearPjPermanently('${this.esc(p.id)}')">×</button>
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        } else {
            let sorted = [...this.state.staff].sort((a, b) => a.order - b.order);
            b.innerHTML = `
                <div class="form-g" style="display:grid;grid-template-columns:2fr 1.5fr auto;gap:15px;padding:1.5rem;background:rgba(255,255,255,0.03);border-radius:12px;margin:1rem;">
                    <div><label>名前</label><input id="nsN" placeholder="氏名を入力"></div>
                    <div><label>所属チーム</label>
                        <select id="nsT">
                            <option value="">未所属</option>
                            ${this.state.teams.map(x => `<option value="${x.id}">${x.name}</option>`).join('')}
                        </select>
                    </div>
                    <button class="btn btn-primary" style="align-self:end" onclick="app.addStaff()">メンバー追加</button>
                </div>
                <table class="m-table">
                    <thead><tr><th>名前</th><th>所属</th><th style="width:60px">役職</th><th style="width:110px">順序</th><th style="width:60px">操作</th></tr></thead>
                    <tbody>${sorted.map((s, idx) => `
                        <tr>
                            <td><input class="edit-field" value="${this.esc(s.name)}" oninput="app.upStaffN('${this.esc(s.id)}', this.value)"></td>
                            <td>
                                <select onchange="app.upStT('${this.esc(s.id)}', this.value)" style="width:100%">
                                    <option value="">未所属</option>
                                    ${this.state.teams.map(t => `<option value="${this.esc(t.id)}" ${t.id === s.teamId ? 'selected' : ''}>${this.esc(t.name)}</option>`).join('')}
                                </select>
                            </td>
                            <td><button class="btn btn-icon ${s.isLeader ? 'btn-primary' : ''}" onclick="app.toggleL('${this.esc(s.id)}')">${s.isLeader ? '★' : '通常'}</button></td>
                            <td>
                                <div style="display:flex;gap:4px;">
                                    <button class="btn btn-icon" onclick="app.moveStaff(${idx},-1)">▲</button>
                                    <button class="btn btn-icon" onclick="app.moveStaff(${idx},1)">▼</button>
                                </div>
                            </td>
                            <td><button class="btn btn-danger btn-icon" onclick="app.delStaff('${this.esc(s.id)}')">×</button></td>
                        </tr>`).join('')}
                    </tbody>
                </table>`;
        }
    },

    // メンバー操作
    addTeam() {
        const v = document.getElementById('ntN').value;
        if (v) {
            this.state.teams.push({ id: 't' + Date.now(), name: v });
            this.renderMemberBody('team');
            this.render();
        }
    },
    upTeamN(id, v) { this.state.teams.find(t => t.id === id).name = v; this.render(); },
    delTeam(id) { if (confirm('チームを削除しますか？')) { this.state.teams = this.state.teams.filter(t => t.id !== id); this.validateIntegrity(); this.render(); this.renderMemberBody('team'); } },
    moveTeam(idx, dir) {
        const n = idx + dir;
        if (n >= 0 && n < this.state.teams.length) {
            [this.state.teams[idx], this.state.teams[n]] = [this.state.teams[n], this.state.teams[idx]];
            this.renderMemberBody('team');
            this.render();
        }
    },
    addStaff() {
        const n = document.getElementById('nsN').value;
        const t = document.getElementById('nsT').value;
        if (n) {
            const maxOrder = this.state.staff.reduce((m, s) => Math.max(m, s.order || 0), -1);
            this.state.staff.push({ id: 's' + Date.now(), teamId: t, name: n, isLeader: false, order: maxOrder + 1 });
            this.renderMemberBody('staff');
            this.render();
        }
    },
    upStaffN(id, v) { this.state.staff.find(s => s.id === id).name = v; this.render(); },
    upStT(sid, tid) { this.state.staff.find(s => s.id === sid).teamId = tid; this.render(); },
    toggleL(sid) { const s = this.state.staff.find(x => x.id === sid); s.isLeader = !s.isLeader; this.renderMemberBody('staff'); this.render(); },
    delStaff(id) { if (confirm('メンバーを削除しますか？')) { this.state.staff = this.state.staff.filter(s => s.id !== id); this.validateIntegrity(); this.render(); this.renderMemberBody('staff'); } },
    moveStaff(idx, dir) {
        const n = idx + dir;
        let list = [...this.state.staff].sort((a, b) => a.order - b.order);
        if (n >= 0 && n < list.length) {
            const tmp = list[idx].order;
            list[idx].order = list[n].order;
            list[n].order = tmp;
            this.renderMemberBody('staff');
            this.render();
        }
    },

    // タグ操作
    addTag() {
        const v = document.getElementById('ntagN').value;
        if (v) {
            this.state.tags.push({ id: 'tag' + Date.now(), name: v });
            this.renderMemberBody('tag');
            this.render();
        }
    },
    upTagN(id, v) { 
        this.state.tags.find(t => t.id === id).name = v; 
        this.render(); 
    },
    delTag(id) { 
        if (confirm('タグを削除しますか？')) { 
            this.state.tags = this.state.tags.filter(t => t.id !== id); 
            this.validateIntegrity(); 
            this.render(); 
            this.renderMemberBody('tag'); 
        } 
    },
    moveTag(idx, dir) {
        const n = idx + dir;
        if (n >= 0 && n < this.state.tags.length) {
            [this.state.tags[idx], this.state.tags[n]] = [this.state.tags[n], this.state.tags[idx]];
            this.renderMemberBody('tag');
            this.render();
        }
    },

    movePj(idx, dir) {
        const n = idx + dir;
        if (n >= 0 && n < this.state.projects.length) {
            [this.state.projects[idx], this.state.projects[n]] = [this.state.projects[n], this.state.projects[idx]];
            this.render(); // 保存と再描画
            this.renderProjectBody();
        }
    },

    sortPjByTagMaster() {
        if (!confirm('製番リストをタグの登録順に並び替えますか？\n（案件番号 No. も現在の並び順で振り直されます）')) return;

        const tagOrder = this.state.tags.map(t => t.id);
        
        this.state.projects.sort((a, b) => {
            // 両方タグなし
            if (!a.tagId && !b.tagId) return 0;
            // aのみタグなし（後ろへ）
            if (!a.tagId) return 1;
            // bのみタグなし（前へ）
            if (!b.tagId) return -1;
            
            // 両方タグあり：マスターのインデックスで比較
            const idxA = tagOrder.indexOf(a.tagId);
            const idxB = tagOrder.indexOf(b.tagId);
            
            // 万が一マスターにないIDが入っていた場合は最後尾へ
            if (idxA === -1 && idxB === -1) return 0;
            if (idxA === -1) return 1;
            if (idxB === -1) return -1;
            
            return idxA - idxB;
        });

        this.validateIntegrity(); // No.の振り直しを実行
        this.render();            // 工程表とデータの更新
        this.renderProjectBody(); // リスト表示の更新
    },

    reorderPj(id, newNoStr) {
        const newNo = parseInt(newNoStr);
        if (isNaN(newNo) || newNo < 1) {
            this.renderProjectBody(); // 不正な入力時は描画し直して値を元に戻す
            return;
        }

        const projects = this.state.projects;
        const oldIdx = projects.findIndex(p => p.id === id);
        if (oldIdx === -1) return;

        // 表示上のNo. (1〜N) を配列インデックス (0〜N-1) に変換
        const targetIdx = Math.max(0, Math.min(newNo - 1, projects.length - 1));

        if (oldIdx === targetIdx) {
            this.renderProjectBody();
            return;
        }

        // 配列から削除して指定位置に挿入（割り込み処理）
        const [item] = projects.splice(oldIdx, 1);
        projects.splice(targetIdx, 0, item);

        this.validateIntegrity(); // No.の振り直しを含む整合性チェック
        this.render();            // メイン画面（工程表グリッド）の更新
        this.renderProjectBody(); // 製番リスト画面の更新
    },

    // --- 製番管理 ---
    handlePjFilter(key, val) {
        this.pjFilters[key] = val.toLowerCase();
        this.renderProjectBody();
    },

    resetPjFilters() {
        this.pjFilters = { jobNo: '', customer: '', name: '', team: '', person: '', tagId: '' };
        const bar = document.querySelector('.pj-search-bar');
        if (bar) {
            bar.querySelectorAll('input').forEach(i => i.value = '');
            bar.querySelectorAll('select').forEach(s => s.value = '');
        }
        this.renderProjectBody();
    },

    // セルのサイズ（高さ・幅）を内容に合わせて自動調整 
    adjustTextareaSize(el) {
        if (!el || el.tagName !== 'TEXTAREA') return;

        // 高さを調整
        el.style.height = 'auto';
        el.style.height = (el.scrollHeight) + 'px';

        // 幅を「最長の一行」に合わせて調整 (v2.55)
        // ただし、テーブル内の要素はCSS側で100%制御されるためスキップ (v2.96)
        if (!el.closest('table')) {
            const lines = el.value.split('\n');
            const maxLen = Math.max(...lines.map(l => {
                let len = 0;
                for (let i = 0; i < l.length; i++) {
                    len += l.charCodeAt(i) > 255 ? 2 : 1;
                }
                return len;
            }), 0);
            el.style.width = (maxLen + 2) + 'ch';
            el.style.minWidth = '100%';
        }
    },

    renderProjectBody() {
        const b = document.getElementById('projectBody');
        const countEl = document.getElementById('pjCount');
        if (!b) return;

        // フィルタ用プルダウンの生成 (v2.41)
        const teamFlt = document.getElementById('fltTeam');
        const personFlt = document.getElementById('fltPerson');
        const tagFlt = document.getElementById('fltTag');
        if (teamFlt && !teamFlt.options.length) {
            teamFlt.innerHTML = '<option value="">(すべて)</option>' + this.state.teams.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
        }
        if (personFlt && !personFlt.options.length) {
            personFlt.innerHTML = '<option value="">(すべて)</option>' + this.state.staff.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
        }
        if (tagFlt) {
            tagFlt.innerHTML = '<option value="">(すべて)</option>' + this.state.tags.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
            tagFlt.value = this.pjFilters.tagId;
        }

        // 複合フィルタリング処理 (v2.41: AND条件)
        const filtered = this.state.projects.filter(p => {
            const f = this.pjFilters;
            const matchJob = !f.jobNo || (p.jobNo || '').toLowerCase().includes(f.jobNo);
            const matchCust = !f.customer || (p.customer || '').toLowerCase().includes(f.customer);
            const matchName = !f.name || (p.name || '').toLowerCase().includes(f.name);
            const matchTeam = !f.team || (p.team === f.team);
            const matchPers = !f.person || (p.person === f.person);
            const matchTag = !f.tagId || (p.tagId === f.tagId);
            return matchJob && matchCust && matchName && matchTeam && matchPers && matchTag;
        });

        const isFiltered = Object.values(this.pjFilters).some(v => v !== '');

        // 件数更新
        if (countEl) countEl.innerText = `ヒット: ${filtered.length} / 全 ${this.state.projects.length} 件`;

        // 全項目のヘッダー定義 (v2.45)
        const hs = ['順序', 'No.', '指令書No.', '客先', '向先', '製品名', 'チーム', '担当者', '数量', '納期', '工数', '備考', 'タグ'];
        const cols = ['col-order', 'col-no', 'col-job', 'col-customer', 'col-dest', 'col-name', 'col-team', 'col-person', 'col-qty', 'col-date', 'col-mh', 'col-notes', 'col-tag'];

        b.innerHTML = `
            <table class="m-table">
                <thead>
                    <tr>
                        <th class="col-color-indicator"></th> <!-- カラー線用 (v2.47) -->
                        <th class="col-sel">選択</th>
                        ${hs.map((h, i) => `<th class="${cols[i]}">${h}</th>`).join('')}
                        <th class="col-opt">操作</th>
                    </tr>
                </thead>
                <tbody>
                    ${(() => {
                        let lastTagId = undefined;
                        return filtered.map(p => {
                            let header = '';
                            if (p.tagId !== lastTagId) {
                                const tagName = this.state.tags.find(t => t.id === p.tagId)?.name || '未設定';
                                header = `<tr class="tag-group-header"><td colspan="16">🏷️ ${this.esc(tagName)}</td></tr>`;
                                lastTagId = p.tagId;
                            }
                            const teamName = this.state.teams.find(t => t.id === p.team)?.name || '未設定';
                            const staffName = this.state.staff.find(s => s.id === p.person)?.name || '未設定';
                            return header + `
                        <tr>
                            <td class="col-color-indicator" style="background:${this.esc(p.color)}"></td>
                            <td class="col-sel"><button class="btn btn-select btn-icon" onclick="app.selectSelf('${this.esc(p.id)}')">選択</button></td>
                            <td class="col-order">
                                ${!isFiltered ? `
                                    <div style="display:flex;gap:4px;justify-content:center;">
                                        <button class="btn btn-icon" onclick="app.movePj(${this.state.projects.indexOf(p)}, -1)">▲</button>
                                        <button class="btn btn-icon" onclick="app.movePj(${this.state.projects.indexOf(p)}, 1)">▼</button>
                                    </div>
                                ` : '<span style="opacity:0.3">-</span>'}
                            </td>
                            <td class="col-no">
                                <input type="number" class="no-edit" value="${this.esc(p.no)}" onchange="app.reorderPj('${this.esc(p.id)}', this.value)">
                            </td>
                            <td class="col-job"><textarea class="edit-field" rows="1" oninput="app.adjustTextareaSize(this)" onchange="app.upPj('${this.esc(p.id)}', 'jobNo', this.value)">${this.esc(p.jobNo) || ''}</textarea></td>
                            <td class="col-customer"><textarea class="edit-field" rows="1" oninput="app.adjustTextareaSize(this)" onchange="app.upPj('${this.esc(p.id)}', 'customer', this.value)">${this.esc(p.customer) || ''}</textarea></td>
                            <td class="col-dest"><textarea class="edit-field" rows="1" oninput="app.adjustTextareaSize(this)" onchange="app.upPj('${this.esc(p.id)}', 'destination', this.value)">${this.esc(p.destination) || ''}</textarea></td>
                            <td class="col-name"><textarea class="edit-field" rows="1" oninput="app.adjustTextareaSize(this)" onchange="app.upPj('${this.esc(p.id)}', 'name', this.value)">${this.esc(p.name) || ''}</textarea></td>
                            <td class="col-team">
                                <select class="edit-field" onchange="app.upPjTeam('${this.esc(p.id)}', this.value)">
                                    <option value="">未設定</option>
                                    ${this.state.teams.map(t => `<option value="${this.esc(t.id)}" ${t.id === p.team ? 'selected' : ''}>${this.esc(t.name)}</option>`).join('')}
                                </select>
                            </td>
                            <td class="col-person">
                                <select class="edit-field" onchange="app.upPj('${this.esc(p.id)}', 'person', this.value)">
                                    <option value="">未設定</option>
                                    ${this.renderStaffOptions(p.team, p.person)}
                                </select>
                            </td>
                            <td class="col-qty"><textarea class="edit-field" rows="1" oninput="app.adjustTextareaSize(this)" onchange="app.upPj('${this.esc(p.id)}', 'qty', this.value)">${this.esc(p.qty) || ''}</textarea></td>
                            <td class="col-date"><textarea class="edit-field" rows="1" oninput="app.adjustTextareaSize(this)" onchange="app.upPj('${this.esc(p.id)}', 'deadline', this.value)">${this.esc(p.deadline) || ''}</textarea></td>
                            <td class="col-mh"><textarea class="edit-field" rows="1" oninput="app.adjustTextareaSize(this)" onchange="app.upPj('${this.esc(p.id)}', 'manHours', this.value)">${this.esc(p.manHours) || ''}</textarea></td>
                            <td class="col-notes"><textarea class="edit-field" rows="1" oninput="app.adjustTextareaSize(this)" onchange="app.upPj('${this.esc(p.id)}', 'notes', this.value)">${this.esc(p.notes) || ''}</textarea></td>
                            <td class="col-tag">
                                <select class="edit-field" onchange="app.upPj('${this.esc(p.id)}', 'tagId', this.value)">
                                    <option value="">未設定</option>
                                    ${this.state.tags.map(t => `<option value="${this.esc(t.id)}" ${t.id === p.tagId ? 'selected' : ''}>${this.esc(t.name)}</option>`).join('')}
                                </select>
                            </td>
                            <td class="col-opt"><button class="btn btn-danger btn-icon" onclick="app.delPj('${this.esc(p.id)}')">×</button></td>
                        </tr>`;
                        }).join('');
                    })()}
                </tbody>
            </table>`;

        // 描画直後に全てのサイズを調整 (v2.48/v2.55)
        setTimeout(() => {
            b.querySelectorAll('textarea.edit-field').forEach(el => this.adjustTextareaSize(el));
        }, 0);
    },

    renderStaffOptions(teamId, selectedSid) {
        let list = this.state.staff;
        if (teamId) list = list.filter(s => s.teamId === teamId);
        return list.map(s => `<option value="${s.id}" ${s.id === selectedSid ? 'selected' : ''}>${s.name}</option>`).join('');
    },

    upPjTeam(pid, tid) {
        const p = this.state.projects.find(x => x.id === pid);
        p.team = tid;
        p.person = '';
        this.render();
    },

    upPj(id, f, v) {
        const p = this.state.projects.find(x => x.id === id);
        if (p) p[f] = v;
        this.render();
    },

    delPj(id) {
        if (confirm('製番データを削除（ゴミ箱へ移動）しますか？')) {
            const idx = this.state.projects.findIndex(p => p.id === id);
            if (idx !== -1) {
                const [pj] = this.state.projects.splice(idx, 1);
                pj.deletedAt = new Date().toLocaleString('ja-JP', { 
                    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' 
                });
                this.state.deletedProjects.push(pj);
                // 最大50件保持
                if (this.state.deletedProjects.length > 50) {
                    this.state.deletedProjects.shift();
                }
                this.validateIntegrity();
                this.render();
                this.renderProjectBody();
            }
        }
    },

    restorePj(id) {
        const idx = this.state.deletedProjects.findIndex(p => p.id === id);
        if (idx !== -1) {
            const [pj] = this.state.deletedProjects.splice(idx, 1);
            this.state.projects.push(pj);
            this.validateIntegrity();
            this.render();
            this.renderMemberBody('deleted');
            alert('案件を復元しました（リストの最後尾に追加されました）');
        }
    },

    clearPjPermanently(id) {
        if (confirm('この案件をゴミ箱から完全に削除しますか？\n（復元できなくなります）')) {
            this.state.deletedProjects = this.state.deletedProjects.filter(p => p.id !== id);
            this.saveConfig();
            this.renderMemberBody('deleted');
        }
    },

    // 高度なTSVパーサー (v2.46: 引用符・セル内改行対応)
    parseTSV(text) {
        const rows = [];
        let row = [];
        let field = '';
        let inQuotes = false;

        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const next = text[i + 1];

            if (inQuotes) {
                // 引用符内での二重引用符はエスケープされた単一の引用符
                if (char === '"' && next === '"') {
                    field += '"';
                    i++;
                } else if (char === '"') {
                    inQuotes = false;
                } else {
                    field += char;
                }
            } else {
                if (char === '"') {
                    inQuotes = true;
                } else if (char === '\t') {
                    row.push(field);
                    field = '';
                } else if (char === '\r' && next === '\n') {
                    rows.push([...row, field]);
                    row = []; field = ''; i++;
                } else if (char === '\n' || char === '\r') {
                    rows.push([...row, field]);
                    row = []; field = '';
                } else {
                    field += char;
                }
            }
        }
        if (field || row.length) rows.push([...row, field]);
        return rows.filter(r => r.some(c => c.trim())); // 空行を除去
    },

    handlePaste(e) {
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        if (!text) return;

        // 高度なパーサーを使用 (v2.46)
        const rows = this.parseTSV(text);
        const timestamp = Date.now();

        rows.forEach((cols, idx) => {
            if (cols.length < 2) return;

            // 名前からIDを検索するヘルパー
            const teamName = (cols[4] || '').trim();
            const staffName = (cols[5] || '').trim();
            const foundTeam = this.state.teams.find(t => t.name === teamName);
            const foundStaff = this.state.staff.find(s => s.name === staffName);

            this.state.projects.push({
                id: `p_${timestamp}_${idx}_${Math.random().toString(16).slice(2, 8)}`,
                no: '',
                jobNo: cols[0] || '',       // 1列目: 指令書No
                customer: cols[1] || '',    // 2列目: 客先
                destination: cols[2] || '', // 3列目: 向先
                name: cols[3] || '',        // 4列目: 製品名
                team: foundTeam ? foundTeam.id : '',    // 5列目: チーム名
                person: foundStaff ? foundStaff.id : '',  // 6列目: 担当者名
                qty: cols[6] || '',         // 7列目: 数量 (移動後)
                deadline: cols[7] || '',    // 8列目: 納期
                manHours: cols[8] || '',    // 9列目: 工数
                notes: cols[9] || '',       // 10列目: 備考
                tagId: ''                   // 11列目以降（初期値は空）
            });
            // タグ名でのマッチングが必要な場合は将来的に拡張可能
        });
        this.validateIntegrity();
        this.render();
        this.renderProjectBody();
    },

    // 手動で製番リストに新規案件を追加する機能
    addBlankProject() {
        this.state.projects.push({
            id: `p_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
            no: '',
            jobNo: '',
            customer: '',
            destination: '',
            name: '',
            team: '',
            person: '',
            qty: '',
            deadline: '',
            manHours: '',
            notes: '',
            tagId: ''
        });
        this.validateIntegrity(); // No.を再計算
        this.render(); // 工程表がある場合の再描画
        this.renderProjectBody();

        // 一番下までスクロールして新しく追加された行を見やすくする
        setTimeout(() => {
            const pjView = document.getElementById('pjView');
            if (pjView) pjView.scrollTop = pjView.scrollHeight;
        }, 50);
    },

    // --- その他 ---
    hideModal(id) { document.getElementById(id).style.display = 'none'; },
    exportData() {
        const mon = new Date(this.state.monday);
        const sun = new Date(mon);
        sun.setDate(mon.getDate() + 6);
        
        const pad = (n) => n.toString().padStart(2, '0');
        const f = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
        
        const fn = `工程データ(${f(mon)}-${f(sun)}).json`;
        const blob = new Blob([JSON.stringify(this.state, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fn;
        a.click();
    },
    print() {
        // 印刷前に製番リストを最新状態にする（もし隠れていてもデータがあればレンダリングする）
        if (this.state.projects.length > 0) {
            this.renderProjectBody();
        }
        window.print();
    },
    // 共通データ反映処理 (v2.60)
    applyData(jsonText) {
        try {
            const data = JSON.parse(jsonText);

            // 基本的な構造チェック
            if (!data || typeof data !== 'object') throw new Error("Invalid Data Format");

            // 既存のstateにマージする前に中身を正規化
            Object.assign(this.state, {
                teams: Array.isArray(data.teams) ? data.teams : [],
                staff: Array.isArray(data.staff) ? data.staff : [],
                projects: Array.isArray(data.projects) ? data.projects : [],
                deletedProjects: Array.isArray(data.deletedProjects) ? data.deletedProjects : [],
                tags: Array.isArray(data.tags) ? data.tags : [],
                schedule: Array.isArray(data.schedule) ? data.schedule : [],
                holidays: Array.isArray(data.holidays) ? data.holidays : [],
                specialItems: Array.isArray(data.specialItems) ? data.specialItems : this.state.specialItems,
                monday: data.monday || this.state.monday,
                team: data.team || 'all'
            });

            this.validateIntegrity();
            this.render();
            alert('データの読み込みが完了しました');
        } catch (e) {
            console.error("Apply Data Error", e);
            alert('データ形式が正しくありません。');
        }
    },

    // ドラッグ＆ドロップ初期化 (v2.60)
    initDragAndDrop() {
        const overlay = document.getElementById('dropOverlay');
        if (!overlay) return;

        window.addEventListener('dragenter', (e) => {
            if (this.isFileDrag(e)) {
                e.preventDefault();
                overlay.classList.add('active');
            }
        });

        window.addEventListener('dragover', (e) => {
            if (this.isFileDrag(e)) {
                e.preventDefault();
                if (!overlay.classList.contains('active')) overlay.classList.add('active');
            }
        });

        window.addEventListener('dragleave', (e) => {
            e.preventDefault();
            // 子要素からの離脱を無視するため、relatedTargetをチェック
            if (!e.relatedTarget) {
                overlay.classList.remove('active');
            }
        });

        window.addEventListener('drop', async (e) => {
            // もしファイルドロップ用のオーバーレイが出ていた場合は消す
            overlay.classList.remove('active');
            
            // ファイルのドロップでなければ何もしない
            if (!this.isFileDrag(e)) return;

            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file && (file.type === "application/json" || file.name.endsWith('.json'))) {
                const text = await file.text();
                this.applyData(text);
            } else {
                alert('JSONファイルをドロップしてください。');
            }
        });
    }
};

window.onload = () => app.init();
