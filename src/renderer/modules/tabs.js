import { state, $, esc } from './state.js';

const tabsContainer = $('tabs');
const wvContainer = $('webviews');
const urlInput = $('url-input');

export function getActiveTab() {
  const list = state.tabs[state.activeProfileId] || [];
  return list.find(t => t.active) || list[0];
}

export function renderTabs() {
  const list = state.tabs[state.activeProfileId] || [];
  tabsContainer.innerHTML = list.map(t => `
    <div class="tab ${t.active ? 'active' : ''}" data-id="${t.id}">
      <span class="tab-title">${esc(t.title)}</span>
      <button class="btn-tab-close" data-close="${t.id}">✕</button>
    </div>
  `).join('');

  tabsContainer.querySelectorAll('.tab').forEach(el => {
    el.onclick = (e) => {
      if (e.target.dataset.close) closeTab(e.target.dataset.close);
      else switchTab(el.dataset.id);
    };
  });
}

export function createTab(url = null) {
  const pId = state.activeProfileId;
  if (!pId) return;
  const profile = state.profiles.find(p => p.id === pId);
  const list = state.tabs[pId] || (state.tabs[pId] = []);
  list.forEach(t => t.active = false);

  const newId = 't_' + Math.random().toString(36).slice(2, 8);
  const targetUrl = url || (profile ? profile.startUrl : 'https://www.google.com') || 'https://www.google.com';

  list.push({ id: newId, title: 'New Tab', url: targetUrl, active: true });
  renderTabs();
  syncWebviews();
}

export function switchTab(tabId) {
  const list = state.tabs[state.activeProfileId] || [];
  list.forEach(t => t.active = (t.id === tabId));
  renderTabs();
  syncWebviews();
}

export function closeTab(tabId) {
  const pId = state.activeProfileId;
  let list = state.tabs[pId] || [];
  const idx = list.findIndex(t => t.id === tabId);
  if (idx === -1) return;

  const wasActive = list[idx].active;
  const wv = wvContainer.querySelector(`webview[data-p="${pId}"][data-t="${tabId}"]`);
  if (wv) wv.remove();

  list.splice(idx, 1);
  if (list.length === 0) createTab();
  else {
    if (wasActive) list[Math.max(0, idx - 1)].active = true;
    renderTabs();
    syncWebviews();
  }
}

export function syncWebviews() {
  const pId = state.activeProfileId;
  const tab = getActiveTab();
  if (!pId || !tab) return;

  wvContainer.querySelectorAll('webview').forEach(wv => {
    wv.classList.toggle('active', wv.dataset.p === pId && wv.dataset.t === tab.id);
  });

  let wv = wvContainer.querySelector(`webview[data-p="${pId}"][data-t="${tab.id}"]`);
  if (!wv) {
    wv = document.createElement('webview');
    wv.setAttribute('data-p', pId);
    wv.setAttribute('data-t', tab.id);
    wv.setAttribute('partition', `persist:profile_${pId}`);
    wv.setAttribute('src', tab.url);
    wv.setAttribute('allowpopups', 'true');
    wv.className = 'wv active';

    wv.addEventListener('did-stop-loading', () => {
      try {
        const u = wv.getURL();
        tab.url = u;
        if (pId === state.activeProfileId && tab.active) urlInput.value = u;
      } catch {}
    });

    wv.addEventListener('did-navigate', (e) => {
      tab.url = e.url;
      if (pId === state.activeProfileId && tab.active) urlInput.value = e.url;
    });

    wv.addEventListener('page-title-updated', (e) => {
      tab.title = e.title || 'Tab';
      renderTabs();
    });

    // Quietly capture loading failures
    wv.addEventListener('did-fail-load', (e) => {
      if (!e.isMainFrame || e.errorCode === -3) return;
      tab.title = 'Offline / Error';
      renderTabs();
    });

    wv.addEventListener('new-window', (e) => {
      e.preventDefault();
      createTab(e.url);
    });

    wvContainer.appendChild(wv);
  }

  try { urlInput.value = wv.getURL ? wv.getURL() : tab.url; }
  catch { urlInput.value = tab.url; }
}
