/**
 * Script de Build: Gera o bundle standalone `vinomemo-mobile.html`
 * unificando index.html + styles.css + db.js + app.js em um único artefato portátil.
 *
 * Uso: node scripts/build-mobile.js (ou npm run build:mobile)
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const indexPath = path.join(rootDir, 'index.html');
const cssPath = path.join(rootDir, 'styles.css');
const dbPath = path.join(rootDir, 'db.js');
const appPath = path.join(rootDir, 'app.js');
const outPath = path.join(rootDir, 'vinomemo-mobile.html');

let html = fs.readFileSync(indexPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
const db = fs.readFileSync(dbPath, 'utf8');
const app = fs.readFileSync(appPath, 'utf8');

html = html.replace('<link rel="manifest" href="manifest.json" />', '');
html = html.replace('<link rel="stylesheet" href="styles.css" />', () => `<style>\n${css}\n</style>`);
html = html.replace(
  /<script src="db\.js"><\/script>\s*<script src="app\.js"><\/script>/,
  () => `<script>\n${db}\n\n${app}\n</script>`
);

fs.writeFileSync(outPath, html, 'utf8');
const sizeKb = (fs.statSync(outPath).size / 1024).toFixed(1);
console.log(`[build:mobile] Gerado com sucesso: vinomemo-mobile.html (${sizeKb} KB)`);
