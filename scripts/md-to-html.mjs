// Convierte un .md a HTML autocontenido para imprimir a PDF.
// Uso: node scripts/md-to-html.mjs <entrada.md> <salida.html>
import fs from 'node:fs';

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function inline(s) {
  let r = escapeHtml(s);
  r = r.replace(/`([^`]+)`/g, '<code>$1</code>');
  r = r.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  r = r.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return r;
}

function parseRow(row) {
  return row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

function renderTable(rows) {
  const header = parseRow(rows[0]);
  const body = [];
  for (let j = 1; j < rows.length; j++) {
    const cells = parseRow(rows[j]);
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
    body.push(cells);
  }
  const thead = `<thead><tr>${header.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${body
    .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
    .join('')}</tbody>`;
  return `<table>${thead}${tbody}</table>`;
}

function convert(md) {
  const lines = md.split(/\r?\n/);
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) {
      i++;
      continue;
    }
    if (line.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(lines[i]);
        i++;
      }
      out.push(renderTable(rows));
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const lvl = heading[1].length;
      out.push(`<h${lvl}>${inline(heading[2])}</h${lvl}>`);
      i++;
      continue;
    }
    if (/^---+$/.test(line) || /^\*+$/.test(line)) {
      out.push('<hr />');
      i++;
      continue;
    }
    if (line.startsWith('>')) {
      const q = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        q.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      out.push(`<blockquote>${inline(q.join(' '))}</blockquote>`);
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ''));
        i++;
      }
      out.push(`<ul>${items.map((x) => `<li>${inline(x)}</li>`).join('')}</ul>`);
      continue;
    }
    if (/^\d+[.)]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+[.)]\s+/, ''));
        i++;
      }
      out.push(`<ol>${items.map((x) => `<li>${inline(x)}</li>`).join('')}</ol>`);
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim()) {
      const t = lines[i].trim();
      if (/^#{1,6}\s/.test(t) || /^[-*]\s/.test(t) || /^\d+[.)]\s/.test(t) || /^---+$/.test(t) || /^\*+$/.test(t) || t.startsWith('|') || t.startsWith('>')) break;
      para.push(t);
      i++;
    }
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return out.join('\n');
}

const CSS = `
@page { size: A4; margin: 16mm 14mm; }
body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; font-size: 11pt; line-height: 1.5; max-width: 720px; margin: 0 auto; }
h1 { color: #0f766e; border-bottom: 2px solid #0f766e; padding-bottom: 6px; }
h2 { color: #0f766e; margin-top: 22px; border-bottom: 1px solid #d1d5db; padding-bottom: 4px; }
h3 { color: #374151; margin-top: 16px; }
code { background: #f3f4f6; padding: 1px 4px; border-radius: 4px; font-family: Consolas, monospace; font-size: 10pt; }
table { border-collapse: collapse; width: 100%; margin: 10px 0; }
th, td { border: 1px solid #d1d5db; padding: 6px 10px; text-align: left; vertical-align: top; }
th { background: #f0fdfa; }
blockquote { border-left: 4px solid #0f766e; margin: 12px 0; padding: 4px 14px; background: #f8fafc; color: #475569; }
ul, ol { padding-left: 22px; }
li { margin: 3px 0; }
hr { border: none; border-top: 1px solid #e5e7eb; margin: 18px 0; }
strong { color: #111827; }
`;

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('Uso: node scripts/md-to-html.mjs <entrada.md> <salida.html>');
  process.exit(1);
}

const md = fs.readFileSync(input, 'utf8');
const body = convert(md);
const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(input.split(/[\\/]/).pop().replace(/\.md$/, ''))}</title>
<style>${CSS}</style>
</head>
<body>
${body}
</body>
</html>
`;
fs.writeFileSync(output, html, 'utf8');
console.log(`OK: ${output}`);
