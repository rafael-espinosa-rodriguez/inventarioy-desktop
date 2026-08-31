// Convierte un .md a HTML autocontenido para imprimir a PDF.
// Uso: node scripts/md-to-html.mjs <entrada.md> <salida.html> [--pdf]
// Con --pdf genera además el PDF (Chrome/Edge instalado en el sistema).
import fs from 'node:fs';
import path from 'node:path';

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
body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; font-size: 11pt; line-height: 1.5; max-width: 720px; margin: 0 auto; }
h1 { color: #111111; border-bottom: 3px solid #FFC107; padding-bottom: 6px; }
h2 { color: #1a1a1a; margin-top: 22px; border-bottom: 1px solid #e4e4e7; padding-bottom: 4px; }
h3 { color: #71717a; margin-top: 16px; }
code { background: #f5f5f5; padding: 1px 4px; border-radius: 4px; font-family: Consolas, monospace; font-size: 10pt; color: #111111; }
table { border-collapse: collapse; width: 100%; margin: 10px 0; }
th, td { border: 1px solid #e4e4e7; padding: 6px 10px; text-align: left; vertical-align: top; }
th { background: #FFC107; color: #1a1a1a; }
blockquote { border-left: 4px solid #FFC107; margin: 12px 0; padding: 4px 14px; background: #f5f5f5; color: #71717a; }
ul, ol { padding-left: 22px; }
li { margin: 3px 0; }
hr { border: none; border-top: 1px solid #e4e4e7; margin: 18px 0; }
strong { color: #111111; }
`;

const args = process.argv.slice(2);
const wantPdf = args.includes('--pdf');
const positional = args.filter((a) => a !== '--pdf');
const [input, output] = positional;
if (!input || !output) {
  console.error('Uso: node scripts/md-to-html.mjs <entrada.md> <salida.html> [--pdf]');
  process.exit(1);
}

// ---------- Generación de PDF (Chrome/Edge del sistema, sin descargar navegadores) ----------
async function launchChromium() {
  const { chromium } = await import('playwright');
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ];
  for (const exe of candidates) {
    if (fs.existsSync(exe)) {
      try {
        return await chromium.launch({ executablePath: exe, headless: true });
      } catch (err) {
        console.warn(`No se pudo lanzar ${exe}: ${err.message}`);
      }
    }
  }
  return chromium.launch({ channel: 'chrome', headless: true });
}

async function htmlToPdf(htmlPath, pdfPath) {
  const browser = await launchChromium();
  try {
    const page = await browser.newPage();
    await page.goto('file:///' + path.resolve(htmlPath).replace(/\\/g, '/'));
    await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, preferCSSPageSize: true });
  } finally {
    await browser.close();
  }
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

if (wantPdf) {
  const pdfPath = output.replace(/\.html$/i, '.pdf');
  try {
    await htmlToPdf(output, pdfPath);
    console.log(`OK: ${pdfPath}`);
  } catch (err) {
    console.error(`No se pudo generar el PDF: ${err.message}`);
    process.exit(1);
  }
}
