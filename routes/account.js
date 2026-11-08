// Account self-service (V1.5, 2026-11-07): "Download my data" and "Delete my
// account" in My Info. Pause / Cancel wait for Paddle (they're defined by the
// billing period, which doesn't exist yet). Terms draft section 5.
//
//   GET  /api/account/export-extra  The parts of an export the browser can't
//        get elsewhere: profile, and client portal history (producer updates,
//        client approvals / change requests, client files still stored).
//   POST /api/account/delete { password }
//        Re-checks the password, then deletes everything (deleteAccount below)
//        and signs the user out everywhere. Emails a confirmation.
//
// deleteAccount() is also what the admin dashboard's delete uses, so both
// remove the same things.

const express = require('express');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');
const transfers = require('./transfers');

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Wrong-password guesses on delete count like login attempts.
const deleteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many attempts. Try again in 15 minutes.' },
  keyGenerator: req => 'acct-del-' + String(req.session && req.session.userId),
});

class StorageError extends Error {}

// Permanently deletes a user and everything they own.
//  1. Client portal files are removed from storage FIRST (unfinished uploads
//     aborted). If storage can't be reached nothing else is touched and this
//     throws StorageError: once the database rows are gone, nothing would
//     ever find those files again (the 14-day sweep works from the rows).
//  2. One transaction: receipts, projects (their portals, updates, responses,
//     file rows and email lists cascade), contacts / organizations /
//     locations / custom roles / tombstones / reset tokens (cascade from the
//     user), sessions, the user, and the license key (retired: deleted, so it
//     can't register again) unless another account still uses it.
// Database backups still hold the data until they expire (90 days); the
// privacy policy says so.
// Returns { email, name, files } or null if there was no such user.
async function deleteAccount(userId) {
  const user = (await pool.query('SELECT id, email, name, license_id FROM users WHERE id = $1', [userId])).rows[0];
  if (!user) return null;

  const files = (await pool.query(
    'SELECT id, r2_key, upload_id, status FROM portal_files WHERE owner_id = $1', [userId])).rows;
  if (files.length) {
    if (!transfers.isConfigured()) throw new StorageError('file storage is not configured');
    for (const f of files) {
      try {
        if (f.status === 'pending' && f.upload_id) await transfers.abortUpload(f.r2_key, f.upload_id).catch(() => {});
        await transfers.deleteObject(f.r2_key);
      } catch (err) {
        throw new StorageError('could not delete stored file ' + f.id + ': ' + (err && err.message));
      }
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM receipts WHERE owner_id = $1', [userId]);
    await client.query('DELETE FROM projects WHERE owner_id = $1', [userId]);
    await client.query("DELETE FROM sessions WHERE sess::jsonb->>'userId' = $1::text", [userId]);
    await client.query('DELETE FROM users WHERE id = $1', [userId]);
    if (user.license_id) {
      const others = (await client.query('SELECT 1 FROM users WHERE license_id = $1 LIMIT 1', [user.license_id])).rows.length;
      if (!others) await client.query('DELETE FROM licenses WHERE id = $1', [user.license_id]);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  return { email: user.email, name: user.name, files: files.length };
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function goodbyeEmail(name) {
  const hi = name ? 'Hi ' + esc(name.split(/\s+/)[0]) + ',' : 'Hi,';
  return {
    subject: 'Your Slater account has been deleted',
    html:
      '<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;background:#f3f0ed;padding:24px">' +
      '<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:10px;padding:28px;color:#222">' +
      '<p>' + hi + '</p>' +
      '<p>Your Slater account and everything in it (projects, contacts, receipts, client portals and their files) ' +
      'have been permanently deleted, as you asked. You\'ve been signed out on every device.</p>' +
      '<p>Copies in our encrypted backups are removed automatically as those backups expire, within 90 days.</p>' +
      '<p>If you didn\'t do this, reply to this email or write to hello@productionlabs.io right away.</p>' +
      '<p>Thanks for using Slater.</p>' +
      '<hr style="border:none;border-top:1px solid #f0ebe3;margin:20px 0">' +
      '<p style="color:#9D9D99;font-size:11px;text-align:center">Slater - The Producer\'s Toolbox - Production Labs LLC - productionlabs.io</p>' +
      '</div></div>',
  };
}

router.get('/export-extra', async (req, res) => {
  const userId = req.session.userId;
  try {
    const [u, upd, resp, files] = await Promise.all([
      pool.query('SELECT email, name, dba, phone, timezone, default_country, created_at FROM users WHERE id = $1', [userId]),
      pool.query(`SELECT p.key AS project_key, u.author_name, u.body, u.created_at, u.updated_at
                    FROM portal_updates u JOIN projects p ON p.id = u.project_id
                   WHERE u.owner_id = $1 ORDER BY p.key, u.created_at`, [userId]),
      pool.query(`SELECT p.key AS project_key, r.wb_item_uuid, r.kind, r.responder_name, r.note, r.created_at, r.acknowledged_at
                    FROM portal_responses r JOIN projects p ON p.id = r.project_id
                   WHERE r.owner_id = $1 ORDER BY p.key, r.created_at`, [userId]),
      pool.query(`SELECT p.key AS project_key, f.filename, f.size_bytes, f.uploaded_by_name, f.ready_at, f.expires_at
                    FROM portal_files f JOIN projects p ON p.id = f.project_id
                   WHERE f.owner_id = $1 AND f.status = 'ready' ORDER BY p.key, f.ready_at`, [userId]),
    ]);
    if (!u.rows.length) return res.status(404).json({ error: 'not_found' });
    res.json({
      profile: u.rows[0],
      portal_updates: upd.rows,
      portal_responses: resp.rows,
      // Listed, not included: they're the client's files, deleted 14 days
      // after upload; download them from the Portal tab if you need them.
      portal_files: files.rows.map(f => Object.assign(f, { size_bytes: Number(f.size_bytes) })),
    });
  } catch (err) {
    console.error('Account export failed:', err.message);
    res.status(500).json({ error: 'server_error' });
  }
});

router.post('/delete', deleteLimiter, async (req, res) => {
  const userId = req.session.userId;
  const password = typeof (req.body || {}).password === 'string' ? req.body.password : '';
  if (!password) return res.status(400).json({ error: 'password_required' });
  try {
    const row = (await pool.query('SELECT password_hash FROM users WHERE id = $1', [userId])).rows[0];
    if (!row) return res.status(404).json({ error: 'not_found' });
    if (!(await bcrypt.compare(password, row.password_hash))) return res.status(403).json({ error: 'wrong_password' });

    const gone = await deleteAccount(userId);
    console.log('Account deleted by its owner (user ' + userId + ', ' + gone.files + ' portal files)');
    req.session.destroy(() => {});
    res.clearCookie('connect.sid');
    res.json({ ok: true });
    // After the response: the deletion already happened either way.
    try { await require('./portalNotify').deliver(gone.email, goodbyeEmail(gone.name)); }
    catch (err) { console.error('Account deleted, but the confirmation email failed:', err.message); }
  } catch (err) {
    if (err instanceof StorageError) {
      console.error('Account delete stopped before deleting anything:', err.message);
      return res.status(503).json({ error: 'storage_unavailable' });
    }
    console.error('Account delete failed:', err.message);
    res.status(500).json({ error: 'server_error' });
  }
});

module.exports = router;
module.exports.deleteAccount = deleteAccount;
module.exports.StorageError = StorageError;
