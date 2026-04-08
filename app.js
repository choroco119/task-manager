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
    pjFilters: { jobNo: '', customer: '', name: '', team: '', person: '' }, // 複数項目フィルタ (v2.41)

    init() {
        // モード判定
        const params = new URLSearchParams(window.location.search);
        if (params.get('mode') === 'pj') {
            this.isPjMode = true;
            document.body.classList.add('pj-view-active');
        } else {
            // メイン画面に固有の名前を付与 (v2.37)
            window.name = 'MainProcessManager';
        }

        this.loadConfig();
        this.setInitialWeek();
        this.render();

        // 別ウィンドウ同期
        window.addEventListener('storage', (e) => {
            if (e.key === 'scheduler_app_state') {
                this.loadConfig();
                this.render();
            }
            // 別窓からの選択信号 (v2.31 方式)
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
                h += `<div class="tab ${this.state.team === t.id ? 'active' : ''}" onclick="app.setT('${t.id}')">${t.name}</div>`;
            });
            elTabs.innerHTML = h;
        }

        this.renderGrid();
        this.updateWeekRangeDisplay();
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
                    <span style="color:${i >= 5 ? 'var(--danger-color)' : 'var(--text-secondary)'}">${d.getMonth() + 1}/${d.getDate()}</span>
                </div>`;
        }

        let list = [...this.state.staff].sort((a, b) => a.order - b.order);
        if (this.state.team !== 'all') {
            list = list.filter(s => s.teamId === this.state.team);
        }

        list.forEach(s => {
            const teamName = this.state.teams.find(t => t.id === s.teamId)?.name || '未所属';
            h += `
                <div class="grid-row">
                    <div class="grid-sidebar" id="sidebar-${s.id}">
                        <div class="staff-name">${s.isLeader ? '<span style="color:var(--leader-color)">★</span>' : ''} ${s.name}</div>
                        <div class="staff-team">${teamName}</div>
                    </div>
                    <div class="content-area" id="content-${s.id}">
                        <div class="click-grid">
                            ${[0, 1, 2, 3, 4, 5, 6].map(i => `<div class="click-cell" onclick="app.showA(${i}, '${s.id}')"></div>`).join('')}
                        </div>
                        <div class="bars-layer" id="bars-${s.id}"></div>
                    </div>
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
            b.innerText = `[${pj.no}] ${pj.name}`;
            b.title = `指令No: ${pj.jobNo}\n客先: ${pj.customer}\n納期: ${pj.deadline}`;
            
            b.onclick = (e) => {
                e.stopPropagation();
                app.showA(task.startIdx, null, task.id);
            };

            // ホバー連動 (v2.38: v2.39で表示保持に変更)
            b.onmouseenter = () => this.showPjDetail(pj.id);

            layer.appendChild(b);
        });

        // 行の高さを段数に合わせて動的に拡張 (v2.42: 常に1行分の余白を確保)
        const finalHeight = Math.max(80, (maxLv + 2) * 32 + 16);
        const elSide = document.getElementById(`sidebar-${sid}`);
        const elCont = document.getElementById(`content-${sid}`);
        if (elSide) elSide.style.height = `${finalHeight}px`;
        if (elCont) elCont.style.height = `${finalHeight}px`;
    },

    showA(idx, sid, eid) {
        this.activeEid = eid;
        this.activeSid = sid;
        this.refreshPjSelect();

        const sId = sid || (eid ? this.state.schedule.find(x => x.id === eid).staffId : '');
        const staff = this.state.staff.find(s => s.id === sId);
        document.getElementById('targetStaff').innerText = `対象: ${staff?.name || '---'}`;

        if (eid) {
            const it = this.state.schedule.find(x => x.id === eid);
            document.getElementById('dayS').value = it.startIdx;
            document.getElementById('dayE').value = it.endIdx;
            document.getElementById('pSel').selectedPjId = it.projectId; // 後でセット
            document.getElementById('pSel').value = it.projectId;
            document.getElementById('delBtn').style.display = 'block';
        } else {
            document.getElementById('dayS').value = idx;
            document.getElementById('dayE').value = idx;
            document.getElementById('pSel').value = '';
            document.getElementById('delBtn').style.display = 'none';
        }

        document.getElementById('pjSignalTip').innerText = '別窓リストから選ぶ ↗';
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

    // --- 詳細パネル連動 (v2.38) ---
    showPjDetail(pid) {
        const pj = this.state.projects.find(p => p.id === pid);
        const panel = document.getElementById('detailPanel');
        if (!pj || !panel) return;

        const teamName = this.state.teams.find(t => t.id === pj.team)?.name || '未設定';
        const staffName = this.state.staff.find(s => s.id === pj.person)?.name || '未設定';

        panel.innerHTML = `
            <div class="detail-card">
                <div class="detail-header">
                    <div class="detail-no">Project No.${pj.no}</div>
                    <div class="detail-title">${pj.name}</div>
                </div>
                <div class="detail-grid">
                    <div class="detail-item">
                        <div class="detail-label">指令書番号</div>
                        <div class="detail-value">${pj.jobNo || '---'}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">客先</div>
                        <div class="detail-value">${pj.customer || '---'}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">所属 / 担当</div>
                        <div class="detail-value">${teamName} / ${staffName}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">納期</div>
                        <div class="detail-value" style="color:var(--danger-color); font-weight:700;">${pj.deadline || '---'}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">向先 / 数量 / 工数</div>
                        <div class="detail-value">${pj.destination || '---'} / ${pj.qty || 0} / ${pj.manHours || 0}h</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">備考 / メモ</div>
                        <div class="detail-notes">${pj.notes || 'なし'}</div>
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

    // --- ウィンドウ間連携 ---
    showProjectMng() {
        const url = window.location.href.split('?')[0] + '?mode=pj';
        const win = window.open(url, 'pjMgr', `width=${window.outerWidth},height=${window.outerHeight}`);
        if (win) win.focus();
    },

    selectPjFromSub(signalValue) {
        if (!signalValue) return;
        const pid = signalValue.split('|')[0];
        
        // メイン画面を手前に引き寄せる (積極的フォーカス)
        try { window.focus(); } catch(e) {}
        
        this.refreshPjSelect();
        const el = document.getElementById('pSel');
        if (el) {
            el.value = pid;
            const tip = document.getElementById('pjSignalTip');
            if (tip) tip.innerHTML = '<span style="color:var(--success-color)">✅ 選択されました</span>';
        }
    },

    selectSelf(pid) {
        const signal = pid + '|' + Date.now();
        
        // 1. 名前指定でメインウィンドウを引き寄せる (v2.37: 最も確実な手法)
        try {
            const mainWin = window.open('', 'MainProcessManager');
            if (mainWin) mainWin.focus();
            
            if (window.opener && window.opener.app) {
                window.opener.app.selectPjFromSub(signal);
            }
        } catch (e) {
            console.warn("Opener naming focus failed, falling back to storage signal.");
        }

        // 2. シグナルを送信 (storage event経由)
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
                            <td><input class="edit-field" value="${x.name}" oninput="app.upTeamN('${x.id}', this.value)"></td>
                            <td>
                                <div style="display:flex;gap:4px;">
                                    <button class="btn btn-icon" onclick="app.moveTeam(${idx},-1)">▲</button>
                                    <button class="btn btn-icon" onclick="app.moveTeam(${idx},1)">▼</button>
                                </div>
                            </td>
                            <td><button class="btn btn-danger btn-icon" onclick="app.delTeam('${x.id}')">×</button></td>
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
                            <td><input class="edit-field" value="${s.name}" oninput="app.upStaffN('${s.id}', this.value)"></td>
                            <td>
                                <select onchange="app.upStT('${s.id}', this.value)" style="width:100%">
                                    <option value="">未所属</option>
                                    ${this.state.teams.map(t => `<option value="${t.id}" ${t.id === s.teamId ? 'selected' : ''}>${t.name}</option>`).join('')}
                                </select>
                            </td>
                            <td><button class="btn btn-icon ${s.isLeader ? 'btn-primary' : ''}" onclick="app.toggleL('${s.id}')">${s.isLeader ? '★' : '通常'}</button></td>
                            <td>
                                <div style="display:flex;gap:4px;">
                                    <button class="btn btn-icon" onclick="app.moveStaff(${idx},-1)">▲</button>
                                    <button class="btn btn-icon" onclick="app.moveStaff(${idx},1)">▼</button>
                                </div>
                            </td>
                            <td><button class="btn btn-danger btn-icon" onclick="app.delStaff('${s.id}')">×</button></td>
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
        let list = [...this.state.staff].sort((a,b)=>a.order-b.order);
        if (n >= 0 && n < list.length) {
            const tmp = list[idx].order;
            list[idx].order = list[n].order;
            list[n].order = tmp;
            this.renderMemberBody('staff');
            this.render();
        }
    },

    // --- 製番管理 ---
    handlePjFilter(key, val) {
        this.pjFilters[key] = val.toLowerCase();
        this.renderProjectBody();
    },

    // セルのサイズ（高さ・幅）を内容に合わせて自動調整 (v2.48/v2.55)
    adjustTextareaSize(el) {
        if (!el || el.tagName !== 'TEXTAREA') return;

        // 高さを調整
        el.style.height = 'auto';
        el.style.height = (el.scrollHeight) + 'px';

        // 幅を「最長の一行」に合わせて調整 (v2.55)
        const lines = el.value.split('\n');
        const maxLen = Math.max(...lines.map(l => {
            let len = 0;
            for(let i=0; i<l.length; i++) {
                len += l.charCodeAt(i) > 255 ? 2 : 1; // 全角を2, 半角を1としてカウント
            }
            return len;
        }), 0);
        
        // 少し余裕を持って幅を設定 (0.95ch はフォントによる微調整用)
        el.style.width = (maxLen + 2) + 'ch';
        el.style.minWidth = '100%';
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

        // 件数更新
        if (countEl) countEl.innerText = `ヒット: ${filtered.length} / 全 ${this.state.projects.length} 件`;

        // 全項目のヘッダー定義 (v2.45)
        const hs = ['No.', '指令書', '客先', '向先', '製品名', '数', 'チーム', '担当', '納期', '工数', '備考'];
        const cols = ['col-no', 'col-job', 'col-customer', 'col-dest', 'col-name', 'col-qty', 'col-team', 'col-person', 'col-date', 'col-mh', 'col-notes'];
        
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
                            <td class="col-color-indicator" style="background:${p.color}"></td>
                            <td class="col-sel"><button class="btn btn-select btn-icon" onclick="app.selectSelf('${p.id}')">選択</button></td>
                            <td class="col-no">${p.no}</td>
                            <td class="col-job"><textarea class="edit-field" rows="1" oninput="app.upPj('${p.id}', 'jobNo', this.value); app.adjustTextareaSize(this)">${p.jobNo || ''}</textarea></td>
                            <td class="col-customer"><textarea class="edit-field" rows="1" oninput="app.upPj('${p.id}', 'customer', this.value); app.adjustTextareaSize(this)">${p.customer || ''}</textarea></td>
                            <td class="col-dest"><textarea class="edit-field" rows="1" oninput="app.upPj('${p.id}', 'destination', this.value); app.adjustTextareaSize(this)">${p.destination || ''}</textarea></td>
                            <td class="col-name"><textarea class="edit-field" rows="1" oninput="app.upPj('${p.id}', 'name', this.value); app.adjustTextareaSize(this)">${p.name || ''}</textarea></td>
                            <td class="col-qty"><textarea class="edit-field" rows="1" oninput="app.upPj('${p.id}', 'qty', this.value); app.adjustTextareaSize(this)">${p.qty || ''}</textarea></td>
                            <td class="col-team">
                                <select class="edit-field" onchange="app.upPjTeam('${p.id}', this.value)">
                                    <option value="">未設定</option>
                                    ${this.state.teams.map(t => `<option value="${t.id}" ${t.id === p.team ? 'selected' : ''}>${t.name}</option>`).join('')}
                                </select>
                            </td>
                            <td class="col-person">
                                <select class="edit-field" onchange="app.upPj('${p.id}', 'person', this.value)">
                                    <option value="">未設定</option>
                                    ${this.renderStaffOptions(p.team, p.person)}
                                </select>
                            </td>
                            <td class="col-date"><textarea class="edit-field" rows="1" oninput="app.upPj('${p.id}', 'deadline', this.value); app.adjustTextareaSize(this)">${p.deadline || ''}</textarea></td>
                            <td class="col-mh"><textarea class="edit-field" rows="1" oninput="app.upPj('${p.id}', 'manHours', this.value); app.adjustTextareaSize(this)">${p.manHours || ''}</textarea></td>
                            <td class="col-notes"><textarea class="edit-field" rows="1" oninput="app.upPj('${p.id}', 'notes', this.value); app.adjustTextareaSize(this)">${p.notes || ''}</textarea></td>
                            <td class="col-opt"><button class="btn btn-danger btn-icon" onclick="app.delPj('${p.id}')">×</button></td>
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
        this.renderProjectBody();
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

            this.state.projects.push({
                // IDの重複を完全に防止
                id: `p_${timestamp}_${idx}_${Math.random().toString(16).slice(2, 8)}`,
                no: '',
                jobNo: cols[0] || '',       // 1列目: 指令書No
                customer: cols[1] || '',    // 2列目: 客先
                destination: cols[2] || '', // 3列目: 向先
                name: cols[3] || '',        // 4列目: 製品名
                qty: cols[4] || '',         // 5列目: 数量
                team: '',
                person: '',
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
        const fn = `scheduler_export_${d.getFullYear()}${d.getMonth()+1}${d.getDate()}.json`;
        const blob = new Blob([JSON.stringify(this.state, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fn;
        a.click();
    },
    async importData() {
        try {
            const [h] = await window.showOpenFilePicker({ types: [{ accept: { 'application/json': ['.json'] } }] });
            const f = await h.getFile(), c = await f.text();
            Object.assign(this.state, JSON.parse(c));
            this.validateIntegrity();
            this.render();
        } catch (e) {}
    }
};

window.onload = () => app.init();
