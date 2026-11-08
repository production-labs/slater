// A tiny stand-in for R2 (S3 API) used by the e2e tests, so they run without
// real credentials. It does just what Slater and the browser use: multipart
// upload (start / part / complete / abort), HEAD, GET (honours
// response-content-disposition), DELETE, and CORS with the ETag header.
// It does NOT check signatures: do a real-R2 run before going live.
//
//   const s3 = require('./e2e-fake-s3').create(3988, 'slater-e2e');
//   await s3.listen();   s3.state.objects / .mpus / .log;   s3.close();
// Knobs on s3.state: exposeEtag (false = bucket CORS missing ETag), putDelayMs,
// failDeletes (true = every DELETE answers 500, i.e. storage down).
const http = require('http');
const crypto = require('crypto');

function create(port, bucket) {
  const state = { mpus: new Map(), objects: new Map(), log: [], exposeEtag: true, putDelayMs: 0, failDeletes: false };
  const base = 'http://localhost:' + port;
  const md5 = b => crypto.createHash('md5').update(b).digest('hex');
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const xml = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/xml' }); res.end('<?xml version="1.0" encoding="UTF-8"?>' + body); };

  const server = http.createServer((req, res) => {
    const u = new URL(req.url, base);
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      if (state.exposeEtag) res.setHeader('Access-Control-Expose-Headers', 'ETag');
    }
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'PUT');
      if (req.headers['access-control-request-headers']) res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers']);
      res.writeHead(204); return res.end();
    }
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', async () => {
      const body = Buffer.concat(chunks);
      const prefix = '/' + bucket + '/';
      const key = u.pathname.startsWith(prefix) ? decodeURIComponent(u.pathname.slice(prefix.length)) : null;
      state.log.push({ method: req.method, path: u.pathname, query: u.search, origin: origin || '', bytes: body.length });
      if (!key) return xml(res, 400, '<Error><Code>InvalidBucketName</Code></Error>');
      const q = u.searchParams;
      if (req.method === 'POST' && q.has('uploads')) {
        const id = 'mpu-' + crypto.randomBytes(8).toString('hex');
        state.mpus.set(id, { key, parts: new Map(), contentType: req.headers['content-type'] });
        return xml(res, 200, `<InitiateMultipartUploadResult><Bucket>${bucket}</Bucket><Key>${key}</Key><UploadId>${id}</UploadId></InitiateMultipartUploadResult>`);
      }
      if (req.method === 'PUT' && q.has('partNumber')) {
        const mpu = state.mpus.get(q.get('uploadId'));
        if (!mpu || mpu.key !== key) return xml(res, 404, '<Error><Code>NoSuchUpload</Code></Error>');
        if (state.putDelayMs) await sleep(state.putDelayMs);
        const etag = '"' + md5(body) + '"';
        mpu.parts.set(Number(q.get('partNumber')), { body, etag });
        res.writeHead(200, { ETag: etag }); return res.end();
      }
      if (req.method === 'POST' && q.has('uploadId')) {
        const mpu = state.mpus.get(q.get('uploadId'));
        if (!mpu || mpu.key !== key) return xml(res, 404, '<Error><Code>NoSuchUpload</Code></Error>');
        const listed = [...body.toString().matchAll(/<PartNumber>(\d+)<\/PartNumber>\s*<ETag>([^<]*)<\/ETag>|<ETag>([^<]*)<\/ETag>\s*<PartNumber>(\d+)<\/PartNumber>/g)]
          .map(m => ({ n: Number(m[1] || m[4]), etag: (m[2] || m[3]).replace(/&quot;/g, '"') }));
        for (const p of listed) {
          const have = mpu.parts.get(p.n);
          if (!have || have.etag !== p.etag) return xml(res, 400, '<Error><Code>InvalidPart</Code></Error>');
        }
        state.objects.set(key, Buffer.concat(listed.sort((a, b) => a.n - b.n).map(p => mpu.parts.get(p.n).body)));
        state.mpus.delete(q.get('uploadId'));
        return xml(res, 200, `<CompleteMultipartUploadResult><Bucket>${bucket}</Bucket><Key>${key}</Key><ETag>"done"</ETag></CompleteMultipartUploadResult>`);
      }
      if (req.method === 'DELETE' && state.failDeletes) return xml(res, 500, '<Error><Code>InternalError</Code></Error>');
      if (req.method === 'DELETE' && q.has('uploadId')) { state.mpus.delete(q.get('uploadId')); res.writeHead(204); return res.end(); }
      if (req.method === 'DELETE') { state.objects.delete(key); res.writeHead(204); return res.end(); }
      if (req.method === 'HEAD') {
        const o = state.objects.get(key);
        res.writeHead(o ? 200 : 404, o ? { 'Content-Length': o.length } : {}); return res.end();
      }
      if (req.method === 'GET') {
        const o = state.objects.get(key);
        if (!o) return xml(res, 404, '<Error><Code>NoSuchKey</Code></Error>');
        const headers = { 'Content-Length': o.length, 'Content-Type': 'application/octet-stream' };
        if (q.get('response-content-disposition')) headers['Content-Disposition'] = q.get('response-content-disposition');
        res.writeHead(200, headers); return res.end(o);
      }
      xml(res, 405, '<Error><Code>MethodNotAllowed</Code></Error>');
    });
  });

  return {
    state, server, url: base,
    listen: () => new Promise(r => server.listen(port, r)),
    close: () => server.close(),
  };
}

module.exports = { create };
