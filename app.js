const app = {
    state: {
        monday: null,
        team: 'all',
        teams: [],
        staff: [],
        projects: [],
        schedule: []
    },
    isPjMode: false,
    activeEid: null,
    activeSid: null,
    pjFilters: { jobNo: '', customer: '', name: '', team: '', person: '' }, // 複数項目フィルタ
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
    },

    saveConfig() {
        this.validateIntegrity();
        localStorage.setItem('scheduler_app_state', JSON.stringify(this.state));
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
        if (!this.state.schedule) this.state.schedule = [];

        const teamIds = new Set(this.state.teams.map(t => t.id));
        const staffIds = new Set(this.state.staff.map(s => s.id));
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
        });

        this.state.schedule = this.state.schedule.filter(l => staffIds.has(l.staffId) && pjIds.has(l.projectId));
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
            const isToday = new Date().toDateString() === d.toDateString();
            h += `
                <div class="grid-header" style="${isToday ? 'background:rgba(99,102,241,0.1)' : ''}">
                    <b>${['月', '火', '水', '木', '金', '土', '日'][i]}</b>
                    <span style="color:${i === 5 ? 'var(--saturday-color)' : (i === 6 ? 'var(--danger-color)' : 'var(--text-secondary)')}">${d.getMonth() + 1}/${d.getDate()}</span>
                </div>`;
        }
        h += `<div class="grid-header grid-total-header">合計工数</div>`;

        let list = [...this.state.staff].sort((a, b) => a.order - b.order);
        if (this.state.team !== 'all') {
            list = list.filter(s => s.teamId === this.state.team);
        }

        list.forEach(s => {
            const teamName = this.state.teams.find(t => t.id === s.teamId)?.name || '未所属';

            // この週の工数を算出 
            const staffTasks = this.state.schedule.filter(l => l.staffId === s.id);
            const totalH = staffTasks.reduce((sum, t) => {
                const pj = this.state.projects.find(p => p.id === t.projectId);
                return sum + this.parseManHours(pj?.manHours);
            }, 0);

            h += `
                <div class="grid-row">
                    <div class="grid-sidebar" id="sidebar-${s.id}">
                        <div class="staff-name">${s.isLeader ? '<span style="color:var(--leader-color)">★</span>' : ''} ${this.esc(s.name)}</div>
                        <div class="staff-team">${this.esc(teamName)}</div>
                    </div>
                    <div class="content-area" id="content-${s.id}">
                        <div class="click-grid">
                            ${[0, 1, 2, 3, 4, 5, 6].map(i => `<div class="click-cell" onclick="app.showA(${i}, '${s.id}')"></div>`).join('')}
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

        const tasks = this.state.schedule.filter(l => l.staffId === sid);
        const stacks = [];
        let maxLv = 0;

        tasks.sort((a, b) => a.startIdx - b.startIdx).forEach(task => {
            // 重なり判定 (スタッキングロジック)
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

            const pj = this.state.projects.find(p => p.id === task.projectId);
            if (!pj) return;

            const b = document.createElement('div');
            b.className = 'bar';
            const left = (task.startIdx / 7) * 100;
            const width = ((task.endIdx - task.startIdx + 1) / 7) * 100;

            b.style.left = `calc(${left}% + 4px)`;
            b.style.width = `calc(${width}% - 8px)`;
            b.style.top = `${lv * 32 + 8}px`; // 縦に並べる
            b.style.backgroundColor = pj.color;
            b.innerHTML = `<span style="font-size:0.75rem;opacity:0.8;margin-right:4px;">#${this.esc(pj.no)}</span> <b style="font-size:0.85rem;">${this.esc(pj.jobNo)}</b><span style="opacity:0.6;margin-left:4px;">: ${this.esc(pj.name)}</span>`;
            b.title = `指令No: ${pj.jobNo}\n客先: ${pj.customer}\n納期: ${pj.deadline}`;

            b.onclick = (e) => {
                e.stopPropagation();
                app.showA(task.startIdx, null, task.id);
            };

            // ホバー連動
            b.onmouseenter = () => this.showPjDetail(pj.id);

            layer.appendChild(b);
        });

        // 行の高さを段数に合わせて動的に拡張 
        const finalHeight = Math.max(120, (maxLv + 2) * 32 + 16);
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

    showA(idx, sid, eid = null, pid = null) {
        // 先行して製番が選ばれている場合 
        if (this.pendingPid && !pid) {
            const selectedPid = this.pendingPid;
            this.clearPendingPid();
            this.showA(idx, sid, null, selectedPid);
            return;
        }

        this.activeEid = eid;
        this.activeSid = sid;

        // 新規入力時、まだ製番が決まっていないならリストを表示 
        if (!eid && !pid) {
            this.pendingAssign = { idx, sid };
            this.showPjModal();
            return;
        }

        this.pendingAssign = null;
        this.refreshPjSelect();

        const sId = sid || (eid ? this.state.schedule.find(x => x.id === eid).staffId : '');
        const staff = this.state.staff.find(s => s.id === sId);
        document.getElementById('targetStaff').innerText = `対象: ${staff?.name || '---'}`;

        if (eid) {
            const it = this.state.schedule.find(x => x.id === eid);
            document.getElementById('dayS').value = it.startIdx;
            document.getElementById('dayE').value = it.endIdx;
            document.getElementById('pSel').value = it.projectId;
            document.getElementById('delBtn').style.display = 'block';
        } else {
            document.getElementById('dayS').value = idx;
            document.getElementById('dayE').value = idx;
            document.getElementById('pSel').value = pid || '';
            document.getElementById('delBtn').style.display = 'none';
        }

        document.getElementById('assignModal').style.display = 'flex';
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

    // --- 詳細パネル連動 ---
    showPjDetail(pid) {
        const pj = this.state.projects.find(p => p.id === pid);
        const panel = document.getElementById('detailPanel');
        if (!pj || !panel) return;

        const teamName = this.state.teams.find(t => t.id === pj.team)?.name || '未設定';
        const staffName = this.state.staff.find(s => s.id === pj.person)?.name || '未設定';

        panel.innerHTML = `
            <div class="detail-card">
                <div class="detail-header">
                    <div class="detail-no">Project No.${this.esc(pj.no)}</div>
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
        const p = document.getElementById('pSel').value;

        if (!p) {
            alert('製番を選択してください');
            return;
        }

        if (this.activeEid) {
            const item = this.state.schedule.find(sc => sc.id === this.activeEid);
            Object.assign(item, { startIdx: s, endIdx: e, projectId: p });
        } else {
            this.state.schedule.push({
                id: 'sc' + Date.now(),
                staffId: this.activeSid,
                projectId: p,
                startIdx: s,
                endIdx: e
            });
        }
        this.hideModal('assignModal');
        this.render();
    },

    delSchedule() {
        if (confirm('割当を削除しますか？')) {
            this.state.schedule = this.state.schedule.filter(s => s.id !== this.activeEid);
            this.hideModal('assignModal');
            this.render();
        }
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
                try { window.focus(); } catch(e) {}
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

    // --- メンバー管理 ---
    showMemberMng() {
        document.getElementById('memberModal').style.display = 'flex';
        this.switchMemberTab('staff');
    },

    switchMemberTab(t) {
        document.querySelectorAll('.m-tab').forEach(el => el.classList.remove('active'));
        const elTab = document.getElementById('mtb-' + (t === 'staff' ? 's' : 't'));
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
    movePj(idx, dir) {
        const n = idx + dir;
        if (n >= 0 && n < this.state.projects.length) {
            [this.state.projects[idx], this.state.projects[n]] = [this.state.projects[n], this.state.projects[idx]];
            this.render(); // 保存と再描画
            this.renderProjectBody();
        }
    },

    // --- 製番管理 ---
    handlePjFilter(key, val) {
        this.pjFilters[key] = val.toLowerCase();
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
        if (teamFlt && !teamFlt.options.length) {
            teamFlt.innerHTML = '<option value="">(すべて)</option>' + this.state.teams.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
        }
        if (personFlt && !personFlt.options.length) {
            personFlt.innerHTML = '<option value="">(すべて)</option>' + this.state.staff.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
        }

        // 複合フィルタリング処理 (v2.41: AND条件)
        const filtered = this.state.projects.filter(p => {
            const f = this.pjFilters;
            const matchJob = !f.jobNo || (p.jobNo || '').toLowerCase().includes(f.jobNo);
            const matchCust = !f.customer || (p.customer || '').toLowerCase().includes(f.customer);
            const matchName = !f.name || (p.name || '').toLowerCase().includes(f.name);
            const matchTeam = !f.team || (p.team === f.team);
            const matchPers = !f.person || (p.person === f.person);
            return matchJob && matchCust && matchName && matchTeam && matchPers;
        });

        const isFiltered = Object.values(this.pjFilters).some(v => v !== '');

        // 件数更新
        if (countEl) countEl.innerText = `ヒット: ${filtered.length} / 全 ${this.state.projects.length} 件`;

        // 全項目のヘッダー定義 (v2.45)
        const hs = ['順序', 'No.', '指令書No.', '客先', '向先', '製品名', 'チーム', '担当者', '数量', '納期', '工数', '備考'];
        const cols = ['col-order', 'col-no', 'col-job', 'col-customer', 'col-dest', 'col-name', 'col-team', 'col-person', 'col-qty', 'col-date', 'col-mh', 'col-notes'];

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
                    ${filtered.map(p => {
            const teamName = this.state.teams.find(t => t.id === p.team)?.name || '未設定';
            const staffName = this.state.staff.find(s => s.id === p.person)?.name || '未設定';
            return `
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
                            <td class="col-no">${this.esc(p.no)}</td>
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
                            <td class="col-opt"><button class="btn btn-danger btn-icon" onclick="app.delPj('${this.esc(p.id)}')">×</button></td>
                        </tr>`;
        }).join('')}
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
        if (confirm('製番データを削除しますか？')) {
            this.state.projects = this.state.projects.filter(p => p.id !== id);
            this.validateIntegrity();
            this.render();
            this.renderProjectBody();
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
                notes: cols[9] || ''        // 10列目: 備考
            });
        });
        this.validateIntegrity();
        this.render();
        this.renderProjectBody();
    },

    // --- その他 ---
    hideModal(id) { document.getElementById(id).style.display = 'none'; },
    exportData() {
        const d = new Date();
        const fn = `scheduler_export_${d.getFullYear()}${d.getMonth() + 1}${d.getDate()}.json`;
        const blob = new Blob([JSON.stringify(this.state, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fn;
        a.click();
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
                schedule: Array.isArray(data.schedule) ? data.schedule : [],
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
            e.preventDefault();
            overlay.classList.add('active');
        });

        window.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (!overlay.classList.contains('active')) overlay.classList.add('active');
        });

        window.addEventListener('dragleave', (e) => {
            e.preventDefault();
            // 子要素からの離脱を無視するため、relatedTargetをチェック
            if (!e.relatedTarget) {
                overlay.classList.remove('active');
            }
        });

        window.addEventListener('drop', async (e) => {
            e.preventDefault();
            overlay.classList.remove('active');

            const file = e.dataTransfer.files[0];
            if (file && file.type === "application/json" || file.name.endsWith('.json')) {
                const text = await file.text();
                this.applyData(text);
            } else {
                alert('JSONファイルをドロップしてください。');
            }
        });
    }
};

window.onload = () => app.init();
