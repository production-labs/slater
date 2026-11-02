// R2 access for client file TRANSFER (V1.5 step 6b): the slater-transfers
// bucket. Files go browser -> R2 directly with presigned URLs; the app server
// never handles file bytes. Used by routes/portalUploads.js (client side) and,
// later, the producer panel (downloads, deletes).
//
// Env (app service):
//   R2_TRANSFER_ENDPOINT              https://<account_id>.r2.cloudflarestorage.com
//   R2_TRANSFER_BUCKET                slater-transfers
//   R2_TRANSFER_ACCESS_KEY_ID /
//   R2_TRANSFER_SECRET_ACCESS_KEY     Object Read & Write, scoped to that bucket only
//
// The bucket itself needs (Cloudflare dashboard, not code):
//   - lifecycle rule: delete objects 14 days after upload (backstop)
//   - CORS: PUT from the app's origin, ExposeHeaders ETag (multipart needs it)
//
// Path-style URLs (endpoint/bucket/key) so every presigned URL has the same
// origin as R2_TRANSFER_ENDPOINT; the portal page's CSP allows exactly that.

const crypto = require('crypto');
const {
  S3Client, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand, HeadObjectCommand, DeleteObjectCommand, GetObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const MAX_FILE_BYTES = 5 * 1024 ** 3;  // 5 GiB, same as the portal_files_size_cap CHECK
const PART_BYTES = 16 * 1024 ** 2;     // 16 MiB parts: a 5 GiB file is 320 parts
const RETENTION_DAYS = 14;
const PART_URL_TTL_SECONDS = 60 * 60;  // signed in batches as the upload goes, so 1 h is plenty
const DOWNLOAD_URL_TTL_SECONDS = 5 * 60;
const R2_TIMEOUT_MS = 15000;

function isConfigured() {
  return !!(process.env.R2_TRANSFER_ENDPOINT && process.env.R2_TRANSFER_BUCKET &&
            process.env.R2_TRANSFER_ACCESS_KEY_ID && process.env.R2_TRANSFER_SECRET_ACCESS_KEY);
}

// Origin of the endpoint, for the portal page's connect-src. '' if unset/invalid.
function endpointOrigin() {
  try { return isConfigured() ? new URL(process.env.R2_TRANSFER_ENDPOINT).origin : ''; } catch (_) { return ''; }
}

let client;
function r2() {
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: process.env.R2_TRANSFER_ENDPOINT,
      forcePathStyle: true,
      maxAttempts: 3,
      // Newer SDKs add CRC checksums by default; presigned part URLs would then
      // expect a checksum header the browser doesn't send. R2's docs say to
      // turn this off.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      credentials: {
        accessKeyId: process.env.R2_TRANSFER_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_TRANSFER_SECRET_ACCESS_KEY,
      },
    });
  }
  return client;
}

const bucket = () => process.env.R2_TRANSFER_BUCKET;
const send = (cmd) => r2().send(cmd, { abortSignal: AbortSignal.timeout(R2_TIMEOUT_MS) });

// Object keys never contain anything the client typed: project id + random.
function newKey(projectId) {
  return 'portal/' + Number(projectId) + '/' + crypto.randomUUID();
}

function partCount(size) {
  return Math.max(1, Math.ceil(size / PART_BYTES));
}

async function startUpload(key, contentType) {
  const r = await send(new CreateMultipartUploadCommand({
    Bucket: bucket(), Key: key, ContentType: contentType || 'application/octet-stream',
  }));
  return r.UploadId;
}

function signPart(key, uploadId, partNumber) {
  return getSignedUrl(r2(), new UploadPartCommand({
    Bucket: bucket(), Key: key, UploadId: uploadId, PartNumber: partNumber,
  }), { expiresIn: PART_URL_TTL_SECONDS });
}

async function completeUpload(key, uploadId, parts) {
  await send(new CompleteMultipartUploadCommand({
    Bucket: bucket(), Key: key, UploadId: uploadId,
    MultipartUpload: { Parts: parts.map(p => ({ PartNumber: p.part, ETag: p.etag })) },
  }));
}

async function abortUpload(key, uploadId) {
  await send(new AbortMultipartUploadCommand({ Bucket: bucket(), Key: key, UploadId: uploadId }));
}

// Size of a stored object in bytes, or null if it isn't there.
async function objectSize(key) {
  try {
    const r = await send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return Number(r.ContentLength);
  } catch (err) {
    if (err && (err.name === 'NotFound' || (err.$metadata && err.$metadata.httpStatusCode === 404))) return null;
    throw err;
  }
}

async function deleteObject(key) {
  await send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

// Short-lived download link that always saves as a file (never opens in the
// browser), under the client's original filename.
function signDownload(key, filename) {
  const ascii = String(filename).replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return getSignedUrl(r2(), new GetObjectCommand({
    Bucket: bucket(), Key: key,
    ResponseContentDisposition: `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
  }), { expiresIn: DOWNLOAD_URL_TTL_SECONDS });
}

module.exports = {
  MAX_FILE_BYTES, PART_BYTES, RETENTION_DAYS,
  isConfigured, endpointOrigin, newKey, partCount,
  startUpload, signPart, completeUpload, abortUpload, objectSize, deleteObject, signDownload,
};
