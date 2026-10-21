/* Officer-only views */
const Officer = {
  async submissions(el) {
    el.innerHTML = `
      <div class="page-head">
        <div><h1>My Submissions</h1><p>Every branch result you have entered. Use Edit to change the figures or Delete to remove an entry you submitted.</p></div>
        <div class="head-actions"><button class="btn" id="myRefresh">${H.ico('refresh', 13)} Refresh</button><button class="btn primary" id="myNew">${H.ico('plus', 13)} New entry</button></div>
      </div>
      <div id="myStats" class="grid kpis" style="grid-template-columns:repeat(3,minmax(0,1fr));margin-bottom:16px"></div>
      <div class="card">
        <div class="card-head"><div><h2>My submitted branches</h2><div class="sub">Entries stay editable until the administrator locks them.</div></div></div>
        <div id="myTable"><div class="empty"><div class="spin dark"></div></div></div>
      </div>`;

    const load = async () => {
      const { rows } = await H.api('/api/recent');
      const valid = rows.reduce((s, r) => s + r.valid, 0);
      const rejected = rows.reduce((s, r) => s + r.rejected, 0);
      const locked = rows.filter(r => r.status === 'locked').length;
      H.$('#myStats', el).innerHTML = `
        <div class="card kpi green"><span class="k-accent"></span><div class="k-label">Branches submitted</div><div class="k-value">${H.fmt(rows.length)}</div><div class="k-foot">${locked} locked by administrator</div></div>
        <div class="card kpi dark"><span class="k-accent"></span><div class="k-label">Valid votes recorded</div><div class="k-value">${H.fmt(valid)}</div><div class="k-foot">Across all three candidates</div></div>
        <div class="card kpi gold"><span class="k-accent"></span><div class="k-label">Rejected ballots recorded</div><div class="k-value">${H.fmt(rejected)}</div><div class="k-foot">Total votes cast: ${H.fmt(valid + rejected)}</div></div>`;

      if (!rows.length) {
        H.$('#myTable', el).innerHTML = `<div class="empty"><div class="e-ico">${H.ico('ballot', 30)}</div><h2>No submissions yet</h2><p>Enter your first branch result from the “Enter Results” tab.</p></div>`;
        return;
      }
      H.$('#myTable', el).innerHTML = `<div class="table-wrap"><table class="data">
        <thead><tr>
          <th>Branch</th><th>Electoral area</th>
          <th class="num">Lawrence O. Yeboah</th><th class="num">John J. Owusu Ansah</th><th class="num">Nana Kofi Nti</th>
          <th class="num">Rejected</th><th class="num">Votes cast</th><th>Status</th><th>Last saved</th>
          <th style="text-align:right">Actions</th>
        </tr></thead>
        <tbody>${rows.map(r => `<tr>
            <td><div class="branch-name">${H.esc(r.name)}</div><div class="branch-code">${H.esc(r.code)}</div></td>
            <td class="muted small">${H.esc(r.area)}</td>
            <td class="num">${H.fmt(r.c1)}</td>
            <td class="num">${H.fmt(r.c2)}</td>
            <td class="num">${H.fmt(r.c3)}</td>
            <td class="num">${H.fmt(r.rejected)}</td>
            <td class="num"><b>${H.fmt(r.cast)}</b></td>
            <td>${H.statusBadge(r.status)}</td>
            <td class="muted small nowrap">${H.timeAgo(r.enteredAt)}</td>
            <td><div class="row-actions">
              <button class="act-btn edit" data-edit="${r.id}">${H.ico('edit', 12)} Edit</button>
              <button class="act-btn del" data-del="${r.id}" ${r.canDelete ? '' : 'disabled title="Locked by administrator"'}>${H.ico('trash', 12)} Delete</button>
            </div></td>
          </tr>`).join('')}</tbody></table></div>`;
    };

    H.$('#myRefresh', el).addEventListener('click', load);
    H.$('#myNew', el).addEventListener('click', () => App.switchTab('entry'));

    H.$('#myTable', el).addEventListener('click', async e => {
      const editBtn = e.target.closest('[data-edit]');
      const delBtn = e.target.closest('[data-del]');
      if (editBtn) {
        App.switchTab('entry', { branchId: editBtn.dataset.edit });
        return;
      }
      if (delBtn) {
        const b = App.state.branches.find(x => x.id === delBtn.dataset.del);
        if (!b) return;
        const ok = await H.confirmDialog({
          title: 'Delete this entry?',
          message: `Your result for <b>${H.esc(b.code)} · ${H.esc(b.name)}</b> will be removed and the branch will return to “Pending”. This is recorded in the audit trail.`,
          confirmText: 'Delete entry', danger: true
        });
        if (!ok) return;
        try {
          await H.api('/api/results/' + b.id, { method: 'DELETE' });
          H.toast('Entry deleted.', 'success');
          await App.refreshBranches();
          load();
        } catch (er) { H.toast(er.message, 'error'); }
      }
    });

    await load();
    return { refresh: load };
  }
};
