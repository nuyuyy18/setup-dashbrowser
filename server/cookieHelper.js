/**
 * DashBrowser Cookie & Spreadsheet Parser Helper
 */
const { URL } = require('url');

function extractDomain(urlStr) {
  try {
    const u = new URL(urlStr.startsWith('http') ? urlStr : `https://${urlStr}`);
    return u.hostname;
  } catch {
    return 'localhost';
  }
}

function parseCookies(input, defaultUrl = 'https://www.google.com') {
  if (!input) return { valid: false, cookies: [], error: 'Input is empty' };
  const fallbackDomain = extractDomain(defaultUrl);
  let raw = typeof input === 'string' ? input.trim() : input;

  // 1. If already an array
  if (Array.isArray(raw)) {
    return normalizeCookieArray(raw, fallbackDomain);
  }

  // 2. Try JSON Array
  if (typeof raw === 'string' && (raw.startsWith('[') || raw.startsWith('{'))) {
    try {
      const parsed = JSON.parse(raw);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      return normalizeCookieArray(arr, fallbackDomain);
    } catch (e) {
      // Continue to string parsing
    }
  }

  // 3. Netscape / curl format (tab-separated)
  if (typeof raw === 'string' && raw.includes('\t')) {
    const lines = raw.split(/\r?\n/).filter(l => l.trim() && !l.startsWith('#'));
    const cookies = [];
    for (const line of lines) {
      const parts = line.split('\t').map(p => p.trim());
      if (parts.length >= 7) {
        cookies.push({
          domain: parts[0] || fallbackDomain,
          path: parts[2] || '/',
          secure: parts[3] === 'TRUE',
          expires: parseInt(parts[4]) || -1,
          name: parts[5],
          value: parts[6]
        });
      }
    }
    if (cookies.length > 0) return normalizeCookieArray(cookies, fallbackDomain);
  }

  // 4. Semicolon key-value string: "name=val; name2=val2"
  if (typeof raw === 'string' && raw.includes('=')) {
    const pairs = raw.split(';').map(s => s.trim()).filter(Boolean);
    const cookies = [];
    for (const pair of pairs) {
      const eqIdx = pair.indexOf('=');
      if (eqIdx > 0) {
        const name = pair.substring(0, eqIdx).trim();
        const value = pair.substring(eqIdx + 1).trim();
        if (name) {
          cookies.push({
            name,
            value,
            domain: '.' + fallbackDomain.replace(/^\./, ''),
            path: '/'
          });
        }
      }
    }
    if (cookies.length > 0) return normalizeCookieArray(cookies, fallbackDomain);
  }

  return { valid: false, cookies: [], error: 'Unsupported cookie format' };
}

function normalizeCookieArray(arr, fallbackDomain) {
  const result = [];
  for (const c of arr) {
    if (!c || !c.name) continue;
    let dom = c.domain || fallbackDomain;
    if (dom.includes(':')) dom = dom.split(':')[0];
    
    // Playwright cookie requirement: domain must start without protocol
    dom = dom.replace(/^https?:\/\//, '');
    
    const cookie = {
      name: String(c.name).trim(),
      value: String(c.value !== undefined ? c.value : '').trim(),
      domain: dom,
      path: c.path || '/',
      httpOnly: Boolean(c.httpOnly || c.httponly),
      secure: c.secure !== undefined ? Boolean(c.secure) : true,
      sameSite: ['Strict', 'Lax', 'None'].includes(c.sameSite) ? c.sameSite : 'Lax'
    };
    if (c.expirationDate || c.expires) {
      cookie.expires = Math.round(Number(c.expirationDate || c.expires));
    }
    result.push(cookie);
  }

  if (result.length === 0) {
    return { valid: false, cookies: [], error: 'No valid cookie pairs found' };
  }
  return { valid: true, cookies: result, count: result.length };
}

function parseSpreadsheet(text) {
  if (!text || !text.trim()) return { rows: [], validCount: 0, invalidCount: 0 };
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim().length > 0);
  const delimiter = lines[0].includes('\t') ? '\t' : (lines[0].includes(';') ? ';' : ',');
  
  const rows = [];
  let startIndex = 0;
  
  // Check header
  const firstTokens = lines[0].split(delimiter).map(t => t.trim().toLowerCase());
  const isHeader = firstTokens.some(t => ['name', 'nama', 'url', 'cookie', 'cookies', 'akun', 'vpn'].includes(t));
  if (isHeader) startIndex = 1;

  for (let i = startIndex; i < lines.length; i++) {
    const rawLine = lines[i];
    const parts = rawLine.split(delimiter).map(p => p.trim());
    if (parts.length < 2) continue;

    const name = parts[0] || `Profile ${i + 1}`;
    const url = (parts[1] && (parts[1].startsWith('http') || parts[1].includes('.'))) ? parts[1] : 'https://www.google.com';
    const cookieRaw = parts[2] || '';
    const vpnNode = parts[3] || 'indonesia';
    const userAgent = parts[4] || '';

    const parsedCookie = parseCookies(cookieRaw, url);
    rows.push({
      index: i + 1,
      name,
      startUrl: url.startsWith('http') ? url : `https://${url}`,
      cookies: parsedCookie.cookies,
      cookieCount: parsedCookie.cookies.length,
      isValidCookie: parsedCookie.valid,
      vpnNode: vpnNode.toLowerCase(),
      userAgent: userAgent || null,
      rawCookie: cookieRaw,
      status: parsedCookie.valid ? 'VALID' : 'NO_COOKIE'
    });
  }

  const validCount = rows.filter(r => r.isValidCookie).length;
  return {
    rows,
    total: rows.length,
    validCount,
    invalidCount: rows.length - validCount
  };
}

module.exports = {
  extractDomain,
  parseCookies,
  parseSpreadsheet
};
