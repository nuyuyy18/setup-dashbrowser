const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');

function getChromeExecutable() {
  if (process.platform === 'win32') {
    const progFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
    const progFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const localAppData = process.env['LOCALAPPDATA'] || '';

    const candidates = [
      path.join(progFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(progFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(progFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(progFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
    ];

    for (const p of candidates) {
      if (p && fs.existsSync(p)) {
        return p;
      }
    }

    try {
      const out = execSync('where chrome 2>nul || where msedge 2>nul', { encoding: 'utf8' }).trim().split('\n')[0].trim();
      if (out && fs.existsSync(out)) {
        return out;
      }
    } catch {}

    throw new Error('Google Chrome atau Microsoft Edge tidak ditemukan di komputer ini! Mohon instal Chrome atau Edge lalu jalankan ulang.');
  }

  const linuxBins = [
    '/opt/data/home/.cloakbrowser/chromium-146.0.7680.177.5/chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium'
  ];
  for (const b of linuxBins) {
    if (fs.existsSync(b)) return b;
  }
  return 'google-chrome';
}

const CHROME_BIN = getChromeExecutable();
const DATA_DIR = path.resolve(__dirname, '../data/profiles');
const SERVERS_FILE = process.platform === 'win32' ? path.resolve(__dirname, '../data/servers.json') : '/opt/data/surfshark/servers.json';
const sessions = new Map();

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36';

function getVpnServers() {
  try {
    if (fs.existsSync(SERVERS_FILE)) {
      return Object.keys(JSON.parse(fs.readFileSync(SERVERS_FILE, 'utf8')));
    }
  } catch {}
  return ['indonesia', 'singapore', 'malaysia', 'japan', 'korsel', 'us', 'uk-london', 'germany-berlin'];
}

function switchVpnServer(location) {
  try {
    if (process.platform === 'win32') {
      // Di Windows, bypass VPN script VPS tanpa crash
      return { ok: true, location: location || 'direct' };
    }
    const loc = (location || 'indonesia').toLowerCase().trim();
    const vpnScript = '/opt/data/surfshark/switch_vpn.sh';
    if (fs.existsSync(vpnScript)) {
      execSync(`${vpnScript} ${loc}`, { stdio: 'ignore' });
      return { ok: true, location: loc };
    }
    return { ok: true, location: 'mock' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// Clean exit hook to close all active browser sessions
process.on('exit', () => {
  for (const [, s] of sessions.entries()) {
    try { s.ctx.close(); } catch {}
  }
});
process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));

async function launch(profile) {
  if (sessions.has(profile.id)) return getStatus(profile.id);

  const userDir = path.join(DATA_DIR, profile.id);
  if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });

  const userAgent = profile.userAgent || DEFAULT_USER_AGENT;
  const vpnNode = (profile.vpnNode || 'indonesia').toLowerCase();
  
  if (profile.useVpn !== false) {
    switchVpnServer(vpnNode);
  }

  const args = [
    '--no-sandbox',
    '--disable-gpu',
    '--disable-software-rasterizer',
    '--disable-dev-shm-usage',
    '--mute-audio',
    '--autoplay-policy=document-user-activation-required',
    '--disable-background-networking',
    '--disable-breakpad',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-domain-reliability',
    '--disable-sync',
    '--no-first-run',
    '--lang=id-ID,id,en-US,en',
    '--metrics-recording-only',
    '--js-flags=--max-old-space-size=256',
    '--hide-scrollbars',
    '--disable-blink-features=AutomationControlled'
  ];

  let proxyConfig;
  if (profile.proxy && profile.proxy.host && profile.proxy.port) {
    const proto = (profile.proxy.type || 'http').toLowerCase();
    proxyConfig = { server: `${proto}://${profile.proxy.host}:${profile.proxy.port}` };
  } else {
    // Never force proxy unless explicitly configured by user
    proxyConfig = undefined;
  }

  let ctx, page;
  try {
    ctx = await chromium.launchPersistentContext(userDir, {
      executablePath: getChromeExecutable(),
      headless: true,
      args,
      proxy: proxyConfig,
      viewport: { width: 1280, height: 800 },
      userAgent,
      locale: 'id-ID',
      timezoneId: 'Asia/Jakarta'
    });

    if (profile.cookies && Array.isArray(profile.cookies) && profile.cookies.length > 0) {
      try { await ctx.addCookies(profile.cookies); } catch (e) {}
    }

    const pages = ctx.pages();
    page = pages[0] || await ctx.newPage();
    // Viewport size matching desktop browser
    await page.setViewportSize({ width: 1280, height: 800 });
    
    // Initial navigation
    const targetUrl = profile.startUrl || 'https://www.google.com';
    try {
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
    } catch (e) {
      // Non-fatal on slow network
    }
  } catch (err) {
    if (ctx) try { await ctx.close(); } catch {}
    throw new Error('Failed to launch CloakBrowser: ' + err.message);
  }

  const s = {
    ctx, page,
    url: page.url(),
    title: await page.title(),
    vpnNode,
    lastActive: Date.now()
  };
  sessions.set(profile.id, s);
  return { running: true, url: s.url, title: s.title };
}

async function stop(profileId) {
  const s = sessions.get(profileId);
  if (!s) return { running: false };
  try { await s.ctx.close(); } catch {}
  sessions.delete(profileId);
  return { running: false };
}

async function navigate(profileId, url) {
  const s = sessions.get(profileId);
  if (!s) throw new Error('Browser not running');
  s.lastActive = Date.now();
  let target = (url || '').trim();
  if (!target) target = 'https://www.google.com';
  if (!target.startsWith('http://') && !target.startsWith('https://')) {
    target = target.includes('.') && !target.includes(' ') ? 'https://' + target : `https://www.google.com/search?q=${encodeURIComponent(target)}`;
  }
  await s.page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 });
  s.url = s.page.url();
  s.title = await s.page.title();
  return { url: s.url, title: s.title };
}

async function injectCookies(profileId, cookies, navigateUrl = null) {
  const s = sessions.get(profileId);
  if (!s) throw new Error('Browser not running');
  s.lastActive = Date.now();
  await s.ctx.addCookies(cookies);
  if (navigateUrl) {
    await s.page.goto(navigateUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } else {
    await s.page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
  }
  s.url = s.page.url();
  s.title = await s.page.title();
  return { ok: true, count: cookies.length, url: s.url, title: s.title };
}

async function screenshot(profileId) {
  const s = sessions.get(profileId);
  if (!s) throw new Error('Browser not running');
  // High Definition (HD) screenshot quality
  return s.page.screenshot({ type: 'jpeg', quality: 90, timeout: 5000 });
}

async function click(profileId, x, y) {
  const s = sessions.get(profileId);
  if (!s) throw new Error('Browser not running');
  s.lastActive = Date.now();
  await s.page.mouse.click(x, y);
  return { ok: true, url: s.page.url(), title: await s.page.title() };
}

async function type(profileId, text) {
  const s = sessions.get(profileId);
  if (!s) throw new Error('Browser not running');
  s.lastActive = Date.now();
  await s.page.keyboard.type(text);
  return { ok: true };
}

async function keyPress(profileId, key) {
  const s = sessions.get(profileId);
  if (!s) throw new Error('Browser not running');
  s.lastActive = Date.now();
  await s.page.keyboard.press(key);
  return { ok: true, url: s.page.url(), title: await s.page.title() };
}

function getStatus(profileId) {
  const s = sessions.get(profileId);
  return s ? { running: true, url: s.page.url(), title: s.title, vpnNode: s.vpnNode } : { running: false };
}

async function scroll(profileId, deltaY) {
  const s = sessions.get(profileId);
  if (!s) throw new Error('Browser not running');
  s.lastActive = Date.now();
  await s.page.mouse.wheel(0, deltaY);
  return { ok: true };
}

module.exports = {
  launch, stop, navigate, injectCookies, screenshot,
  click, type, keyPress, scroll, getStatus, getVpnServers,
  switchVpnServer, DEFAULT_USER_AGENT
};
