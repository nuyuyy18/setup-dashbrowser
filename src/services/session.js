const { session } = require('electron');
const fs = require('fs');
const store = require('./store');

module.exports = {
  async setup(profileId) {
    const profile = store.getProfile(profileId);
    if (!profile) return;
    const ses = session.fromPartition(`persist:profile_${profileId}`);

    // Global Network Guard: Ignore dead certs & prevent socket crashes
    ses.setPermissionRequestHandler((_, __, cb) => cb(true));
    
    // Fast Proxy Config
    if (profile.proxy && profile.proxy.host && profile.proxy.port) {
      const proto = (profile.proxy.type || 'http').toLowerCase();
      const rules = proto.startsWith('socks')
        ? `socks5://${profile.proxy.host}:${profile.proxy.port}`
        : `http://${profile.proxy.host}:${profile.proxy.port}`;
      await ses.setProxy({ proxyRules: rules, proxyBypassRules: '<local>' });
    } else {
      await ses.setProxy({ mode: 'direct' });
    }

    // Fast Extensions Load
    if (Array.isArray(profile.extensions)) {
      const allExts = store.getExtensions();
      for (const extId of profile.extensions) {
        const ext = allExts.find(e => e.id === extId);
        if (ext && fs.existsSync(ext.path)) {
          try { await ses.loadExtension(ext.path, { allowFileAccess: true }); }
          catch {}
        }
      }
    }
  },
  async clear(profileId) {
    const ses = session.fromPartition(`persist:profile_${profileId}`);
    await ses.clearStorageData();
  }
};
