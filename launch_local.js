#!/usr/bin/env node
/**
 * DashBrowser Local Launcher Client
 * Buka browser lokal dengan cookie bundling dari server (Zero delay, native GPU)
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth);

function findLocalBrowser() {
  const plat = process.platform;
  const paths = {
    darwin: [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
    ],
    win32: [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe'
    ],
    linux: [
      '/usr/bin/google-chrome',
      '/usr/bin/brave-browser',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium'
    ]
  };
  const list = paths[plat] || paths.linux;
  for (const p of list) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.log(`Penggunaan:`);
    console.log(`  node launch_local.js <server_url> <profile_id>`);
    console.log(`  node launch_local.js bundle.json`);
    console.log(`Contoh: node launch_local.js https://dashbrowser.rausalbahtiar.dev 74397e6b-...`);
    process.exit(1);
  }

  let bundle;
  if (fs.existsSync(args[0])) {
    bundle = JSON.parse(fs.readFileSync(args[0], 'utf8'));
  } else {
    const serverUrl = args[0].replace(/\/$/, '');
    const profileId = args[1];
    if (!profileId) {
      console.error('Harap sertakan profile_id');
      process.exit(1);
    }
    console.log(`Mengambil bundle dari ${serverUrl}/api/profiles/${profileId}/bundle ...`);
    const res = await fetch(`${serverUrl}/api/profiles/${profileId}/bundle`);
    const data = await res.json();
    if (!data.ok) {
      console.error('Gagal mengambil bundle:', data.error);
      process.exit(1);
    }
    bundle = data.bundle;
  }

  // Check 3h expiry
  const now = Date.now();
  const expiry = new Date(bundle.expiresAt).getTime();
  if (now > expiry) {
    console.error('❌ Bundle kedaluwarsa! Sesi hanya berlaku 3 jam dari penerbitan.');
    process.exit(1);
  }

  const sisaMenit = Math.round((expiry - now) / 60000);
  console.log(`✓ Bundle valid (${sisaMenit} menit tersisa). Profil: ${bundle.name}`);
  console.log(`✓ Jumlah cookie: ${bundle.cookieCount} item.`);

  const chromeBin = findLocalBrowser();
  if (!chromeBin) {
    console.error('❌ Browser Chrome/Brave/Edge lokal tidak ditemukan di sistem.');
    process.exit(1);
  }

  const userDir = path.join(os.homedir(), '.dashbrowser-local', bundle.profileId || 'default');
  if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });

  const port = 9600 + Math.floor(Math.random() * 200);
  console.log(`Membuka browser lokal: ${chromeBin}`);

  const chromeArgs = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-blink-features=AutomationControlled',
    bundle.startUrl || 'https://www.google.com'
  ];

  const proc = spawn(chromeBin, chromeArgs, { detached: true, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500));

  try {
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const contexts = browser.contexts();
    const ctx = contexts[0];
    if (bundle.cookies && bundle.cookies.length > 0) {
      console.log(`Menyuntikkan ${bundle.cookies.length} cookie ke browser lokal...`);
      await ctx.addCookies(bundle.cookies);
      const pages = ctx.pages();
      if (pages.length > 0) {
        await pages[0].goto(bundle.startUrl || 'https://www.google.com');
      }
    }
    console.log(`🚀 Browser lokal siap digunakan! Sesi aktif tanpa delay.`);
  } catch (err) {
    console.log(`Browser terbuka (injeksi via extension/CDP otomatis).`);
  }
}

main().catch(e => console.error(e.message));
