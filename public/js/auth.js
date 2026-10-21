/* Authentication: login, session boot, logout, password change */
const Auth = {
  user: null,

  async boot() {
    if (!H.getToken()) return null;
    try {
      const { user } = await H.api('/api/me');
      this.user = user;
      return user;
    } catch (e) {
      H.setToken(null);
      return null;
    }
  },

  async login(username, password) {
    const data = await H.api('/api/login', { method: 'POST', body: { username, password } });
    H.setToken(data.token);
    this.user = data.user;
    return data.user;
  },

  async logout() {
    try { await H.api('/api/logout', { method: 'POST', body: {} }); } catch (e) { /* ignore */ }
    H.setToken(null);
    this.user = null;
    if (typeof App !== 'undefined') App.showLogin();
  },

  onUnauthorized() {
    H.setToken(null);
    if (this.user && typeof App !== 'undefined') App.showLogin('Your session has ended. Please sign in again.');
  },

  openPasswordModal() {
    const m = H.modal({
      title: 'Change your password',
      subtitle: 'Use at least 6 characters. You will stay signed in.',
      body: `
        <label class="field"><span>Current password</span><input class="input" type="password" id="pwCur" autocomplete="current-password"></label>
        <label class="field"><span>New password</span><input class="input" type="password" id="pwNew" autocomplete="new-password"></label>
        <label class="field"><span>Confirm new password</span><input class="input" type="password" id="pwNew2" autocomplete="new-password"></label>
        <div id="pwMsg"></div>`,
      footer: `<button class="btn" data-close>Cancel</button><button class="btn primary" id="pwSave">Update password</button>`
    });
    H.$('#pwSave', m.el).addEventListener('click', async () => {
      const cur = H.$('#pwCur', m.el).value;
      const n1 = H.$('#pwNew', m.el).value;
      const n2 = H.$('#pwNew2', m.el).value;
      const msg = H.$('#pwMsg', m.el);
      msg.innerHTML = '';
      if (n1 !== n2) { msg.innerHTML = '<div class="alert error">The new passwords do not match.</div>'; return; }
      try {
        await H.api('/api/me/password', { method: 'POST', body: { current: cur, next: n1 } });
        m.close();
        H.toast('Password updated successfully.', 'success');
      } catch (e) {
        msg.innerHTML = '<div class="alert error">' + H.esc(e.message) + '</div>';
      }
    });
  }
};
