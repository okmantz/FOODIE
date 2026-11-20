/**
 * Tiny dependency-free PDF writer (Letter, standard Helvetica/Times fonts).
 * Supports flowing text with wrapping, rules, coloured rectangles, checkboxes,
 * automatic page breaks and a footer. Output is a real downloadable .pdf Blob.
 */
const HELV = {
  32: 278, 33: 278, 34: 355, 35: 556, 36: 556, 37: 889, 38: 667, 39: 191, 40: 333, 41: 333, 42: 389, 43: 584, 44: 278, 45: 333, 46: 278, 47: 278,
  48: 556, 49: 556, 50: 556, 51: 556, 52: 556, 53: 556, 54: 556, 55: 556, 56: 556, 57: 556, 58: 278, 59: 278, 60: 584, 61: 584, 62: 584, 63: 556, 64: 1015,
  65: 667, 66: 667, 67: 722, 68: 722, 69: 667, 70: 611, 71: 778, 72: 722, 73: 278, 74: 500, 75: 667, 76: 556, 77: 833, 78: 722, 79: 778, 80: 667, 81: 778,
  82: 722, 83: 667, 84: 611, 85: 722, 86: 667, 87: 944, 88: 667, 89: 667, 90: 611, 91: 278, 92: 278, 93: 278, 94: 469, 95: 556, 96: 333,
  97: 556, 98: 556, 99: 500, 100: 556, 101: 556, 102: 278, 103: 556, 104: 556, 105: 222, 106: 222, 107: 500, 108: 222, 109: 833, 110: 556, 111: 556, 112: 556,
  113: 556, 114: 333, 115: 500, 116: 278, 117: 556, 118: 500, 119: 722, 120: 500, 121: 500, 122: 500, 123: 334, 124: 260, 125: 334, 126: 584,
};
// unicode -> WinAnsi byte
const WIN = { '•': 149, '–': 150, '—': 151, '‘': 145, '’': 146, '“': 147, '”': 148, '…': 133, '€': 128, '°': 176, '×': 215, '½': 189, '¼': 188, '¾': 190, '·': 183, '✓': 118, '≈': 126, '⅓': 49, '⅔': 50, '⅛': 49 };
const FONT = { r: 'F1', b: 'F2', t: 'F3', tb: 'F4' };

const FRAC = { '⅓': '1/3', '⅔': '2/3', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8', '⅕': '1/5', '⅙': '1/6' };
function toWin(s) {
  let out = '';
  s = String(s).replace(/(\d)?([⅓⅔⅛⅜⅝⅞⅕⅙])/g, (_, d, f) => (d ? d + ' ' : '') + FRAC[f]);
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c < 128) out += ch;
    else if (WIN[ch]) out += String.fromCharCode(WIN[ch]);
    else if (c >= 160 && c <= 255) out += ch;
    else if (c === 0x2009 || c === 0x00a0) out += ' ';
    else if (c > 0x2000 && c < 0x2100) out += '-';
    else if (c >= 0x1f000 || (c >= 0x2600 && c < 0x2800) || c === 0xfe0f || c === 0x200d) out += '';
    else out += '?';
  }
  return out;
}
const esc = (s) => s.replace(/[\\()]/g, '\\$&');

