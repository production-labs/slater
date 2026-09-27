// Read-only view of the slater-backups R2 bucket for the admin dashboard.
// Mounted behind requireAdmin in server.js. There is deliberately no restore
// or delete endpoint here: restores are a manual procedure (docs/RESTORE.md).
//
// Env (app service):
//   R2_READ_ACCESS_KEY_ID / R2_READ_SECRET_ACCESS_KEY  - read-only R2 token
//   R2_ENDPOINT / R2_BUCKET                             - shared with slater-backup
//   BACKUP_STALE_HOURS                                  - optional, default 48

const express = require('express');
const fs = require('fs');
const path = require('path');
const { S3Client, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const router = express.Router();

const KEY_PATTERN = /^slater-\d{4}-\d{2}-\d{2}-\d{6}\.sql\.gz$/;
const DOWNLOAD_URL_TTL_SECONDS = 5 * 60;
const R2_TIMEOUT_MS = 8000;
const RESTORE_DOC_PATH = path.join(__dirname, '..', 'docs', 'RESTORE.md');

function isConfigured() {
  return !!(process.env.R2_READ_ACCESS_KEY_ID && process.env.R2_READ_SECRET_ACCESS_KEY &&
            process.env.R2_ENDPOINT && process.env.R2_BUCKET);
}

let client;
function r2() {
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT,
      maxAttempts: 2,
      credentials: {
        accessKeyId: process.env.R2_READ_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_READ_SECRET_ACCESS_KEY,
      },
    });
  }
  return client;
}

// GET /api/admin/backups  ->  list + health summary
// ?staleHours=N overrides the threshold (used to test the warning).
router.get('/', async (req, res) => {
  const envStale = parseFloat(process.env.BACKUP_STALE_HOURS);
  const queryStale = parseFloat(req.query.staleHours);
  const staleHours = Number.isFinite(queryStale) ? queryStale : (Number.isFinite(envStale) ? envStale : 48);

  if (!isConfigured()) {
    return res.status(503).json({
      error: 'Backup bucket access is not configured on the app service (R2_READ_* variables missing).',
      configured: false,
    });
  }

  try {
    const objects = [];
    let token;
    do {
      const page = await r2().send(
        new ListObjectsV2Command({ Bucket: process.env.R2_BUCKET, ContinuationToken: token }),
        { abortSignal: AbortSignal.timeout(R2_TIMEOUT_MS) }
      );
      for (const o of page.Contents || []) {
        objects.push({ key: o.Key, size: o.Size, lastModified: o.LastModified.toISOString() });
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);

    objects.sort((a, b) => b.lastModified.localeCompare(a.lastModified));

    const now = Date.now();
    const newest = objects[0] || null;
    const newestAgeHours = newest ? (now - Date.parse(newest.lastModified)) / 3600000 : null;
    const totalSize = objects.reduce((sum, o) => sum + o.size, 0);

    const warnings = [];
    if (!newest) {
      warnings.push('The bucket has no backups at all.');
    } else if (newestAgeHours > staleHours) {
      const ageText = newestAgeHours >= 10 ? Math.floor(newestAgeHours) : newestAgeHours.toFixed(1);
      warnings.push(`The newest backup is ${ageText} hours old (threshold ${staleHours}h). The backup job has probably stopped running.`);
    }
    // A sudden drop in size can mean data was lost before the backup ran.
    if (objects.length >= 2 && objects[0].size < objects[1].size * 0.5) {
      warnings.push(`The newest backup is less than half the size of the previous one (${objects[0].size} vs ${objects[1].size} bytes). Check that production data is intact.`);
    }

    res.json({
      configured: true,
      checkedAt: new Date(now).toISOString(),
      staleHours,
      count: objects.length,
      totalSize,
      newest,
      newestAgeHours,
      warnings,
      objects,
    });
  } catch (err) {
    console.error('admin backups list failed:', err.name, err.message);
    res.status(502).json({ error: `Could not reach the backup bucket: ${err.name === 'TimeoutError' || err.name === 'AbortError' ? 'request timed out' : err.message}` });
  }
});

// GET /api/admin/backups/download?key=...  ->  302 to a 5-minute presigned URL.
// Signed at click time so links never go stale on an open page, and the
// file streams straight from R2 rather than through the app.
router.get('/download', async (req, res) => {
  const key = String(req.query.key || '');
  if (!KEY_PATTERN.test(key)) return res.status(400).json({ error: 'Invalid backup name' });
  if (!isConfigured()) return res.status(503).json({ error: 'Backup bucket access is not configured' });
  try {
    const url = await getSignedUrl(
      r2(),
      new GetObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: key,
        ResponseContentDisposition: `attachment; filename="${key}"`,
      }),
      { expiresIn: DOWNLOAD_URL_TTL_SECONDS }
    );
    res.redirect(302, url);
  } catch (err) {
    console.error('admin backups presign failed:', err.message);
    res.status(502).json({ error: 'Could not create download link' });
  }
});

// GET /api/admin/backups/restore-doc  ->  raw markdown of docs/RESTORE.md
router.get('/restore-doc', (req, res) => {
  fs.readFile(RESTORE_DOC_PATH, 'utf8', (err, text) => {
    if (err) return res.status(404).type('text/plain').send('docs/RESTORE.md not found on this deployment.');
    res.type('text/plain').send(text);
  });
});

module.exports = router;
