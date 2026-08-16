const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  console.error('FATAL: SESSION_SECRET must be set in production');
  process.exit(1);
}

app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));

app.use(session({
  store: new pgSession({ pool, tableName: 'sessions' }),
  secret: process.env.SESSION_SECRET || 'slater-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  }
}));

pool.query('SELECT 1').then(async () => {
  console.log('Database connected');
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS contacts JSONB DEFAULT '{}'`);
  console.log('Migrations complete');
}).catch(err => {
  console.error('Database connection failed:', err.message);
});

app.use((req, res, next) => {
  console.log(req.method, req.path);
  next();
});

function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  res.status(401).json({ error: 'Not logged in' });
}

app.use('/api/contacts', requireAuth, require('./routes/contacts'));
app.use('/api/users/me/contacts', requireAuth, require('./routes/contacts'));
app.use('/api/users', require('./routes/users'));

app.use('/api/agencies', requireAuth, require('./routes/agencies'));
app.use('/api/projects', requireAuth, require('./routes/projects'));
app.use('/api/receipts', requireAuth, require('./routes/receipts'));
app.use('/api/ocr', requireAuth, require('./routes/ocr'));
app.use('/api/licenses', require('./routes/licenses'));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '0.1.0' });
});

// --- Admin auth ---

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  res.redirect('/admin/login');
}

app.get('/admin/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-login.html'));
});

app.post('/admin/login', (req, res) => {
  if (req.body.secret === process.env.ADMIN_SECRET) {
    req.session.isAdmin = true;
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid admin password' });
  }
});

app.get('/admin', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/admin/logout', (req, res) => {
  req.session.isAdmin = false;
  res.redirect('/admin/login');
});

// --- Admin API ---

app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  try {
    const [users, licenses, devices, projects] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM users'),
      pool.query('SELECT COUNT(*) FROM licenses'),
      pool.query('SELECT COUNT(*) FROM license_devices'),
      pool.query('SELECT COUNT(*) FROM projects'),
    ]);
    res.json({
      users: parseInt(users.rows[0].count),
      licenses: parseInt(licenses.rows[0].count),
      devices: parseInt(devices.rows[0].count),
      projects: parseInt(projects.rows[0].count),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.name, u.email, u.created_at,
             l.key as license_key, l.plan, l.expires_at,
             COUNT(ld.id) as device_count
      FROM users u
      LEFT JOIN licenses l ON u.license_id = l.id
      LEFT JOIN license_devices ld ON l.id = ld.license_id
      GROUP BY u.id, l.key, l.plan, l.expires_at
      ORDER BY u.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/licenses', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT l.*, COUNT(ld.id) as device_count,
             u.email as user_email, u.name as user_name
      FROM licenses l
      LEFT JOIN license_devices ld ON l.id = ld.license_id
      LEFT JOIN users u ON u.license_id = l.id
      GROUP BY l.id, u.email, u.name
      ORDER BY l.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/licenses/generate', requireAdmin, async (req, res) => {
  try {
    const crypto = require('crypto');
    var count = req.body.count || 1;
    var plan = req.body.plan || 'beta';
    var max_devices = req.body.max_devices || 3;
    var expires_at = req.body.expires_at;
    var generateKey = function() {
      var seg = function() { return crypto.randomBytes(2).toString('hex').toUpperCase(); };
      return 'SLTR-' + seg() + seg() + '-' + seg() + seg() + '-' + seg() + seg();
    };
    var keys = [];
    for (var i = 0; i < Math.min(count, 50); i++) {
      var key = generateKey();
      await pool.query(
        'INSERT INTO licenses (key, plan, max_devices, expires_at) VALUES ($1, $2, $3, $4)',
        [key, plan, max_devices, expires_at || null]
      );
      keys.push(key);
    }
    res.json({ keys: keys });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/licenses/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM licenses WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- End admin ---

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/reset-password', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'reset-password.html'));
});

app.get('/', (req, res, next) => {
  if (!req.session || !req.session.userId) return res.redirect('/login');
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`Slater server running on http://localhost:${PORT}`);
});