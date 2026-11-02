// Client Portal: file uploads, client -> producer (V1.5 step 6b).
//
// Registered on the PUBLIC portal router (routes/portal.js), so every route
// here first passes the same checks as the rest of the portal: the link token
// (findPortal) and, if the project has one, the password cookie (isUnlocked).
//
// File bytes never pass through this server. The flow:
//   1. POST   /:token/uploads             start: checks size + caps, starts an R2
//                                          multipart upload, adds a 'pending' row
//   2. POST   /:token/uploads/:id/parts   presigned URLs for some part numbers;
//                                          the browser PUTs each part to R2
//   3. POST   /:token/uploads/:id/complete  R2 joins the parts; the stored size
//                                          must match what was declared, else the
//                                          object and row are deleted
//      DELETE /:token/uploads/:id          cancel a pending upload
// A row only becomes 'ready' (shown to anyone) after step 3.
//
// What a client can do with an upload link is bounded: 5 GiB per file (also a
// DB CHECK), per-project caps on files and bytes held at once, rate limits,
// and part numbers limited to what the declared size needs. Parts are not
// size-signed, so a client could push more bytes than declared before step 3;
// step 3 then rejects it, and R2 drops unfinished multipart uploads itself
// (bucket's multipart abort rule) if step 3 never comes.
//
// Retention: expires_at = 14 days after the upload completes. Clients see
// what they sent (name, size, date); they can never download anything back.

const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const transfers = require('./transfers');

const MAX_ACTIVE_FILES = 200;               // per project, pending + ready, not expired
const MAX_ACTIVE_BYTES = 50 * 1024 ** 3;    // per project, 50 GiB
const PENDING_HOURS = 24;                   // a pending row older than this is abandoned
const MAX_PARTS_PER_REQUEST = 50;
const NAME_MAX = 200;

const byPortal = (req) => ipKeyGenerator(req.ip) + '|' + req.params.token;
const startLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false,
  keyGenerator: byPortal, message: { error: 'too_many_requests' },
});
const partLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 1000, standardHeaders: true, legacyHeaders: false,
  keyGenerator: byPortal, message: { error: 'too_many_requests' },
});

// Keep the name readable but harmless: no paths, no control characters.
function cleanFilename(v) {
  let s = typeof v === 'string' ? v.normalize('NFC') : '';
  s = s.replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, '')
       .replace(/[\\/]/g, '_').trim();
  if (s.length > 255) {
    const dot = s.lastIndexOf('.');
    const ext = dot > 0 && s.length - dot <= 16 ? s.slice(dot) : '';
    s = s.slice(0, 255 - ext.length) + ext;
  }
  return s;
}

function cleanContentType(v) {
  return typeof v === 'string' && v.length <= 100 && /^[\w.+-]+\/[\w.+-]+$/.test(v) ? v.toLowerCase() : 'application/octet-stream';
}

