import { state, $, esc } from './state.js';

const extGrid = $('ext-grid');

export function renderExtensions() {
  if (state.extensions.length === 0) {
    extGrid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:#9ca3af;">No extensions in library.</div>';
    return;
  }
  extGrid.innerHTML = state.extensions.map(e => `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <b>🧩 ${esc(e.name)}</b>
        <span class="badge">v${esc(e.version)}</span>
      </div>
      <div style="margin-top:10px;text-align:right;">
        <button class="btn btn-danger" data-del="${e.id}" style="padding:4px 8px;font-size:11px;">Delete</button>
      </div>
    </div>
  `).join('');

  extGrid.querySelectorAll('button[data-del]').forEach(btn => {
    btn.onclick = async () => {
      await window.api.deleteExt(btn.dataset.del);
      state.extensions = await window.api.getExtensions();
      renderExtensions();
    };
  });
}

export async function importFolder() {
  const ext = await window.api.importFolder();
  if (ext) {
    state.extensions = await window.api.getExtensions();
    renderExtensions();
  }
}

export async function importZip() {
  const ext = await window.api.importZip();
  if (ext) {
    state.extensions = await window.api.getExtensions();
    renderExtensions();
  }
}
