// Field validation for v2 routes.
//
// Each resource declares a spec: { column: { type, required?, multiline? } }.
// Types:
//   text   single-line, trimmed + inner whitespace collapsed, max 2,000 chars
//          (multiline: kept as typed, max 20,000)
//   bool   strict true/false
//   image  data:image/png|jpeg;base64,... up to ~3 MB of text (logos are 512x512 PNG)
//   orgRef organization id owned by the same user (ownership checked by caller)
//   country ISO 3166-1 alpha-2 code from public/regions.js (case-insensitive in, uppercase out)
// Empty strings are stored as NULL so "no value" has exactly one representation.

const Regions = require('../../public/regions');

class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra || {};
  }
}

const TEXT_MAX = 2000;
const MULTILINE_MAX = 20000;
const IMAGE_MAX = 3000000;
const IMAGE_RE = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/;

function cleanValue(col, def, raw) {
  if (def.type === 'bool') {
    if (raw === undefined || raw === null) return false;
    if (typeof raw !== 'boolean') throw new HttpError(400, `${col} must be true or false`);
    return raw;
  }
  if (raw === undefined || raw === null) return null;

  if (def.type === 'orgRef') {
    const n = Number(raw);
    if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, `${col} must be an id`);
    return n;
  }

  if (typeof raw === 'number') raw = String(raw);
  if (typeof raw !== 'string') throw new HttpError(400, `${col} must be text`);

  if (def.type === 'country') {
    const c = raw.trim().toUpperCase();
    if (c === '') return null;
    if (!Regions.isCountry(c)) throw new HttpError(400, `${col} must be a 2-letter country code`);
    return c;
  }

  if (def.type === 'image') {
    if (raw === '') return null;
    if (raw.length > IMAGE_MAX) throw new HttpError(413, `${col} is too large`);
    if (!IMAGE_RE.test(raw)) throw new HttpError(400, `${col} must be a PNG or JPEG data URL`);
    return raw;
  }

  // text
  // Single-line text: trim and collapse runs of whitespace ("Nick  Vettorel"
  // -> "Nick Vettorel"). Multiline text keeps its spacing.
  const v = def.multiline ? raw : raw.replace(/\s+/g, ' ').trim();
  const max = def.multiline ? MULTILINE_MAX : TEXT_MAX;
  if (v.length > max) throw new HttpError(400, `${col} is too long (max ${max} characters)`);
  return v === '' ? null : v;
}

// partial = true: only columns present in body are returned (PATCH).
// partial = false: every column in the spec is returned (POST).
function clean(spec, body, { partial }) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Request body must be a JSON object');
  }
  const out = {};
  for (const [col, def] of Object.entries(spec)) {
    const present = Object.prototype.hasOwnProperty.call(body, col);
    if (partial && !present) continue;
    const v = cleanValue(col, def, body[col]);
    if (def.required && (v === null || v === '')) throw new HttpError(400, `${col} is required`);
    out[col] = v;
  }
  return out;
}

function parseId(raw) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'Invalid id');
  return n;
}

// Wrap an async route handler: HttpError -> its status; Postgres
// errors with known meaning -> 400/409; anything else -> 500.
function handle(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof HttpError) {
        return res.status(err.status).json({ error: err.message, ...err.extra });
      }
      if (err.code === '22007' || err.code === '22008') {
        return res.status(400).json({ error: 'Invalid timestamp' });
      }
      if (err.code === '23505') {
        return res.status(409).json({ error: 'Duplicate', detail: err.constraint });
      }
      console.error('[v2]', req.method, req.originalUrl, err);
      res.status(500).json({ error: 'Server error' });
    }
  };
}

module.exports = { HttpError, clean, parseId, handle };
