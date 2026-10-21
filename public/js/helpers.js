/* Shared helpers: DOM, API, formatting, modals, toasts */
const H = (() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const fmt = n => (n === null || n === undefined || n === '' ? '—' : Number(n).toLocaleString('en-GB'));
  const pct = (n, d = 1) => (n === null || n === undefined || isNaN(n) ? '—' : Number(n).toFixed(d) + '%');

  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function fmtTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  function fmtDateTime(iso) {
    if (!iso) return '—';
    return fmtDate(iso) + ', ' + fmtTime(iso);
  }
  function timeAgo(iso) {
    if (!iso) return '';
    const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (secs < 15) return 'just now';
    if (secs < 60) return secs + 's ago';
    if (secs < 3600) return Math.floor(secs / 60) + 'm ago';
    if (secs < 86400) return Math.floor(secs / 3600) + 'h ago';
    return Math.floor(secs / 86400) + 'd ago';
  }
  function initials(name) {
    return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }

  /* ---------- token storage (sandbox-safe) ---------- */
  let TOKEN = null;
  const store = {
    get() {
      try { return window.localStorage.getItem('ndc_sid') || null; } catch (e) { return null; }
    },
    set(v) {
      try { v ? window.localStorage.setItem('ndc_sid', v) : window.localStorage.removeItem('ndc_sid'); } catch (e) { /* in-memory only */ }
    }
  };
  function setToken(t) { TOKEN = t; store.set(t); }
  function getToken() { return TOKEN || store.get(); }

  async function api(path, opts = {}) {
    const headers = { 'Accept': 'application/json' };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    const tok = getToken();
    if (tok) headers['x-session'] = tok;
    let res;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);   // never leave a save spinning forever
    try {
      res = await fetch(path, {
        method: opts.method || 'GET',
        headers,
        signal: ctrl.signal,
        credentials: 'same-origin',
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
      });
    } catch (e) {
      const err = (e && e.name === 'AbortError')
        ? new Error('The request timed out. Check your connection and try again.')
        : new Error('Network problem — check your connection and try again.');
      err.network = true;
      throw err;
    } finally {
      clearTimeout(timer);
    }
    let data = {};
    try { data = await res.json(); } catch (e) { /* empty body */ }
    if (!res.ok) {
      const err = new Error(data.error || ('Request failed (' + res.status + ')'));
      err.status = res.status;
      if (res.status === 401 && typeof Auth !== 'undefined') Auth.onUnauthorized();
      throw err;
    }
    return data;
  }

  /* ---------- toast ---------- */
  let toastTimer = null;
  function toast(msg, type = 'info', ms = 3800) {
    const el = $('#toast');
    el.className = 'toast ' + type;
    el.innerHTML = (type === 'success' ? '✓ ' : type === 'error' ? '⚠ ' : '') + esc(msg);
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), ms);
  }

  /* ---------- modal ---------- */
  function modal({ title, subtitle = '', body = '', footer = '', size = '', onOpen }) {
    const root = $('#modalRoot');
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal ${size}" role="dialog" aria-modal="true">
        <div class="modal-head">
          <div><h2 class="modal-title">${esc(title)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div>
          <button class="modal-x" data-close type="button" aria-label="Close">✕</button>
        </div>
        <div class="modal-body">${body}</div>
        ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
      </div>`;
    root.appendChild(backdrop);
    const close = () => backdrop.remove();
    backdrop.addEventListener('click', e => {
      if (e.target === backdrop || e.target.closest('[data-close]')) close();
    });
    const onKey = e => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } };
    document.addEventListener('keydown', onKey);
    if (onOpen) onOpen(backdrop, close);
    return { el: backdrop, close };
  }

  function confirmDialog({ title, message, confirmText = 'Confirm', danger = false, requireText = '' }) {
    return new Promise(resolve => {
      const id = 'cf' + Math.random().toString(36).slice(2, 7);
      const body = `<p style="margin:0 0 12px;font-size:13.5px;line-height:1.55">${message}</p>
        ${requireText ? `<label class="field"><span>Type <b>${esc(requireText)}</b> to confirm</span><input class="input" id="${id}"></label>` : ''}`;
      const m = modal({
        title, body,
        footer: `<button class="btn" data-close>Cancel</button><button class="btn ${danger ? 'primary' : 'green'}" id="${id}_ok">${esc(confirmText)}</button>`
      });
      const ok = $('#' + id + '_ok', m.el);
      if (requireText) ok.disabled = true;
      if (requireText) {
        $('#' + id, m.el).addEventListener('input', e => { ok.disabled = e.target.value !== requireText; });
      }
      ok.addEventListener('click', () => { m.close(); resolve(true); });
      m.el.addEventListener('click', e => {
        if (e.target === m.el || e.target.closest('[data-close]')) resolve(false);
      });
    });
  }

  /* ---------- downloads / CSV ---------- */
  function download(filename, text, mime = 'text/csv;charset=utf-8') {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  /* Authenticated download: a plain <a href> can't carry the session header. */
  async function downloadUrl(path, filename) {
    const headers = {};
    const tok = getToken();
    if (tok) headers['x-session'] = tok;
    const res = await fetch(path, { headers, credentials: 'same-origin' });
    if (!res.ok) throw new Error('Download failed (' + res.status + ')');
    const text = await res.text();
    download(filename, text.charCodeAt(0) === 0xFEFF ? text : '\uFEFF' + text);
  }

  function parseCSV(text) {
    const rows = [];
    let row = [], cell = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQ) {
        if (ch === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false;
        } else cell += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ',') { row.push(cell.trim()); cell = ''; }
      else if (ch === '\n') { row.push(cell.trim()); rows.push(row); row = []; cell = ''; }
      else if (ch !== '\r') cell += ch;
    }
    if (cell || row.length) { row.push(cell.trim()); rows.push(row); }
    return rows.filter(r => r.some(c => c !== ''));
  }

  /* ---------- misc ---------- */
  function debounce(fn, ms = 250) {
    let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }
  function csvCell(v) {
    const s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function statusBadge(status) {
    const map = {
      pending: ['pending', 'Pending'],
      entered: ['entered', 'Entered'],
      locked: ['locked', 'Locked']
    };
    const [cls, label] = map[status] || ['pending', status];
    return `<span class="badge ${cls}">${status === 'locked' ? ico('lock', 10) + ' ' : ''}${label}</span>`;
  }


  /* ---------- inline SVG icons (font-independent) ---------- */
  const ICONS = {
    overview: '<rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1"/><rect x="9" y="1.5" width="5.5" height="5.5" rx="1"/><rect x="1.5" y="9" width="5.5" height="5.5" rx="1"/><rect x="9" y="9" width="5.5" height="5.5" rx="1"/>',
    collation: '<path d="M1.5 3h13M1.5 8h13M1.5 13h13"/>',
    chart: '<circle cx="8" cy="8" r="6.2"/><path d="M8 1.8V8l5 3"/>',
    progress: '<path d="M2 14V8M6 14V4M10 14v-4M14 14V6"/>',
    entry: '<path d="M11.2 1.9l2.9 2.9L5.6 13.3l-3.9 1 1-3.9z"/>',
    users: '<circle cx="6" cy="5" r="2.6"/><path d="M1.4 14c0-2.6 2-4.3 4.6-4.3s4.6 1.7 4.6 4.3"/><path d="M11 3.2a2.4 2.4 0 010 4.6M12.3 9.9c1.5.5 2.4 1.9 2.4 4.1"/>',
    branches: '<path d="M8 14.3s4.6-4.3 4.6-7.4A4.6 4.6 0 008 2.3a4.6 4.6 0 00-4.6 4.6C3.4 10 8 14.3 8 14.3z"/><circle cx="8" cy="6.8" r="1.7"/>',
    audit: '<circle cx="8" cy="8" r="6.3"/><path d="M8 4.4V8l2.6 1.7"/>',
    settings: '<circle cx="8" cy="8" r="2.3"/><path d="M8 1.4v1.8M8 12.8v1.8M2.4 8H1.4M14.6 8h-1M4 4l1.3 1.3M10.7 10.7L12 12M12 4l-1.3 1.3M5.3 10.7L4 12"/>',
    edit: '<path d="M11.2 1.9l2.9 2.9L5.6 13.3l-3.9 1 1-3.9z"/>',
    trash: '<path d="M2.6 4.2h10.8M6 4.2V2.6h4v1.6M3.8 4.2l.8 9.3h6.8l.8-9.3"/><path d="M6.4 6.6v4.6M9.6 6.6v4.6"/>',
    lock: '<rect x="3.2" y="7" width="9.6" height="6.6" rx="1.4"/><path d="M5.6 7V5.2a2.4 2.4 0 014.8 0V7"/>',
    unlock: '<rect x="3.2" y="7" width="9.6" height="6.6" rx="1.4"/><path d="M5.6 7V5.2a2.4 2.4 0 014.6-.8"/>',
    ballot: '<rect x="2.2" y="2.2" width="11.6" height="11.6" rx="1.6"/><path d="M5 8.2l1.9 1.9L11 6.3"/>',
    search: '<circle cx="7" cy="7" r="4.6"/><path d="M10.4 10.4l3.4 3.4"/>',
    refresh: '<path d="M13.4 8a5.4 5.4 0 11-1.6-3.8"/><path d="M13.6 2.2v3h-3"/>',
    download: '<path d="M8 2.2v8.2M4.8 7.4L8 10.6l3.2-3.2"/><path d="M2.6 12.6h10.8v1.6H2.6z"/>',
    plus: '<path d="M8 3v10M3 8h10"/>',
    left: '<path d="M9.8 3.4L5.2 8l4.6 4.6"/>',
    right: '<path d="M6.2 3.4L10.8 8l-4.6 4.6"/>'
  };

  function ico(name, size = 15, cls = '') {
    const body = ICONS[name];
    if (!body) return '';
    return `<svg class="ico ${cls}" width="${size}" height="${size}" viewBox="0 0 16 16" fill="none"
      stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
      aria-hidden="true" style="flex:none;vertical-align:-2px">${body}</svg>`;
  }

  /* ------------------------------------------------------------------ */
  /*  Dedicated horizontal scrollbar for wide table boxes.               */
  /*  The bar belongs to the box only: the page never scrolls sideways.   */
  /* ------------------------------------------------------------------ */
  function tableScroller(wrap) {
    if (wrap.__hs || !wrap.parentNode) return;
    wrap.__hs = true;

    const bar = document.createElement('div');
    bar.className = 'hs-bar off';
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Scroll this table sideways');
    bar.innerHTML =
      `<button type="button" class="hs-btn" data-dir="-1" aria-label="Scroll left" title="Scroll left">${ico('left', 14)}</button>` +
      `<div class="hs-track" title="Drag to scroll this table sideways"><div class="hs-thumb"></div></div>` +
      `<button type="button" class="hs-btn" data-dir="1" aria-label="Scroll right" title="Scroll right">${ico('right', 14)}</button>`;
    wrap.parentNode.insertBefore(bar, wrap);
    wrap.classList.add('hs-on');   // tells CSS to hide the native horizontal bar

    const track = bar.querySelector('.hs-track');
    const thumb = bar.querySelector('.hs-thumb');
    const prev = bar.querySelector('[data-dir="-1"]');
    const next = bar.querySelector('[data-dir="1"]');

    const maxScroll = () => Math.max(0, wrap.scrollWidth - wrap.clientWidth);

    function update() {
      const max = maxScroll();
      if (max <= 1) { bar.classList.add('off'); return; }
      bar.classList.remove('off');
      const trackW = track.clientWidth;
      if (!trackW) return;
      const w = Math.min(trackW, Math.max(30, Math.round(trackW * (wrap.clientWidth / wrap.scrollWidth))));
      thumb.style.width = w + 'px';
      thumb.style.left = Math.round((wrap.scrollLeft / max) * (trackW - w)) + 'px';
      prev.disabled = wrap.scrollLeft <= 1;
      next.disabled = wrap.scrollLeft >= max - 1;
    }

    wrap.__hsUpdate = update;
    wrap.addEventListener('scroll', update, { passive: true });

    // arrows: move three quarters of a box width
    [prev, next].forEach(btn => {
      btn.addEventListener('click', () => {
        wrap.scrollBy({ left: Number(btn.dataset.dir) * Math.round(wrap.clientWidth * 0.75), behavior: 'smooth' });
      });
    });

    // click anywhere on the track to jump
    track.addEventListener('pointerdown', e => {
      if (e.target === thumb) return;
      const r = track.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      wrap.scrollLeft = p * maxScroll();
    });

    // drag the thumb
    thumb.addEventListener('pointerdown', e => {
      e.preventDefault();
      const startX = e.clientX;
      const startLeft = wrap.scrollLeft;
      const max = maxScroll();
      const travel = track.clientWidth - thumb.offsetWidth;
      thumb.classList.add('dragging');
      try { thumb.setPointerCapture(e.pointerId); } catch (_) {}
      const move = ev => {
        if (!travel) return;
        wrap.scrollLeft = startLeft + ((ev.clientX - startX) * max) / travel;
      };
      const end = () => {
        thumb.classList.remove('dragging');
        thumb.removeEventListener('pointermove', move);
        thumb.removeEventListener('pointerup', end);
        thumb.removeEventListener('pointercancel', end);
      };
      thumb.addEventListener('pointermove', move);
      thumb.addEventListener('pointerup', end);
      thumb.addEventListener('pointercancel', end);
    });

    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => update());
      ro.observe(wrap); ro.observe(track);
      wrap.__hsRO = ro;
    }
    requestAnimationFrame(update);
    setTimeout(update, 60);
  }

  function attachTableScrollers(root = document) {
    $$('.table-wrap', root).forEach(tableScroller);
  }

  let tableObserver = null;
  function watchTables() {
    attachTableScrollers();
    if (tableObserver) return;
    tableObserver = new MutationObserver(muts => {
      const touched = new Set();
      for (const m of muts) {
        if (m.type === 'childList') {
          m.addedNodes.forEach(n => {
            if (n.nodeType !== 1) return;
            if (n.classList && n.classList.contains('table-wrap')) { tableScroller(n); touched.add(n); }
            if (n.querySelectorAll) n.querySelectorAll('.table-wrap').forEach(w => { tableScroller(w); touched.add(w); });
          });
        }
        const t = m.target.nodeType === 1 ? m.target.closest('.table-wrap') : null;
        if (t) touched.add(t);
      }
      touched.forEach(w => { if (w.__hsUpdate) w.__hsUpdate(); });
    });
    tableObserver.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', () => attachTableScrollers(), { passive: true });
  }

  /* The app page itself never scrolls sideways — only table boxes do. */
  function lockPageScrollX() {
    const reset = () => {
      if (window.scrollX !== 0) window.scrollTo(0, window.scrollY);
      if (document.documentElement.scrollLeft) document.documentElement.scrollLeft = 0;
      if (document.body && document.body.scrollLeft) document.body.scrollLeft = 0;
    };
    window.addEventListener('scroll', reset, { passive: true });
    window.addEventListener('resize', reset, { passive: true });
    reset();
  }

  // start watching as soon as the DOM exists, independent of the app boot
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { watchTables(); lockPageScrollX(); }, { once: true });
  } else {
    watchTables();
    lockPageScrollX();
  }

  const BUILD = 16;   // must match #buildChip in index.html

  return {
    BUILD,
    $, $$, esc, fmt, pct, fmtDate, fmtTime, fmtDateTime, timeAgo, initials,
    api, toast, modal, confirmDialog, download, downloadUrl, parseCSV, debounce, csvCell, statusBadge, ico,
    setToken, getToken, tableScroller, attachTableScrollers, watchTables
  };
})();
