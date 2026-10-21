/* Administrator views */
const Admin = (() => {
  const cand = id => App.state.config.candidates.find(c => c.id === id);
  const esc = H.esc;

  const actionIcon = a => {
    if (/CREATE/.test(a)) return H.ico('plus', 13);
    if (/UPDATE|CORRECT/.test(a)) return H.ico('edit', 13);
    if (/UNLOCK/.test(a)) return H.ico('unlock', 13);
    if (/LOCK/.test(a)) return H.ico('lock', 13);
    if (/RESET|DELETE/.test(a)) return H.ico('trash', 13);
    if (/LOGIN|LOGOUT/.test(a)) return H.ico('users', 13);
    if (/USER/.test(a)) return H.ico('users', 13);
    if (/BRANCH|AREA/.test(a)) return H.ico('branches', 13);
    if (/BACKUP|IMPORT/.test(a)) return H.ico('download', 13);
    return '•';
  };

  /* ======================= OVERVIEW ======================= */
  async function overview(el) {
    const draw = async () => {
      const d = await H.api('/api/admin/overview');
      const t = d.totals;
      const cands = d.candidates;
      const leader = cands.find(c => c.id === d.leaderId);
      const topAreas = [...d.areas]
        .sort((a, b) => (b.reported / b.branches) - (a.reported / a.branches) || b.reported - a.reported)
        .slice(0, 6);

      el.innerHTML = `
        <div class="page-head">
          <div><h1>Admin Overview</h1><p>Live collation of the Vice Chairman election across all ${H.fmt(t.branches)} branches${t.lastUpdated ? ' · updated ' + H.timeAgo(t.lastUpdated) : ''}.</p></div>
          <div class="head-actions">
            <button class="btn" data-nav="collation">Open collation</button>
            <button class="btn primary" data-nav="entry">${H.ico('plus', 13)} Enter results</button>
          </div>
        </div>
        ${d.resultsOpen ? '' : '<div class="notice warn"><div><b>Result entry is currently closed.</b> Officers cannot submit new results. Re-open it from Settings.</div></div>'}

        <div class="grid kpis" style="margin-bottom:16px">
          <div class="card kpi green"><span class="k-accent"></span><div class="k-label">Branches reported</div>
            <div class="k-value">${H.fmt(t.reported)} <small>/ ${H.fmt(t.branches)}</small></div>
            <div class="bar-mini"><i style="width:${t.reportingRate}%"></i></div>
            <div class="k-foot">${H.pct(t.reportingRate, 0)} reporting · ${H.fmt(t.pending)} pending</div></div>
          <div class="card kpi red"><span class="k-accent"></span><div class="k-label">Total votes cast</div>
            <div class="k-value">${H.fmt(t.cast)}</div><div class="k-foot">Candidate votes + rejected</div></div>
          <div class="card kpi dark"><span class="k-accent"></span><div class="k-label">Valid votes</div>
            <div class="k-value">${H.fmt(t.valid)}</div><div class="k-foot">${H.pct(t.cast ? (t.valid / t.cast) * 100 : 0)} of votes cast</div></div>
          <div class="card kpi gold"><span class="k-accent"></span><div class="k-label">Rejected ballots</div>
            <div class="k-value">${H.fmt(t.rejected)}</div><div class="k-foot">${H.pct(t.rejectedShare)} of votes cast</div></div>
          <div class="card kpi"><span class="k-accent" style="background:${leader ? leader.color : 'var(--slate-2)'}"></span>
            <div class="k-label">Currently leading</div>
            <div class="k-value" style="font-size:${leader ? '22px' : '26px'}">${leader ? esc(leader.short.split(' ')[0] + ' ' + leader.short.split(' ').slice(-1)) : 'No results'}</div>
            <div class="k-foot">${leader ? `${H.fmt(leader.votes)} votes · margin ${H.fmt(d.margin)}` : 'Waiting for first entry'}</div></div>
        </div>

        <div class="grid cands" style="margin-bottom:16px">${Charts.candidateCards(cands, t.valid)}</div>

        <div class="card">
          <div class="card-head"><div><h2>Reporting progress</h2><div class="sub">Top ${topAreas.length} of ${d.areas.length} electoral areas by reporting · vote split shown below each bar</div></div>
            <button class="btn xs" data-nav="progress">View all</button></div>
          <div class="card-pad" style="padding-top:4px">
            ${topAreas.map(a => Charts.areaRow(a)).join('') || '<div class="empty"><p>No electoral areas.</p></div>'}
            <div class="area-legend" style="margin-top:12px">
              <span><span class="dotc" style="background:#036439"></span>${esc(cands.find(c => c.id === 1)?.short || 'C1')}</span>
              <span><span class="dotc" style="background:#d20f2d"></span>${esc(cands.find(c => c.id === 2)?.short || 'C2')}</span>
              <span><span class="dotc" style="background:#202020"></span>${esc(cands.find(c => c.id === 3)?.short || 'C3')}</span>
            </div>
          </div>
        </div>`;
    };
    await draw();
    return { refresh: draw };
  }

  /* ======================= COLLATION ======================= */
  async function collation(el) {
    let rows = [];
    const filters = { q: '', area: '', status: '' };

    el.innerHTML = `
      <div class="page-head">
        <div><h1>Branch Collation</h1><p>Every branch result entered, with candidate votes, rejected ballots and automatic vote-cast totals. Edit or delete any entry, including other users’.</p></div>
        <div class="head-actions">
          <button class="btn" id="colExport">${H.ico('download', 13)} Export CSV</button>
          <button class="btn" id="colLockAll">${H.ico('lock', 13)} Lock all reported</button>
          <button class="btn primary" data-nav="entry">${H.ico('plus', 13)} Enter results</button>
        </div>
      </div>
      <div class="card">
        <div class="toolbar">
          <input class="input input-sm" id="colSearch" placeholder="Search branch, code or officer…" style="max-width:280px">
          <select class="input input-sm area-filter" id="colArea" aria-label="Filter collation by electoral area"><option value="">All electoral areas</option></select>
          <select class="input input-sm" id="colStatus" aria-label="Filter collation by status" style="max-width:170px">
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="entered">Entered</option>
            <option value="locked">Locked</option>
          </select>
          <span class="spacer"></span>
          <span class="count-chip" id="colCount"></span>
        </div>
        <div id="colTable"></div>
      </div>`;

    const areas = [...new Set(App.state.branches.map(b => b.area))].sort((a, b) => a.localeCompare(b));
    H.$('#colArea', el).innerHTML += areas.map(a => `<option value="${esc(a)}">${esc(a)}</option>`).join('');

    function filtered() {
      const q = filters.q.toLowerCase();
      return rows.filter(r => {
        if (filters.area && r.area !== filters.area) return false;
        if (filters.status && r.status !== filters.status) return false;
        if (q && !(`${r.code} ${r.name} ${r.area} ${r.enteredBy || ''} ${r.updatedByName || ''}`.toLowerCase().includes(q))) return false;
        return true;
      });
    }

    function table() {
      const list = filtered();
      const sum = list.reduce((s, r) => {
        if (r.c1 == null) return s;
        s.c1 += r.c1; s.c2 += r.c2; s.c3 += r.c3; s.rej += r.rejected; s.cast += r.cast;
        return s;
      }, { c1: 0, c2: 0, c3: 0, rej: 0, cast: 0 });
      const wrap = H.$('#colTable', el);
      H.$('#colCount', el).textContent = `${list.length} branch${list.length === 1 ? '' : 'es'}`;
      if (!list.length) {
        wrap.innerHTML = `<div class="empty"><div class="e-ico">${H.ico('search', 30)}</div><h2>No branches match</h2><p>Adjust the search or filters.</p></div>`;
        return;
      }
      wrap.innerHTML = `<div class="table-wrap"><table class="data">
        <thead><tr>
          <th>Branch</th><th>Electoral area</th>
          <th class="num" title="${esc(cand(1).short)} — candidate 1">Cand. 1<small style="display:block;font-weight:600;text-transform:none;letter-spacing:0;color:var(--slate-2)">L. O. Yeboah</small></th>
          <th class="num" title="${esc(cand(2).short)} — candidate 2">Cand. 2<small style="display:block;font-weight:600;text-transform:none;letter-spacing:0;color:var(--slate-2)">J. J. Owusu Ansah</small></th>
          <th class="num" title="${esc(cand(3).short)} — candidate 3">Cand. 3<small style="display:block;font-weight:600;text-transform:none;letter-spacing:0;color:var(--slate-2)">N. K. Nti</small></th>
          <th class="num">Rejected</th><th class="num">Votes cast</th>
          <th>Status</th><th>Entered by</th><th>Last update</th><th style="text-align:right">Actions</th>
        </tr></thead>
        <tbody>${list.map(r => `
          <tr data-branch="${r.id}">
            <td><div class="branch-name">${esc(r.name)}</div><div class="branch-code">${esc(r.code)}</div></td>
            <td class="muted small">${esc(r.area)}</td>
            <td class="num ${r.c1 == null ? 'muted' : ''}">${H.fmt(r.c1)}</td>
            <td class="num ${r.c2 == null ? 'muted' : ''}">${H.fmt(r.c2)}</td>
            <td class="num ${r.c3 == null ? 'muted' : ''}">${H.fmt(r.c3)}</td>
            <td class="num ${r.rejected == null ? 'muted' : ''}">${H.fmt(r.rejected)}</td>
            <td class="num"><b>${H.fmt(r.cast)}</b></td>
            <td>${H.statusBadge(r.status)}</td>
            <td class="small">${r.entryOwner && r.entryOwner !== '—' ? esc(r.entryOwner) : '<span class="muted">—</span>'}</td>
            <td class="small muted nowrap">${r.updatedAt ? H.timeAgo(r.updatedAt) : '—'}</td>
            <td>
              <div class="row-actions">
                <button class="btn xs" data-act="${r.status === 'pending' ? 'enter' : 'edit'}" data-id="${r.id}">${r.status === 'pending' ? 'Enter' : H.ico('edit', 11) + ' Edit'}</button>
                ${r.status === 'pending' ? '' : r.locked
                  ? `<button class="btn xs" data-act="unlock" data-id="${r.id}">${H.ico('unlock', 11)} Unlock</button>`
                  : `<button class="btn xs" data-act="lock" data-id="${r.id}">${H.ico('lock', 11)} Lock</button>`}
                ${r.status === 'pending' ? '' : `<button class="btn xs danger" data-act="reset" data-id="${r.id}">${H.ico('trash', 11)} Delete</button>`}
              </div>
            </td>
          </tr>`).join('')}
        </tbody>
        <tfoot><tr>
          <td colspan="2">Totals (${list.length} shown)</td>
          <td class="num">${H.fmt(sum.c1)}</td><td class="num">${H.fmt(sum.c2)}</td><td class="num">${H.fmt(sum.c3)}</td>
          <td class="num">${H.fmt(sum.rej)}</td><td class="num">${H.fmt(sum.cast)}</td>
          <td colspan="4"></td>
        </tr></tfoot></table></div>`;
    }

    const load = async () => {
      const d = await H.api('/api/admin/results');
      rows = d.rows.map(r => ({ ...r, entryOwner: r.status === 'pending' ? '—' : (r.updatedByName || r.enteredBy) }));
      table();
    };

    H.$('#colSearch', el).addEventListener('input', H.debounce(e => { filters.q = e.target.value; table(); }, 150));
    H.$('#colArea', el).addEventListener('change', e => { filters.area = e.target.value; table(); });
    H.$('#colStatus', el).addEventListener('change', e => { filters.status = e.target.value; table(); });

    H.$('#colExport', el).addEventListener('click', async () => {
      try {
        const res = await fetch('/api/admin/export.csv', { headers: { 'x-session': H.getToken() || '' } });
        if (!res.ok) throw new Error('Export failed');
        const text = await res.text();
        H.download(`atwima-kwanwoma-vice-chairman-${new Date().toISOString().slice(0, 10)}.csv`, text);
        H.toast('CSV exported.', 'success');
      } catch (e) { H.toast(e.message, 'error'); }
    });

    H.$('#colLockAll', el).addEventListener('click', async () => {
      const ok = await H.confirmDialog({
        title: 'Lock all reported results?',
        message: 'All entered branch results will be locked so officers can no longer edit them. You can still unlock individual branches.',
        confirmText: 'Lock all'
      });
      if (!ok) return;
      try {
        const d = await H.api('/api/admin/results/lock-all', { method: 'POST', body: {} });
        H.toast(`${d.locked} branch result(s) locked.`, 'success');
        load();
      } catch (e) { H.toast(e.message, 'error'); }
    });

    el.onclick = async e => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const row = rows.find(r => r.id === btn.dataset.id);
      if (!row) return;
      const act = btn.dataset.act;
      if (act === 'enter' || act === 'edit') return openEditor(row, load);
      if (act === 'lock' || act === 'unlock') {
        try {
          await H.api(`/api/admin/results/${row.id}/${act}`, { method: 'POST', body: {} });
          H.toast(act === 'lock' ? 'Branch result locked.' : 'Branch result unlocked.', 'success');
          load();
        } catch (er) { H.toast(er.message, 'error'); }
      }
      if (act === 'reset') {
        const ok = await H.confirmDialog({
          title: 'Delete this branch result?',
          message: `<b>${esc(row.code)} · ${esc(row.name)}</b> will be reset to “pending”. The figures will be removed and the action logged in the audit trail.`,
          confirmText: 'Delete result', danger: true
        });
        if (!ok) return;
        try {
          await H.api(`/api/admin/results/${row.id}/reset`, { method: 'POST', body: {} });
          H.toast('Branch result deleted.', 'success');
          load();
        } catch (er) { H.toast(er.message, 'error'); }
      }
    };

    await load();
    return { refresh: load };
  }

  function openEditor(row, after) {
    if (!row) return;
    const locked = row.status === 'locked';
    const pending = row.status === 'pending';
    const body = `
      ${locked ? `<div class="notice lock" style="margin-bottom:14px"><div>${H.ico('lock', 13)} This result is locked. Saving changes creates a <b>correction</b> that is recorded in the audit trail with your name.</div></div>` : ''}
      <div class="tiny muted" style="margin-bottom:6px;font-weight:800;letter-spacing:.06em">${esc(row.code)} · ${esc(row.area).toUpperCase()}</div>
      <div class="form-grid">
        ${[1, 2, 3].map(id => { const c = cand(id); return `
          <label class="field"><span>${esc(c.short)}</span>
            <input class="input" id="m${id}" inputmode="numeric" value="${row['c' + id] == null ? '' : row['c' + id]}" placeholder="0"></label>`; }).join('')}
        <label class="field"><span>Rejected ballots</span>
          <input class="input" id="mrej" inputmode="numeric" value="${row.rejected == null ? '' : row.rejected}" placeholder="0"></label>
        <div class="full total-strip" style="margin:4px 0 14px">
          <div><div class="ts-label">Total votes cast</div><div class="ts-sub">auto-calculated</div></div>
          <div class="ts-value" id="mTotal">0</div>
        </div>
        ${locked ? `<div class="full"><label class="field"><span>Correction reason (required)</span>
          <textarea class="input" id="mReason" placeholder="Explain the correction for the audit trail…"></textarea></label></div>` : ''}
      </div>
      <div id="mErr"></div>`;
    const m = H.modal({
      title: (pending ? 'Enter result — ' : 'Edit result — ') + esc(row.name),
      subtitle: pending ? 'Figures become visible on the dashboard immediately after saving.' : `Last updated ${row.updatedAt ? H.fmtDateTime(row.updatedAt) : '—'}${row.updatedByName ? ' by ' + esc(row.updatedByName) : ''}`,
      body, size: 'lg',
      footer: `<button class="btn" data-close>Cancel</button><button class="btn ${locked ? 'primary' : 'green'}" id="mSave">${locked ? 'Save correction' : 'Save result'}</button>`
    });
    const $ = s => H.$(s, m.el);
    const recalc = () => {
      const v = ['#m1', '#m2', '#m3', '#mrej'].reduce((s, sel) => s + (Number($(sel).value) || 0), 0);
      $('#mTotal').textContent = H.fmt(v);
    };
    ['#m1', '#m2', '#m3', '#mrej'].forEach(s => $(s).addEventListener('input', recalc));
    recalc();
    $('#mSave').addEventListener('click', async () => {
      const payload = {
        branchId: row.id,
        c1: $('#m1').value, c2: $('#m2').value, c3: $('#m3').value, rejected: $('#mrej').value
      };
      const vals = [payload.c1, payload.c2, payload.c3, payload.rejected];
      if (vals.some(v => String(v).trim() === '' || !/^\d+$/.test(String(v).trim()))) {
        $('#mErr').innerHTML = '<div class="alert error">All fields must be whole numbers (0 or more).</div>';
        return;
      }
      if (locked) payload.reason = $('#mReason') ? $('#mReason').value : '';
      const btn = $('#mSave');
      btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Saving…';
      try {
        if (locked) await H.api(`/api/admin/results/${row.id}/correct`, { method: 'POST', body: payload });
        else await H.api('/api/results', { method: 'POST', body: payload });
        m.close();
        H.toast('Result saved for ' + row.name, 'success');
        await App.refreshBranches();
        if (after) after();
      } catch (e) {
        $('#mErr').innerHTML = '<div class="alert error">' + esc(e.message) + '</div>';
        btn.disabled = false; btn.textContent = locked ? 'Save correction' : 'Save result';
      }
    });
  }

  /* ======================= PROGRESS ======================= */
  async function progress(el) {
    const draw = async () => {
      const d = await H.api('/api/admin/overview');
      const t = d.totals;
      const areaGrid = [...d.areas].sort((a, b) => a.area.localeCompare(b.area));
      el.innerHTML = `
        <div class="page-head">
          <div><h1>Reporting Progress</h1><p>Monitor which electoral areas and branches have submitted results.</p></div>
          <div class="head-actions"><button class="btn" data-nav="collation">Open collation</button><button class="btn primary" data-nav="entry">+ Enter results</button></div>
        </div>
        <div class="card card-pad" style="margin-bottom:16px">
          <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap">
            <div><div class="k-label" style="font-size:11px;letter-spacing:.08em;color:var(--slate-2);font-weight:800;text-transform:uppercase">Overall reporting</div>
              <div style="font-size:30px;font-weight:800;letter-spacing:-.6px">${H.fmt(t.reported)} <span style="font-size:16px;color:var(--slate);font-weight:600">of ${H.fmt(t.branches)} branches</span></div></div>
            <div class="right"><b style="font-size:22px">${H.pct(t.reportingRate, 0)}</b><div class="tiny muted">${H.fmt(t.locked)} locked · ${H.fmt(t.pending)} pending</div></div>
          </div>
          <div class="bar-mini" style="height:12px;margin-top:12px"><i style="width:${t.reportingRate}%"></i></div>
        </div>
        <div class="card">
          <div class="card-head"><div><h2>Electoral areas</h2><div class="sub">${areaGrid.length} areas · branch reporting and current vote split</div></div></div>
          <div class="card-pad"><div class="area-grid">
            ${areaGrid.map(a => {
              const wpct = a.branches ? (a.reported / a.branches) * 100 : 0;
              const totalVotes = a.c1 + a.c2 + a.c3;
              const seg = (v, color) => totalVotes ? `<i style="width:${(v / totalVotes) * 100}%;background:${color}"></i>` : '';
              return `<div class="card area-card" style="box-shadow:none">
                <div class="a-top"><span class="a-name">${esc(a.area)}</span><span class="a-count">${a.reported}/${a.branches}</span></div>
                <div class="bar-mini" style="margin-top:9px"><i style="width:${wpct}%;background:${wpct === 100 ? 'var(--green)' : 'var(--red)'}"></i></div>
                ${totalVotes ? `<div class="a-bars">${seg(a.c1, '#036439')}${seg(a.c2, '#d20f2d')}${seg(a.c3, '#202020')}</div>
                  <div class="area-legend"><span>${H.fmt(totalVotes)} votes</span><span>${H.fmt(a.rejected)} rejected</span></div>` : '<div class="tiny muted" style="margin-top:9px">No results yet</div>'}
              </div>`;
            }).join('')}
          </div></div>
        </div>`;
    };
    await draw();
    return { refresh: draw };
  }

  /* ======================= USERS ======================= */
  async function users(el) {
    const draw = async () => {
      const { users } = await H.api('/api/admin/users');
      el.innerHTML = `
        <div class="page-head">
          <div><h1>Users &amp; Access</h1><p>Create accounts for branch officers and other administrators. Officers can enter results but cannot see the collation.</p></div>
          <div class="head-actions"><button class="btn primary" id="addUser">${H.ico('plus', 13)} Add user</button></div>
        </div>
        <div class="card">
          <div class="card-head"><div><h2>Accounts</h2><div class="sub">${users.length} account${users.length === 1 ? '' : 's'} · ${users.filter(u => u.role === 'admin').length} administrator${users.filter(u => u.role === 'admin').length === 1 ? '' : 's'}</div></div></div>
          <div class="table-wrap"><table class="data">
            <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th class="num">Entries</th><th>Last login</th><th>Created</th><th style="text-align:right">Actions</th></tr></thead>
            <tbody>${users.map(u => `<tr>
              <td><b>${esc(u.name)}</b>${u.id === Auth.user.id ? ' <span class="tiny muted">(you)</span>' : ''}</td>
              <td class="mono">@${esc(u.username)}</td>
              <td><span class="badge ${u.role}">${esc(u.role)}</span></td>
              <td>${u.active ? '<span class="badge entered">Active</span>' : '<span class="badge inactive">Disabled</span>'}</td>
              <td class="num">${H.fmt(u.entries)}</td>
              <td class="small muted">${u.lastLoginAt ? H.fmtDateTime(u.lastLoginAt) : '—'}</td>
              <td class="small muted">${H.fmtDate(u.createdAt)}</td>
              <td><div class="row-actions">
                <button class="btn xs" data-uedit="${u.id}">Edit</button>
                <button class="btn xs" data-upw="${u.id}">Password</button>
                ${u.id === Auth.user.id ? '' : `<button class="btn xs ${u.active ? 'danger' : ''}" data-utoggle="${u.id}">${u.active ? 'Disable' : 'Enable'}</button>`}
              </div></td>
            </tr>`).join('')}</tbody>
          </table></div>
        </div>`;

      H.$('#addUser', el).addEventListener('click', () => userModal(null, draw));
      el.onclick = async e => {
        const ed = e.target.closest('[data-uedit]');
        const pw = e.target.closest('[data-upw]');
        const tg = e.target.closest('[data-utoggle]');
        const u = id => users.find(x => x.id === id);
        if (ed) return userModal(u(ed.dataset.uedit), draw);
        if (pw) {
          const target = u(pw.dataset.upw);
          const m = H.modal({
            title: 'Reset password — @' + target.username,
            body: `<label class="field"><span>New password (min 6 characters)</span><input class="input" id="newpw" autocomplete="new-password"></label><div id="pwErr"></div>`,
            footer: `<button class="btn" data-close>Cancel</button><button class="btn primary" id="pwGo">Set password</button>`
          });
          H.$('#pwGo', m.el).addEventListener('click', async () => {
            try {
              await H.api('/api/admin/users/' + target.id, { method: 'PATCH', body: { password: H.$('#newpw', m.el).value } });
              m.close(); H.toast('Password reset.', 'success');
            } catch (er) { H.$('#pwErr', m.el).innerHTML = '<div class="alert error">' + esc(er.message) + '</div>'; }
          });
        }
        if (tg) {
          const target = u(tg.dataset.utoggle);
          try {
            await H.api('/api/admin/users/' + target.id, { method: 'PATCH', body: { active: !target.active } });
            H.toast(target.active ? 'Account disabled.' : 'Account enabled.', 'success');
            draw();
          } catch (er) { H.toast(er.message, 'error'); }
        }
      };
    };

    function userModal(user, after) {
      const isNew = !user;
      const m = H.modal({
        title: isNew ? 'Add user account' : 'Edit ' + user.name,
        subtitle: isNew ? 'Officers enter branch results only; administrators see everything.' : '@' + user.username,
        body: `<div class="form-grid">
          <label class="field full"><span>Full name</span><input class="input" id="uName" value="${user ? esc(user.name) : ''}" placeholder="e.g. Kwame Mensah"></label>
          ${isNew ? `<label class="field full"><span>Username</span><input class="input" id="uUser" placeholder="e.g. kmensah" autocomplete="off"></label>` : ''}
          <label class="field"><span>Role</span><select class="input" id="uRole">
            <option value="officer" ${user && user.role === 'officer' ? 'selected' : ''}>Officer (data entry)</option>
            <option value="admin" ${user && user.role === 'admin' ? 'selected' : ''}>Administrator (full access)</option>
          </select></label>
          <label class="field"><span>${isNew ? 'Password' : 'New password (optional)'}</span><input class="input" id="uPass" type="password" placeholder="${isNew ? 'min 6 characters' : 'leave blank to keep'}" autocomplete="new-password"></label>
        </div><div id="uErr"></div>`,
        footer: `<button class="btn" data-close>Cancel</button><button class="btn primary" id="uSave">${isNew ? 'Create account' : 'Save changes'}</button>`
      });
      H.$('#uSave', m.el).addEventListener('click', async () => {
        const body = { name: H.$('#uName', m.el).value, role: H.$('#uRole', m.el).value };
        if (isNew) { body.username = H.$('#uUser', m.el).value; body.password = H.$('#uPass', m.el).value; }
        else { const p = H.$('#uPass', m.el).value; if (p) body.password = p; }
        try {
          if (isNew) await H.api('/api/admin/users', { method: 'POST', body });
          else await H.api('/api/admin/users/' + user.id, { method: 'PATCH', body });
          m.close(); H.toast(isNew ? 'Account created.' : 'Account updated.', 'success'); after();
        } catch (e) {
          H.$('#uErr', m.el).innerHTML = '<div class="alert error">' + esc(e.message) + '</div>';
        }
      });
    }

    await draw();
    return { refresh: draw };
  }

  /* ======================= BRANCHES ======================= */
  async function branches(el) {
    let q = '', area = '';
    const draw = async () => {
      await App.refreshBranches();
      const list = App.state.branches;
      const areas = [...new Set(list.map(b => b.area))].sort((a, b) => a.localeCompare(b));
      el.innerHTML = `
        <div class="page-head">
          <div><h1>Branches &amp; Electoral Areas</h1><p>${H.fmt(list.length)} branches in ${areas.length} electoral areas. Keep this list in sync with the official constituency register.</p></div>
          <div class="head-actions">
            <button class="btn" id="brTemplate">${H.ico('download', 13)} Template CSV</button>
            <button class="btn" id="brRename">${H.ico('edit', 13)} Rename area</button>
            <button class="btn" id="brImport">${H.ico('branches', 13)} Import CSV</button>
            <button class="btn primary" id="brAdd">${H.ico('plus', 13)} Add branch</button>
          </div>
        </div>
        <div class="notice info"><div><b>Official polling-station register loaded</b> from <b>EC_AK_CONSTITUENCY.csv</b> (240 stations). Electoral areas were grouped from the polling-station codes (district + area + station); use <b>Rename area</b> to adjust any area label. Import a new CSV (columns: <b>Code, Electoral Area, Branch</b>) with “Replace” mode to swap the whole list — existing results will be cleared.</div></div>
        <div class="card">
          <div class="toolbar">
            <input class="input input-sm" id="brSearch" placeholder="Search branch, code or area…" style="max-width:280px" value="${esc(q)}">
            <select class="input input-sm area-filter" id="brArea" aria-label="Filter branches by electoral area"><option value="">All electoral areas</option>${areas.map(a => `<option ${a === area ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select>
            <span class="spacer"></span><span class="count-chip" id="brCount"></span>
          </div>
          <div id="brTable"></div>
        </div>`;

      const table = () => {
        const filtered = list.filter(b => (!area || b.area === area) && (!q || `${b.code} ${b.name} ${b.area}`.toLowerCase().includes(q.toLowerCase())));
        H.$('#brCount', el).textContent = filtered.length + ' branch' + (filtered.length === 1 ? '' : 'es');
        H.$('#brTable', el).innerHTML = `<div class="table-wrap"><table class="data">
          <thead><tr><th>Code</th><th>Branch</th><th>Electoral area</th><th>Status</th><th style="text-align:right">Actions</th></tr></thead>
          <tbody>${filtered.map(b => `<tr>
            <td class="mono small">${esc(b.code)}</td><td><b>${esc(b.name)}</b></td><td class="muted">${esc(b.area)}</td>
            <td>${H.statusBadge(b.status)}</td>
            <td><div class="row-actions">
              <button class="btn xs" data-bredit="${b.id}">Edit</button>
              <button class="btn xs danger" data-brdelete="${b.id}">Delete</button>
            </div></td></tr>`).join('')}</tbody></table></div>`;
      };

      table();
      H.$('#brSearch', el).addEventListener('input', H.debounce(e => { q = e.target.value; table(); }, 150));
      H.$('#brArea', el).addEventListener('change', e => { area = e.target.value; table(); });

      H.$('#brAdd', el).addEventListener('click', () => branchModal(null));
      H.$('#brTemplate', el).addEventListener('click', () => {
        const csv = 'Code,Electoral Area,Branch\nAK-001,Twedie,Twedie Community Centre\nAK-002,Twedie,Twedie Presby JHS\n';
        H.download('atwima-kwanwoma-branches-template.csv', csv);
      });
      H.$('#brImport', el).addEventListener('click', importModal);
      H.$('#brRename', el).addEventListener('click', renameModal);

      el.onclick = async e => {
        const ed = e.target.closest('[data-bredit]');
        const del = e.target.closest('[data-brdelete]');
        if (ed) {
          const b = list.find(x => x.id === ed.dataset.bredit);
          if (b) branchModal(b);
        }
        if (del) {
          const b = list.find(x => x.id === del.dataset.brdelete);
          if (!b) return;
          const ok = await H.confirmDialog({ title: 'Delete branch?', message: `<b>${esc(b.code)} · ${esc(b.name)}</b> will be removed from the register. Branches with results cannot be deleted.`, confirmText: 'Delete', danger: true });
          if (!ok) return;
          try {
            await H.api('/api/admin/branches/' + b.id, { method: 'DELETE' });
            H.toast('Branch deleted.', 'success');
            draw();
          } catch (er) { H.toast(er.message, 'error'); }
        }
      };
    };

    function branchModal(b) {
      const isNew = !b;
      const m = H.modal({
        title: isNew ? 'Add branch' : 'Edit branch',
        body: `<div class="form-grid">
          <label class="field"><span>Branch code</span><input class="input" id="bCode" value="${b ? esc(b.code) : ''}" placeholder="auto"></label>
          <label class="field"><span>Electoral area</span><input class="input" id="bArea" value="${b ? esc(b.area) : ''}" placeholder="e.g. Twedie" list="areaList">
            <datalist id="areaList">${[...new Set(App.state.branches.map(x => x.area))].map(a => `<option value="${esc(a)}">`).join('')}</datalist></label>
          <label class="field full"><span>Branch name</span><input class="input" id="bName" value="${b ? esc(b.name) : ''}" placeholder="e.g. Twedie Presby JHS"></label>
        </div><div id="bErr"></div>`,
        footer: `<button class="btn" data-close>Cancel</button><button class="btn primary" id="bSave">${isNew ? 'Add branch' : 'Save'}</button>`
      });
      H.$('#bSave', m.el).addEventListener('click', async () => {
        const body = { code: H.$('#bCode', m.el).value, area: H.$('#bArea', m.el).value, name: H.$('#bName', m.el).value };
        try {
          if (isNew) await H.api('/api/admin/branches', { method: 'POST', body });
          else await H.api('/api/admin/branches/' + b.id, { method: 'PATCH', body });
          m.close(); H.toast(isNew ? 'Branch added.' : 'Branch updated.', 'success'); draw();
        } catch (e) { H.$('#bErr', m.el).innerHTML = '<div class="alert error">' + esc(e.message) + '</div>'; }
      });
    }

    function renameModal() {
      const areas = [...new Set(App.state.branches.map(x => x.area))].sort((a, b) => a.localeCompare(b));
      const m = H.modal({
        title: 'Rename an electoral area',
        subtitle: 'Updates every branch in that area at once.',
        body: `<label class="field"><span>Electoral area</span><select class="input" id="raFrom">
            ${areas.map(a => `<option value="${esc(a)}">${esc(a)} (${App.state.branches.filter(b => b.area === a).length} branches)</option>`).join('')}
          </select></label>
          <label class="field"><span>New name</span><input class="input" id="raTo" placeholder="e.g. Twedie"></label>
          <div id="raErr"></div>`,
        footer: `<button class="btn" data-close>Cancel</button><button class="btn primary" id="raSave">Rename area</button>`
      });
      H.$('#raFrom', m.el).addEventListener('change', e => { H.$('#raTo', m.el).value = e.target.value; });
      H.$('#raTo', m.el).value = areas[0] || '';
      H.$('#raSave', m.el).addEventListener('click', async () => {
        try {
          const r = await H.api('/api/admin/areas/rename', { method: 'POST', body: { from: H.$('#raFrom', m.el).value, to: H.$('#raTo', m.el).value } });
          m.close();
          H.toast(`Renamed — ${r.renamed} branches updated.`, 'success');
          draw();
        } catch (e) { H.$('#raErr', m.el).innerHTML = '<div class="alert error">' + esc(e.message) + '</div>'; }
      });
    }

    function importModal() {
      const m = H.modal({
        title: 'Import branches from CSV',
        subtitle: 'Columns: Code, Electoral Area, Branch. A header row is optional.',
        size: 'lg',
        body: `<div class="notice warn"><div><b>Officer accounts are not affected.</b> “Replace” mode deletes the current branch list and any results already entered.</div></div>
          <label class="field"><span>CSV file</span><input class="input" type="file" id="csvFile" accept=".csv,text/csv"></label>
          <label class="field"><span>…or paste CSV content</span><textarea class="input" id="csvText" rows="7" placeholder="Code,Electoral Area,Branch&#10;AK-001,Twedie,Twedie Community Centre"></textarea></label>
          <label class="field"><span>Import mode</span><select class="input" id="csvMode">
            <option value="replace">Replace the entire branch list (recommended for the official list)</option>
            <option value="merge">Merge — add new branches, update existing by code</option>
          </select></label>
          <div id="csvPreview" class="small muted"></div>
          <div id="csvErr"></div>`,
        footer: `<button class="btn" data-close>Cancel</button><button class="btn primary" id="csvGo">Import branches</button>`
      });
      const ta = H.$('#csvText', m.el);
      H.$('#csvFile', m.el).addEventListener('change', e => {
        const f = e.target.files[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = () => { ta.value = r.result; preview(); };
        r.readAsText(f);
      });
      const preview = () => {
        const rows = H.parseCSV(ta.value).filter(r => r.some(c => c !== ''));
        const dataRows = rows.filter((r, i) => !(i === 0 && /electoral|branch|area|code/i.test(r.join(','))));
        const valid = dataRows.filter(r => r.length >= 2 && r[r.length - 2] && r[r.length - 1]);
        H.$('#csvPreview', m.el).innerHTML = ta.value.trim()
          ? `Parsed <b>${valid.length}</b> branch row${valid.length === 1 ? '' : 's'}${valid.length < dataRows.length ? ` · <span style="color:var(--red)">${dataRows.length - valid.length} row(s) look incomplete and will be skipped</span>` : ''}.`
          : '';
      };
      ta.addEventListener('input', preview);
      H.$('#csvGo', m.el).addEventListener('click', async () => {
        const mode = H.$('#csvMode', m.el).value;
        if (mode === 'replace') {
          const ok = await H.confirmDialog({ title: 'Replace entire branch list?', message: 'The current branch list will be deleted and replaced. Any results entered so far will be <b>cleared</b>. This cannot be undone.', confirmText: 'Replace list', danger: true, requireText: 'REPLACE' });
          if (!ok) return;
        }
        try {
          const d = await H.api('/api/admin/import-branches', { method: 'POST', body: { csv: ta.value, mode, confirm: mode === 'replace' ? 'REPLACE BRANCHES' : undefined } });
          m.close();
          H.toast(`Import complete — ${d.added} added, ${d.updated} updated, ${d.skipped} skipped. Total: ${d.total}.`, 'success', 6000);
          draw();
        } catch (e) { H.$('#csvErr', m.el).innerHTML = '<div class="alert error">' + esc(e.message) + '</div>'; }
      });
    }

    await draw();
  }

  /* ======================= AUDIT ======================= */
  async function audit(el) {
    let q = '', action = '';
    const draw = async () => {
      const d = await H.api('/api/admin/audit?q=' + encodeURIComponent(q) + '&action=' + encodeURIComponent(action));
      el.innerHTML = `
        <div class="page-head">
          <div><h1>Audit Trail</h1><p>Immutable record of every login, result entry, edit, correction, lock and account change.</p></div>
          <div class="head-actions"><span class="count-chip">${d.rows.length} event${d.rows.length === 1 ? '' : 's'} shown</span></div>
        </div>
        <div class="card">
          <div class="toolbar">
            <input class="input input-sm" id="auSearch" placeholder="Search user or detail…" style="max-width:300px" value="${esc(q)}">
            <select class="input input-sm area-filter" id="auAction" aria-label="Filter audit trail by action"><option value="">All actions</option>${d.actions.map(a => `<option ${a === action ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select>
            <span class="spacer"></span>
            <button class="btn xs" id="auExport">↓ CSV</button>
            <button class="btn xs" id="auRefresh">↻ Refresh</button>
          </div>
          <ul class="audit-list">
            ${d.rows.length ? d.rows.map(r => `<li class="audit-item">
              <span class="audit-badge a-${esc(r.action)}">${esc(r.action.replace(/_/g, ' '))}</span>
              <div class="audit-main"><b>${esc(r.username)}</b><p>${esc(r.detail)}</p>
                ${r.meta && r.meta.before ? `<div class="audit-meta">Before → after: ${esc(JSON.stringify(r.meta.before))} → ${esc(JSON.stringify(r.meta.after))}</div>` : ''}
              </div>
              <div class="audit-time">${H.fmtDateTime(r.at)}</div>
            </li>`).join('') : '<li class="empty"><p>No matching events.</p></li>'}
          </ul>
        </div>`;
      H.$('#auSearch', el).addEventListener('input', H.debounce(e => { q = e.target.value; draw(); }, 300));
      H.$('#auAction', el).addEventListener('change', e => { action = e.target.value; draw(); });
      H.$('#auRefresh', el).addEventListener('click', draw);
      H.$('#auExport', el).addEventListener('click', async () => {
        try {
          await H.downloadUrl('/api/admin/audit.csv?q=' + encodeURIComponent(q) + '&action=' + encodeURIComponent(action),
                              'audit-trail.csv');
          H.toast('Audit trail exported', 'success');
        } catch (e) { H.toast(e.message, 'error'); }
      });
    };
    await draw();
  }

  /* ======================= SETTINGS ======================= */
  async function settings(el) {
    const draw = async () => {
      const d = await H.api('/api/admin/overview');
      el.innerHTML = `
        <div class="page-head"><div><h1>Settings</h1><p>Control result entry, back up data and manage the constituency register.</p></div></div>
        <div class="grid two">
          <div class="card">
            <div class="card-head"><div><h2>Result entry</h2><div class="sub">Open or close submissions for branch officers</div></div></div>
            <div class="card-pad">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:14px">
                <div><b>${d.resultsOpen ? 'Result entry is open' : 'Result entry is closed'}</b>
                  <div class="tiny muted" style="margin-top:3px">${d.resultsOpen ? 'Officers can submit and update branch results.' : 'Officers cannot submit new results. Administrators can still correct entries.'}</div></div>
                <button class="btn ${d.resultsOpen ? 'danger' : 'green'}" id="toggleEntry">${d.resultsOpen ? 'Close entry' : 'Open entry'}</button>
              </div>
              <hr style="border:0;border-top:1px solid var(--line);margin:16px 0">
              <b>Data</b>
              <div class="tiny muted" style="margin:3px 0 10px">Download a full JSON backup of results, accounts and the audit trail.</div>
              <button class="btn" id="backupBtn">${H.ico('download', 13)} Download backup</button>
            </div>
          </div>
          <div class="card">
            <div class="card-head"><div><h2>Danger zone</h2><div class="sub">These actions cannot be undone</div></div></div>
            <div class="card-pad">
              <b>Training sample data</b>
              <div class="tiny muted" style="margin:3px 0 10px">Fills pending branches with sample results (marked “Sample data (training)”) so you can preview the collation and infographics before the conference. Clear it before real entry.</div>
              <button class="btn" id="demoBtn">Load sample data (~60%)</button>
              <hr style="border:0;border-top:1px solid var(--line);margin:16px 0">
              <b>Clear all results</b>
              <div class="tiny muted" style="margin:3px 0 10px">Removes every branch result. Accounts, branches and the audit trail are kept. Use this after training or testing, before the real conference.</div>
              <button class="btn danger" id="clearAll">Clear all results</button>
              <hr style="border:0;border-top:1px solid var(--line);margin:16px 0">
              <b>Your account</b>
              <div class="tiny muted" style="margin:3px 0 10px">Signed in as ${esc(Auth.user.name)} (@${esc(Auth.user.username)}).</div>
              <button class="btn" id="pwBtn">Change password</button>
            </div>
          </div>
        </div>
        <div class="card" style="margin-top:16px">
          <div class="card-head"><div><h2>Election details</h2><div class="sub">As configured on this system</div></div></div>
          <div class="card-pad">
            <div class="info-grid">
              <div><div class="tiny muted">Party</div><b>${esc(App.state.config.election.party)}</b></div>
              <div><div class="tiny muted">Constituency</div><b>${esc(App.state.config.election.constituency)} (${esc(App.state.config.election.region)})</b></div>
              <div><div class="tiny muted">Conference</div><b>${esc(App.state.config.election.conference)} — ${esc(App.state.config.election.month)}</b></div>
              <div><div class="tiny muted">Position</div><b>${esc(App.state.config.election.position)}</b></div>
              <div><div class="tiny muted">Candidates</div><b>${App.state.config.candidates.map(c => esc(c.short)).join(' · ')}</b></div>
              <div><div class="tiny muted">Branches</div><b>${H.fmt(App.state.branches.length)}</b></div>
              <div><div class="tiny muted">App build</div><b>v16 · minimal sign-in</b></div>
            </div>
          </div>
        </div>`;

      H.$('#toggleEntry', el).addEventListener('click', async () => {
        try {
          await H.api('/api/admin/settings', { method: 'POST', body: { resultsOpen: !d.resultsOpen } });
          H.toast(!d.resultsOpen ? 'Result entry opened.' : 'Result entry closed.', 'success');
          App.updateEntryStatus(!d.resultsOpen);
          draw();
        } catch (e) { H.toast(e.message, 'error'); }
      });
      H.$('#backupBtn', el).addEventListener('click', async () => {
        try {
          const data = await H.api('/api/admin/backup');
          H.download(`atwima-kwanwoma-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`, JSON.stringify(data, null, 2), 'application/json');
          H.toast('Backup downloaded.', 'success');
        } catch (e) { H.toast(e.message, 'error'); }
      });
      H.$('#demoBtn', el).addEventListener('click', async () => {
        const ok = await H.confirmDialog({
          title: 'Load training sample data?',
          message: 'Pending branches will be filled with sample figures so you can preview the dashboard. Every sample entry is labelled “Sample data (training)”. Use “Clear all results” before the real conference.',
          confirmText: 'Load sample data'
        });
        if (!ok) return;
        try {
          const r = await H.api('/api/admin/demo-data', { method: 'POST', body: { coverage: 0.62 } });
          H.toast(`Sample data loaded for ${r.created} branches.`, 'success');
          await App.refreshBranches();
        } catch (e) { H.toast(e.message, 'error'); }
      });
      H.$('#clearAll', el).addEventListener('click', async () => {
        const ok = await H.confirmDialog({
          title: 'Clear ALL results?',
          message: 'Every branch result will be permanently deleted. Accounts, branch list and audit log stay intact.',
          confirmText: 'Clear everything', danger: true, requireText: 'CLEAR ALL RESULTS'
        });
        if (!ok) return;
        try {
          const r = await H.api('/api/admin/results/clear-demo', { method: 'POST', body: { confirm: 'CLEAR ALL RESULTS' } });
          H.toast(`${r.cleared} result(s) cleared.`, 'success');
          App.refreshBranches();
        } catch (e) { H.toast(e.message, 'error'); }
      });
      H.$('#pwBtn', el).addEventListener('click', () => Auth.openPasswordModal());
    };
    await draw();
  }

  return { overview, collation, progress, users, branches, audit, settings, openEditor };
})();
