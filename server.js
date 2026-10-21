'use strict';
const path = require('path');
const fs = require('fs');
const Module = require('module');

/*
 * Dependency resolution that survives sandbox/container restarts:
 * `node_modules/` is not persisted by the workspace snapshot, so a vendored copy
 * lives in `vendor/deps` and is used as a fallback module path.
 */
const vendorDir = path.join(__dirname, 'vendor', 'deps');
if (fs.existsSync(vendorDir)) {
  const paths = (process.env.NODE_PATH ? process.env.NODE_PATH.split(path.delimiter) : []);
  if (!paths.includes(vendorDir)) paths.push(vendorDir);
  process.env.NODE_PATH = paths.join(path.delimiter);
  Module._initPaths();
}

const express = require('express');
const crypto = require('crypto');

/* ------------------------------------------------------------------ */
/*  Passwords — Node's built-in scrypt (no external dependency)        */
/* ------------------------------------------------------------------ */
const SCRYPT_KEYLEN = 64;
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pw), salt, SCRYPT_KEYLEN).toString('hex');
  return `scrypt$${salt}$${hash}`;
}
function verifyPassword(pw, stored) {
  if (!stored) return false;
  if (stored.startsWith('scrypt$')) {
    const [, salt, hash] = stored.split('$');
    const test = crypto.scryptSync(String(pw), salt, SCRYPT_KEYLEN);
    const expected = Buffer.from(hash, 'hex');
    return expected.length === test.length && crypto.timingSafeEqual(expected, test);
  }
  return false; /* legacy hash — migrated on boot */
}
const store = require('./lib/store');
const { buildBranches } = require('./lib/seed');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const SESSION_HOURS = 24;

const CANDIDATES = [
  { id: 1, name: 'LAWRENCE OBIRI YEBOAH', short: 'Lawrence Obiri Yeboah', initials: 'LOY', photo: '/img/candidates/c1.jpg', color: '#036439' },
  { id: 2, name: 'JOHN JUNIOR OWUSU ANSAH', short: 'John Junior Owusu Ansah', initials: 'JOA', photo: '/img/candidates/c2.jpg', color: '#d20f2d' },
  { id: 3, name: 'NANA KOFI NTI', short: 'Nana Kofi Nti', initials: 'NKN', photo: '/img/candidates/c3.jpg', color: '#202020' }
];

const ELECTION = {
  party: 'National Democratic Congress',
  region: 'Ashanti',
  constituency: 'Atwima Kwanwoma',
  conference: 'Constituency Delegates Conference',
  month: 'October 2026',
  position: 'Vice Chairman'
};

/* ------------------------------------------------------------------ */
/*  Database bootstrap                                                 */
/* ------------------------------------------------------------------ */
const db = store.load();

function bootstrap() {
  const d = store.getDB();
  if (!d.users.length) {
    d.users.push({
      id: store.id(),
      name: 'System Administrator',
      username: 'admin',
      passHash: hashPassword(process.env.ADMIN_PASSWORD || 'Admin@2026'),
      role: 'admin',
      active: true,
      createdAt: store.nowISO(),
      createdBy: 'system'
    });
    d.users.push({
      id: store.id(),
      name: 'Sample Branch Officer',
      username: 'officer',
      passHash: hashPassword(process.env.OFFICER_PASSWORD || 'Officer@2026'),
      role: 'officer',
      active: true,
      createdAt: store.nowISO(),
      createdBy: 'system'
    });
    store.audit({ action: 'SYSTEM_BOOTSTRAP', detail: 'Default administrator and sample officer account created' });
  }
  if (!d.branches.length) {
    d.branches = buildBranches();
    store.audit({ action: 'BRANCH_SEED', detail: `Placeholder branch structure created (${d.branches.length} branches)` });
  }
  if (!d.settings.electionName) {
    d.settings.electionName = 'NDC Atwima Kwanwoma — Vice Chairman Election';
    d.settings.resultsOpen = true;
  }
  /* One-time migration of legacy password hashes to scrypt (same passwords). */
  let migrated = 0;
  d.users.forEach(u => {
    if (u.passHash && !u.passHash.startsWith('scrypt$')) {
      const fallback = u.role === 'admin'
        ? (process.env.ADMIN_PASSWORD || 'Admin@2026')
        : (process.env.OFFICER_PASSWORD || 'Officer@2026');
      u.passHash = hashPassword(fallback);
      migrated++;
    }
  });
  if (migrated) store.audit({ action: 'SYSTEM_MIGRATE', detail: `Re-hashed ${migrated} account password(s) with scrypt` });
  store.save();
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);   // one hop (the preview proxy) — stops X-Forwarded-For spoofing
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  // Only on real HTTPS — sending HSTS over plain HTTP from a LAN host would be wrong.
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  next();
});
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(ROOT, 'public'), {
  index: false,
  etag: true,
  setHeaders(res, filePath) {
    if (/\.(html|js|css)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      res.setHeader('Pragma', 'no-cache');
    }
  }
}));

const sessions = new Map(); // fast index: token -> userId

