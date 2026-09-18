#!/usr/bin/env node
// Cloudflare Pages silently drops any uploaded file whose path contains a
// "node_modules" segment (see cloudflare/workers-sdk#3615). expo-sqlite's
// web build ships its wa-sqlite WASM binary at exactly such a path --
// dist/assets/node_modules/expo-sqlite/web/wa-sqlite/*.wasm -- so it never
// reaches the deployed site and SQLite fails to initialize there, even
// though the same build works fine locally and on other hosts. This runs
// after `expo export -p web` to move the file to a node_modules-free path
// and rewrite the reference to it in the exported JS bundles.
const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, '..', 'dist');
const OLD_REL_DIR = 'assets/node_modules/expo-sqlite/web/wa-sqlite';
const NEW_REL_DIR = 'wasm';

const oldDir = path.join(DIST, OLD_REL_DIR);
const newDir = path.join(DIST, NEW_REL_DIR);

if (!fs.existsSync(oldDir)) {
  console.log(`[fix-wasm-path] ${OLD_REL_DIR} not found in this build, nothing to do.`);
  process.exit(0);
}

fs.mkdirSync(newDir, { recursive: true });
const wasmFiles = fs.readdirSync(oldDir).filter((f) => f.endsWith('.wasm'));
if (wasmFiles.length === 0) {
  console.error(`[fix-wasm-path] no .wasm file found in ${OLD_REL_DIR} -- expo-sqlite's web output may have changed.`);
  process.exit(1);
}

for (const file of wasmFiles) {
  fs.renameSync(path.join(oldDir, file), path.join(newDir, file));
  console.log(`[fix-wasm-path] moved ${file} -> ${NEW_REL_DIR}/`);
}

const jsDir = path.join(DIST, '_expo', 'static', 'js', 'web');
const oldRefPrefix = `/${OLD_REL_DIR}/`;
const newRefPrefix = `/${NEW_REL_DIR}/`;
let patchedCount = 0;
for (const file of fs.readdirSync(jsDir).filter((f) => f.endsWith('.js'))) {
  const filePath = path.join(jsDir, file);
  const contents = fs.readFileSync(filePath, 'utf8');
  if (contents.includes(oldRefPrefix)) {
    fs.writeFileSync(filePath, contents.split(oldRefPrefix).join(newRefPrefix));
    patchedCount++;
    console.log(`[fix-wasm-path] patched reference in ${file}`);
  }
}
console.log(`[fix-wasm-path] done -- patched ${patchedCount} file(s).`);
