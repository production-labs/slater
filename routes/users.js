const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { Pool } = require('pg');
const rateLimit = require('express-rate-limit');
const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false
});

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Register a new user (requires valid license key)
router.post('/register', async (req, res) => {
  const { email, password, name, invite_code, license_key } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  if (!license_key) return res.status(400).json({ error: 'License key required' });
  if (process.env.INVITE_CODE && invite_code !== process.env.INVITE_CODE) {
    return res.status(403).json({ error: 'Invalid invite code' });
  }
  try {
    // Validate license key
    const licResult = await pool.query('SELECT * FROM licenses WHERE key = $1', [license_key.trim().toUpperCase()]);
    if (!licResult.rows.length) return res.status(400).json({ error: 'Invalid license key' });
    const licenseData = licResult.rows[0];
    if (licenseData.expires_at && new Date(licenseData.expires_at) < new Date()) {
      return res.status(400).json({ error: 'License key has expired' });
    }

    // Build device fingerprint
    const fpRaw = [req.headers['user-agent']||'', req.headers['accept-language']||'', req.ip||''].join('|');
    const fingerprint = crypto.createHash('sha256').update(fpRaw).digest('hex');

    // Check if this device is already registered for this license
    const deviceCheck = await pool.query(
      'SELECT * FROM license_devices WHERE license_id = $1 AND device_fingerprint = $2',
      [licenseData.id, fingerprint]
    );
    if (!deviceCheck.rows.length) {
      const countResult = await pool.query('SELECT COUNT(*) FROM license_devices WHERE license_id = $1', [licenseData.id]);
      if (parseInt(countResult.rows[0].count) >= licenseData.max_devices) {
        return res.status(403).json({
          error: 'Device limit reached. This license allows ' + licenseData.max_devices + ' devices. Deactivate a device in account settings to continue.',
          device_limit: true
        });
      }
    }

    // Create the user
    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, name, license_id, license_key) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, name',
      [email.toLowerCase().trim(), hash, name||'', licenseData.id, license_key.trim().toUpperCase()]
    );
    const user = result.rows[0];

    // Register device for this license
    if (deviceCheck.rows.length) {
      await pool.query(
        'UPDATE license_devices SET last_seen = NOW() WHERE license_id = $1 AND device_fingerprint = $2',
        [licenseData.id, fingerprint]
      );
    } else {
      await pool.query(
        'INSERT INTO license_devices (license_id, device_fingerprint, user_agent) VALUES ($1, $2, $3)',
        [licenseData.id, fingerprint, req.headers['user-agent']||'']
      );
    }

    // Mark license as activated on first use
    if (!licenseData.activated_at) {
      await pool.query('UPDATE licenses SET activated_at = NOW() WHERE id = $1', [licenseData.id]);
    }

    // Auto-login after registration
    req.session.userId = user.id;
    req.session.userEmail = user.email;
    req.session.userName = user.name;

    res.json({ success: true, user: user });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already registered' });
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  try {
	const result = await pool.query(
	  'SELECT * FROM users WHERE email = $1',
	  [email.toLowerCase().trim()]
	);
	if (!result.rows.length) return res.status(401).json({ error: 'Invalid email or password' });
	const user = result.rows[0];
	const match = await bcrypt.compare(password, user.password_hash);
	if (!match) return res.status(401).json({ error: 'Invalid email or password' });
	req.session.userId = user.id;
	req.session.userEmail = user.email;
	req.session.userName = user.name;
	res.json({ success: true, user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) {
	console.error(err);
	res.status(500).json({ error: 'Login failed' });
  }
});

// Logout
router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Get current user / My Info
router.get('/me', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
  try {
    const result = await pool.query(
      'SELECT id, email, name, dba, phone, timezone, logo FROM users WHERE id=$1',
      [req.session.userId]
    );
    const row = result.rows[0] || {};
    res.json({
      id: row.id,
      email: row.email,
      name: row.name || '',
      dba: row.dba || '',
      phone: row.phone || '',
      timezone: row.timezone || 'PT',
      avatar: row.logo || null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load user info' });
  }
});

// Update My Info
router.put('/me', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
  const { name, dba, phone, timezone, avatar } = req.body;
  try {
    await pool.query(
      'UPDATE users SET name=$1, dba=$2, phone=$3, timezone=$4, logo=$5, updated_at=NOW() WHERE id=$6',
      [name||'', dba||'', phone||'', timezone||'PT', avatar||null, req.session.userId]
    );
    req.session.userName = name || req.session.userName;
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save user info' });
  }
});

// Update agency settings (legacy — kept for backwards compatibility)
router.put('/me/agency', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
  const { agency_name, agency_address, agency_city, agency_state, agency_zip,
		  agency_phone, agency_billing_contact, agency_timezone, agency_project_type, agency_logo,
		  agency_billing_email, agency_invoicing_text } = req.body;
  try {
	await pool.query(
	  `UPDATE users SET agency_name=$1, agency_address=$2, agency_city=$3, agency_state=$4,
	   agency_zip=$5, agency_phone=$6, agency_billing_contact=$7, agency_timezone=$8,
	   agency_project_type=$9, agency_logo=$10, agency_billing_email=$11, agency_invoicing_text=$12,
	   updated_at=NOW() WHERE id=$13`,
	  [agency_name, agency_address, agency_city, agency_state, agency_zip,
	   agency_phone, agency_billing_contact, agency_timezone, agency_project_type, agency_logo,
	   agency_billing_email, agency_invoicing_text,
	   req.session.userId]
	);
	res.json({ success: true });
  } catch (err) {
	console.error(err);
	res.status(500).json({ error: 'Failed to save agency settings' });
  }
});