/* Rebuilt at boot, after the datastore has finished loading (async on Postgres). */
function hydrateSessions() {
  sessions.clear();
  Object.entries(db.sessions).forEach(([tok, s]) => {
    if (new Date(s.expiresAt).getTime() > Date.now()) sessions.set(tok, s.userId);
    else delete db.sessions[tok];
  });
}

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie || '';
  raw.split(';').forEach(part => {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function issueSession(user, req, res) {
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 3600 * 1000).toISOString();
  db.sessions[token] = { userId: user.id, createdAt: store.nowISO(), expiresAt };
  sessions.set(token, user.id);
  const secure = req.secure || req.get('x-forwarded-proto') === 'https';
  res.cookie('ndc_sid', token, {
    httpOnly: true, sameSite: 'lax', secure,
    maxAge: SESSION_HOURS * 3600 * 1000, path: '/'
  });
  store.save();
  return { token, expiresAt };
}

function currentUser(req) {
  const token = req.get('x-session') || parseCookies(req).ndc_sid;   // never from the URL
  if (!token) return null;
  const s = db.sessions[token];
  if (!s) return null;
  if (new Date(s.expiresAt).getTime() < Date.now()) {
    delete db.sessions[token];
    sessions.delete(token);
    return null;
  }
  const user = db.users.find(u => u.id === s.userId);
  if (!user || !user.active) return null;
  user._token = token;
  return user;
}

function auth(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
  req.user = user;
  next();
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Administrator access required.' });
  next();
}

function branchById(idOrCode) {
  return db.branches.find(b => b.id === idOrCode || b.code === idOrCode);
}

function ownsResult(r, user) {
  if (!r) return true;                       // nothing entered yet — anyone may create it
  if (r.enteredBy !== user.id) return false; // created by someone else
  return !r.updatedBy || r.updatedBy === user.id; // an administrator has since touched it
}

function resultStatus(branchId) {
  const r = db.results[branchId];
  if (!r) return 'pending';
  if (r.locked) return 'locked';
  return 'entered';
}

function branchMeta(b) {
  const r = db.results[b.id];
  return {
    id: b.id, code: b.code, area: b.area, name: b.name,
    status: resultStatus(b.id),
    enteredAt: r ? r.updatedAt || r.enteredAt : null,
    enteredBy: r ? r.updatedByName || r.enteredByName || null : null,
    locked: r ? !!r.locked : false
  };
}

function computeStats() {
  const rows = db.branches.map(b => {
    const r = db.results[b.id];
    return { branch: b, result: r || null };
  });
  const entered = rows.filter(x => x.result);
  const locked = rows.filter(x => x.result && x.result.locked);
  const tally = { c1: 0, c2: 0, c3: 0, rejected: 0, cast: 0 };
  const byArea = {};
  db.branches.forEach(b => {
    if (!byArea[b.area]) byArea[b.area] = { area: b.area, branches: 0, reported: 0, locked: 0, c1: 0, c2: 0, c3: 0, rejected: 0, cast: 0 };
    byArea[b.area].branches++;
  });
  entered.forEach(({ branch, result }) => {
    const c1 = result.c1 || 0, c2 = result.c2 || 0, c3 = result.c3 || 0, rej = result.rejected || 0;
    const cast = c1 + c2 + c3 + rej;
    tally.c1 += c1; tally.c2 += c2; tally.c3 += c3; tally.rejected += rej; tally.cast += cast;
    const a = byArea[branch.area];
    a.reported++; a.c1 += c1; a.c2 += c2; a.c3 += c3; a.rejected += rej; a.cast += cast;
    if (result.locked) a.locked++;
  });
  const valid = tally.c1 + tally.c2 + tally.c3;
  const candidates = CANDIDATES.map(c => {
    const votes = tally['c' + c.id] || 0;
    return {
      ...c,
      votes,
      share: valid ? (votes / valid) * 100 : 0,
      shareOfCast: tally.cast ? (votes / tally.cast) * 100 : 0
    };
  });
  const ranked = [...candidates].sort((a, b) => b.votes - a.votes);
  const leader = ranked[0];
  const runnerUp = ranked[1];
  const tied = leader.votes === runnerUp.votes;
  const areas = Object.values(byArea).map(a => {
    const aValid = a.c1 + a.c2 + a.c3;
    const winner = [1, 2, 3].map(id => ({ id, v: a['c' + id] || 0 })).sort((x, y) => y.v - x.v)[0];
    return { ...a, valid: aValid, pending: a.branches - a.reported, winnerId: a.reported ? winner.id : null, winnerVotes: a.reported ? winner.v : 0 };
  }).sort((a, b) => a.area.localeCompare(b.area));

  return {
    totals: {
      branches: db.branches.length,
      reported: entered.length,
      locked: locked.length,
      pending: db.branches.length - entered.length,
      reportingRate: db.branches.length ? (entered.length / db.branches.length) * 100 : 0,
      ...tally,
      valid,
      rejectedShare: tally.cast ? (tally.rejected / tally.cast) * 100 : 0
    },
    candidates: ranked.map((c, i) => ({ ...c, rank: i + 1 })),
    leaderId: entered.length ? (tied ? null : leader.id) : null,
    tied: entered.length ? tied : false,
    margin: entered.length ? Math.abs(leader.votes - runnerUp.votes) : 0,
    majorityThreshold: valid ? Math.floor(valid / 2) + 1 : 0,
    areas,
    lastUpdated: entered.length ? entered.map(x => x.result.updatedAt || x.result.enteredAt).sort().pop() : null
  };
}

function validVotes(body) {
  const src = body || {};
  const has = k => Object.prototype.hasOwnProperty.call(src, k);
  const out = {};
  for (const c of CANDIDATES) {
    if (!has('c' + c.id)) {
      const err = new Error(`Missing votes for ${c.short}. Send all three candidates and rejected ballots.`);
      err.status = 400; throw err;
    }
    const raw = src['c' + c.id];
    const n = Number(raw === '' || raw == null ? 0 : raw);
    if (!Number.isInteger(n) || n < 0 || n > 1000000) {
      const err = new Error(`Enter a whole number (0 or more) for ${c.short}.`);
      err.status = 400; throw err;
    }
    out['c' + c.id] = n;
  }
  if (!has('rejected')) {
    const err = new Error('Missing rejected ballots. Send all three candidates and rejected ballots.');
    err.status = 400; throw err;
  }
  const rej = Number(src.rejected === '' || src.rejected == null ? 0 : src.rejected);
  if (!Number.isInteger(rej) || rej < 0 || rej > 1000000) {
    const err = new Error('Rejected ballots must be a whole number (0 or more).');
    err.status = 400; throw err;
  }
  out.rejected = rej;
  return out;
}

function writeAutoBackup(reason) {
  try {
    const dir = path.join(store.DATA_DIR, 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(dir, `auto-${stamp}-${reason}.json`);
    fs.writeFileSync(file, JSON.stringify({
      reason, at: store.nowISO(), settings: db.settings,
      branches: db.branches, results: db.results, users: db.users, audit: db.audit
    }, null, 2));
    return path.basename(file);
  } catch (e) { console.error('Auto-backup failed:', e.message); return null; }
}

function csvEscape(v) {
  const s = String(v == null ? '' : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/* ------------------------------------------------------------------ */
/*  Auth routes                                                        */
/* ------------------------------------------------------------------ */
const loginAttempts = new Map();
app.post('/api/login', (req, res) => {
  const ip = req.ip || 'unknown';
  const rec = loginAttempts.get(ip) || { count: 0, until: 0 };
  if (rec.count >= 6 && Date.now() < rec.until) {
    return res.status(429).json({ error: 'Too many failed attempts. Try again in a few minutes.' });
  }
  const now = Date.now();
  if (loginAttempts.size > 500) {
    for (const [k, v] of loginAttempts) if (v.until < now && v.count > 0) loginAttempts.delete(k);
  }
  const { username, password } = req.body || {};
  const user = db.users.find(u => String(u.username).toLowerCase() === String(username || '').trim().toLowerCase());
  if (!user || !verifyPassword(password || '', user.passHash)) {
    rec.count++; rec.until = Date.now() + 5 * 60 * 1000;
    loginAttempts.set(ip, rec);
    store.audit({ action: 'LOGIN_FAILED', username: String(username || 'unknown').slice(0, 40),
                  detail: `Failed sign-in attempt for “${String(username || '').slice(0, 40)}” from ${ip}` });
    store.save();
    return res.status(401).json({ error: 'Incorrect username or password.' });
  }
  if (!user.active) return res.status(403).json({ error: 'This account has been deactivated. Contact the administrator.' });
  loginAttempts.delete(ip);
  user.lastLoginAt = store.nowISO();
  const { token } = issueSession(user, req, res);
  store.audit({ userId: user.id, username: user.username, action: 'LOGIN', detail: `${user.name} signed in` });
  store.save();
  res.json({ token, user: store.publicUser(user) });
});

app.post('/api/logout', auth, (req, res) => {
  delete db.sessions[req.user._token];
  sessions.delete(req.user._token);
  res.clearCookie('ndc_sid');
  store.audit({ userId: req.user.id, username: req.user.username, action: 'LOGOUT', detail: `${req.user.name} signed out` });
  store.save();
  res.json({ ok: true });
});

app.get('/api/me', auth, (req, res) => {
  const fresh = db.users.find(u => u.id === req.user.id);
  res.json({ user: store.publicUser(fresh) });
});

app.post('/api/me/password', auth, (req, res) => {
  const { current, next } = req.body || {};
  if (!verifyPassword(current || '', req.user.passHash)) {
    return res.status(400).json({ error: 'Your current password is incorrect.' });
  }
  if (String(next || '').length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  req.user.passHash = hashPassword(next);
  store.audit({ userId: req.user.id, username: req.user.username, action: 'PASSWORD_CHANGE', detail: 'Changed own password' });
  store.save();
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ */
/*  Shared: config + branches + result entry                           */
/* ------------------------------------------------------------------ */
app.get('/api/config', (req, res) => {
  res.json({
    election: ELECTION,
    candidates: CANDIDATES,
    resultsOpen: db.settings.resultsOpen !== false,
    // Register size, used on the sign-in screen. Counts only — no branch data.
    stats: {
      branches: db.branches.length,
      areas: new Set(db.branches.map(b => b.area)).size
    }
  });
});

app.get('/api/branches', auth, (req, res) => {
  res.json({ branches: db.branches.map(branchMeta) });
});

app.get('/api/branches/:id', auth, (req, res) => {
  const b = branchById(req.params.id);
  if (!b) return res.status(404).json({ error: 'Branch not found.' });
  const r = db.results[b.id] || null;
  const canEdit = req.user.role === 'admin' || ownsResult(r, req.user);
  res.json({ branch: branchMeta(b), canEdit, result: r ? { c1: r.c1, c2: r.c2, c3: r.c3, rejected: r.rejected, locked: !!r.locked, enteredBy: r.enteredByName, enteredAt: r.enteredAt, updatedAt: r.updatedAt, updatedBy: r.updatedByName } : null });
});

app.post('/api/results', auth, (req, res, next) => {
  try {
    if (db.settings.resultsOpen === false && req.user.role !== 'admin') {
      return res.status(423).json({ error: 'Result entry is currently closed by the administrator.' });
    }
    const b = branchById((req.body || {}).branchId);
    if (!b) return res.status(404).json({ error: 'Branch not found.' });
    const votes = validVotes(req.body);
    const existing = db.results[b.id];
    if (existing && existing.locked && req.user.role !== 'admin') {
      return res.status(423).json({ error: 'This branch result has been verified and locked by the administrator.' });
    }
    /* Officers may only change an entry they created themselves (and last edited).
       Administrators keep full access to every branch. */
    if (existing && req.user.role !== 'admin' && !ownsResult(existing, req.user)) {
      return res.status(403).json({
        error: 'This entry was submitted by another officer. Only the System Administrator can change it.'
      });
    }
    const stamp = store.nowISO();
    if (existing) {
      if (existing.locked) {
        return res.status(423).json({ error: 'This branch result is locked. Use the correction tool as administrator.' });
      }
      const before = { c1: existing.c1, c2: existing.c2, c3: existing.c3, rejected: existing.rejected };
      Object.assign(existing, votes, { updatedAt: stamp, updatedBy: req.user.id, updatedByName: req.user.name });
      store.audit({
        userId: req.user.id, username: req.user.username, action: 'RESULT_UPDATE',
        detail: `Updated ${b.code} ${b.name} (${b.area})`,
        meta: { before, after: votes, branchId: b.id }
      });
      store.save();
      return res.json({ ok: true, updated: true, branch: branchMeta(b) });
    }
    db.results[b.id] = {
      ...votes,
      enteredAt: stamp,
      enteredBy: req.user.id,
      enteredByName: req.user.name,
      updatedAt: stamp,
      updatedBy: req.user.id,
      updatedByName: req.user.name,
      locked: false,
      corrections: []
    };
    store.audit({
      userId: req.user.id, username: req.user.username, action: 'RESULT_CREATE',
      detail: `Entered results for ${b.code} ${b.name} (${b.area})`,
      meta: { after: votes, branchId: b.id }
    });
    store.save();
    res.json({ ok: true, created: true, branch: branchMeta(b) });
  } catch (e) { next(e); }
});

function recentRows(user) {
  const isAdmin = user.role === 'admin';
  const rows = [];
  Object.entries(db.results).forEach(([bid, r]) => {
    const mine = r.enteredBy === user.id || r.updatedBy === user.id;
    if (!isAdmin && !mine) return;
    const b = branchById(bid);
    if (!b) return;
    rows.push({
      ...branchMeta(b),
      c1: r.c1, c2: r.c2, c3: r.c3, rejected: r.rejected,
      valid: r.c1 + r.c2 + r.c3,
      cast: r.c1 + r.c2 + r.c3 + r.rejected,
      owner: r.updatedByName || r.enteredByName || '—',
      mine,
      canDelete: isAdmin || (mine && !r.locked)
    });
  });
  rows.sort((a, b) => String(b.enteredAt || '').localeCompare(String(a.enteredAt || '')));
  return rows;
}

app.get('/api/recent', auth, (req, res) => {
  const rows = recentRows(req.user);
  const limit = Math.min(400, Math.max(1, Number(req.query.limit) || 300));
  res.json({ rows: rows.slice(0, limit), total: rows.length, scope: req.user.role === 'admin' ? 'all' : 'own' });
});

app.get('/api/my-results', auth, (req, res) => {
  const rows = recentRows(req.user).filter(r => r.mine);
  res.json({ rows });
});

/* Officer (or admin) deletes a branch result. Officers may only delete their own, unlocked entries. */
app.delete('/api/results/:branchId', auth, (req, res) => {
  const b = branchById(req.params.branchId);
  if (!b) return res.status(404).json({ error: 'Branch not found.' });
  const r = db.results[b.id];
  if (!r) return res.status(400).json({ error: 'No result has been entered for this branch.' });
  const isAdmin = req.user.role === 'admin';
  const mine = r.enteredBy === req.user.id || r.updatedBy === req.user.id;
  if (!isAdmin) {
    if (!mine) return res.status(403).json({ error: 'You can only delete entries you submitted yourself.' });
    if (r.locked) return res.status(423).json({ error: 'This result has been locked by the administrator and cannot be deleted.' });
  }
  delete db.results[b.id];
  store.audit({
    userId: req.user.id, username: req.user.username, action: 'RESULT_DELETE',
    detail: `Deleted result for ${b.code} ${b.name} (${b.area})`,
    meta: { before: { c1: r.c1, c2: r.c2, c3: r.c3, rejected: r.rejected }, branchId: b.id }
  });
  store.save();
  res.json({ ok: true, deleted: true });
});

/* ------------------------------------------------------------------ */
/*  Admin routes                                                       */
/* ------------------------------------------------------------------ */
app.get('/api/admin/overview', auth, adminOnly, (req, res) => {
  const stats = computeStats();
  const recent = db.audit
    .filter(a => !/^(LOGIN|LOGOUT)$/.test(a.action))
    .slice(0, 15);
  res.json({ ...stats, recent, resultsOpen: db.settings.resultsOpen !== false });
});

app.get('/api/admin/results', auth, adminOnly, (req, res) => {
  const q = String(req.query.q || '').toLowerCase();
  const area = String(req.query.area || '');
  const status = String(req.query.status || '');
  const rows = db.branches.map(b => {
    const r = db.results[b.id];
    const meta = branchMeta(b);
    const c1 = r ? r.c1 : null, c2 = r ? r.c2 : null, c3 = r ? r.c3 : null, rejected = r ? r.rejected : null;
    return {
      ...meta,
      c1, c2, c3, rejected,
      cast: r ? c1 + c2 + c3 + rejected : null,
      enteredAt: r ? r.enteredAt : null,
      updatedAt: r ? r.updatedAt : null,
      updatedByName: r ? r.updatedByName : null,
      corrections: r ? (r.corrections || []).length : 0,
      lockedAt: r ? r.lockedAt || null : null
    };
  }).filter(row => {
    if (area && row.area !== area) return false;
    if (status && row.status !== status) return false;
    if (q) {
      const hay = `${row.code} ${row.name} ${row.area} ${row.enteredBy || ''} ${row.updatedByName || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  res.json({ rows });
});

app.post('/api/admin/results/:id/correct', auth, adminOnly, (req, res, next) => {
  try {
    const b = branchById(req.params.id);
    if (!b) return res.status(404).json({ error: 'Branch not found.' });
    const r = db.results[b.id];
    if (!r) return res.status(400).json({ error: 'No result has been entered for this branch yet.' });
    const votes = validVotes(req.body);
    const reason = String((req.body || {}).reason || '').trim();
    if (reason.length < 5) return res.status(400).json({ error: 'A correction reason (at least 5 characters) is required.' });
    const before = { c1: r.c1, c2: r.c2, c3: r.c3, rejected: r.rejected };
    Object.assign(r, votes, { updatedAt: store.nowISO(), updatedBy: req.user.id, updatedByName: req.user.name });
    r.corrections = r.corrections || [];
    r.corrections.push({ at: store.nowISO(), by: req.user.name, username: req.user.username, reason, before, after: votes });
    store.audit({
      userId: req.user.id, username: req.user.username, action: 'RESULT_CORRECT',
      detail: `Corrected ${b.code} ${b.name} — reason: ${reason}`,
      meta: { before, after: votes, branchId: b.id }
    });
    store.save();
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.post('/api/admin/results/:id/lock', auth, adminOnly, (req, res) => {
  const b = branchById(req.params.id);
  if (!b) return res.status(404).json({ error: 'Branch not found.' });
  const r = db.results[b.id];
  if (!r) return res.status(400).json({ error: 'No result entered yet.' });
  r.locked = true;
  r.lockedAt = store.nowISO();
  r.lockedBy = req.user.name;
  store.audit({ userId: req.user.id, username: req.user.username, action: 'LOCK', detail: `Locked ${b.code} ${b.name}` });
  store.save();
  res.json({ ok: true });
});

app.post('/api/admin/results/:id/unlock', auth, adminOnly, (req, res) => {
  const b = branchById(req.params.id);
  if (!b) return res.status(404).json({ error: 'Branch not found.' });
  const r = db.results[b.id];
  if (!r) return res.status(400).json({ error: 'No result entered yet.' });
  r.locked = false;
  delete r.lockedAt; delete r.lockedBy;
  store.audit({ userId: req.user.id, username: req.user.username, action: 'UNLOCK', detail: `Unlocked ${b.code} ${b.name}` });
  store.save();
  res.json({ ok: true });
});

app.post('/api/admin/results/:id/reset', auth, adminOnly, (req, res) => {
  const b = branchById(req.params.id);
  if (!b) return res.status(404).json({ error: 'Branch not found.' });
  if (!db.results[b.id]) return res.status(400).json({ error: 'No result entered yet.' });
  delete db.results[b.id];
  store.audit({ userId: req.user.id, username: req.user.username, action: 'RESET_RESULT', detail: `Cleared result for ${b.code} ${b.name}` });
  store.save();
  res.json({ ok: true });
});

app.post('/api/admin/results/lock-all', auth, adminOnly, (req, res) => {
  let n = 0;
  Object.values(db.results).forEach(r => { if (!r.locked) { r.locked = true; r.lockedAt = store.nowISO(); r.lockedBy = req.user.name; n++; } });
  store.audit({ userId: req.user.id, username: req.user.username, action: 'LOCK', detail: `Locked all reported results (${n})` });
  store.save();
  res.json({ ok: true, locked: n });
});

app.post('/api/admin/results/clear-demo', auth, adminOnly, (req, res) => {
  const { confirm } = req.body || {};
  if (confirm !== 'CLEAR ALL RESULTS') return res.status(400).json({ error: 'Type CLEAR ALL RESULTS to confirm.' });
  const n = Object.keys(db.results).length;
  const backup = n ? writeAutoBackup('clear-all') : null;
  db.results = {};
  store.audit({ userId: req.user.id, username: req.user.username, action: 'RESET_RESULT', detail: `Cleared ALL results (${n} branches)` });
  store.save();
  res.json({ ok: true, cleared: n, backup });
});

app.post('/api/admin/demo-data', auth, adminOnly, (req, res) => {
  const coverage = Math.min(1, Math.max(0.05, Number((req.body || {}).coverage || 0.62)));
  const pending = db.branches.filter(b => !db.results[b.id]);
  const target = Math.round(db.branches.length * coverage);
  const picks = pending.slice(0, Math.max(0, target - (db.branches.length - pending.length)));
  const stamp = Date.now();
  picks.forEach((b, i) => {
    const seed = i * 37 + 11;
    const cast = 65 + (seed % 70);
    const rejected = seed % 5;
    const valid = cast - rejected;
    const b1 = 0.38 + ((seed % 13) - 6) / 100;
    const b2 = 0.28 + ((seed % 7) - 3) / 100;
    const c1 = Math.round(valid * b1);
    const c2 = Math.round(valid * b2);
    const c3 = Math.max(0, valid - c1 - c2);
    const at = new Date(stamp - (i * 3 + (seed % 20)) * 60000).toISOString();
    db.results[b.id] = {
      c1, c2, c3, rejected,
      enteredAt: at, enteredBy: req.user.id, enteredByName: 'Sample data (training)',
      updatedAt: at, updatedBy: req.user.id, updatedByName: 'Sample data (training)',
      locked: false, corrections: [], demo: true
    };
  });
  store.audit({ userId: req.user.id, username: req.user.username, action: 'DEMO_LOAD', detail: `Loaded training sample results for ${picks.length} branches (${Math.round(coverage * 100)}% coverage)` });
  store.save();
  res.json({ ok: true, created: picks.length, total: db.branches.length });
});

app.post('/api/admin/settings', auth, adminOnly, (req, res) => {
  if (typeof req.body.resultsOpen === 'boolean') {
    db.settings.resultsOpen = req.body.resultsOpen;
    store.audit({ userId: req.user.id, username: req.user.username, action: 'SETTINGS', detail: req.body.resultsOpen ? 'Opened result entry' : 'Closed result entry' });
  }
  store.save();
  res.json({ ok: true, resultsOpen: db.settings.resultsOpen !== false });
});

app.get('/api/admin/audit', auth, adminOnly, (req, res) => {
  const q = String(req.query.q || '').toLowerCase();
  const action = String(req.query.action || '');
  let rows = db.audit;
  if (action) rows = rows.filter(r => r.action === action);
  if (q) rows = rows.filter(r => `${r.username} ${r.action} ${r.detail}`.toLowerCase().includes(q));
  res.json({ rows: rows.slice(0, 400), actions: [...new Set(db.audit.map(r => r.action))] });
});

app.get('/api/admin/backup', auth, adminOnly, (req, res) => {
  store.audit({ userId: req.user.id, username: req.user.username, action: 'BACKUP', detail: 'Downloaded a full data backup' });
  store.save();
  const payload = {
    exportedAt: store.nowISO(),
    exportedBy: req.user.username,
    election: ELECTION,
    candidates: CANDIDATES,
    settings: db.settings,
    branches: db.branches,
    results: db.results,
    users: db.users.map(store.publicUser),
    audit: db.audit
  };
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="atwima-kwanwoma-backup-${new Date().toISOString().slice(0, 10)}.json"`);
  res.send(JSON.stringify(payload, null, 2));
});

app.get('/api/admin/export.csv', auth, adminOnly, (req, res) => {
  const lines = [];
  lines.push(['Code', 'Electoral Area', 'Branch', 'Lawrence Obiri Yeboah', 'John Junior Owusu Ansah', 'Nana Kofi Nti', 'Rejected', 'Total Cast', 'Status', 'Entered By', 'Entered At', 'Locked'].join(','));
  db.branches.forEach(b => {
    const r = db.results[b.id];
    lines.push([
      b.code, b.area, b.name,
      r ? r.c1 : '', r ? r.c2 : '', r ? r.c3 : '', r ? r.rejected : '',
      r ? r.c1 + r.c2 + r.c3 + r.rejected : '',
      resultStatus(b.id), r ? r.enteredByName : '', r ? r.enteredAt : '', r && r.locked ? 'YES' : 'NO'
    ].map(csvEscape).join(','));
  });
  const stats = computeStats();
  lines.push('');
  lines.push(['TOTALS', '', '', stats.totals.c1, stats.totals.c2, stats.totals.c3, stats.totals.rejected, stats.totals.cast].join(','));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="atwima-kwanwoma-vice-chairman-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(lines.join('\n'));
});

app.get('/api/admin/audit.csv', auth, adminOnly, (req, res) => {
  const q = String(req.query.q || '').toLowerCase();
  const action = String(req.query.action || '');
  let rows = db.audit;
  if (action) rows = rows.filter(r => r.action === action);
  if (q) rows = rows.filter(r => `${r.username} ${r.action} ${r.detail}`.toLowerCase().includes(q));
  const lines = [['When', 'User', 'Action', 'Detail'].join(',')];
  rows.forEach(r => lines.push([r.at, r.username, r.action, r.detail].map(csvEscape).join(',')));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="atwima-kwanwoma-audit-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(lines.join('\n'));
});

/* Users */
app.get('/api/admin/users', auth, adminOnly, (req, res) => {
  res.json({ users: db.users.map(u => ({ ...store.publicUser(u), entries: Object.values(db.results).filter(r => r.enteredBy === u.id || r.updatedBy === u.id).length })) });
});

app.post('/api/admin/users', auth, adminOnly, (req, res) => {
  const { name, username, password, role } = req.body || {};
  const uname = String(username || '').trim().toLowerCase();
  if (!String(name || '').trim()) return res.status(400).json({ error: 'Full name is required.' });
  if (!/^[a-z0-9._-]{3,32}$/.test(uname)) return res.status(400).json({ error: 'Username must be 3–32 characters (letters, numbers, dot, dash, underscore).' });
  if (String(password || '').length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  if (db.users.some(u => u.username.toLowerCase() === uname)) return res.status(409).json({ error: 'That username already exists.' });
  const user = {
    id: store.id(), name: String(name).trim(), username: uname,
    passHash: hashPassword(password),
    role: role === 'admin' ? 'admin' : 'officer', active: true,
    createdAt: store.nowISO(), createdBy: req.user.username
  };
  db.users.push(user);
  store.audit({ userId: req.user.id, username: req.user.username, action: 'USER_CREATE', detail: `Created ${user.role} account @${user.username} (${user.name})` });
  store.save();
  res.json({ ok: true, user: store.publicUser(user) });
});

app.patch('/api/admin/users/:id', auth, adminOnly, (req, res) => {
  const u = db.users.find(x => x.id === req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found.' });
  const { name, active, role, password } = req.body || {};
  if (typeof name === 'string' && name.trim()) u.name = name.trim();
  if (typeof active === 'boolean') {
    if (u.id === req.user.id && !active) return res.status(400).json({ error: 'You cannot deactivate your own account.' });
    u.active = active;
  }
  if (role === 'admin' || role === 'officer') {
    if (u.id === req.user.id && role !== 'admin') return res.status(400).json({ error: 'You cannot remove your own administrator role.' });
    if (u.role === 'admin' && role === 'officer' && db.users.filter(x => x.role === 'admin' && x.active).length <= 1) {
      return res.status(400).json({ error: 'At least one active administrator is required.' });
    }
    u.role = role;
  }
  if (typeof password === 'string' && password) {
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    u.passHash = hashPassword(password);
  }
  store.audit({ userId: req.user.id, username: req.user.username, action: 'USER_UPDATE', detail: `Updated account @${u.username}` });
  store.save();
  res.json({ ok: true, user: store.publicUser(u) });
});

/* Branches */
app.post('/api/admin/branches', auth, adminOnly, (req, res) => {
  const { code, area, name } = req.body || {};
  if (!String(area || '').trim() || !String(name || '').trim()) return res.status(400).json({ error: 'Electoral area and branch name are required.' });
  const auto = String(code || '').trim() || 'AK-' + String(db.branches.length + 1).padStart(3, '0');
  if (db.branches.some(b => b.code.toLowerCase() === auto.toLowerCase())) return res.status(409).json({ error: 'That branch code already exists.' });
  const b = { id: store.id(), code: auto, area: String(area).trim(), name: String(name).trim() };
  db.branches.push(b);
  store.audit({ userId: req.user.id, username: req.user.username, action: 'BRANCH_ADD', detail: `Added branch ${b.code} ${b.name}` });
  store.save();
  res.json({ ok: true, branch: branchMeta(b) });
});

app.patch('/api/admin/branches/:id', auth, adminOnly, (req, res) => {
  const b = branchById(req.params.id);
  if (!b) return res.status(404).json({ error: 'Branch not found.' });
  const { code, area, name } = req.body || {};
  if (code && b.code !== String(code).trim()) {
    if (db.branches.some(x => x.id !== b.id && x.code.toLowerCase() === String(code).trim().toLowerCase())) {
      return res.status(409).json({ error: 'Another branch already uses that code.' });
    }
    b.code = String(code).trim();
  }
  if (area) b.area = String(area).trim();
  if (name) b.name = String(name).trim();
  store.audit({ userId: req.user.id, username: req.user.username, action: 'BRANCH_UPDATE', detail: `Edited branch ${b.code} ${b.name}` });
  store.save();
  res.json({ ok: true, branch: branchMeta(b) });
});

app.delete('/api/admin/branches/:id', auth, adminOnly, (req, res) => {
  const idx = db.branches.findIndex(b => b.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Branch not found.' });
  if (db.results[db.branches[idx].id]) return res.status(400).json({ error: 'This branch already has a result. Clear the result first.' });
  const [b] = db.branches.splice(idx, 1);
  store.audit({ userId: req.user.id, username: req.user.username, action: 'BRANCH_DELETE', detail: `Deleted branch ${b.code} ${b.name}` });
  store.save();
  res.json({ ok: true });
});

app.post('/api/admin/areas/rename', auth, adminOnly, (req, res) => {
  const from = String((req.body || {}).from || '').trim();
  const to = String((req.body || {}).to || '').trim();
  if (!from || !to) return res.status(400).json({ error: 'Both the current and new electoral area names are required.' });
  if (from === to) return res.status(400).json({ error: 'The new name is the same as the current name.' });
  const affected = db.branches.filter(b => b.area === from);
  if (!affected.length) return res.status(404).json({ error: 'No branches found in that electoral area.' });
  affected.forEach(b => { b.area = to; });
  store.audit({ userId: req.user.id, username: req.user.username, action: 'AREA_RENAME', detail: `Renamed electoral area “${from}” to “${to}” (${affected.length} branches)` });
  store.save();
  res.json({ ok: true, renamed: affected.length, from, to });
});

app.post('/api/admin/import-branches', auth, adminOnly, (req, res) => {
  const csv = String((req.body || {}).csv || '');
  const mode = (req.body || {}).mode === 'replace' ? 'replace' : 'merge';
  if (mode === 'replace' && String((req.body || {}).confirm || '') !== 'REPLACE BRANCHES') {
    return res.status(400).json({
      error: 'Replacing the branch list deletes every result. Type REPLACE BRANCHES to confirm, or use merge mode.'
    });
  }
  if (!csv.trim()) return res.status(400).json({ error: 'The CSV file is empty.' });
  const lines = csv.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const parsed = [];
  let skipped = 0;
  lines.forEach((line, idx) => {
    const cells = line.split(',').map(c => c.trim().replace(/^"(.*)"$/, '$1'));
    if (idx === 0 && /electoral|branch|area|code/i.test(line)) return; // header
    let code = '', area = '', name = '';
    if (cells.length >= 3) { [code, area, name] = cells; }
    else if (cells.length === 2) { [area, name] = cells; }
    else { skipped++; return; }
    if (!area || !name) { skipped++; return; }
    parsed.push({ code, area, name });
  });
  if (!parsed.length) return res.status(400).json({ error: 'No valid rows found. Use columns: Code, Electoral Area, Branch (or Electoral Area, Branch).' });

  let added = 0, updated = 0;
  if (mode === 'replace') {
    const cleared = Object.keys(db.results).length;
    const backup = cleared ? writeAutoBackup('branch-replace') : null;
    db.results = {};
    db.branches = parsed.map((p, i) => ({
      id: store.id(), code: p.code || 'AK-' + String(i + 1).padStart(3, '0'), area: p.area, name: p.name
    }));
    added = db.branches.length;
    store.audit({ userId: req.user.id, username: req.user.username, action: 'BRANCH_IMPORT', detail: `Replaced branch list with ${added} branches (${cleared} results cleared)` });
  } else {
    parsed.forEach(p => {
      const match = db.branches.find(b => (p.code && b.code.toLowerCase() === p.code.toLowerCase()) || (!p.code && b.area === p.area && b.name === p.name));
      if (match) {
        match.area = p.area; match.name = p.name;
        updated++;
      } else {
        db.branches.push({ id: store.id(), code: p.code || 'AK-' + String(db.branches.length + 1).padStart(3, '0'), area: p.area, name: p.name });
        added++;
      }
    });
    store.audit({ userId: req.user.id, username: req.user.username, action: 'BRANCH_IMPORT', detail: `Imported branches (merge): ${added} added, ${updated} updated` });
  }
  store.save();
  res.json({ ok: true, added, updated, skipped, total: db.branches.length, mode });
});

/* ------------------------------------------------------------------ */
/*  SPA fallback + errors                                              */
/* ------------------------------------------------------------------ */
/* Health probe for the hosting platform: reports liveness + that the volume
   is writable, without touching any election data. */
app.get('/healthz', (req, res) => {
  let writable = false;
  try {
    fs.mkdirSync(store.DATA_DIR, { recursive: true });
    fs.accessSync(store.DATA_DIR, fs.constants.W_OK);
    writable = true;
  } catch (e) { /* reported below */ }
  res.json({
    ok: writable,
    uptime: Math.round(process.uptime()),
    branches: db.branches.length,
    users: db.users.length,
    dataDir: store.DATA_DIR,
    dataWritable: writable,
    version: 'v16'
  });
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

app.use((req, res, next) => {
  // HEAD must behave like GET for the shell (health checks, proxies, curl -I).
  if ((req.method === 'GET' || req.method === 'HEAD') && !req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Clear-Site-Data', '"cache"');   // wipe any stale cached build
    return res.sendFile(path.join(ROOT, 'public', 'index.html'));
  }
  next();
});

app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  if (status >= 500) {
    return res.status(500).json({ error: 'Something went wrong on the server. Please try again.' });
  }
  res.status(status).json({ error: err.message || 'Request could not be completed.' });
});

function pruneSessions() {
  const now = Date.now();
  let n = 0;
  Object.entries(db.sessions).forEach(([tok, s]) => {
    if (new Date(s.expiresAt).getTime() < now) { delete db.sessions[tok]; sessions.delete(tok); n++; }
  });
  if (n) { console.log('Pruned', n, 'expired session(s)'); store.save(); }
}
pruneSessions();
setInterval(pruneSessions, 60 * 60 * 1000).unref();

/* ------------------------------------------------------------------ */
/*  Boot: load the datastore, then start accepting traffic             */
/* ------------------------------------------------------------------ */

/* Copy the register + accounts from a seed file into an empty datastore.
   Results and audit stay empty — a fresh deployment starts with no votes. */
function seedFromFile() {
  const candidates = [
    process.env.SEED_FILE,
    path.join(ROOT, 'seed', 'db.json'),
    path.join(ROOT, 'deploy', 'seed.db.json')
  ].filter(Boolean);
  const file = candidates.find(f => fs.existsSync(f));
  if (!file) {
    console.log('No seed file found — the placeholder register will be used.');
    return;
  }
  try {
    const seed = JSON.parse(fs.readFileSync(file, 'utf8'));
    db.branches = seed.branches || [];
    db.users = seed.users || [];
    db.settings = seed.settings || db.settings || {};
    db.results = {};
    db.audit = [];
    db.sessions = {};
    store.audit({ action: 'SYSTEM_SEED', detail: `Seeded ${db.branches.length} branches and ${db.users.length} accounts from ${path.basename(file)}` });
    store.save();
    console.log(`Seeded from ${file}: ${db.branches.length} branches, ${db.users.length} accounts`);
  } catch (e) {
    console.error('Seed file could not be read:', e.message);
  }
}

let server = null;

async function start() {
  try {
    await store.loadAsync();      // no-op work on the file backend

    /* First boot on an empty Postgres database: load the real register and the
       default accounts from the shipped seed instead of the placeholder one. */
    if (store.USE_PG && !db.branches.length) seedFromFile();

    hydrateSessions();
    bootstrap();                  // seeds accounts/register on a blank database
  } catch (err) {
    console.error('Failed to initialise the datastore:', err.message);
    process.exit(1);
  }

  server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Atwima Kwanwoma election system listening on 0.0.0.0:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Storage: ${store.USE_PG ? 'Postgres (' + store.PG_TABLE + ')' : 'JSON file ' + store.DATA_DIR}`);
    console.log(`Branches: ${db.branches.length} | Users: ${db.users.length}`);
  });
}

start();

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received — flushing the database…`);
  const finish = async () => {
    try { await store.save(); } catch (e) { /* ignore */ }
    process.exit(0);
  };
  if (server) server.close(finish); else finish();
  setTimeout(() => process.exit(0), 3000).unref();
}
['SIGTERM', 'SIGINT'].forEach(sig => process.on(sig, () => shutdown(sig)));
