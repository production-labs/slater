const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const crypto = require('crypto');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function generateKey() {
  const seg = () => crypto.randomBytes(2).toString('hex').toUpperCase();
  return `SLTR-${seg()}${seg()}-${seg()}${seg()}-${seg()}${seg()}`;
}

function getFingerprint(req) {
  const data = [req.headers['user-agent']||'', req.headers['accept-language']||'', req.ip||''].join('|');
  return crypto.createHash('sha256').update(data).digest('hex');
}

// Validate license key and register device
router.post('/validate', async (req, res) => {
  const { key, fingerprint } = req.body;
  if (!key) return res.status(400).json({ error: 'License key required' });
  try {
    const result = await pool.query('SELECT * FROM licenses WHERE key = $1', [key.trim().toUpperCase()]);
    if (!result.rows.length) return res.status(404).json({ error: 'Invalid license key' });
    const license = result.rows[0];
    if (license.expires_at && new Date(license.expires_at) < new Date()) {
      return res.status(403).json({ error: 'License key has expired' });
    }
    const deviceResult = await pool.query(
      'SELECT * FROM license_devices WHERE license_id = $1 AND device_fingerprint = $2',
      [license.id, fingerprint]
    );
    if (deviceResult.rows.length) {
      await pool.query('UPDATE license_devices SET last_seen = NOW() WHERE license_id = $1 AND device_fingerprint = $2', [license.id, fingerprint]);
      return res.json({ valid: true, plan: license.plan, license_id: license.id });
    }
    const countResult = await pool.query('SELECT COUNT(*) FROM license_devices WHERE license_id = $1', [license.id]);
    if (parseInt(countResult.rows[0].count) >= license.max_devices) {
      return res.status(403).json({ error: `Device limit reached. This license allows ${license.max_devices} devices. Deactivate a device in account settings to continue.`, device_limit: true });
    }
    await pool.query('INSERT INTO license_devices (license_id, device_fingerprint, user_agent) VALUES ($1, $2, $3)', [license.id, fingerprint, req.headers['user-agent']||'']);
    res.json({ valid: true, plan: license.plan, license_id: license.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'License validation failed' });
  }
});

// Generate beta keys (admin only)
router.post('/generate-beta', async (req, res) => {
  const { count = 1, expires_at, secret } = req.body;
  if (secret !== process.env.ADMIN_SECRET) return res.status(403).json({ error: 'Unauthorized' });
  try {
    const keys = [];
    for (let i = 0; i < Math.min(count, 50); i++) {
      const key = generateKey();
      const result = await pool.query(
        'INSERT INTO licenses (key, plan, max_devices, expires_at) VALUES ($1, $2, $3, $4) RETURNING key',
        [key, 'beta', 3, expires_at || null]
      );
      keys.push(result.rows[0].key);
    }
    res.json({ keys });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Key generation failed' });
  }
});

// Get devices for current user
router.get('/devices', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
  try {
    const userResult = await pool.query('SELECT license_id FROM users WHERE id = $1', [req.session.userId]);
    if (!userResult.rows[0]?.license_id) return res.json([]);
    const devices = await pool.query(
      'SELECT id, device_fingerprint, user_agent, last_seen, created_at FROM license_devices WHERE license_id = $1 ORDER BY last_seen DESC',
      [userResult.rows[0].license_id]
    );
    res.json(devices.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load devices' });
  }
});

// Deactivate a device
router.delete('/devices/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
  try {
    const userResult = await pool.query('SELECT license_id FROM users WHERE id = $1', [req.session.userId]);
    if (!userResult.rows[0]?.license_id) return res.status(403).json({ error: 'No license' });
    await pool.query('DELETE FROM license_devices WHERE id = $1 AND license_id = $2', [req.params.id, userResult.rows[0].license_id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to deactivate device' });
  }
});

module.exports = router;
