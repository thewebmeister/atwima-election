/* Application shell: boot, login, navigation, live polling */
const App = {
  state: {
    user: null,
    config: { election: {}, candidates: [] },
    branches: [],
    tab: null,
    activeRefresh: null,
    pollTimer: null,
    resultsOpen: true
  },

  async init() {
    try {
      this.state.config = await H.api('/api/config');
    } catch (e) {
      this.state.config = { election: { party: 'National Democratic Congress', constituency: 'Atwima Kwanwoma', region: 'Ashanti', conference: 'Constituency Delegates Conference', month: 'October 2026', position: 'Vice Chairman' }, candidates: [], resultsOpen: true };
    }
    this.renderLoginCandidates();
    this.bindPasswordToggle();
    this.bindGlobal();

    const user = await Auth.boot();
    H.$('#boot').classList.add('hidden');
    if (user) this.startApp();
    else this.showLogin();
  },

  renderLoginCandidates() {
    const cfg = this.state.config;
    const wrap = H.$('#loginCandidates');
    if (wrap && cfg.candidates.length) {
      const tint = c => c.color || '#fff';
      wrap.innerHTML = cfg.candidates.map(c => `
        <div class="lc" style="--lc:${H.esc(tint(c))}">
          <div class="lc-pic">
            <img src="${c.photo}" alt="${H.esc(c.short)}" width="120" height="144" decoding="async">
            <span class="lc-no">${c.id}</span>
          </div>
          <b>${H.esc(c.short)}</b>
        </div>`).join('');
    }

    // Register figures, straight from the server so the sign-in screen is truthful.
    const stats = H.$('#loginStats');
    if (stats) {
      const n = cfg.stats || {};
      const items = [];
      if (n.branches) items.push([H.fmt(n.branches), 'branches']);
      if (n.areas) items.push([n.areas, 'electoral areas']);
      items.push([cfg.candidates.length || 3, 'candidates']);
      stats.innerHTML = items.map(([v, k]) => `<div><b>${v}</b><span>${k}</span></div>`).join('');
    }
  },

  /* Show/hide the password — small thing, but this gets typed on phones a lot. */
  bindPasswordToggle() {
    const btn = H.$('#pwToggle');
    const input = H.$('#loginPassword');
    if (!btn || !input) return;
    btn.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.setAttribute('aria-pressed', String(show));
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      btn.classList.toggle('on', show);
      input.focus();
    });
  },

  bindGlobal() {
    H.$('#loginForm').addEventListener('submit', async e => {
      e.preventDefault();
      const btn = H.$('#loginBtn');
      const err = H.$('#loginError');
      err.classList.add('hidden');
      const username = H.$('#loginUsername').value.trim();
      const password = H.$('#loginPassword').value;
      if (!username || !password) { err.textContent = 'Enter your username and password.'; err.classList.remove('hidden'); return; }
      btn.disabled = true;
      btn.innerHTML = '<span class="spin"></span> Signing in…';
      try {
        await Auth.login(username, password);
        H.$('#loginPassword').value = '';
        await this.startApp();
      } catch (ex) {
        err.textContent = ex.message;
        err.classList.remove('hidden');
        btn.disabled = false;
        btn.textContent = 'Sign in';
      }
    });

    const menuBtn = H.$('#menuBtn');
    const sidebar = H.$('#sidebar');
    const backdrop = H.$('#sidebarBackdrop');
    const isMobile = () => window.matchMedia('(max-width: 1000px)').matches;

    const shell = H.$('#view-main');
    const setSidebar = (open) => {
      sidebar.classList.toggle('collapsed', !open);
      shell.classList.toggle('sidebar-collapsed', !open);
      if (isMobile()) {
        backdrop.classList.toggle('hidden', !open);
      } else {
        backdrop.classList.add('hidden');
      }
      menuBtn.setAttribute('aria-expanded', String(open));
      try { localStorage.setItem('ndc_sidebar', open ? 'open' : 'closed'); } catch (e) {}
    };

    menuBtn.addEventListener('click', () => {
      const isOpen = menuBtn.getAttribute('aria-expanded') === 'true';
      setSidebar(!isOpen);
    });
    backdrop.addEventListener('click', () => setSidebar(false));
    window.addEventListener('resize', H.debounce(() => {
      if (!isMobile()) { backdrop.classList.add('hidden'); }
      else if (menuBtn.getAttribute('aria-expanded') === 'true') { backdrop.classList.remove('hidden'); }
    }, 150));

    // Desktop remembers your choice. On phones/tablets the drawer always starts closed,
    // so it never covers the page you are trying to read.
    let saved = null;
    if (!isMobile()) { try { saved = localStorage.getItem('ndc_sidebar'); } catch (e) {} }
    setSidebar(isMobile() ? false : (saved ? saved === 'open' : true));

    H.$('[data-action="logout-side"]').addEventListener('click', () => Auth.logout());

    const userBtn = H.$('#userBtn');
    const dropdown = H.$('#userDropdown');

    /* ------------------------------------------------------------------
       Account menu.
       The menu is anchored with fixed positioning at body level because the
       top bar is height-locked with overflow:hidden (which would clip it).
       Everything below is defensive on purpose: if a browser is still holding
       an older copy of index.html, the expected child nodes may be missing —
       in that case we create them rather than throwing, because a throw here
       would swallow the click and the menu would never open.
       ------------------------------------------------------------------ */
    const menuHead = () => {
      let head = H.$('#dropdownHead', dropdown);
      if (!head) {                      // stale DOM: build the header on the fly
        head = document.createElement('div');
        head.id = 'dropdownHead';
        head.className = 'dropdown-head';
        dropdown.insertBefore(head, dropdown.firstChild);
      }
      return head;
    };

    const placeMenu = () => {
      try {
        const r = userBtn.getBoundingClientRect();
        const w = dropdown.offsetWidth || 218;
        const h = dropdown.offsetHeight || 132;
        const gap = 8;
        let left = r.right - w;                                   // right edges flush
        left = Math.min(Math.max(gap, left), window.innerWidth - w - gap);
        let top = r.bottom + gap;
        if (top + h > window.innerHeight - gap) top = Math.max(gap, r.top - h - gap);  // flip up
        dropdown.style.left = Math.round(left) + 'px';
        dropdown.style.top = Math.round(top) + 'px';
      } catch (e) { /* never let positioning stop the menu opening */ }
    };

    const menuOpen = () => !dropdown.classList.contains('hidden');

    const setMenu = open => {
      try {
        if (open) {
          const u = (Auth && Auth.user) || {};
          const roleLabel = u.role === 'admin' ? 'System Administrator' : 'Branch Officer';
          const meta = [];
          if (u.username) meta.push('@' + u.username);
          if (u.name !== roleLabel) meta.push(roleLabel);
          menuHead().innerHTML =
            '<strong>' + H.esc(u.name || 'Signed in') + '</strong>' +
            '<span>' + H.esc(meta.join(' · ')) + '</span>';
          dropdown.classList.remove('hidden');
          placeMenu();
        } else {
          dropdown.classList.add('hidden');
        }
      } catch (e) {
        dropdown.classList.remove('hidden');   // worst case: show it unpositioned
      }
      userBtn.setAttribute('aria-expanded', String(open));
    };

    let lastToggle = 0;
    userBtn.addEventListener('click', e => {
      e.stopPropagation();
      const now = Date.now();
      if (now - lastToggle < 300) return;     // a double-tap must not open-then-close
      lastToggle = now;
      setMenu(!menuOpen());
    });

    document.addEventListener('click', () => { if (menuOpen()) setMenu(false); });
    dropdown.addEventListener('click', e => e.stopPropagation());
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && menuOpen()) { setMenu(false); try { userBtn.focus(); } catch (_) {} }
    });
    // Reposition rather than close: a stray scroll must not eat the menu.
    window.addEventListener('scroll', () => { if (menuOpen()) placeMenu(); }, { passive: true });
    window.addEventListener('resize', H.debounce(() => { if (menuOpen()) placeMenu(); }, 120));

    dropdown.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      setMenu(false);
      if (b.dataset.action === 'logout') Auth.logout();
      if (b.dataset.action === 'password') Auth.openPasswordModal();
    });

    document.addEventListener('click', e => {
      if (e.target.closest('#infoPrint')) window.print();
    });

    H.$('#view-main').addEventListener('click', e => {
      const nav = e.target.closest('[data-nav]');
      if (!nav) return;
      e.preventDefault();
      this.switchTab(nav.dataset.nav);
    });
  },

  showLogin(message) {
    this.stopPolling();
    H.$('#view-main').classList.add('hidden');
    H.$('#view-login').classList.remove('hidden');
    const err = H.$('#loginError');
    if (message) { err.textContent = message; err.classList.remove('hidden'); } else { err.classList.add('hidden'); }
    const btn = H.$('#loginBtn');
    btn.disabled = false; btn.textContent = 'Sign in';
    setTimeout(() => { const u = H.$('#loginUsername'); if (u) u.focus(); }, 50);
  },

  async startApp() {
    this.state.user = Auth.user;
    const u = Auth.user;
    H.$('#loginError').classList.add('hidden');
    H.$('#view-login').classList.add('hidden');
    H.$('#view-main').classList.remove('hidden');
    H.$('#userName').textContent = u.name;
    H.$('#userRole').textContent = u.role === 'admin' ? 'Administrator' : 'Branch Officer';
    H.$('#userInitials').textContent = H.initials(u.name);
    H.$('#sideInitials').textContent = H.initials(u.name);
    H.$('#sideName').textContent = u.name;
    H.$('#sideRole').textContent = u.role === 'admin' ? 'Administrator' : 'Branch Officer';
    H.$('#footerUser').textContent = `${u.name} · ${u.role === 'admin' ? 'Administrator' : 'Officer'}`;

    try {
      const conf = await H.api('/api/config');
      this.state.config = conf;
      this.updateEntryStatus(conf.resultsOpen !== false);
    } catch (e) { /* ignore */ }
    await this.refreshBranches();
    H.watchTables();
    this.buildTabs();
    const allowed = this.state.user.role === 'admin'
      ? ['overview','collation','infographics','progress','entry','users','branches','audit','settings']
      : ['entry','mine'];
    const fromHash = (location.hash || '').replace(/^#\//, '');
    const initial = allowed.includes(fromHash) ? fromHash : (this.state.user.role === 'admin' ? 'overview' : 'entry');
    this.switchTab(initial);
    if (!this.state.hashBound) {
      this.state.hashBound = true;
      window.addEventListener('hashchange', () => {
        const t = (location.hash || '').replace(/^#\//, '');
        if (t && t !== this.state.tab && allowed.includes(t)) this.switchTab(t);
      });
    }
    this.startPolling();
  },

  async refreshBranches() {
    try {
      const d = await H.api('/api/branches');
      this.state.branches = d.branches;
    } catch (e) { /* handled by api */ }
  },

  updateEntryStatus(open) {
    this.state.resultsOpen = !!open;
    const pill = H.$('#entryStatus');
    pill.className = 'pill ' + (open ? 'open' : 'closed');
    pill.textContent = open ? '● Entry open' : '● Entry closed';
  },

  buildTabs() {
    const admin = [
      ['overview', 'Overview', 'overview'], ['collation', 'Collation', 'collation'], ['infographics', 'Infographics', 'chart'],
      ['progress', 'Progress', 'progress'], ['entry', 'Data Entry', 'entry'], ['users', 'Users', 'users'],
      ['branches', 'Branches', 'branches'], ['audit', 'Audit Trail', 'audit'], ['settings', 'Settings', 'settings']
    ];
    const officer = [['entry', 'Enter Results', 'entry'], ['mine', 'My Submissions', 'ballot']];
    const tabs = this.state.user.role === 'admin' ? admin : officer;
    H.$('#tabs').innerHTML = tabs.map(([id, label, icon]) =>
      `<button class="nav-item" data-tab="${id}"><span class="nav-ico">${H.ico(icon, 16)}</span><span class="nav-label">${label}</span></button>`).join('');
    H.$$('#tabs .nav-item').forEach(btn => btn.addEventListener('click', () => this.switchTab(btn.dataset.tab)));
  },

  async switchTab(tab, params = {}) {
    if (!Auth.user) return;
    this.state.tab = tab;
    if (location.hash !== '#/' + tab) {
      try { history.replaceState(null, '', '#/' + tab); } catch (e) { /* ignore */ }
    }
    this.state.tabParams = params;
    H.$$('#tabs .nav-item').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    const activeLabel = H.$('#tabs .nav-item.active .nav-label');
    if (activeLabel) H.$('#pageTitle').textContent = activeLabel.textContent;
    if (window.matchMedia('(max-width: 1000px)').matches) {
      H.$('#sidebar').classList.add('collapsed');
      H.$('#view-main').classList.add('sidebar-collapsed');
      H.$('#sidebarBackdrop').classList.add('hidden');
      H.$('#menuBtn').setAttribute('aria-expanded', 'false');
    }
    const content = H.$('#content');
    this.state.activeRefresh = null;
    content.innerHTML = `<div class="empty" style="padding:70px 20px"><div class="spin dark" style="width:26px;height:26px"></div><p style="margin-top:10px">Loading…</p></div>`;
    const isAdmin = this.state.user.role === 'admin';
    try {
      let view = null;
      if (isAdmin) {
        if (tab === 'overview') view = await Admin.overview(content);
        else if (tab === 'collation') view = await Admin.collation(content);
        else if (tab === 'infographics') view = await Infographics.render(content);
        else if (tab === 'progress') view = await Admin.progress(content);
        else if (tab === 'entry') view = await Entry.render(content, { admin: true });
        else if (tab === 'users') view = await Admin.users(content);
        else if (tab === 'branches') view = await Admin.branches(content);
        else if (tab === 'audit') view = await Admin.audit(content);
        else if (tab === 'settings') view = await Admin.settings(content);
      } else {
        if (tab === 'entry') view = await Entry.render(content, { admin: false, branchId: params.branchId });
        else if (tab === 'mine') view = await Officer.submissions(content);
        else view = await Entry.render(content, { admin: false, branchId: params.branchId });
      }
      this.state.activeRefresh = view && typeof view.refresh === 'function' ? view.refresh : null;
      window.scrollTo({ top: 0 });
    } catch (e) {
      content.innerHTML = `<div class="card card-pad" style="max-width:560px;margin:40px auto">
        <div class="alert error">${H.esc(e.message || 'Unable to load this page.')}</div>
        <button class="btn" onclick="App.switchTab('${this.state.tab}')">Try again</button></div>`;
    }
  },

  startPolling() {
    this.stopPolling();
    this.state.pollTimer = setInterval(async () => {
      if (!Auth.user || document.hidden) return;
      if (!this.state.activeRefresh) return;
      if (H.$('.modal-backdrop')) return;
      const focused = document.activeElement;
      if (focused && H.$('#content').contains(focused) && /INPUT|SELECT|TEXTAREA/.test(focused.tagName)) return;
      if (this.state.tab === 'entry') return;
      try { await this.state.activeRefresh(); } catch (e) { /* silent */ }
    }, window.matchMedia('(max-width: 1000px)').matches ? 20000 : 10000);
  },

  stopPolling() {
    if (this.state.pollTimer) clearInterval(this.state.pollTimer);
    this.state.pollTimer = null;
    this.state.activeRefresh = null;
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
