import { state, $ } from './modules/state.js';
import { renderProfiles, selectProfile, openModal, saveProfileFromForm } from './modules/profiles.js';
import { createTab, getActiveTab } from './modules/tabs.js';
import { renderExtensions, importFolder, importZip } from './modules/extensions.js';

// Init
async function boot() {
  state.profiles = await window.api.getProfiles();
  state.extensions = await window.api.getExtensions();

  if (state.profiles.length === 0) {
    const p = await window.api.saveProfile({ name: 'Account 1', color: '#2563eb' });
    state.profiles = [p];
  }

  selectProfile(state.profiles[0].id);
  bindEvents();
}

function bindEvents() {
  const sidebar = $('sidebar');
  $('btn-toggle-sidebar').onclick = () => sidebar.classList.toggle('collapsed');
  $('btn-hide-sidebar').onclick = () => sidebar.classList.add('collapsed');
  $('search-input').oninput = renderProfiles;
  $('btn-add-p').onclick = () => openModal();
  $('btn-new-tab').onclick = () => createTab();
  $('btn-close-modal').onclick = () => $('modal').classList.remove('active');
  $('btn-save-profile').onclick = saveProfileFromForm;

  $('btn-nav-back').onclick = () => { const w = getWv(); if (w && w.canGoBack()) w.goBack(); };
  $('btn-nav-forward').onclick = () => { const w = getWv(); if (w && w.canGoForward()) w.goForward(); };
  $('btn-nav-reload').onclick = () => { const w = getWv(); if (w) w.isLoading() ? w.stop() : w.reload(); };

  $('url-input').onkeydown = (e) => {
    if (e.key === 'Enter') {
      let u = $('url-input').value.trim();
      if (!u.startsWith('http://') && !u.startsWith('https://')) {
        u = u.includes('.') && !u.includes(' ') ? 'https://' + u : `https://www.google.com/search?q=${encodeURIComponent(u)}`;
      }
      const w = getWv();
      if (w) w.loadURL(u);
    }
  };

  $('btn-clear-data').onclick = async () => {
    if (confirm('Clear session data for this account?')) {
      await window.api.clearData(state.activeProfileId);
      const w = getWv(); if (w) w.reload();
    }
  };

  $('btn-edit-profile').onclick = () => openModal(state.activeProfileId);
  $('btn-del-profile').onclick = async () => {
    if (confirm('Delete this profile?')) {
      await window.api.deleteProfile(state.activeProfileId);
      state.profiles = await window.api.getProfiles();
      if (state.profiles.length > 0) selectProfile(state.profiles[0].id);
      else boot();
    }
  };

  $('nav-exts').onclick = () => { $('view-browser').style.display = 'none'; $('view-exts').style.display = 'flex'; renderExtensions(); };
  $('btn-back-browser').onclick = () => { $('view-exts').style.display = 'none'; $('view-browser').style.display = 'flex'; };
  $('btn-imp-folder').onclick = importFolder;
  $('btn-imp-zip').onclick = importZip;
}

function getWv() {
  const tab = getActiveTab();
  return tab ? $(`webviews`).querySelector(`webview[data-p="${state.activeProfileId}"][data-t="${tab.id}"]`) : null;
}

boot();
