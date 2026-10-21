'use strict';
/* Tiny JSON file store with serialized atomic writes. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/* DATA_DIR lets a host mount a persistent volume (Render disk, Fly volume,
   Docker volume). Falls back to ./data for local development. */
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

/* ---------------------------------------------------------------------------
 * Two storage backends, one interface.
 *
 *   DATABASE_URL set  -> Postgres. The whole database is one JSONB document in
 *                        a single row, written with an UPSERT. This keeps every
 *                        other line of the app unchanged while making the web
 *                        process completely disposable (free tiers with no disk).
 *   DATABASE_URL unset-> the original JSON file on disk (local dev, VPS, Docker
 *                        volume). No database server needed.
 *
 * The document is ~35 KB, so a single-row JSONB is not a compromise here — it
 * is simply the same object with durable, off-machine storage.
 * ------------------------------------------------------------------------- */
const DATABASE_URL = process.env.DATABASE_URL || '';
const USE_PG = !!DATABASE_URL;
const PG_TABLE = 'app_state';

let db = null;
let chain = Promise.resolve();
let pool = null;
let pgReady = false;

function nowISO() {
  return new Date().toISOString();
}

function id() {
  return crypto.randomBytes(9).toString('hex');
}

function load() {
  if (USE_PG) {
    db = blankDB();
    return db;                 // filled by await loadAsync()
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    try {
      db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
      const backup = DB_FILE + '.corrupt-' + Date.now();
      fs.copyFileSync(DB_FILE, backup);
      console.error('Database unreadable, backed up to', backup);
      db = null;
    }
  }
  if (!db) {
    db = { version: 1, users: [], sessions: {}, branches: [], results: {}, audit: [], settings: {} };
  }
  db.users = db.users || [];
  db.sessions = db.sessions || {};
  db.branches = db.branches || [];
  db.results = db.results || {};
  db.audit = db.audit || [];
  db.settings = db.settings || {};
  return db;
}

function blankDB() {
  return { version: 1, users: [], sessions: {}, branches: [], results: {}, audit: [], settings: {} };
}

function getDB() {
  if (!db) load();
  return db;
}

/* ---------- Postgres backend ---------- */
function getPool() {
  if (pool) return pool;
  const { Pool } = require('pg');
  const needsSsl = !/localhost|127\.0\.0\.1/.test(DATABASE_URL);
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: needsSsl ? { rejectUnauthorized: false } : false,
    max: 4,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  });
  pool.on('error', err => console.error('Postgres idle client error:', err.message));
  return pool;
}

/* Called once at boot. Creates the table and pulls the document into memory. */
async function loadAsync() {
  if (!USE_PG) { load(); return getDB(); }
  const c = await getPool().connect();
  try {
    await c.query(`CREATE TABLE IF NOT EXISTS ${PG_TABLE} (
      id         smallint PRIMARY KEY DEFAULT 1,
      doc        jsonb    NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT ${PG_TABLE}_single_row CHECK (id = 1)
    )`);
    const r = await c.query(`SELECT doc FROM ${PG_TABLE} WHERE id = 1`);
    if (r.rows.length) {
      // Mutate in place: server.js holds a reference to this object.
      Object.assign(db, r.rows[0].doc);
    } else {
      // First ever boot on an empty database: keep the blank document and insert it.
      await c.query(`INSERT INTO ${PG_TABLE} (id, doc) VALUES (1, $1)`, [JSON.stringify(db)]);
    }
  } finally {
    c.release();
  }
  db.users = db.users || [];
  db.sessions = db.sessions || {};
  db.branches = db.branches || [];
  db.results = db.results || {};
  db.audit = db.audit || [];
  db.settings = db.settings || {};
  pgReady = true;
  return db;
}

function save() {
  const snapshot = JSON.stringify(getDB(), null, 2);

  if (USE_PG) {
    // Serialised writes, last one wins, same guarantee the file chain gave us.
    chain = chain.then(async () => {
      await getPool().query(
        `INSERT INTO ${PG_TABLE} (id, doc, updated_at) VALUES (1, $1, now())
         ON CONFLICT (id) DO UPDATE SET doc = EXCLUDED.doc, updated_at = now()`,
        [snapshot]
      );
    }).catch(err => console.error('Postgres write failed:', err.message));
    return chain;
  }

  chain = chain.then(async () => {
    const tmp = DB_FILE + '.tmp';
    await fs.promises.writeFile(tmp, snapshot, 'utf8');
    await fs.promises.rename(tmp, DB_FILE);
  }).catch(err => console.error('DB write failed:', err));
  return chain;
}

function audit(entry) {
  const d = getDB();
  const rec = {
    id: id(),
    at: nowISO(),
    userId: entry.userId || null,
    username: entry.username || 'system',
    action: entry.action,
    detail: entry.detail || '',
    meta: entry.meta || null
  };
  d.audit.unshift(rec);
  if (d.audit.length > 3000) d.audit.length = 3000;
  return rec;
}

function publicUser(u) {
  if (!u) return null;
  return { id: u.id, name: u.name, username: u.username, role: u.role, active: !!u.active, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt || null };
}

module.exports = {
  load, loadAsync, getDB, save, audit, id, nowISO, publicUser,
  DB_FILE, DATA_DIR, USE_PG, PG_TABLE
};