// Get agency settings
router.get('/me/agency', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
  try {
	const result = await pool.query(
	  `SELECT agency_name, agency_address, agency_city, agency_state, agency_zip,
	   agency_phone, agency_billing_contact, agency_timezone, agency_project_type, agency_logo,
	   agency_billing_email, agency_invoicing_text
	   FROM users WHERE id=$1`,
	  [req.session.userId]
	);
	res.json(result.rows[0] || {});
  } catch (err) {
	console.error(err);
	res.status(500).json({ error: 'Failed to load agency settings' });
  }
});

// Get contacts
router.get('/me/contacts', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
  try {
    const result = await pool.query('SELECT contacts FROM users WHERE id=$1', [req.session.userId]);
    res.json(result.rows[0]?.contacts || {});
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load contacts' });
  }
});

// Save contacts — replaces each bucket with the incoming data
router.put('/me/contacts', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
  const incoming = req.body;
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
    return res.status(400).json({ error: 'Invalid contacts data' });
  }
  try {
    const result = await pool.query('SELECT contacts FROM users WHERE id=$1', [req.session.userId]);
    const existing = result.rows[0]?.contacts || {};
    const merged = Object.assign({}, existing);
    Object.keys(incoming).forEach(function(bucket) {
      const items = incoming[bucket];
      if (!Array.isArray(items)) return;
      merged[bucket] = items;
    });
    await pool.query('UPDATE users SET contacts=$1, updated_at=NOW() WHERE id=$2', [merged, req.session.userId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save contacts' });
  }
});

// POST /api/users/forgot-password
router.post('/forgot-password', async (req, res) => {
  var email = req.body.email;
  if (!email) return res.status(400).json({ error: 'Email required' });
  try {
    var result = await pool.query(
      'SELECT id, name FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );
    // Always return success even if email not found -- security best practice
    if (!result.rows.length) return res.json({ success: true });

    var user = result.rows[0];
    var token = crypto.randomBytes(32).toString('hex');
    var expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Invalidate any existing tokens
    await pool.query(
      'UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL',
      [user.id]
    );

    // Store new token
    await pool.query(
      'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, token, expires]
    );

    var resetUrl = (process.env.APP_URL || 'http://localhost:3000') + '/reset-password?token=' + token;

    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL,
      to: email,
      subject: 'Reset your Slater password',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#f3f0ed">
          <div style="background:#222222;padding:20px 24px;border-radius:8px 8px 0 0">
            <h1 style="color:#C8A84B;font-size:22px;margin:0;letter-spacing:0.05em">SLATER</h1>
            <p style="color:rgba(255,255,255,0.5);font-size:12px;margin:4px 0 0">The Producer's Toolbox</p>
          </div>
          <div style="background:#ffffff;padding:24px;border-radius:0 0 8px 8px">
            <p style="color:#222222;font-size:15px">Hi ${user.name || 'there'},</p>
            <p style="color:#555555;font-size:14px;line-height:1.6">We received a request to reset your Slater password. Click the button below to choose a new one.</p>
            <div style="text-align:center;margin:28px 0">
              <a href="${resetUrl}" style="background:#222222;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:500">Reset Password</a>
            </div>
            <p style="color:#9D9D99;font-size:12px">This link expires in 1 hour. If you didn't request a password reset you can safely ignore this email.</p>
            <hr style="border:none;border-top:1px solid #f0ebe3;margin:20px 0">
            <p style="color:#9D9D99;font-size:11px;text-align:center">Slater - The Producer's Toolbox - Production Labs LLC - productionlabs.io</p>
          </div>
        </div>
      `
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Failed to send reset email' });
  }
});

// POST /api/users/reset-password
router.post('/reset-password', async (req, res) => {
  var token = req.body.token;
  var password = req.body.password;
  if (!token || !password) return res.status(400).json({ error: 'Token and password required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  try {
    var result = await pool.query(
      `SELECT prt.*, u.email FROM password_reset_tokens prt
       JOIN users u ON prt.user_id = u.id
       WHERE prt.token = $1 AND prt.used_at IS NULL AND prt.expires_at > NOW()`,
      [token]
    );

    if (!result.rows.length) {
      return res.status(400).json({ error: 'Reset link is invalid or has expired' });
    }

    var resetToken = result.rows[0];
    var hash = await bcrypt.hash(password, 12);

    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, resetToken.user_id]);
    await pool.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1', [resetToken.id]);

    res.json({ success: true });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

module.exports = router;