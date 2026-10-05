const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bm = require('./browserManager');

const DATA = path.resolve(__dirname, '../data');
const EXT_DIR = path.join(DATA, 'extensions');
const DB = path.join(DATA, 'db.json');

[DATA, EXT_DIR, path.join(DATA, 'profiles')].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

function readDB() {
  try {
    const raw = fs.readFileSync(DB, 'utf8');
    const data = JSON.parse(raw);
    if (!data.profiles) data.profiles = [];
    if (!data.extensions) data.extensions = [];
    if (!data.logs) data.logs = [];
    return data;
  } catch {
    return { profiles: [], extensions: [], logs: [] };
  }
}

function writeDB(data) {
  fs.writeFileSync(DB, JSON.stringify(data, null, 2), 'utf8');
}

module.exports = {
  getProfiles: () => readDB().profiles,
  getProfile: (id) => readDB().profiles.find(p => p.id === id),
  
  saveProfile(data, id = null) {
    const db = readDB();
    if (id) {
      const idx = db.profiles.findIndex(p => p.id === id);
      if (idx !== -1) {
        db.profiles[idx] = { ...db.profiles[idx], ...data, updatedAt: new Date().toISOString() };
        writeDB(db);
        return db.profiles[idx];
      }
    }
    const profile = {
      id: crypto.randomUUID(),
      name: data.name || 'Account',
      color: data.color || '#0A84FF',
      startUrl: data.startUrl || 'https://www.google.com',
      userAgent: data.userAgent || bm.DEFAULT_USER_AGENT,
      useVpn: data.useVpn !== undefined ? data.useVpn : true,
      vpnNode: data.vpnNode || 'indonesia',
      proxy: data.proxy || null,
      cookies: data.cookies || [],
      extensions: data.extensions || [],
      status: 'STOPPED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.profiles.push(profile);
    writeDB(db);
    return profile;
  },

  saveCookies(profileId, cookies) {
    const db = readDB();
    const p = db.profiles.find(x => x.id === profileId);
    if (p) {
      p.cookies = cookies;
      p.updatedAt = new Date().toISOString();
      writeDB(db);
      return p;
    }
    return null;
  },

  bulkCreateProfiles(list) {
    const db = readDB();
    const created = [];
    const colors = ['#0A84FF', '#30D158', '#FF9F0A', '#BF5AF2', '#64D2FF', '#FF375F', '#FFD60A'];
    
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      const p = {
        id: crypto.randomUUID(),
        name: item.name || `Account ${db.profiles.length + 1}`,
        color: colors[(db.profiles.length + i) % colors.length],
        startUrl: item.startUrl || 'https://www.google.com',
        userAgent: item.userAgent || bm.DEFAULT_USER_AGENT,
        useVpn: item.useVpn !== undefined ? item.useVpn : true,
        vpnNode: item.vpnNode || 'indonesia',
        proxy: item.proxy || null,
        cookies: item.cookies || [],
        extensions: [],
        status: 'STOPPED',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      db.profiles.push(p);
      created.push(p);
    }
    writeDB(db);
    return created;
  },

  deleteProfile(id) {
    const db = readDB();
    db.profiles = db.profiles.filter(p => p.id !== id);
    writeDB(db);
  },

  getExtensions: () => readDB().extensions,
  deleteExt(id) {
    const db = readDB();
    db.extensions = db.extensions.filter(e => e.id !== id);
    db.profiles.forEach(p => { p.extensions = (p.extensions || []).filter(x => x !== id); });
    writeDB(db);
    const target = path.join(EXT_DIR, id);
    if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
  },

  // Activity / Post tracking logs
  getLogs: () => readDB().logs || [],
  saveLog(data, id = null) {
    const db = readDB();
    if (!db.logs) db.logs = [];
    if (id) {
      const idx = db.logs.findIndex(l => l.id === id);
      if (idx !== -1) {
        db.logs[idx] = { ...db.logs[idx], ...data, updatedAt: new Date().toISOString() };
        writeDB(db);
        return db.logs[idx];
      }
    }
    const item = {
      id: crypto.randomUUID(),
      postUrl: data.postUrl || '',
      action: data.action || 'Komen',
      accountName: data.accountName || '',
      profileId: data.profileId || '',
      note: data.note || '',
      status: data.status || 'Success',
      createdAt: new Date().toISOString()
    };
    db.logs.unshift(item); // Newest first
    writeDB(db);
    return item;
  },

  deleteLog(id) {
    const db = readDB();
    if (!db.logs) return;
    db.logs = db.logs.filter(l => l.id !== id);
    writeDB(db);
  },

  clearLogs() {
    const db = readDB();
    db.logs = [];
    writeDB(db);
  }
};