module.exports = function registerUploads(router, { pool, findPortal, isUnlocked }) {
  // Shared front door: portal exists, unlocked, uploads configured.
  async function gate(req, res) {
    const portal = await findPortal(req.params.token);
    if (!portal) { res.status(404).json({ error: 'not_found' }); return null; }
    if (!isUnlocked(req, portal)) { res.status(401).json({ error: 'locked' }); return null; }
    if (!transfers.isConfigured()) { res.status(503).json({ error: 'uploads_unavailable' }); return null; }
    return portal;
  }

  // A pending upload of this portal's project, still young enough to finish.
  async function pendingRow(portal, id) {
    if (!/^\d{1,10}$/.test(String(id))) return null;
    const r = await pool.query(
      `SELECT id, r2_key, upload_id, size_bytes, status FROM portal_files
        WHERE id = $1 AND project_id = $2 AND owner_id = $3
          AND (status = 'ready' OR created_at > NOW() - make_interval(hours => $4))`,
      [Number(id), portal.project_id, portal.owner_id, PENDING_HOURS]);
    return r.rows[0] || null;
  }

  function fail(res, where, err) {
    console.error('Portal upload ' + where + ' failed:', err && (err.name + ': ' + err.message));
    if (!res.headersSent) res.status(500).json({ error: 'server_error' });
  }

  router.post('/:token/uploads', startLimiter, async (req, res) => {
    try {
      const portal = await gate(req, res);
      if (!portal) return;
      const b = req.body || {};
      const name = typeof b.name === 'string' ? b.name.trim() : '';
      const filename = cleanFilename(b.filename);
      const size = Number(b.size);
      if (!name || name.length > NAME_MAX) return res.status(400).json({ error: 'bad_name' });
      if (!filename) return res.status(400).json({ error: 'bad_filename' });
      if (!Number.isSafeInteger(size) || size < 1) return res.status(400).json({ error: 'bad_size' });
      if (size > transfers.MAX_FILE_BYTES) return res.status(413).json({ error: 'too_large', max_bytes: transfers.MAX_FILE_BYTES });

      const held = (await pool.query(
        `SELECT COUNT(*)::int AS n, COALESCE(SUM(size_bytes), 0)::bigint AS bytes FROM portal_files
          WHERE project_id = $1 AND expires_at > NOW()
            AND (status = 'ready' OR created_at > NOW() - make_interval(hours => $2))`,
        [portal.project_id, PENDING_HOURS])).rows[0];
      if (held.n >= MAX_ACTIVE_FILES || Number(held.bytes) + size > MAX_ACTIVE_BYTES) {
        return res.status(409).json({ error: 'project_full' });
      }

      const contentType = cleanContentType(b.content_type);
      const key = transfers.newKey(portal.project_id);
      const uploadId = await transfers.startUpload(key, contentType);
      const row = (await pool.query(
        `INSERT INTO portal_files (project_id, owner_id, filename, content_type, size_bytes, r2_key, upload_id, uploaded_by_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [portal.project_id, portal.owner_id, filename, contentType, size, key, uploadId, name])).rows[0];
      res.json({ id: row.id, part_bytes: transfers.PART_BYTES, parts: transfers.partCount(size) });
    } catch (err) { fail(res, 'start', err); }
  });

  router.post('/:token/uploads/:id/parts', partLimiter, async (req, res) => {
    try {
      const portal = await gate(req, res);
      if (!portal) return;
      const row = await pendingRow(portal, req.params.id);
      if (!row || row.status !== 'pending') return res.status(404).json({ error: 'not_found' });
      const max = transfers.partCount(Number(row.size_bytes));
      const want = Array.isArray(req.body && req.body.parts) ? req.body.parts : [];
      if (!want.length || want.length > MAX_PARTS_PER_REQUEST ||
          !want.every(n => Number.isInteger(n) && n >= 1 && n <= max)) {
        return res.status(400).json({ error: 'bad_parts' });
      }
      const urls = {};
      for (const n of new Set(want)) urls[n] = await transfers.signPart(row.r2_key, row.upload_id, n);
      res.json({ urls });
    } catch (err) { fail(res, 'sign', err); }
  });

  router.post('/:token/uploads/:id/complete', partLimiter, async (req, res) => {
    try {
      const portal = await gate(req, res);
      if (!portal) return;
      const row = await pendingRow(portal, req.params.id);
      if (!row) return res.status(404).json({ error: 'not_found' });
      if (row.status === 'ready') return res.json({ ok: true }); // a retried request

      const count = transfers.partCount(Number(row.size_bytes));
      const parts = Array.isArray(req.body && req.body.parts) ? req.body.parts : [];
      const ok = parts.length === count && parts.every((p, i) =>
        p && p.part === i + 1 && typeof p.etag === 'string' && p.etag.length > 0 && p.etag.length <= 200);
      if (!ok) return res.status(400).json({ error: 'bad_parts' });

      await transfers.completeUpload(row.r2_key, row.upload_id, parts);
      const stored = await transfers.objectSize(row.r2_key);
      if (stored !== Number(row.size_bytes)) {
        await transfers.deleteObject(row.r2_key).catch(() => {});
        await pool.query('DELETE FROM portal_files WHERE id = $1', [row.id]);
        return res.status(400).json({ error: 'size_mismatch' });
      }
      await pool.query(
        `UPDATE portal_files
            SET status = 'ready', ready_at = NOW(), upload_id = NULL,
                expires_at = NOW() + make_interval(days => $2)
          WHERE id = $1 AND status = 'pending'`,
        [row.id, transfers.RETENTION_DAYS]);
      res.json({ ok: true });
    } catch (err) { fail(res, 'complete', err); }
  });

  router.delete('/:token/uploads/:id', partLimiter, async (req, res) => {
    try {
      const portal = await gate(req, res);
      if (!portal) return;
      const row = await pendingRow(portal, req.params.id);
      if (!row || row.status !== 'pending') return res.status(404).json({ error: 'not_found' });
      await transfers.abortUpload(row.r2_key, row.upload_id).catch(() => {});
      await pool.query(`DELETE FROM portal_files WHERE id = $1 AND status = 'pending'`, [row.id]);
      res.json({ ok: true });
    } catch (err) { fail(res, 'cancel', err); }
  });
};

// For the portal payload: files this project's clients have sent, still kept.
module.exports.loadSent = async function loadSent(pool, projectId) {
  const r = await pool.query(
    `SELECT filename, size_bytes, uploaded_by_name, ready_at FROM portal_files
      WHERE project_id = $1 AND status = 'ready' AND expires_at > NOW()
      ORDER BY ready_at DESC LIMIT 50`, [projectId]);
  return r.rows;
};
module.exports.cleanFilename = cleanFilename;
