// Ultra-lightweight reactive store
export const state = {
  profiles: [],
  extensions: [],
  activeProfileId: null,
  tabs: {}, // { [profileId]: [ { id, title, url, active } ] }
  activeColor: '#2563eb'
};

export const $ = (id) => document.getElementById(id);
export const esc = (s) => (s ? String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`) : '');
