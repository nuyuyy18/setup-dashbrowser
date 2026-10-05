/**
 * DashBrowser Local Client Bundle Custodian
 * Creates time-limited (3h) bundled payloads for safe local execution
 */
const crypto = require('crypto');
const store = require('./store');

const BUNDLE_TTL_HOURS = 3;

function createBundle(profileId) {
  const profile = store.getProfile(profileId);
  if (!profile) return { error: 'Profile not found' };

  const now = Date.now();
  const expiresAt = now + (BUNDLE_TTL_HOURS * 60 * 60 * 1000);

  const payload = {
    version: '1.0',
    profileId: profile.id,
    name: profile.name,
    startUrl: profile.startUrl || 'https://www.google.com',
    vpnNode: profile.vpnNode || 'indonesia',
    proxy: profile.proxy || null,
    cookies: profile.cookies || [],
    cookieCount: (profile.cookies && profile.cookies.length) || 0,
    issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
    ttlHours: BUNDLE_TTL_HOURS
  };

  // Sign checksum
  const hash = crypto.createHash('sha256').update(JSON.stringify(payload) + 'dash_custodian_secret').digest('hex');
  payload.signature = hash.substring(0, 16);

  return { ok: true, bundle: payload };
}

function verifyBundle(bundle) {
  if (!bundle || !bundle.expiresAt) return { valid: false, error: 'Format bundle tidak valid' };
  const expiry = new Date(bundle.expiresAt).getTime();
  if (Date.now() > expiry) {
    return { valid: false, error: 'Bundle telah kedaluwarsa (melebihi batas 3 jam)' };
  }
  return { valid: true, bundle };
}

module.exports = {
  BUNDLE_TTL_HOURS,
  createBundle,
  verifyBundle
};
