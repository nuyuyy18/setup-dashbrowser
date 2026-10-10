const http = require('http');
const path = require('path');
const fs = require('fs');
const store = require('./store');
const bm = require('./browserManager');
const { parseCookies, parseSpreadsheet } = require('./cookieHelper');
const bundleHelper = require('./bundleHelper');

const PORT = 8200;
const STATIC = path.resolve(__dirname, '../web');
const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.ico': 'image/x-icon', '.png': 'image/png', '.jpg': 'image/jpeg'
};

function serve(res, filePath) {
  const mime = MIME[path.extname(filePath)] || 'application/octet-stream';
  try { res.writeHead(200, { 'Content-Type': mime }); res.end(fs.readFileSync(filePath)); }
  catch { res.writeHead(404); res.end('Not found'); }
}

function json(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise(resolve => {
    let buf = '';
    req.on('data', d => buf += d);
    req.on('end', () => { try { resolve(JSON.parse(buf)); } catch { resolve({}); } });
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,DELETE', 'Access-Control-Allow-Headers': 'Content-Type' });
    return res.end();
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;
  const id = url.searchParams.get('id');

  try {
    // Profile Management & 3H Bundles
    if (p === '/api/profiles' && req.method === 'GET') return json(res, 200, store.getProfiles());
    if (p === '/api/profiles' && req.method === 'POST') return json(res, 200, store.saveProfile(await readBody(req), id));
    if (p.startsWith('/api/profiles/') && p.endsWith('/bundle') && req.method === 'GET') {
      return json(res, 200, bundleHelper.createBundle(p.split('/')[3]));
    }
    if (p.startsWith('/api/profiles/') && req.method === 'DELETE') { store.deleteProfile(p.split('/').pop()); return json(res, 200, { ok: true }); }

    // Cookie Injection & Bulk Spreadsheets
    if (p === '/api/cookies/parse' && req.method === 'POST') {
      const body = await readBody(req);
      return json(res, 200, parseCookies(body.cookies, body.url || 'https://www.google.com'));
    }
    if (p === '/api/browser/inject-cookies' && req.method === 'POST') {
      const body = await readBody(req);
      const targetId = id || body.profileId;
      const parsed = parseCookies(body.cookies, body.url || 'https://www.google.com');
      if (!parsed.valid) return json(res, 400, { error: parsed.error || 'Invalid cookies format' });
      
      store.saveCookies(targetId, parsed.cookies);
      let liveResult = null;
      const status = bm.getStatus(targetId);
      if (status.running) {
        liveResult = await bm.injectCookies(targetId, parsed.cookies, body.navigateUrl || null);
      }
      return json(res, 200, { ok: true, count: parsed.cookies.length, liveInjected: status.running, liveResult });
    }
    if (p === '/api/bulk/parse' && req.method === 'POST') {
      const body = await readBody(req);
      return json(res, 200, parseSpreadsheet(body.rawText));
    }
    if (p === '/api/bulk/import' && req.method === 'POST') {
      const body = await readBody(req);
      const parsed = parseSpreadsheet(body.rawText);
      const validRows = parsed.rows.filter(r => r.isValidCookie);
      const created = store.bulkCreateProfiles(validRows);
      return json(res, 200, { ok: true, createdCount: created.length, created });
    }

    // VPN & Browser Control
    if (p === '/api/vpn/servers' && req.method === 'GET') return json(res, 200, { servers: bm.getVpnServers() });
    if (p === '/api/vpn/switch' && req.method === 'POST') {
      const body = await readBody(req);
      const loc = body.location;
      const result = bm.switchVpnServer(loc);
      if (id) store.saveProfile({ vpnNode: loc, useVpn: true }, id);
      return json(res, 200, result);
    }
    if (p === '/api/browser/launch' && req.method === 'POST') {
      const profile = store.getProfile(id);
      if (!profile) return json(res, 404, { error: 'Profile not found' });
      const result = await bm.launch(profile);
      store.saveProfile({ status: 'RUNNING' }, id);
      return json(res, 200, result);
    }
    if (p === '/api/browser/stop' && req.method === 'POST') {
      const result = await bm.stop(id);
      store.saveProfile({ status: 'STOPPED' }, id);
      return json(res, 200, result);
    }
    if (p === '/api/browser/status' && req.method === 'GET') return json(res, 200, bm.getStatus(id));
    if (p === '/api/browser/navigate' && req.method === 'POST') return json(res, 200, await bm.navigate(id, (await readBody(req)).url));
    if (p === '/api/browser/screenshot' && req.method === 'GET') {
      const img = await bm.screenshot(id);
      res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-cache, no-store' });
      return res.end(img);
    }
    if (p === '/api/browser/click' && req.method === 'POST') { const b = await readBody(req); return json(res, 200, await bm.click(id, b.x, b.y)); }
    if (p === '/api/browser/type' && req.method === 'POST') { const b = await readBody(req); return json(res, 200, await bm.type(id, b.text)); }
    if (p === '/api/browser/key' && req.method === 'POST') { const b = await readBody(req); return json(res, 200, await bm.keyPress(id, b.key)); }
    if (p === '/api/browser/scroll' && req.method === 'POST') { 
      const b = await readBody(req); 
      await bm.scroll(id, Number(b.deltaY) || 300, b.x, b.y);
      return json(res, 200, { ok: true }); 
    }

    // Google Sheets export webhook (Apps Script Web App)
    if (p === '/api/logs/export-sheets' && req.method === 'POST') {
      const body = await readBody(req);
      if (!Array.isArray(body.rows)) return json(res, 400, { error: 'rows must be an array' });
      const webhookUrl = 'https://script.google.com/macros/s/AKfycbzH-xT0qZYBmagmXS5HNbNmVjnprKWOu0gPedGy4qWsOgqoV53mChgbDoQC_7Kzpvmh6g/exec';
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ rows: body.rows }),
        redirect: 'follow'
      });
      const text = await response.text();
      let result;
      try { result = JSON.parse(text); } catch {
        throw new Error(`Apps Script response non-JSON (HTTP ${response.status})`);
      }
      if (!response.ok || result.ok !== true) throw new Error(result.error || `Apps Script HTTP ${response.status}`);
      return json(res, 200, result);
    }

    // Activity Logs / Tracking
    if (p === '/api/logs' && req.method === 'GET') return json(res, 200, store.getLogs());
    if (p === '/api/logs' && req.method === 'POST') return json(res, 200, store.saveLog(await readBody(req), id));
    if (p.startsWith('/api/logs/') && req.method === 'DELETE') { store.deleteLog(p.split('/').pop()); return json(res, 200, { ok: true }); }
    if (p === '/api/logs/clear' && req.method === 'POST') { store.clearLogs(); return json(res, 200, { ok: true }); }
  } catch (err) {
    if (!res.headersSent) {
      return json(res, 500, { error: err.message });
    }
    console.error('Error after headers sent:', err);
  }

  // Static files & SPA
  let filePath = path.join(STATIC, p === '/' ? 'index.html' : p);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) filePath = path.join(filePath, 'index.html');
  if (fs.existsSync(filePath)) return serve(res, filePath);
  serve(res, path.join(STATIC, 'index.html'));
});

server.listen(PORT, '127.0.0.1', () => console.log(`DashBrowser running on http://127.0.0.1:${PORT}`));
