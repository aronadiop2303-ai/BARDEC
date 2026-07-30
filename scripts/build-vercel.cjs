#!/usr/bin/env node
/**
 * scripts/build-vercel.cjs
 *
 * Script de build Vercel pour la version web de BARDEC.
 *
 * Étapes :
 *  1. Patch temporaire de app.json → experiments.baseUrl = "/app"
 *     (les assets seront référencés en /app/_expo/… dans l'index.html généré)
 *  2. expo export --platform web  →  artifacts/mobile/dist/
 *  3. Restauration de app.json (même en cas d'erreur)
 *  4. Copie de dist/ → vercel-dist/app/
 *
 * Le dossier vercel-dist/ est le outputDirectory déclaré dans vercel.json.
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT     = path.resolve(__dirname, '..');
const APP_JSON = path.resolve(ROOT, 'artifacts/mobile/app.json');
const DIST_DIR = path.resolve(ROOT, 'artifacts/mobile/dist');
const OUT_DIR  = path.resolve(ROOT, 'vercel-dist/app');

// ── 1. Patch app.json ────────────────────────────────────────────────────────
const originalAppJson = fs.readFileSync(APP_JSON, 'utf-8');
const appJson = JSON.parse(originalAppJson);
appJson.expo.experiments = { ...appJson.expo.experiments, baseUrl: '/app' };
fs.writeFileSync(APP_JSON, JSON.stringify(appJson, null, 2));
console.log('✓ app.json patché : experiments.baseUrl = "/app"');

// ── 2. Export web ────────────────────────────────────────────────────────────
try {
  execSync('pnpm --filter @workspace/mobile run build:web', {
    stdio: 'inherit',
    cwd: ROOT,
  });
  console.log('✓ expo export --platform web terminé');
} catch (err) {
  fs.writeFileSync(APP_JSON, originalAppJson);
  console.error('✗ expo export a échoué — app.json restauré');
  process.exit(1);
}

// ── 3. Restaurer app.json ────────────────────────────────────────────────────
fs.writeFileSync(APP_JSON, originalAppJson);
console.log('✓ app.json restauré');

// ── 4. Copie dist/ → vercel-dist/app/ ───────────────────────────────────────
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    entry.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  }
}

if (fs.existsSync(OUT_DIR)) fs.rmSync(OUT_DIR, { recursive: true });
copyDir(DIST_DIR, OUT_DIR);

const fileCount = execSync(`find "${OUT_DIR}" -type f | wc -l`).toString().trim();
console.log(`✓ ${fileCount} fichiers copiés → vercel-dist/app/`);
console.log('\n🎉 Build Vercel terminé. Dossier de sortie : vercel-dist/');
