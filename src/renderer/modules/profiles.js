import { state, $, esc } from './state.js';
import { renderTabs, syncWebviews, createTab } from './tabs.js';

const listContainer = $('profiles-list');
const pillAvatar = $('pill-avatar');
const pillName = $('pill-name');
const modal = $('modal');
const extListContainer = $('modal-exts');

export function renderProfiles() {
  const q = ($('search-input').value || '').toLowerCase();
  const filtered = state.profiles.filter(p => p.name.toLowerCase().includes(q));

  listContainer.innerHTML = filtered.map(p => `
    <div class="profile-item ${p.id === state.activeProfileId ? 'active' : ''}" data-id="${p.id}">
      <div class="avatar" style="background:${p.color || '#2563eb'}">${esc(p.name[0].toUpperCase())}</div>
      <span class="name">${esc(p.name)}</span>
    </div>
  `).join('');

  listContainer.querySelectorAll('.profile-item').forEach(el => {
    el.onclick = () => selectProfile(el.dataset.id);
  });
}

export async function selectProfile(id) {
  state.activeProfileId = id;
  const p = state.profiles.find(x => x.id === id);
  if (!p) return;

  renderProfiles();
  pillName.innerText = p.name;
  pillAvatar.innerText = p.name[0].toUpperCase();
  pillAvatar.style.backgroundColor = p.color || '#2563eb';

  await window.api.prepareSession(p.id);

  if (!state.tabs[p.id] || state.tabs[p.id].length === 0) {
    createTab();
  } else {
    renderTabs();
    syncWebviews();
  }
}

export function openModal(id = null) {
  $('field-id').value = id || '';
  if (id) {
    const p = state.profiles.find(x => x.id === id);
    if (!p) return;
    $('field-name').value = p.name;
    $('field-starturl').value = p.startUrl || 'https://www.google.com';
    $('field-proxy-type').value = p.proxy ? p.proxy.type : 'none';
    $('field-proxy-host').value = p.proxy ? p.proxy.host : '';
    $('field-proxy-port').value = p.proxy ? p.proxy.port : '';
    renderExtCheckboxes(p.extensions || []);
  } else {
    $('field-name').value = '';
    $('field-starturl').value = 'https://www.google.com';
    $('field-proxy-type').value = 'none';
    $('field-proxy-host').value = '';
    $('field-proxy-port').value = '';
    renderExtCheckboxes([]);
  }
  modal.classList.add('active');
}

function renderExtCheckboxes(selected = []) {
  if (state.extensions.length === 0) {
    extListContainer.innerHTML = '<span style="font-size:12px;color:#9ca3af;">No extensions imported.</span>';
    return;
  }
  extListContainer.innerHTML = state.extensions.map(e => `
    <label style="display:flex;align-items:center;gap:8px;font-size:12px;">
      <input type="checkbox" value="${e.id}" ${selected.includes(e.id) ? 'checked' : ''}>
      <span>${esc(e.name)} (v${esc(e.version)})</span>
    </label>
  `).join('');
}

export async function saveProfileFromForm() {
  const id = $('field-id').value;
  const name = $('field-name').value.trim();
  if (!name) return alert('Name is required');

  const pType = $('field-proxy-type').value;
  let proxy = null;
  if (pType !== 'none') {
    const host = $('field-proxy-host').value.trim();
    const port = $('field-proxy-port').value.trim();
    if (host && port) proxy = { type: pType, host, port };
  }

  const exts = [];
  extListContainer.querySelectorAll('input:checked').forEach(c => exts.push(c.value));

  const saved = await window.api.saveProfile({
    name,
    color: state.activeColor,
    startUrl: $('field-starturl').value.trim(),
    proxy,
    extensions: exts
  }, id || null);

  modal.classList.remove('active');
  state.profiles = await window.api.getProfiles();
  selectProfile(saved.id);
}