export class PDF {
  constructor({ margin = 48, footer = 'Made with FOODIE', accent = [0.35, 0.65, 0.15] } = {}) {
    this.W = 612; this.H = 792; this.m = margin; this.footer = footer; this.accent = accent;
    this.pages = []; this.newPage();
  }
  newPage() { this.pages.push([]); this.y = this.m; return this; }
  get ops() { return this.pages[this.pages.length - 1]; }
  width(str, size, font = 'r') {
    let w = 0;
    for (const ch of toWin(str)) w += HELV[ch.charCodeAt(0)] ?? 556;
    const f = font === 'b' ? 1.06 : font === 't' ? 0.93 : font === 'tb' ? 0.97 : 1;
    return (w / 1000) * size * f;
  }
  ensure(h) { if (this.y + h > this.H - this.m - 14) this.newPage(); }
  color(c, stroke = false) { return c.map((v) => v.toFixed(3)).join(' ') + (stroke ? ' RG' : ' rg'); }
  text(str, x, size = 11, { font = 'r', color = [0.1, 0.12, 0.1], baseline } = {}) {
    const y = this.H - (baseline ?? this.y) - size * 0.8;
    this.ops.push(`BT /${FONT[font]} ${size} Tf ${this.color(color)} ${x.toFixed(2)} ${y.toFixed(2)} Td (${esc(toWin(str))}) Tj ET`);
  }
  rect(x, y, w, h, { fill, stroke, lw = 1, radius } = {}) {
    const yy = this.H - y - h;
    const parts = [];
    if (fill) parts.push(this.color(fill));
    if (stroke) parts.push(this.color(stroke, true), `${lw} w`);
    parts.push(`${x.toFixed(2)} ${yy.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re`);
    parts.push(fill && stroke ? 'B' : fill ? 'f' : 'S');
    this.ops.push(parts.join(' '));
  }
  rule(color = [0.85, 0.88, 0.83], lw = 0.6) {
    this.ops.push(`${this.color(color, true)} ${lw} w ${this.m} ${(this.H - this.y).toFixed(2)} m ${this.W - this.m} ${(this.H - this.y).toFixed(2)} l S`);
  }
  wrap(str, size, maxW, font = 'r') {
    const lines = [];
    for (const para of String(str).split('\n')) {
      let line = '';
      for (const word of para.split(/\s+/)) {
        const t = line ? line + ' ' + word : word;
        if (this.width(t, size, font) > maxW && line) { lines.push(line); line = word; } else line = t;
      }
      lines.push(line);
    }
    return lines;
  }
  title(str, sub) {
    this.rect(0, 0, this.W, 86, { fill: [0.09, 0.14, 0.1] });
    this.rect(0, 86, this.W, 4, { fill: this.accent });
    this.text(str, this.m, 26, { font: 'tb', color: [1, 1, 1], baseline: 26 });
    if (sub) this.text(sub, this.m, 10.5, { color: [0.75, 0.88, 0.7], baseline: 62 });
    this.y = 112;
  }
  h2(str) { this.ensure(34); this.y += 10; this.text(str, this.m, 13.5, { font: 'tb', color: [0.18, 0.42, 0.12] }); this.y += 18; this.rule(this.accent, 1); this.y += 8; }
  p(str, { size = 10.5, font = 'r', color, indent = 0, gap = 4 } = {}) {
    for (const ln of this.wrap(str, size, this.W - this.m * 2 - indent, font)) { this.ensure(size + 4); this.text(ln, this.m + indent, size, { font, color }); this.y += size + 4; }
    this.y += gap;
  }
  /** Checkbox row: [ ] label ............ right */
  checkRow(label, right = '', { checked = false, note = '' } = {}) {
    this.ensure(20);
    const x = this.m;
    this.rect(x, this.y + 1, 10, 10, { stroke: [0.2, 0.45, 0.12], lw: 1, fill: checked ? [0.85, 0.93, 0.8] : null });
    if (checked) this.text('x', x + 2.4, 9, { font: 'b', color: [0.2, 0.45, 0.12], baseline: this.y + 1 });
    const col = checked ? [0.6, 0.62, 0.6] : [0.1, 0.12, 0.1];
    this.text(label, x + 18, 10.5, { color: col });
    if (note) this.text(note, x + 22 + this.width(label, 10.5), 8.5, { color: [0.5, 0.55, 0.5], baseline: this.y + 1.5 });
    if (right) this.text(right, this.W - this.m - this.width(right, 10.5), 10.5, { color: col });
    this.y += 17;
    this.rule([0.92, 0.94, 0.9], 0.4);
    this.y += 3;
  }
  kv(label, value) { this.ensure(16); this.text(label, this.m, 10, { color: [0.45, 0.5, 0.45] }); this.text(value, this.m + 120, 10, { font: 'b' }); this.y += 15; }
  gap(n = 8) { this.y += n; }

  build() {
    const n = this.pages.length;
    this.pages.forEach((ops, i) => ops.push(`BT /F1 8 Tf 0.5 0.55 0.5 rg ${this.m} 28 Td (${esc(toWin(this.footer))}) Tj ET`, `BT /F1 8 Tf 0.5 0.55 0.5 rg ${this.W - this.m - 40} 28 Td (Page ${i + 1} of ${n}) Tj ET`));
    const objs = [];
    const add = (s) => { objs.push(s); return objs.length; };
    add('<< /Type /Catalog /Pages 2 0 R >>');
    add(''); // pages placeholder
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman /Encoding /WinAnsiEncoding >>');
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold /Encoding /WinAnsiEncoding >>');
    const kids = [];
    for (const ops of this.pages) {
      const stream = ops.join('\n');
      const c = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
      const p = add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.W} ${this.H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R /F4 6 0 R >> >> /Contents ${c} 0 R >>`);
      kids.push(`${p} 0 R`);
    }
    objs[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`;
    let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
    const offsets = [];
    objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
    out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
    return new Blob([bytes], { type: 'application/pdf' });
  }
}
