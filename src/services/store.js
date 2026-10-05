const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');

const DATA = path.resolve('data');
const EXT_DIR = path.join(DATA, 'extensions');
const DB = path.join(DATA, 'db.json');

[DATA, EXT_DIR, path.join(DATA, 'profiles')].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

function readDB() {
  try { return JSON.parse(fs.readFileSync(DB, 'utf8')); }
  catch { return { profiles: [], extensions: [] }; }
}

function writeDB(data) {
  fs.writeFileSync(DB, JSON.stringify(data), 'utf8');
}

module.exports = {
  getProfiles: () => readDB().profiles,
  getProfile: (id) => readDB().profiles.find(p => p.id === id),
  saveProfile(data, id = null) {
    const db = readDB();
    if (id) {
      const idx = db.profiles.findIndex(p => p.id === id);
      if (idx !== -1) {
        db.profiles[idx] = { ...db.profiles[idx], ...data };
        writeDB(db);
        return db.profiles[idx];
      }
    }
    const profile = {
      id: crypto.randomUUID(),
      name: data.name || 'Account',
      color: data.color || '#2563eb',
      startUrl: data.startUrl || 'https://www.google.com',
      proxy: data.proxy || null,
      extensions: data.extensions || []
    };
    db.profiles.push(profile);
    writeDB(db);
    return profile;
  },
  deleteProfile(id) {
    const db = readDB();
    db.profiles = db.profiles.filter(p => p.id !== id);
    writeDB(db);
  },
  getExtensions: () => readDB().extensions,
  async importExt(filePath, isZip = false) {
    const id = crypto.randomUUID();
    const target = path.join(EXT_DIR, id);
    let manifest;
    if (isZip) {
      const zip = new AdmZip(filePath);
      const entry = zip.getEntries().find(e => e.entryName.endsWith('manifest.json'));
      if (!entry) throw new Error('manifest.json missing');
      manifest = JSON.parse(zip.readAsText(entry));
      fs.mkdirSync(target, { recursive: true });
      zip.extractAllTo(target, true);
    } else {
      const mfPath = path.join(filePath, 'manifest.json');
      if (!fs.existsSync(mfPath)) throw new Error('manifest.json missing');
      manifest = JSON.parse(fs.readFileSync(mfPath, 'utf8'));
      fs.cpSync(filePath, target, { recursive: true });
    }
    const ext = {
      id,
      name: manifest.name || 'Extension',
      version: manifest.version || '1.0',
      path: target
    };
    const db = readDB();
    db.extensions.push(ext);
    writeDB(db);
    return ext;
  },
  deleteExt(id) {
    const db = readDB();
    db.extensions = db.extensions.filter(e => e.id !== id);
    db.profiles.forEach(p => { p.extensions = p.extensions.filter(x => x !== id); });
    writeDB(db);
    const target = path.join(EXT_DIR, id);
    if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
  }
};
