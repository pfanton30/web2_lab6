const fs = require('fs');
const path = require('path');

// folderi
const SRC = path.join(__dirname, 'public');
const DIST = path.join(__dirname, 'dist');

// helper za kopiranje foldera
function copyFolder(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (let entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyFolder(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// izbriši stari dist ako postoji
if (fs.existsSync(DIST)) {
  fs.rmSync(DIST, { recursive: true, force: true });
}

// kopiraj src u dist
copyFolder(SRC, DIST);
