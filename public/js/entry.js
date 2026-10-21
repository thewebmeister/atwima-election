/* Branch result entry — shared by officers and administrators */
const Entry = (() => {
  const S = {
    area: '', branchId: '', branch: null, result: null,
    isAdmin: false, closed: false, canEdit: true,
    comboList: [], comboIndex: -1, comboOpen: false, el: null
  };

  const candPhoto = id => `/img/candidates/c${id}.jpg`;
  const esc = H.esc;

  /* ------------------------------------------------------------------ */
  /*  Searchable branch combobox                                         */
  /* ------------------------------------------------------------------ */
  function branchPool() {
    let list = App.state.branches;
    if (S.area) list = list.filter(b => b.area === S.area);
    return list.slice().sort((a, b) => (a.area + a.code).localeCompare(b.area + b.code));
  }

  function comboSearch(term) {
    const q = term.trim().toLowerCase();
    let list = branchPool();
    if (q) {
      const words = q.split(/\s+/);
      list = list.filter(b => {
        const hay = `${b.code} ${b.name} ${b.area}`.toLowerCase();
        return words.every(w => hay.includes(w));
      });
    }
    return list.slice(0, 80);
  }

  function comboRender(term) {
    const el = S.el;
    const listEl = H.$('#branchList', el);
    if (!listEl) return;
    S.comboList = comboSearch(term);
    S.comboIndex = S.comboList.length ? 0 : -1;
    const total = branchPool().length;
    const rows = S.comboList.map((b, i) => `
      <div class="combo-item ${i === S.comboIndex ? 'active' : ''} ${b.id === S.branchId ? 'selected' : ''}" data-bid="${b.id}">
        <div class="ci-main">
          <b>${esc(b.code)}</b>
          <span class="ci-name">${esc(b.name)}</span>
          <span class="ci-area">${esc(b.area)}</span>
        </div>
        ${b.status === 'locked' ? '<span class="badge locked">' + H.ico('lock', 10) + '</span>' : b.status === 'entered' ? '<span class="badge entered">✓</span>' : ''}
      </div>`).join('');
    listEl.innerHTML = `<div class="combo-head"><span>${S.comboList.length} of ${total} branches</span><span>↑↓ then Enter</span></div>` +
      (S.comboList.length ? rows : `<div class="combo-empty">No branch matches “${esc(term)}”</div>`);
    listEl.classList.remove('hidden');
    S.comboOpen = true;
    const active = listEl.querySelector('.combo-item.active');
    if (active) active.scrollIntoView({ block: 'nearest' });
  }

  function comboClose() {
    const listEl = H.$('#branchList', S.el);
    if (listEl) listEl.classList.add('hidden');
    S.comboOpen = false;
  }

  function comboMove(delta) {
    if (!S.comboOpen) return;
    if (!S.comboList.length) return;
    S.comboIndex = (S.comboIndex + delta + S.comboList.length) % S.comboList.length;
    H.$$('#branchList .combo-item', S.el).forEach((row, i) => row.classList.toggle('active', i === S.comboIndex));
    const active = H.$('#branchList .combo-item.active', S.el);
    if (active) active.scrollIntoView({ block: 'nearest' });
  }

  function comboChoose(branch) {
    if (!branch) return;
    S.branchId = branch.id;
    const input = H.$('#branchSearch', S.el);
    input.value = `${branch.code} — ${branch.name}`;
    H.$('#comboClear', S.el).classList.remove('hidden');
    comboClose();
    loadBranch(S.el);
  }

  function comboReset() {
    S.branchId = ''; S.branch = null; S.result = null;
    const input = H.$('#branchSearch', S.el);
    if (input) { input.value = ''; input.focus(); }
    H.$('#comboClear', S.el).classList.add('hidden');
    H.$('#selectedBranch', S.el).innerHTML = '';
    H.$('#entryStatusBox', S.el).innerHTML = '';
    const form = H.$('#entryFormBody', S.el);
    if (form) form.classList.add('hidden');
    const empty = H.$('#entryEmpty', S.el);
    if (empty) empty.classList.remove('hidden');
    H.$('#entryBranchLabel', S.el).textContent = 'no branch selected';
  }

  function bindCombo(el) {
    const input = H.$('#branchSearch', el);
    const listEl = H.$('#branchList', el);

    input.addEventListener('input', () => {
      S.branchId = ''; S.branch = null; S.result = null;
      H.$('#comboClear', el).classList.toggle('hidden', !input.value);
      H.$('#selectedBranch', el).innerHTML = '';
      comboRender(input.value);
    });
    input.addEventListener('focus', () => comboRender(input.value));
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (!S.comboOpen) comboRender(input.value); else comboMove(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); comboMove(-1); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        if (S.comboOpen && S.comboIndex >= 0) comboChoose(S.comboList[S.comboIndex]);
      } else if (e.key === 'Escape') { comboClose(); }
    });

    listEl.addEventListener('mousedown', e => {
      const item = e.target.closest('.combo-item');
      if (!item) return;
      e.preventDefault();
      comboChoose(App.state.branches.find(b => b.id === item.dataset.bid));
    });

    H.$('#comboClear', el).addEventListener('click', e => { e.preventDefault(); comboReset(); });
    document.addEventListener('mousedown', e => {
      if (!e.target.closest('#branchCombo')) comboClose();
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Result form                                                        */
  /* ------------------------------------------------------------------ */
  function setFormEnabled(el) {
    const lockedForOfficer = !S.isAdmin && S.result && S.result.locked;
    const closedForOfficer = S.closed && !S.isAdmin;
    const notOwner = !S.isAdmin && !S.canEdit;
    const disabled = lockedForOfficer || closedForOfficer || notOwner;
    ['#v1', '#v2', '#v3', '#vr'].forEach(sel => {
      const inp = H.$(sel, el);
      if (inp) inp.disabled = disabled;
    });
    const btn = H.$('#entrySave', el);
    if (btn) {
      btn.disabled = disabled;
      btn.textContent = notOwner ? 'Owned by another officer'
        : lockedForOfficer ? 'Locked by administrator'
        : closedForOfficer ? 'Entry closed'
        : (S.isAdmin && S.result && S.result.locked) ? 'Save correction'
        : S.result ? 'Update results' : 'Save results';
    }
  }

  /* Unsaved figures survive a reload, a dropped connection or a flat battery. */
  const draftKey = () => 'ndc_draft_' + S.branchId;
  function saveDraft(el) {
    if (!S.branchId) return;
    try {
      localStorage.setItem(draftKey(), JSON.stringify({
        c1: H.$('#v1', el).value, c2: H.$('#v2', el).value,
        c3: H.$('#v3', el).value, rejected: H.$('#vr', el).value,
        at: new Date().toISOString()
      }));
    } catch (e) { /* storage full/blocked — ignore */ }
  }
  function clearDraft() {
    try { if (S.branchId) localStorage.removeItem(draftKey()); } catch (e) { /* ignore */ }
  }
  function restoreDraft(el) {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(draftKey()) || 'null'); } catch (e) { d = null; }
    if (!d) return;
    const cur = [H.$('#v1', el).value, H.$('#v2', el).value, H.$('#v3', el).value, H.$('#vr', el).value].map(String);
    const draft = [d.c1, d.c2, d.c3, d.rejected].map(v => String(v == null ? '' : v));
    if (cur.join('|') === draft.join('|')) { return; }
    H.$('#v1', el).value = d.c1; H.$('#v2', el).value = d.c2;
    H.$('#v3', el).value = d.c3; H.$('#vr', el).value = d.rejected;
    recalc(el);
    const box = H.$('#entryError', el);
    if (box) box.innerHTML = `<div class="notice warn" style="margin:0 0 10px"><div>
      <b>Unsaved figures restored from this device</b> (${H.fmtDateTime(d.at)}).
      They have <b>not</b> been submitted yet — press save.
      <button type="button" class="btn xs" id="draftDiscard" style="margin-left:8px">Discard</button></div></div>`;
    const disc = H.$('#draftDiscard', el);
    if (disc) disc.onclick = () => { clearDraft(); fillForm(el, S.result); box.innerHTML = ''; };
  }

  function recalc(el) {
    const n = id => Number(H.$(id, el).value || 0) || 0;
    const total = n('#v1') + n('#v2') + n('#v3') + n('#vr');
    const valid = n('#v1') + n('#v2') + n('#v3');
    H.$('#entryTotal', el).textContent = H.fmt(total);
    H.$('#entryValid', el).textContent = H.fmt(valid) + ' valid';
    H.$('#entryRej', el).textContent = total ? H.pct((n('#vr') / total) * 100) + ' rejected' : '';
    const warn = H.$('#entryPlausible', el);
    if (warn) {
      warn.innerHTML = total > 1000
        ? '<div class="notice warn" style="margin-top:8px"><div><b>Unusually high for one branch (' + H.fmt(total) + ' votes).</b> Please double-check the figures before saving.</div></div>'
        : '';
    }
  }

  function branchBanner(el) {
    const box = H.$('#entryStatusBox', el);
    const selBox = H.$('#selectedBranch', el);
    if (!S.branch) { box.innerHTML = ''; selBox.innerHTML = ''; return; }
    const b = S.branch;
    selBox.innerHTML = `<div class="selected-branch">
      <span style="color:var(--green)">${H.ico('branches', 17)}</span>
      <div class="sb-main"><b>${esc(b.code)} · ${esc(b.name)}</b><span>${esc(b.area)} electoral area</span></div>
      ${H.statusBadge(b.status)}
    </div>`;
    let html = '';
    if (!S.isAdmin && !S.canEdit) {
      html = `<div class="notice warn" style="margin:0"><div><b>Submitted by another officer.</b>
        ${b.enteredBy ? 'This entry was recorded by <b>' + esc(b.enteredBy) + '</b>. ' : ''}
        Only the System Administrator can change it. Contact them if a correction is needed.</div></div>`;
      box.innerHTML = html;
      return;
    }
    if (b.status === 'entered') {
      html = `<div class="notice good" style="margin:0">Results already entered${b.enteredBy ? ' by <b>' + esc(b.enteredBy) + '</b>' : ''}. Update the figures below at any time before it is locked.</div>`;
    }
    if (b.status === 'locked') {
      html = `<div class="notice lock" style="margin:0">${H.ico('lock', 13)} Verified and locked by the administrator.${S.isAdmin ? ' Saving changes creates a logged correction — give a reason below.' : ' Contact the administrator if a correction is needed.'}</div>`;
    }
    box.innerHTML = html;
  }

  function fillForm(el, result) {
    H.$('#v1', el).value = result ? result.c1 : '';
    H.$('#v2', el).value = result ? result.c2 : '';
    H.$('#v3', el).value = result ? result.c3 : '';
    H.$('#vr', el).value = result ? result.rejected : '';
    recalc(el);
    const meta = H.$('#entryMeta', el);
    meta.innerHTML = result && result.updatedAt
      ? `Last saved ${H.fmtDateTime(result.updatedAt)}${result.updatedBy ? ' · ' + esc(result.updatedBy) : ''}`
      : '';
    const reasonWrap = H.$('#corrWrap', el);
    if (reasonWrap) reasonWrap.classList.toggle('hidden', !(S.result && S.result.locked));
    setFormEnabled(el);
  }

  async function loadBranch(el) {
    S.branch = null; S.result = null;
    const label = H.$('#entryBranchLabel', el);
    if (!S.branchId) {
      label.textContent = 'no branch selected';
      H.$('#entryStatusBox', el).innerHTML = '';
      H.$('#selectedBranch', el).innerHTML = '';
      H.$('#entryFormBody', el).classList.add('hidden');
      H.$('#entryEmpty', el).classList.remove('hidden');
      return;
    }
    try {
      const data = await H.api('/api/branches/' + S.branchId);
      S.branch = data.branch; S.result = data.result;
      S.canEdit = data.canEdit !== false;
      label.textContent = data.branch.code + ' · ' + data.branch.name;
      branchBanner(el);
      H.$('#entryEmpty', el).classList.add('hidden');
      H.$('#entryFormBody', el).classList.remove('hidden');
      fillForm(el, data.result);
      restoreDraft(el);
    } catch (e) { H.toast(e.message, 'error'); }
  }

  async function save(el) {
    const btn = H.$('#entrySave', el);
    const errBox = H.$('#entryError', el);
    errBox.innerHTML = '';
    const body = {
      branchId: S.branchId,
      c1: H.$('#v1', el).value, c2: H.$('#v2', el).value,
      c3: H.$('#v3', el).value, rejected: H.$('#vr', el).value
    };
    const vals = [body.c1, body.c2, body.c3, body.rejected];
    if (vals.some(v => String(v).trim() === '')) {
      errBox.innerHTML = '<div class="alert error">Enter a number for every candidate and for rejected ballots (use 0 where none).</div>';
      return;
    }
    if (vals.some(v => !/^\d+$/.test(String(v).trim()))) {
      errBox.innerHTML = '<div class="alert error">Votes must be whole numbers, 0 or more.</div>';
      return;
    }
    const useCorrect = S.isAdmin && S.result && S.result.locked;
    if (useCorrect) body.reason = H.$('#corrReason', el) ? H.$('#corrReason', el).value : '';
    const old = btn.textContent;
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span> Saving…';
    try {
      if (useCorrect) {
        if (String(body.reason || '').trim().length < 5) throw new Error('Please give a reason (at least 5 characters) for the correction.');
        await H.api('/api/admin/results/' + S.branchId + '/correct', { method: 'POST', body });
      } else {
        await H.api('/api/results', { method: 'POST', body });
      }
      clearDraft();
      H.toast('Results saved for ' + S.branch.code + ' — ' + S.branch.name, 'success');
      await App.refreshBranches();
      await loadBranch(el);
      loadRecent(el);
    } catch (e) {
      errBox.innerHTML = '<div class="alert error">' + esc(e.message) +
        (e.network ? ' <button type="button" class="btn xs" id="entryRetry" style="margin-left:8px">Retry</button>' : '') + '</div>';
      const retry = H.$('#entryRetry', el);
      if (retry) retry.onclick = () => save(el);
    } finally {
      btn.disabled = false;
      btn.textContent = old;
      setFormEnabled(el);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Recent entries (officer: own · admin: everyone) with edit/delete   */
  /* ------------------------------------------------------------------ */
  async function loadRecent(el) {
    const wrap = H.$('#recentWrap', el);
    if (!wrap) return;
    try {
      const { rows, scope, total } = await H.api('/api/recent');
      if (!rows.length) {
        wrap.innerHTML = `<div class="empty" style="padding:30px 16px"><div class="e-ico">${H.ico('ballot', 30)}</div><h2>No entries yet</h2><p>${S.isAdmin ? 'Results entered by any user will appear here.' : 'Results you save will appear here.'}</p></div>`;
        return;
      }
      const shown = rows.slice(0, 60);
      wrap.innerHTML = `<div class="table-wrap" style="max-height:480px"><table class="data">
        <thead><tr>
          <th>Branch</th><th>Electoral area</th>
          ${S.isAdmin ? '<th>Entered by</th>' : ''}
          <th class="num">Valid</th><th class="num">Rejected</th><th class="num">Cast</th>
          <th>Status</th><th>Last saved</th><th style="text-align:right">Actions</th>
        </tr></thead>
        <tbody>${shown.map(r => `
          <tr>
            <td><div class="branch-name">${esc(r.name)}</div><div class="branch-code">${esc(r.code)}</div></td>
            <td class="muted small">${esc(r.area)}</td>
            ${S.isAdmin ? `<td class="small">${esc(r.owner)}</td>` : ''}
            <td class="num">${H.fmt(r.valid)}</td>
            <td class="num">${H.fmt(r.rejected)}</td>
            <td class="num"><b>${H.fmt(r.cast)}</b></td>
            <td>${H.statusBadge(r.status)}</td>
            <td class="muted small nowrap">${H.timeAgo(r.enteredAt)}</td>
            <td>
              <div class="row-actions">
                <button class="act-btn edit" data-recent-edit="${r.id}">${H.ico('edit', 12)} Edit</button>
                <button class="act-btn del" data-recent-del="${r.id}" ${r.canDelete ? '' : 'disabled title="Locked or not yours"'}>${H.ico('trash', 12)} Delete</button>
              </div>
            </td>
          </tr>`).join('')}</tbody></table></div>
        ${total > shown.length ? `<div class="small muted" style="padding:10px 16px;border-top:1px solid var(--line)">Showing the latest ${shown.length} of ${total} entries${S.isAdmin ? ' — see the Collation tab for the full list.' : '.'}</div>` : ''}`;
    } catch (e) {
      wrap.innerHTML = `<div class="empty" style="padding:24px"><p>${esc(e.message)}</p></div>`;
    }
  }

  async function deleteEntry(branchId, name) {
    const ok = await H.confirmDialog({
      title: 'Delete this entry?',
      message: `The result for <b>${esc(name)}</b> will be removed and the branch will return to “Pending”. This action is recorded in the audit trail.`,
      confirmText: 'Delete entry', danger: true
    });
    if (!ok) return false;
    try {
      await H.api('/api/results/' + branchId, { method: 'DELETE' });
      H.toast('Entry deleted.', 'success');
      await App.refreshBranches();
      return true;
    } catch (e) { H.toast(e.message, 'error'); return false; }
  }

  /* ------------------------------------------------------------------ */
  /*  Render                                                             */
  /* ------------------------------------------------------------------ */
  async function render(el, opts = {}) {
    S.isAdmin = !!opts.admin;
    S.area = ''; S.branchId = opts.branchId || ''; S.branch = null; S.result = null;
    S.el = el;
    try {
      const conf = await H.api('/api/config');
      S.closed = conf.resultsOpen === false;
    } catch (e) { /* ignore */ }

    const startBranch = opts.branchId ? App.state.branches.find(b => b.id === opts.branchId) : null;

    el.innerHTML = `
      <div class="page-head">
        <div>
          <h1>${S.isAdmin ? 'Data Entry' : 'Enter Branch Results'}</h1>
          <p>${S.isAdmin ? 'Enter, edit or delete results for any branch. Every change is recorded in the audit trail.' : 'Record the Vice Chairman votes from your branch exactly as counted. You can edit or delete any entry you saved.'}</p>
        </div>
      </div>
      ${S.closed ? `<div class="notice warn"><div><b>Result entry is closed.</b> The administrator has temporarily closed result entry${S.isAdmin ? '. You can still correct results as administrator.' : '. Please contact the System Administrator.'}</div></div>` : ''}

      <div class="entry-layout">
        <div class="grid" style="gap:16px">
          <div class="card card-pad">
            <h2 style="margin:0 0 3px">1. Select branch</h2>
            <p class="muted small" style="margin:0 0 14px">Type a branch code (e.g. <b>F1602</b>) or a name (e.g. <b>Twedie</b>) to search.</p>
            <label class="field"><span>Electoral area filter <span class="muted" style="font-weight:500">(optional)</span></span>
              <select class="input" id="entryArea"></select></label>
            <label class="field" style="margin-bottom:6px"><span>Branch</span>
              <div class="combo" id="branchCombo">
                <input class="input" id="branchSearch" placeholder="Search branch code or name…" autocomplete="off"
                  role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="branchList">
                <button class="combo-clear hidden" id="comboClear" type="button" aria-label="Clear selection">✕</button>
                <div class="combo-list hidden" id="branchList" role="listbox"></div>
              </div>
            </label>
            <div id="selectedBranch"></div>
            <div id="entryStatusBox" style="margin-top:12px"></div>
          </div>
          <div class="card card-pad">
            <h2 style="margin:0 0 10px;font-size:14.5px">Entry rules</h2>
            <ul class="small muted" style="margin:0;padding-left:18px;line-height:1.7">
              <li>Enter the <b>valid votes</b> for each candidate and the <b>rejected ballots</b> at the branch.</li>
              <li>Votes cast = candidate votes + rejected ballots (calculated automatically).</li>
              <li>Use <b>0</b> where a candidate received no votes — do not leave a field empty.</li>
              <li>You can <b>edit or delete</b> an entry you saved until an administrator locks it or changes it.</li>
              <li>Entries saved by <b>another officer</b> are read-only for you — only the System Administrator can correct them.</li>
              ${S.isAdmin ? '<li>As administrator you can edit or delete <b>any</b> entry, including other users’. Locked results need a correction reason.</li>' : ''}
            </ul>
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <div><h2>2. Votes for Vice Chairman — <span id="entryBranchLabel" style="color:var(--red)">no branch selected</span></h2>
              <div class="sub" id="entryMeta"></div></div>
          </div>
          <div class="card-pad" id="entryEmpty">
            <div class="empty"><div class="e-ico">${H.ico('branches', 30)}</div><h2>Search for a branch to begin</h2><p>Start typing a branch code or name in the box on the left.</p></div>
          </div>
          <form class="card-pad hidden" id="entryFormBody" autocomplete="off">
            <div class="entry-form">
            <div id="candInputs">
              ${App.state.config.candidates.map(c => `
                <div class="cand-input-row">
                  <img src="${candPhoto(c.id)}" alt="${esc(c.short)}" width="46" height="56" loading="lazy" decoding="async">
                  <div class="ci-name"><span>CANDIDATE ${c.id}</span><b>${esc(c.short)}</b></div>
                  <div class="ci-input"><input class="input" id="v${c.id}" inputmode="numeric" pattern="[0-9]*" placeholder="0" aria-label="Votes for ${esc(c.short)}"></div>
                </div>`).join('')}
              <div class="cand-input-row">
                <div style="width:46px;height:56px;border-radius:8px;background:var(--gold-soft);display:flex;align-items:center;justify-content:center;flex:none;color:var(--gold)">${H.ico('ballot', 22)}</div>
                <div class="ci-name"><span>NOT VALID</span><b>Rejected ballots</b></div>
                <div class="ci-input"><input class="input" id="vr" inputmode="numeric" pattern="[0-9]*" placeholder="0" aria-label="Rejected ballots"></div>
              </div>
            </div>
            <div id="entryPlausible"></div>
            <div class="total-strip">
              <div><div class="ts-label">Total votes cast at branch</div><div class="ts-sub" id="entryValid">0 valid</div></div>
              <div style="text-align:right"><div class="ts-value" id="entryTotal">0</div><div class="ts-sub" id="entryRej"></div></div>
            </div>
            <div id="corrWrap" class="hidden">
              <label class="field"><span>Reason for correction (required — recorded in audit trail)</span>
                <textarea class="input" id="corrReason" placeholder="e.g. Transcription error in candidate 2 figure per Form 1B"></textarea></label>
            </div>
            <div id="entryError"></div>
            <div style="display:flex;gap:9px;justify-content:flex-end;align-items:center;flex-wrap:wrap">
              <button type="button" class="btn" id="entryClear">Clear form</button>
              <button type="button" class="btn green" id="entrySave">Save results</button>
            </div>
            </div>
          </form>
        </div>
      </div>

      <div class="card" style="margin-top:16px">
        <div class="card-head">
          <div><h2>${S.isAdmin ? 'Recent entries — all users' : 'Your entries'}</h2>
            <div class="sub">${S.isAdmin ? 'Every branch result on record. Use Edit or Delete to change any of them.' : 'Edit or delete any entry you submitted.'}</div></div>
          <button class="btn xs" id="recentRefresh">${H.ico('refresh', 12)} Refresh</button>
        </div>
        <div id="recentWrap"></div>
      </div>`;

    // area filter
    const sel = H.$('#entryArea', el);
    const areas = [...new Set(App.state.branches.map(b => b.area))].sort((a, b) => a.localeCompare(b));
    sel.innerHTML = `<option value="">All electoral areas (${App.state.branches.length} branches)</option>` +
      areas.map(a => `<option value="${esc(a)}">${esc(a)}</option>`).join('');
    sel.addEventListener('change', e => {
      S.area = e.target.value;
      comboRender(H.$('#branchSearch', el).value);
      H.$('#branchSearch', el).focus();
    });

    bindCombo(el);

    // form events
    const draftSave = H.debounce(() => saveDraft(el), 400);
    ['#v1', '#v2', '#v3', '#vr'].forEach(s => H.$(s, el).addEventListener('input', () => { recalc(el); draftSave(); }));
    H.$('#entryClear', el).addEventListener('click', () => fillForm(el, null));
    H.$('#entrySave', el).addEventListener('click', () => save(el));
    H.$('#recentRefresh', el).addEventListener('click', () => loadRecent(el));

    // edit / delete from the recent table
    H.$('#recentWrap', el).addEventListener('click', async e => {
      const editBtn = e.target.closest('[data-recent-edit]');
      const delBtn = e.target.closest('[data-recent-del]');
      if (editBtn) {
        const b = App.state.branches.find(x => x.id === editBtn.dataset.recentEdit);
        if (!b) return;
        comboChoose(b);
        H.$('#branchSearch', el).scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      if (delBtn) {
        const b = App.state.branches.find(x => x.id === delBtn.dataset.recentDel);
        if (!b) return;
        const done = await deleteEntry(b.id, `${b.code} · ${b.name}`);
        if (done) {
          if (S.branchId === b.id) comboReset();
          loadRecent(el);
        }
      }
    });

    // preselect (from My Submissions "Edit")
    if (startBranch) comboChoose(startBranch);

    await loadRecent(el);
    return { refresh: () => loadRecent(el) };
  }

  return { render };
})();
