/**
 * Slater production database backup job.
 *
 * Runs as its own Railway service on a cron schedule (Settings > Cron Schedule
 * on the "slater-backup" service in the Railway dashboard - no code change
 * needed to change the schedule).
 *
 * What it does, in order:
 *   1. pg_dump the production Postgres database (plain SQL) over the internal
 *      Railway network.
 *   2. Sanity-check the dump: non-empty, pg_dump exited 0, and the file ends
 *      with pg_dump's own "dump complete" trailer line.
 *   3. Gzip it and upload to the Cloudflare R2 bucket via the S3 API.
 *   4. Delete any backups older than RETENTION_DAYS (default 90) from R2.
 *   5. On any failure at any step, email johnm@productionlabs.io via Resend
 *      with what failed and why, then exit non-zero.
 *   6. Once a week (default Sunday), also send a short "still alive" success
 *      summary so a silently-broken job doesn't go unnoticed for 90 days.
 *
 * Required env vars:
 *   DATABASE_URL        - set to ${{Postgres.DATABASE_URL}} (internal, not the
 *                          public proxy URL) as a Railway variable reference.
 *   R2_ACCESS_KEY_ID
 *   R2_SECRET_ACCESS_KEY
 *   R2_ENDPOINT          - e.g. https://<account_id>.r2.cloudflarestorage.com
 *   R2_BUCKET            - e.g. slater-backups
 *   RESEND_API_KEY       - reuse ${{slater.RESEND_API_KEY}}
 *   RESEND_FROM_EMAIL    - reuse ${{slater.RESEND_FROM_EMAIL}}
 *
 * Optional env vars:
 *   NOTIFY_EMAIL         - default johnm@productionlabs.io
 *   RETENTION_DAYS       - default 90
 *   BACKUP_PREFIX        - default "slater"
 *   WEEKLY_SUMMARY_DAY   - default 0 (Sunday, UTC, JS getUTCDay() convention)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { spawnSync } = require('child_process');
const {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3');
const { Resend } = require('resend');

const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL || 'johnm@productionlabs.io';
const RETENTION_DAYS = parseInt(process.env.RETENTION_DAYS || '90', 10);
const BACKUP_PREFIX = process.env.BACKUP_PREFIX || 'slater';
const WEEKLY_SUMMARY_DAY = parseInt(process.env.WEEKLY_SUMMARY_DAY ?? '0', 10);
const MIN_DUMP_BYTES = 20 * 1024; // 20KB - current dump is ~3.5MB; anything this small means pg_dump produced ~nothing

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

// Belt-and-suspenders: even though main() wraps everything in try/catch,
// make sure a truly stray uncaught error still tries to notify before the
// process dies, instead of vanishing into deploy logs nobody is watching.
process.on('uncaughtException', async (err) => {
  console.error(`[${new Date().toISOString()}] UNCAUGHT EXCEPTION: ${err && err.stack ? err.stack : err}`);
  try {
    await notifyFailure('uncaughtException', err);
  } catch (_) {
    // best effort only
  }
  process.exit(1);
});
process.on('unhandledRejection', async (err) => {
  console.error(`[${new Date().toISOString()}] UNHANDLED REJECTION: ${err && err.stack ? err.stack : err}`);
  try {
    await notifyFailure('unhandledRejection', err);
  } catch (_) {
    // best effort only
  }
  process.exit(1);
});

function requireEnv(names) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) {
    throw new Error(`Missing required environment variable(s): ${missing.join(', ')}`);
  }
}

async function sendEmail({ subject, html }) {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    log(`WARNING: cannot send notification email, RESEND_API_KEY/RESEND_FROM_EMAIL not set. Subject would have been: ${subject}`);
    return;
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: NOTIFY_EMAIL,
    subject,
    html,
  });
}

function brandedEmail(title, bodyHtml) {
  return `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#f3f0ed">
      <div style="background:#222222;padding:20px 24px;border-radius:8px 8px 0 0">
        <h1 style="color:#C8A84B;font-size:22px;margin:0;letter-spacing:0.05em">SLATER</h1>
        <p style="color:rgba(255,255,255,0.5);font-size:12px;margin:4px 0 0">Database Backup Job</p>
      </div>
      <div style="background:#ffffff;padding:24px;border-radius:0 0 8px 8px;border:1px solid #E9DFC8">
        <h2 style="color:#222222;font-size:17px;margin:0 0 12px">${title}</h2>
        ${bodyHtml}
      </div>
    </div>
  `;
}

async function notifyFailure(stage, err) {
  log(`FAILURE at stage "${stage}": ${err && err.stack ? err.stack : err}`);
  try {
    await sendEmail({
      subject: 'Slater backup FAILED',
      html: brandedEmail(
        'The scheduled database backup failed',
        `
          <p style="color:#222222;font-size:14px">Stage: <strong>${escapeHtml(stage)}</strong></p>
          <p style="color:#222222;font-size:14px">Error: <code style="background:#f3f0ed;padding:2px 6px;border-radius:4px">${escapeHtml(String(err && err.message ? err.message : err))}</code></p>
          <p style="color:#9D9D99;font-size:12px">Time (UTC): ${new Date().toISOString()}</p>
          <p style="color:#9D9D99;font-size:12px">Check the slater-backup service deploy logs in Railway for full details.</p>
        `
      ),
    });
  } catch (emailErr) {
    log(`ERROR: also failed to send the failure notification email: ${emailErr && emailErr.stack ? emailErr.stack : emailErr}`);
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function timestampForKey(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}` +
    `-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`
  );
}

/** Read the last non-blank line of a file without loading the whole thing into memory. */
function lastNonBlankLine(filePath, chunkBytes = 8192) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const readSize = Math.min(chunkBytes, size);
    const buf = Buffer.alloc(readSize);
    fs.readSync(fd, buf, 0, readSize, size - readSize);
    const lines = buf.toString('utf8').trim().split('\n');
    return lines[lines.length - 1] || '';
  } finally {
    fs.closeSync(fd);
  }
}

