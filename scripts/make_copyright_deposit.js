#!/usr/bin/env node
/**
 * U.S. Copyright Office source-code deposit PDF generator for Slater v1.0.
 * Pure Node.js -- no npm dependencies required.
 * Uses PDF standard Type-1 fonts (Courier, Helvetica) available in all viewers.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const REPO_ROOT      = path.dirname(__dirname);
const OUTPUT_PDF     = path.join(REPO_ROOT, 'Slater_v1.0_copyright_deposit.pdf');
const PROGRAM_TITLE  = 'Slater';
const PROGRAM_VER    = 'Version 1.0';
const COPYRIGHT      = '(c) 2026 Production Labs LLC. All rights reserved.';

// Git-tracked original source files (alphabetical; third-party/generated excluded)
const SOURCE_FILES = [
  'import.js',
  'migrate-agencies.js',
  'package.json',
  'public/admin-login.html',
  'public/admin.html',
  'public/app.js',
  'public/index.html',
  'public/login.html',
  'public/privacy.html',
  'public/reset-password.html',
  'public/styles.css',
  'routes/agencies.js',
  'routes/contacts.js',
  'routes/licenses.js',
  'routes/ocr.js',
  'routes/projects.js',
  'routes/receipts.js',
  'routes/users.js',
  'server.js',
];

// ---------------------------------------------------------------------------
// PDF constants (points; 1pt = 1/72 inch; LETTER = 612 x 792)
// ---------------------------------------------------------------------------
const PAGE_W   = 612;
const PAGE_H   = 792;
const MARGIN   = 54;          // 0.75 inch
const FS_CODE  = 7.5;
const LINE_H   = FS_CODE * 1.35;
const LNUM_W   = 36;          // column for line numbers
const CODE_X   = MARGIN + LNUM_W;
// Courier char width = 0.6 * fontSize
const MAX_CHARS = Math.floor((PAGE_W - MARGIN - CODE_X) / (FS_CODE * 0.6));
const TOP_Y    = PAGE_H - MARGIN;
const BOTTOM_Y = MARGIN + 16;

// ---------------------------------------------------------------------------
// PDF helpers
// ---------------------------------------------------------------------------
function pdfEscape(s) {
  return s.replace(/\\/g, '\\\\')
          .replace(/\(/g, '\\(')
          .replace(/\)/g, '\\)')
          .replace(/\r/g, '\\r');
}

class PDFDoc {
  constructor() {
    this._chunks = [];   // raw byte chunks written so far
    this._offsets = [];  // byte offset of each object
    this._objCount = 0;
    this._pageIds = [];
    this._pageCount = 0;
  }

  _write(s) {
    const buf = Buffer.isBuffer(s) ? s : Buffer.from(s, 'latin1');
    this._chunks.push(buf);
  }

  _pos() {
    return this._chunks.reduce((n, b) => n + b.length, 0);
  }

  _beginObj() {
    this._objCount++;
    this._offsets.push(this._pos());
    this._write(`${this._objCount} 0 obj\n`);
    return this._objCount;
  }

  _endObj() {
    this._write('endobj\n');
  }

  // Write a stream object, return its id
  _streamObj(dictExtra, data) {
    const id = this._beginObj();
    const dataBuf = Buffer.isBuffer(data) ? data : Buffer.from(data, 'latin1');
    this._write(`<< /Length ${dataBuf.length}${dictExtra ? ' ' + dictExtra : ''} >>\nstream\n`);
    this._chunks.push(dataBuf);
    this._write('\nendstream\n');
    this._endObj();
    return id;
  }

  addPage(contentBuf) {
    this._pageCount++;
    const contentId = this._streamObj('', contentBuf);

    const id = this._beginObj();
    this._write(
      `<< /Type /Page /Parent 2 0 R\n` +
      `   /MediaBox [0 0 ${PAGE_W} ${PAGE_H}]\n` +
      `   /Contents ${contentId} 0 R\n` +
      `   /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >>\n` +
      `>>\n`
    );
    this._endObj();
    this._pageIds.push(id);
  }

  finalize(outPath) {
    // Rewrite with proper structure:
    // obj 1 = Catalog, 2 = Pages, 3 = Courier, 4 = Helvetica, 5 = Helvetica-Bold
    // then the page content pairs already written above (offset by 5)
    // We'll just rebuild from scratch using the accumulated page content.
    // Simpler: reconstruct the whole file in one pass.

    const parts = [];
    const objOffsets = [];

    function push(s) { parts.push(Buffer.from(s, 'latin1')); }
    function pushBuf(b) { parts.push(b); }
    function byteLen() { return parts.reduce((n, b) => n + b.length, 0); }

    push('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');

    // We'll collect all page objects in order; each page needs: contentStream + pageDict
    // We have them in this._pageIds but the content was already serialized into chunks.
    // Instead, let's rebuild from the stored content.

    // ---- Rebuild cleanly ----
    // Unfortunately the page content was already serialized.  We need to extract it
    // or store it separately.  Let's store pages separately from the stream.

    console.log('  Internal rebuild pass...');
    // This approach has a design flaw: we serialized objects into _chunks already.
    // We need to rebuild from scratch using a stored page list.
    // Let me use a two-pass approach: store raw content in memory, then write all at once.
    throw new Error('Use PDFDoc2 instead.');
  }
}

// ---------------------------------------------------------------------------
// Clean two-pass PDFDoc
// ---------------------------------------------------------------------------
class PDFDoc2 {
  constructor() {
    this._pages = []; // array of Buffer (content streams)
  }

  addPage(contentBuf) {
    this._pages.push(Buffer.isBuffer(contentBuf) ? contentBuf : Buffer.from(contentBuf, 'latin1'));
  }

  save(outPath) {
    const parts = [];
    const objOff = []; // 1-indexed offset array

    function w(s)  { parts.push(Buffer.from(s, 'latin1')); }
    function wbuf(b) { parts.push(b); }
    function pos() { return parts.reduce((n, b) => n + b.length, 0); }

    w('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');

    // Object numbering plan:
    // 1 = Catalog
    // 2 = Pages
    // 3 = Courier
    // 4 = Helvetica
    // 5 = Helvetica-Bold
    // For each page i (0-indexed):
    //   6 + i*2     = content stream
    //   6 + i*2 + 1 = page dict
    const n = this._pages.length;
    const pageIds = Array.from({length: n}, (_, i) => 6 + i * 2 + 1);

    // Obj 1: Catalog
    objOff[1] = pos();
    w('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

    // Obj 2: Pages
    objOff[2] = pos();
    const kids = pageIds.map(id => `${id} 0 R`).join(' ');
    w(`2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${n} >>\nendobj\n`);

    // Obj 3: Courier
    objOff[3] = pos();
    w('3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>\nendobj\n');

    // Obj 4: Helvetica
    objOff[4] = pos();
    w('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n');

    // Obj 5: Helvetica-Bold
    objOff[5] = pos();
    w('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n');

    // Pages
    for (let i = 0; i < n; i++) {
      const contentId = 6 + i * 2;
      const pageId    = 6 + i * 2 + 1;

      // Content stream
      objOff[contentId] = pos();
      const cdata = this._pages[i];
      w(`${contentId} 0 obj\n<< /Length ${cdata.length} >>\nstream\n`);
      wbuf(cdata);
      w('\nendstream\nendobj\n');

      // Page dict
      objOff[pageId] = pos();
      w(`${pageId} 0 obj\n`);
      w(`<< /Type /Page /Parent 2 0 R\n`);
      w(`   /MediaBox [0 0 ${PAGE_W} ${PAGE_H}]\n`);
      w(`   /Contents ${contentId} 0 R\n`);
      w(`   /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >>\n`);
      w(`>>\nendobj\n`);
    }

    // XRef
    const xrefPos = pos();
    const totalObjs = 5 + n * 2 + 1; // catalog+pages+3fonts + 2 per page + 1 for obj 0
    w('xref\n');
    w(`0 ${totalObjs + 1}\n`);
    w('0000000000 65535 f \n');
    for (let i = 1; i <= totalObjs; i++) {
      const off = objOff[i];
      if (off === undefined) {
        // gap -- write free entry
        w('0000000000 65535 f \n');
      } else {
        w(`${String(off).padStart(10, '0')} 00000 n \n`);
      }
    }

    // Trailer
    w('trailer\n');
    w(`<< /Size ${totalObjs + 1} /Root 1 0 R >>\n`);
    w('startxref\n');
    w(`${xrefPos}\n`);
    w('%%EOF\n');

    fs.writeFileSync(outPath, Buffer.concat(parts));
  }
}

// ---------------------------------------------------------------------------
// Page renderer
// ---------------------------------------------------------------------------
class PageRenderer {
  constructor(doc, totalCodeLines, mode) {
    this._doc  = doc;
    this._total = totalCodeLines;
    this._mode  = mode;
    this._pn   = 0;
    this._buf  = null;
    this._y    = 0;
  }

  _footer() {
    const label = `${PROGRAM_TITLE} ${PROGRAM_VER}  |  ${COPYRIGHT}  |  Page ${this._pn}`;
    const safe  = pdfEscape(label);
    const tw    = label.length * 7.5 * 0.5;
    const fx    = (PAGE_W - tw) / 2;
    return `0.4 0.4 0.4 rg\nBT /F2 7.5 Tf ${fx.toFixed(1)} 18.0 Td (${safe}) Tj ET\n`;
  }

  newPage() {
    if (this._buf !== null) {
      // close previous page
      this._buf += this._footer();
      this._doc.addPage(this._buf);
    }
    this._pn++;
    this._buf = '';
    this._y   = TOP_Y;
  }

  finish() {
    if (this._buf !== null) {
      this._buf += this._footer();
      this._doc.addPage(this._buf);
      this._buf = null;
    }
  }

  _checkPage() {
    if (this._y < BOTTOM_Y) this.newPage();
  }

  titlePage() {
    this.newPage();
    const mid = PAGE_H / 2;
    const items = [
      [130, PROGRAM_TITLE,  'F3', 22.0, 0.05],
      [ 98, PROGRAM_VER,    'F2', 14.0, 0.20],
      [ 70, COPYRIGHT,      'F2', 10.5, 0.20],
      [ 44, 'Source Code Deposit for U.S. Copyright Registration', 'F2', 10.0, 0.35],
      [ 22, `Total source lines: ${this._total}   |   ${this._mode === 'full' ? 'Full source' : 'First 1,000 + Last 1,000 lines'}`, 'F2', 9.0, 0.45],
    ];
    for (const [dy, text, font, size, gray] of items) {
      const safe = pdfEscape(text);
      const tw   = text.length * size * (font === 'F1' ? 0.6 : 0.5);
      const x    = (PAGE_W - tw) / 2;
      this._buf += `${gray.toFixed(2)} ${gray.toFixed(2)} ${gray.toFixed(2)} rg\n`;
      this._buf += `BT /${font} ${size} Tf ${x.toFixed(1)} ${(mid + dy).toFixed(1)} Td (${safe}) Tj ET\n`;
    }
    // close title page and start source page
    this._buf += this._footer();
    this._doc.addPage(this._buf);
    this._buf = null;
  }

  drawHeader(text) {
    this._checkPage();
    const safe = pdfEscape(text.slice(0, MAX_CHARS + 20));
    this._buf += `0.45 0.45 0.45 rg\nBT /F2 ${FS_CODE} Tf ${MARGIN.toFixed(1)} ${this._y.toFixed(2)} Td (${safe}) Tj ET\n`;
    this._y -= LINE_H;
  }

  drawCodeLine(lineNum, text) {
    this._checkPage();
    const display = text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text;

    // line number (right-aligned)
    const ns  = String(lineNum);
    const nw  = ns.length * FS_CODE * 0.6;
    const nx  = MARGIN + LNUM_W - nw - 4;
    const sns = pdfEscape(ns);
    this._buf += `0.55 0.55 0.55 rg\nBT /F1 ${FS_CODE} Tf ${nx.toFixed(2)} ${this._y.toFixed(2)} Td (${sns}) Tj ET\n`;

    // code text
    const safe = pdfEscape(display);
    this._buf += `0 0 0 rg\nBT /F1 ${FS_CODE} Tf ${CODE_X.toFixed(1)} ${this._y.toFixed(2)} Td (${safe}) Tj ET\n`;

    this._y -= LINE_H;
  }
}

// ---------------------------------------------------------------------------
// Step 1: Read source files
// ---------------------------------------------------------------------------
function readSourceFiles() {
  const lines = []; // {num: number|null, text: string}
  let codeCount = 0;

  for (const relPath of SOURCE_FILES) {
    const absPath = path.join(REPO_ROOT, relPath);
    if (!fs.existsSync(absPath)) {
      console.warn(`  WARNING: not found, skipping: ${relPath}`);
      continue;
    }

    const bar = '='.repeat(72);
    lines.push({num: null, text: ''});
    lines.push({num: null, text: bar});
    lines.push({num: null, text: `FILE: ${relPath}`});
    lines.push({num: null, text: bar});

    const content = fs.readFileSync(absPath, 'utf8');
    for (const line of content.split('\n')) {
      codeCount++;
      lines.push({num: codeCount, text: line.replace(/\r$/, '')});
    }
    // Remove trailing empty line added by split if file ends with \n
    if (lines.length > 0 && lines[lines.length - 1].num !== null &&
        lines[lines.length - 1].text === '') {
      const removed = lines.pop();
      codeCount--;
    }
  }

  return {lines, codeCount};
}

// ---------------------------------------------------------------------------
// Step 2: Apply Copyright Office page rule
// ---------------------------------------------------------------------------
function applyPageRule(lines, total) {
  if (total <= 2000) {
    console.log(`  Total code lines: ${total}  -- FULL SOURCE (<=2000)`);
    return {deposit: lines, mode: 'full'};
  }

  console.log(`  Total code lines: ${total}  -- PARTIAL (first 1000 + last 1000)`);

  // first 1000 code lines (keep preceding header lines)
  const first = [];
  let seen = 0;
  for (const item of lines) {
    first.push(item);
    if (item.num !== null) {
      seen++;
      if (seen >= 1000) break;
    }
  }

  // last 1000 code lines
  const last = [];
  seen = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    last.unshift(lines[i]);
    if (lines[i].num !== null) {
      seen++;
      if (seen >= 1000) break;
    }
  }

  const sep = [
    {num: null, text: ''},
    {num: null, text: '='.repeat(72)},
    {num: null, text: '  *** FIRST PORTION ENDS HERE ***'},
    {num: null, text: `  Lines 1-1000 of ${total} total code lines shown above.`},
    {num: null, text: ''},
    {num: null, text: `  OMITTED: lines 1001 through ${total - 1000}`},
    {num: null, text: `  (${total - 2000} lines omitted per Copyright Office deposit rules)`},
    {num: null, text: ''},
    {num: null, text: '  *** LAST PORTION BEGINS HERE ***'},
    {num: null, text: `  Last 1000 of ${total} total code lines shown below.`},
    {num: null, text: '='.repeat(72)},
    {num: null, text: ''},
  ];

  return {deposit: [...first, ...sep, ...last], mode: 'partial'};
}

// ---------------------------------------------------------------------------
// Step 3: Ensure copyright notice is present
// ---------------------------------------------------------------------------
function ensureCopyright(deposit, allLines) {
  const combined = deposit.map(l => l.text).join(' ').toLowerCase();
  if (combined.includes('production labs') && combined.includes('all rights reserved')) {
    console.log('  Copyright notice is present in deposit.');
    return deposit;
  }

  console.log('  Copyright notice not in selected portion -- appending labelled excerpt.');
  const idx = allLines.findIndex(l =>
    l.text.toLowerCase().includes('production labs') &&
    l.text.toLowerCase().includes('all rights reserved')
  );

  let extra;
  if (idx < 0) {
    extra = [{num: null, text: COPYRIGHT}];
  } else {
    const start = Math.max(0, idx - 3);
    const end   = Math.min(allLines.length, idx + 4);
    extra = allLines.slice(start, end);
  }

  const appendix = [
    {num: null, text: ''},
    {num: null, text: '='.repeat(72)},
    {num: null, text: 'COPYRIGHT NOTICE (appended per deposit rules -- public/index.html)'},
    {num: null, text: '='.repeat(72)},
    ...extra,
  ];

  return [...deposit, ...appendix];
}

// ---------------------------------------------------------------------------
// Step 4: Render PDF
// ---------------------------------------------------------------------------
function renderPDF(deposit, totalCodeLines, mode) {
  const doc = new PDFDoc2();
  const rdr = new PageRenderer(doc, totalCodeLines, mode);

  rdr.titlePage();
  rdr.newPage();

  for (const {num, text} of deposit) {
    if (num === null) {
      rdr.drawHeader(text);
    } else {
      rdr.drawCodeLine(num, text);
    }
  }

  rdr.finish();
  doc.save(OUTPUT_PDF);
  return rdr._pn;
}

// ---------------------------------------------------------------------------
// Step 5: Verify
// ---------------------------------------------------------------------------
function verify() {
  const raw = fs.readFileSync(OUTPUT_PDF);
  const str = raw.toString('latin1');
  return {
    hasTitle:   str.includes('Slater'),
    hasCopyright: str.includes('Production Labs'),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
console.log('\n=== Slater v1.0 Copyright Deposit PDF Generator ===\n');

console.log('Step 1: Reading source files...');
const {lines: allLines, codeCount} = readSourceFiles();
console.log(`  ${codeCount} code lines read from ${SOURCE_FILES.length} files`);

console.log('\nStep 2: Applying Copyright Office page rule...');
const {deposit: depositRaw, mode} = applyPageRule(allLines, codeCount);

console.log('\nStep 3: Verifying copyright notice is present...');
const deposit = ensureCopyright(depositRaw, allLines);

console.log('\nStep 4: Generating PDF...');
const pages = renderPDF(deposit, codeCount, mode);

console.log('\nStep 5: Verifying text searchability...');
const {hasTitle, hasCopyright} = verify();
console.log(`  'Slater' found in raw PDF bytes:          ${hasTitle ? 'YES' : 'NO'}`);
console.log(`  'Production Labs' found in raw PDF bytes: ${hasCopyright ? 'YES' : 'NO'}`);

const sizeKB = (fs.statSync(OUTPUT_PDF).size / 1024).toFixed(1);
const sizeMB = (fs.statSync(OUTPUT_PDF).size / (1024 * 1024)).toFixed(3);

console.log('\n' + '='.repeat(56));
console.log(`  Output file:     ${OUTPUT_PDF}`);
console.log(`  Files included:  ${SOURCE_FILES.filter(f => fs.existsSync(path.join(REPO_ROOT, f))).length}`);
console.log(`  Total lines:     ${codeCount}`);
console.log(`  Deposit mode:    ${mode === 'full' ? 'Full source' : 'First 1,000 + Last 1,000 lines'}`);
console.log(`  PDF pages:       ${pages}`);
console.log(`  PDF size:        ${sizeKB} KB (${sizeMB} MB)`);
console.log(`  Under 500 MB:    ${parseFloat(sizeMB) < 500 ? 'YES' : 'NO'}`);
console.log('='.repeat(56));
