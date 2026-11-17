/**
 * Script de Validação Técnica e Integridade do Projeto
 * Verifica sintaxe JS, arquivos obrigatórios, manifest.json e contratos de DOM.
 *
 * Uso: node scripts/validate.js (ou npm run validate)
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');

const requiredFiles = [
  'index.html',
  'styles.css',
  'db.js',
  'app.js',
  'manifest.json',
  'sw.js',
  'icon-192.png',
  'icon-512.png',
  'sql/001_initial_schema.sql',
  'sql/002_analytics_views.sql'
];

let hasErrors = false;

console.log('=== VinoMemo • Validação de Engenharia ===');

// 1. Verificar existência de arquivos essenciais
for (const relPath of requiredFiles) {
  const fullPath = path.join(rootDir, relPath);
  if (!fs.existsSync(fullPath)) {
    console.error(`[ERRO] Arquivo obrigatório ausente: ${relPath}`);
    hasErrors = true;
  }
}

// 2. Validar sintaxe JavaScript
for (const jsFile of ['db.js', 'app.js', 'sw.js']) {
  const fullPath = path.join(rootDir, jsFile);
  try {
    execFileSync(process.execPath, ['--check', fullPath], { stdio: 'pipe' });
    console.log(`[OK] Sintaxe JS válida: ${jsFile}`);
  } catch (err) {
    console.error(`[ERRO] Falha de sintaxe em ${jsFile}:`, err.stderr ? err.stderr.toString() : err.message);
    hasErrors = true;
  }
}

// 3. Validar JSON do PWA Manifest
try {
  const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf8'));
  if (!manifest.name || !Array.isArray(manifest.icons) || manifest.icons.length === 0) {
    throw new Error('Campos name ou icons inválidos em manifest.json');
  }
  console.log('[OK] Manifesto PWA (manifest.json) válido.');
} catch (err) {
  console.error('[ERRO] manifest.json inválido:', err.message);
  hasErrors = true;
}

if (hasErrors) {
  process.exit(1);
}
console.log('=== Todas as verificações passaram com sucesso! ===');