function runPgDump(databaseUrl, outFile) {
  const result = spawnSync(
    'pg_dump',
    [databaseUrl, '--no-owner', '--no-privileges', '--no-acl', '-f', outFile],
    { encoding: 'utf8', maxBuffer: 1024 * 1024 * 200 }
  );
  if (result.error) {
    throw new Error(`Failed to launch pg_dump: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`pg_dump exited with code ${result.status}. stderr: ${result.stderr || '(empty)'}`);
  }
  return result;
}

function gzipFile(inFile, outFile) {
  const raw = fs.readFileSync(inFile);
  const gz = zlib.gzipSync(raw, { level: 9 });
  fs.writeFileSync(outFile, gz);
  return gz.length;
}

function s3Client() {
  return new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
}

async function uploadToR2(client, key, filePath) {
  const body = fs.readFileSync(filePath);
  await client.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: 'application/gzip',
    })
  );
  return body.length;
}

/**
 * Delete backups older than RETENTION_DAYS. Retention is based on the date
 * encoded in the object key (slater-YYYY-MM-DD-HHMMSS.sql.gz), not S3
 * LastModified, so it's unambiguous and independent of any bucket lifecycle
 * config. Only objects matching our own naming pattern are ever touched.
 */
async function pruneOldBackups(client) {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const keyPattern = new RegExp(`^${BACKUP_PREFIX}-(\\d{4})-(\\d{2})-(\\d{2})-(\\d{2})(\\d{2})(\\d{2})\\.sql\\.gz$`);

  let deleted = 0;
  let continuationToken;
  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: process.env.R2_BUCKET,
        Prefix: `${BACKUP_PREFIX}-`,
        ContinuationToken: continuationToken,
      })
    );
    for (const obj of page.Contents || []) {
      const match = obj.Key.match(keyPattern);
      if (!match) continue; // don't touch anything that isn't clearly one of ours
      const [, y, mo, d, h, mi, s] = match;
      const objDate = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
      if (objDate.getTime() < cutoff) {
        await client.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET, Key: obj.Key }));
        log(`Deleted old backup (>${RETENTION_DAYS}d): ${obj.Key}`);
        deleted += 1;
      }
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);

  return deleted;
}

async function main() {
  const startedAt = Date.now();
  let tmpDir;

  try {
    // Everything, including env validation, lives inside this try block.
    // If validation (or anything else) throws before we get to the real
    // work, we still want notifyFailure() to run below - a config mistake
    // must never fail silently.
    requireEnv([
      'DATABASE_URL',
      'R2_ACCESS_KEY_ID',
      'R2_SECRET_ACCESS_KEY',
      'R2_ENDPOINT',
      'R2_BUCKET',
    ]);

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slater-backup-'));
    const now = new Date();
    const key = `${BACKUP_PREFIX}-${timestampForKey(now)}.sql.gz`;
    const sqlPath = path.join(tmpDir, 'dump.sql');
    const gzPath = path.join(tmpDir, 'dump.sql.gz');

    log('Starting pg_dump...');
    runPgDump(process.env.DATABASE_URL, sqlPath);

    const dumpStats = fs.statSync(sqlPath);
    if (dumpStats.size === 0) {
      throw new Error('pg_dump produced a zero-byte file');
    }
    if (dumpStats.size < MIN_DUMP_BYTES) {
      throw new Error(`Dump is suspiciously small (${dumpStats.size} bytes, expected at least ${MIN_DUMP_BYTES})`);
    }

    const trailer = lastNonBlankLine(sqlPath);
    if (!trailer.includes('PostgreSQL database dump complete')) {
      throw new Error(`Dump file does not end with pg_dump's completion marker. Last line was: "${trailer}"`);
    }
    log(`pg_dump OK: ${dumpStats.size} bytes, completion marker present.`);

    const gzBytes = gzipFile(sqlPath, gzPath);
    log(`Gzipped to ${gzBytes} bytes (${(gzBytes / 1024 / 1024).toFixed(2)} MB).`);

    const client = s3Client();
    log(`Uploading to r2://${process.env.R2_BUCKET}/${key} ...`);
    const uploadedBytes = await uploadToR2(client, key, gzPath);
    log(`Upload OK: ${key} (${(uploadedBytes / 1024 / 1024).toFixed(2)} MB).`);

    log('Pruning backups older than the retention window...');
    const deletedCount = await pruneOldBackups(client);
    log(`Retention: deleted ${deletedCount} object(s) older than ${RETENTION_DAYS} days.`);

    const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
    log(`BACKUP SUCCESS: ${key} - ${(uploadedBytes / 1024 / 1024).toFixed(2)} MB uploaded, ${deletedCount} old object(s) pruned, ${elapsedSec}s total.`);

    if (now.getUTCDay() === WEEKLY_SUMMARY_DAY) {
      await sendEmail({
        subject: 'Slater backup weekly summary (all good)',
        html: brandedEmail(
          'Weekly backup summary',
          `
            <p style="color:#222222;font-size:14px">The scheduled backup is running normally.</p>
            <ul style="color:#222222;font-size:14px;padding-left:18px">
              <li>Latest backup: <code>${escapeHtml(key)}</code></li>
              <li>Size: ${(uploadedBytes / 1024 / 1024).toFixed(2)} MB</li>
              <li>Retention: ${RETENTION_DAYS} days (${deletedCount} old object(s) pruned this run)</li>
            </ul>
            <p style="color:#9D9D99;font-size:12px">You'll only hear from this job otherwise if a backup fails.</p>
          `
        ),
      });
      log('Weekly summary email sent.');
    }
  } catch (err) {
    await notifyFailure('backup', err);
    process.exitCode = 1;
  } finally {
    if (tmpDir) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (cleanupErr) {
        log(`WARNING: failed to clean up temp dir ${tmpDir}: ${cleanupErr.message}`);
      }
    }
  }
}

main().catch(async (err) => {
  // Last-resort safety net. main() catches everything internally, so this
  // should be unreachable - but if something truly unexpected escapes (a
  // bug in the catch block itself, a rejected promise we missed), we still
  // try to notify and always exit non-zero. A silent crash here is exactly
  // the "backup job stops working and nobody notices" failure mode this
  // whole job exists to prevent.
  console.error(`[${new Date().toISOString()}] UNEXPECTED: error escaped main(): ${err && err.stack ? err.stack : err}`);
  try {
    await notifyFailure('unexpected (escaped main)', err);
  } catch (_) {
    // already logged inside notifyFailure
  }
  process.exit(1);
});
