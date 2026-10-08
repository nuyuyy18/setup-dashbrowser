const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth);

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

  const userAgent = profile.userAgent || undefined;
  const vpnNode = (profile.vpnNode || 'indonesia').toLowerCase();
  
  if (profile.useVpn !== false) {
    switchVpnServer(vpnNode);
  }

  const args = [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--mute-audio',
    '--autoplay-policy=document-user-activation-required',
    '--no-first-run',
    '--lang=id-ID,id,en-US,en',
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
    // Only pass userAgent if explicitly set, else rely on native Chrome version to bypass Client Hints mismatch
    const launchOptions = {
      executablePath: getChromeExecutable(),
      headless: process.env.HEADLESS !== 'false',
      args,
      proxy: proxyConfig,
      viewport: { width: 1280, height: 950 },
      locale: 'id-ID',
      timezoneId: 'Asia/Jakarta'
    };
    if (userAgent) launchOptions.userAgent = userAgent;

    ctx = await chromium.launchPersistentContext(userDir, launchOptions);

    if (profile.cookies && Array.isArray(profile.cookies) && profile.cookies.length > 0) {
      try { await ctx.addCookies(profile.cookies); } catch (e) {}
    }

    const pages = ctx.pages();
    page = pages[0] || await ctx.newPage();

    // Universal Anti-Detection & reCAPTCHA / Cloudflare bypass script
    await ctx.addInitScript(() => {
      // 1. Remove automation flags
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      delete navigator.__proto__.webdriver;

      // 2. Realistic plugins array
      Object.defineProperty(navigator, 'plugins', {
        get: () => [
          { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
          { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
          { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' }
        ]
      });

      // 3. Realistic languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['id-ID', 'id', 'en-US', 'en']
      });

      // 4. Mimic genuine window.chrome
      window.chrome = {
        app: { isInstalled: false, InstallState: { DISABLED: 'DISABLED', INSTALLED: 'INSTALLED', NOT_INSTALLED: 'NOT_INSTALLED' }, RunningState: { CANNOT_RUN: 'CANNOT_RUN', READY_TO_RUN: 'READY_TO_RUN', RUNNING: 'RUNNING' } },
        runtime: { OnInstalledReason: { CHROME_UPDATE: 'chrome_update', INSTALL: 'install', SHARED_MODULE_UPDATE: 'shared_module_update', UPDATE: 'update' }, OnRestartRequiredReason: { APP_UPDATE: 'app_update', OS_UPDATE: 'os_update', PERIODIC: 'periodic' }, PlatformArch: { ARM: 'arm', ARM64: 'arm64', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' }, PlatformNaclArch: { ARM: 'arm', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' }, PlatformOs: { ANDROID: 'android', CROS: 'cros', LINUX: 'linux', MAC: 'mac', OPENBSD: 'openbsd', WIN: 'win' }, RequestUpdateCheckStatus: { NO_UPDATE: 'no_update', THROTTLED: 'throttled', UPDATE_AVAILABLE: 'update_available' } }
      };

      // 5. Realistic permissions query
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = parameters => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission }) :
          originalQuery(parameters)
      );

      // 6. Realistic WebGL vendor/renderer spoofing (Intel/Nvidia desktop)
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(parameter) {
        if (parameter === 37445) return 'Google Inc. (NVIDIA)';
        if (parameter === 37446) return 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Direct3D11 vs_5_0 ps_5_0, D3D11)';
        return getParameter.apply(this, [parameter]);
      };
    });

    // Viewport height 950 ensures entire Instagram Reel dialog and bottom comment input box are fully visible
    await page.setViewportSize({ width: 1280, height: 950 });
    
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

async function scroll(profileId, deltaY, x, y) {
  const s = sessions.get(profileId);
  if (!s) throw new Error('Browser not running');
  s.lastActive = Date.now();
  
  // Jika koordinat kursor diberikan, pindahkan mouse ke titik tersebut terlebih dahulu
  // agar scroll terjadi tepat di atas elemen tersebut (misalnya kolom komentar modal Instagram)
  if (x !== undefined && y !== undefined) {
    await s.page.mouse.move(x, y);
  }
  
  await s.page.mouse.wheel(0, deltaY);
  return { ok: true };
}

module.exports = {
  launch, stop, navigate, injectCookies, screenshot,
  click, type, keyPress, scroll, getStatus, getVpnServers,
  switchVpnServer, DEFAULT_USER_AGENT
};
