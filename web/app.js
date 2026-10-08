let state = {
  profiles: [],
  vpnServers: [],
  logs: [],
  activeId: null,
  pollTimer: null,
  isRefreshingScreenshot: false,
  parsedBulkData: null,
  activeBundle: null,
  sidebarCollapsed: false,
  fabHidden: false,
  activeTab: 'browser'
};

const $ = (id) => document.getElementById(id) || new Proxy({}, {
  get: (target, prop) => {
    if (prop === 'classList') return { add: ()=>{}, remove: ()=>{} };
    if (['value', 'innerText', 'innerHTML', 'className'].includes(prop)) return '';
    if (prop === 'style') return {};
    if (typeof prop === 'string' && prop.startsWith('on')) return null;
    return () => {};
  },
  set: () => true
});

async function api(url, method = 'GET', body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error(`Respons server bukan JSON (Status ${res.status}): ${text.substring(0, 100)}`);
  }
  if (!res.ok) {
    throw new Error(data && data.error ? data.error : `HTTP ${res.status}`);
  }
  return data;
}

async function load() {
  try {
    const vpnRes = await api('/api/vpn/servers');
    state.vpnServers = vpnRes.servers || ['indonesia', 'singapore', 'malaysia', 'japan', 'korsel', 'us', 'uk-london', 'germany-berlin'];
  } catch {
    state.vpnServers = ['indonesia', 'singapore', 'malaysia', 'japan', 'korsel', 'us', 'uk-london', 'germany-berlin'];
  }

  populateVpnOptions();
  await refreshProfiles();
  await refreshLogs();

  if (!state.activeId && state.profiles.length > 0) {
    state.activeId = state.profiles[0].id;
  }

  renderList();
  renderActive();
  checkLiveStatus();
  initEvents();

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopPolling();
    } else if (state.activeTab === 'browser') {
      checkLiveStatus();
    }
  });
}

async function refreshProfiles() {
  state.profiles = await api('/api/profiles');
  if (state.profiles.length === 0) {
    const p = await api('/api/profiles', 'POST', {
      name: 'Main Account',
      color: '#0A84FF',
      vpnNode: 'indonesia',
      useVpn: true
    });
    state.profiles = [p];
  }
}

async function refreshLogs() {
  try {
    state.logs = await api('/api/logs');
    renderLogs();
  } catch (err) {
    console.error('Failed to load logs:', err);
  }
}

function populateVpnOptions() {
  const select = $('p-vpn-select');
  const modalSelect = $('form-vpn-node');
  const opts = state.vpnServers.map(s => `<option value="${s}">${s.toUpperCase()}</option>`).join('');
  if (select) select.innerHTML = opts;
  if (modalSelect) modalSelect.innerHTML = opts;
}

function renderList() {
  const q = $('search').value.toLowerCase();
  const filtered = state.profiles.filter(p => p.name.toLowerCase().includes(q));

  $('profile-list').innerHTML = filtered.map(p => {
    const isAct = p.id === state.activeId;
    const isRunning = p.status === 'RUNNING';
    const cookieCount = (p.cookies && p.cookies.length) ? p.cookies.length : 0;
    return `
      <div onclick="selectProfile('${p.id}')" class="group flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs cursor-pointer transition ${isAct ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/5'}">
        <div class="flex items-center gap-2 truncate">
          <div class="rounded flex items-center justify-center font-bold text-[9.5px] text-white shrink-0" style="background: ${p.color || '#0A84FF'}; width: 18px; height: 18px;">
            ${p.name[0].toUpperCase()}
          </div>
          <div class="truncate">
            <div class="font-medium truncate text-white leading-tight text-xs">${p.name}</div>
            <div class="text-[9.5px] text-white/40 truncate">${(p.vpnNode || 'indonesia').toUpperCase()} · ${cookieCount} cookie</div>
          </div>
        </div>
        <div class="flex items-center gap-1.5 shrink-0">
          <span class="w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-emerald-400' : 'bg-white/20'}"></span>
          <button onclick="event.stopPropagation(); editProfile('${p.id}')" class="opacity-0 group-hover:opacity-100 text-white/40 hover:text-white p-0.5 text-[10px]" title="Edit Profil">✎</button>
          <button onclick="event.stopPropagation(); confirmDeleteProfile('${p.id}', '${p.name}')" class="opacity-0 group-hover:opacity-100 text-rose-400 hover:text-rose-300 p-0.5 text-[10px]" title="Hapus Profil">🗑</button>
        </div>
      </div>
    `;
  }).join('');
}

function renderActive() {
  const p = state.profiles.find(x => x.id === state.activeId);
  if (!p) return;

  $('sb-name').innerText = p.name;
  $('sb-status').innerText = p.status || 'STOPPED';
  $('sb-status').className = `px-1.5 py-0.5 rounded text-[9.5px] font-mono ${p.status === 'RUNNING' ? 'bg-emerald-950 border border-emerald-800 text-emerald-300' : 'bg-white/10 text-white/50'}`;
  $('sb-vpn').innerText = `VPN: ${(p.vpnNode || 'indonesia').toUpperCase()}`;
  
  const cookieLen = (p.cookies && p.cookies.length) || 0;
  $('sb-cookies').innerText = `${cookieLen} Cookie`;
  
  const badge = $('vp-cookie-badge');
  if (cookieLen > 0) {
    badge.innerText = `${cookieLen} Cookie Aktif`;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }

  $('p-vpn-select').value = p.vpnNode || 'indonesia';
  $('fab-input-account').value = p.name;

  if (p.status === 'RUNNING') {
    $('btn-top-launch').classList.add('hidden');
    $('btn-top-stop').classList.remove('hidden');
    $('vp-placeholder').classList.add('hidden');
  } else {
    $('btn-top-launch').classList.remove('hidden');
    $('btn-top-stop').classList.add('hidden');
    $('vp-placeholder').classList.remove('hidden');
  }
}

window.selectProfile = function(id) {
  state.activeId = id;
  renderList();
  renderActive();
  checkLiveStatus();
};

window.confirmDeleteProfile = async function(id, name) {
  if (state.profiles.length <= 1) {
    alert('Minimal harus ada 1 profil tersisa.');
    return;
  }
  if (!confirm(`Hapus profil "${name}"?`)) return;
  try {
    await api(`/api/profiles/${id}`, 'DELETE');
    if (state.activeId === id) {
      state.activeId = null;
    }
    await refreshProfiles();
    if (!state.activeId && state.profiles.length > 0) {
      state.activeId = state.profiles[0].id;
    }
    renderList();
    renderActive();
    checkLiveStatus();
  } catch (err) {
    alert('Gagal menghapus profil: ' + err.message);
  }
};

async function checkLiveStatus() {
  if (!state.activeId) return;
  try {
    const res = await api(`/api/browser/status?id=${state.activeId}`);
    if (res.running) {
      $('vp-placeholder').classList.add('hidden');
      $('btn-top-launch').classList.add('hidden');
      $('btn-top-stop').classList.remove('hidden');
      $('vp-status-dot').innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Aktif';
      if (res.url) $('vp-url-input').value = res.url;
      refreshScreenshot();
      startPolling();
    } else {
      $('vp-placeholder').classList.remove('hidden');
      $('btn-top-launch').classList.remove('hidden');
      $('btn-top-stop').classList.add('hidden');
      $('vp-status-dot').innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-neutral-600"></span> Offline';
      stopPolling();
    }
  } catch {
    stopPolling();
  }
}

function startPolling() {
  stopPolling();
  // Polling frame rate drastically sped up to roughly 12 FPS for instant feel
  state.pollTimer = setInterval(refreshScreenshot, 80);
}

function stopPolling() {
  if (state.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
}

async function refreshScreenshot() {
  if (!state.activeId || state.isRefreshingScreenshot) return;
  state.isRefreshingScreenshot = true;

  const img = $('vp-screen');
  const tempImg = new Image();
  const targetUrl = `/api/browser/screenshot?id=${state.activeId}&t=${Date.now()}`;

  tempImg.onload = () => {
    img.src = tempImg.src;
    state.isRefreshingScreenshot = false;
  };
  tempImg.onerror = () => {
    state.isRefreshingScreenshot = false;
  };
  tempImg.src = targetUrl;
}

function initEvents() {
  // Theme Toggle (Dark / Light)
  let currentTheme = localStorage.getItem('dash_theme') || 'dark';
  function applyTheme(theme) {
    currentTheme = theme;
    localStorage.setItem('dash_theme', theme);
    if (theme === 'light') {
      document.body.classList.add('theme-light');
      $('btn-toggle-theme').innerText = '🌙';
      $('btn-toggle-theme').title = 'Ganti ke Dark Mode';
    } else {
      document.body.classList.remove('theme-light');
      $('btn-toggle-theme').innerText = '☀️';
      $('btn-toggle-theme').title = 'Ganti ke Light Mode';
    }
  }
  applyTheme(currentTheme);
  $('btn-toggle-theme').onclick = () => {
    applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
  };

  // Cek Alamat IP / Proxy Publik Langsung
  $('btn-check-ip').onclick = async () => {
    const lbl = $('label-check-ip');
    const orig = lbl.innerText;
    lbl.innerText = 'Memeriksa...';
    try {
      const res = await fetch('https://ipapi.co/json/');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      
      const ip = data.ip || 'Tidak diketahui';
      const city = data.city || '';
      const country = data.country_name || data.country || '';
      const org = data.org || data.asn || '';

      $('vp-url-input').value = `IP: ${ip} | ${city}, ${country} (${org})`;
      alert(`Informasi Jaringan/Proxy:\n• Alamat IP: ${ip}\n• Lokasi: ${city}, ${country}\n• ISP / Operator: ${org}`);
    } catch (e) {
      // Fallback ke ipify jika ipapi kena rate limit
      try {
        const fRes = await fetch('https://api.ipify.org?format=json');
        const fData = await fRes.json();
        $('vp-url-input').value = `IP Publik: ${fData.ip}`;
        alert(`Alamat IP Publik Terdeteksi: ${fData.ip}`);
      } catch (err2) {
        alert('Gagal mendeteksi IP/Proxy: ' + err2.message);
      }
    } finally {
      lbl.innerText = orig;
    }
  };

  // Local Bundle Modal Triggers
  $('btn-top-bundle').onclick = async () => {
    if (!state.activeId) return;
    try {
      const bundle = await api(`/api/profiles/${state.activeId}/bundle`);
      state.activeBundle = bundle;
      
      $('bundle-modal-profile').innerText = bundle.profileName;
      $('bundle-modal-cookies').innerText = bundle.cookiesCount;
      $('bundle-modal-vpn').innerText = bundle.vpnNode.toUpperCase();
      $('bundle-modal-ttl').innerText = `${bundle.ttlMinutes} Menit (${new Date(bundle.expiresAt).toLocaleTimeString()})`;
      $('bundle-token-area').value = bundle.exportToken;
      $('bundle-cmd-code').innerText = bundle.launchCommand;

      $('modal-bundle').classList.remove('hidden');
      $('modal-bundle').classList.add('flex');
    } catch (err) {
      alert('Gagal membuat session bundle: ' + err.message);
    }
  };

  $('btn-close-bundle').onclick = () => {
    $('modal-bundle').classList.add('hidden');
    $('modal-bundle').classList.remove('flex');
  };

  $('btn-copy-bundle-token').onclick = () => {
    $('bundle-token-area').select();
    navigator.clipboard.writeText($('bundle-token-area').value);
    alert('Session Token tersalin! Hanya berlaku selama 3 jam.');
  };

  $('btn-copy-bundle-cmd').onclick = () => {
    const cmd = $('bundle-cmd-code').innerText;
    navigator.clipboard.writeText(cmd);
    alert('Perintah CLI disalin! Jalankan di terminal laptop lokal operator.');
  };

  // Sidebar toggle
  $('btn-toggle-sidebar').onclick = () => {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    $('sidebar').classList.toggle('collapsed', state.sidebarCollapsed);
  };
  window.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      $('btn-toggle-sidebar').click();
    }
  });

  // Tab switching
  $('tab-btn-browser').onclick = () => {
    state.activeTab = 'browser';
    $('tab-btn-browser').classList.add('active');
    $('tab-btn-tracker').classList.remove('active');
    $('view-browser').classList.remove('hidden');
    $('view-tracker').classList.add('hidden');
    checkLiveStatus();
  };
  $('tab-btn-tracker').onclick = () => {
    state.activeTab = 'tracker';
    $('tab-btn-tracker').classList.add('active');
    $('tab-btn-browser').classList.remove('active');
    $('view-browser').classList.add('hidden');
    $('view-tracker').classList.remove('hidden');
    stopPolling();
    refreshLogs();
  };

  // Launch & Stop browser instance
  $('btn-top-launch').onclick = launchActive;
  $('btn-top-stop').onclick = stopActive;
  $('btn-vp-start-now').onclick = launchActive;

  // Change VPN location from toolbar
  $('p-vpn-select').onchange = async () => {
    if (!state.activeId) return;
    const loc = $('p-vpn-select').value;
    try {
      await api(`/api/vpn/switch?id=${state.activeId}`, 'POST', { location: loc });
      await refreshProfiles();
      renderList();
      renderActive();
      alert(`VPN beralih ke: ${loc.toUpperCase()}`);
      setTimeout(refreshScreenshot, 1000);
    } catch (e) {
      alert('Gagal ubah VPN: ' + e.message);
    }
  };

  // Viewport navigation
  $('btn-vp-go').onclick = async () => {
    const url = $('vp-url-input').value.trim();
    if (!url || !state.activeId) return;
    setLoading(true);
    try {
      const res = await api(`/api/browser/navigate?id=${state.activeId}`, 'POST', { url });
      $('vp-url-input').value = res.url;
      setTimeout(refreshScreenshot, 400);
    } catch (e) {
      alert('Navigasi gagal: ' + e.message);
    } finally {
      setLoading(false);
    }
  };
  $('vp-url-input').onkeydown = e => { if (e.key === 'Enter') $('btn-vp-go').click(); };

  $('btn-vp-reload').onclick = async () => {
    const url = $('vp-url-input').value.trim();
    if (url && state.activeId) {
      setLoading(true);
      await api(`/api/browser/navigate?id=${state.activeId}`, 'POST', { url });
      setTimeout(refreshScreenshot, 400);
      setLoading(false);
    }
  };

  // Keyboard bar interactions
  $('vp-type-input').addEventListener('keydown', async e => {
    if (e.key === 'Enter') {
      const txt = $('vp-type-input').value;
      if (txt && state.activeId) {
        await api(`/api/browser/type?id=${state.activeId}`, 'POST', { text: txt });
        $('vp-type-input').value = '';
        setTimeout(refreshScreenshot, 400);
      }
    }
  });

  $('btn-vp-send-text').onclick = async () => {
    const txt = $('vp-type-input').value;
    if (txt && state.activeId) {
      await api(`/api/browser/type?id=${state.activeId}`, 'POST', { text: txt });
      $('vp-type-input').value = '';
      setTimeout(refreshScreenshot, 400);
    }
  };

  $('btn-vp-send-enter').onclick = async () => {
    if (!state.activeId) return;
    await api(`/api/browser/key?id=${state.activeId}`, 'POST', { key: 'Enter' });
    setTimeout(refreshScreenshot, 400);
  };

  $('btn-vp-send-backspace').onclick = async () => {
    if (!state.activeId) return;
    await api(`/api/browser/key?id=${state.activeId}`, 'POST', { key: 'Backspace' });
    setTimeout(refreshScreenshot, 250);
  };

  $('btn-vp-clear-input').onclick = async () => {
    if (!state.activeId) return;
    // Select all text in the focused field and delete it
    await api(`/api/browser/key?id=${state.activeId}`, 'POST', { key: 'Control+a' });
    await api(`/api/browser/key?id=${state.activeId}`, 'POST', { key: 'Backspace' });
    setTimeout(refreshScreenshot, 300);
  };

  // Instant Click Emulation
  $('viewport-wrapper').onclick = async e => {
    if (!state.activeId) return;
    const rect = $('vp-screen').getBoundingClientRect();
    const scaleX = 1280 / rect.width;
    const scaleY = 750 / rect.height;
    
    // Check if click is actually inside the image bounds
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
      return; // Ignore clicks in the black padding area
    }
    
    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);

    const rip = $('vp-click-ripple');
    rip.style.left = `${e.clientX - $('viewport-wrapper').getBoundingClientRect().left}px`;
    rip.style.top = `${e.clientY - $('viewport-wrapper').getBoundingClientRect().top}px`;
    rip.classList.remove('scale-0');
    rip.classList.add('scale-100');
    setTimeout(() => { rip.classList.remove('scale-100'); rip.classList.add('scale-0'); }, 180);

    // Auto focus invisible input for mobile/desktop direct typing
    const hiddenInp = $('vp-hidden-input');
    if (hiddenInp) {
      hiddenInp.value = '';
      hiddenInp.focus();
    }

    try {
      const res = await api(`/api/browser/click?id=${state.activeId}`, 'POST', { x, y });
      if (res.url) $('vp-url-input').value = res.url;
      // Beri sedikit jeda agar animasi klik/komentar Instagram selesai sebelum screenshot diambil
      setTimeout(refreshScreenshot, 100);
      setTimeout(refreshScreenshot, 600);
    } catch (e) {
      console.error('Click error', e);
    }
  };

  // Keyboard emulation inside viewport
  window.addEventListener('keydown', async e => {
    if (state.activeTab !== 'browser' || !state.activeId) return;
    if (document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) && document.activeElement.id !== 'vp-hidden-input') {
      return;
    }
    const specialKeys = ['Enter', 'Backspace', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Escape'];
    if (specialKeys.includes(e.key)) {
      e.preventDefault();
      await api(`/api/browser/key?id=${state.activeId}`, 'POST', { key: e.key });
      refreshScreenshot();
    }
  });

  // Typed Character Emulation
  window.addEventListener('keypress', async e => {
    if (state.activeTab !== 'browser' || !state.activeId) return;
    if (document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) && document.activeElement.id !== 'vp-hidden-input') {
      return;
    }
    // Prevent default browser behavior if needed, and send typing
    e.preventDefault();
    await api(`/api/browser/type?id=${state.activeId}`, 'POST', { text: e.key });
    refreshScreenshot();
  });

  // Mobile / IME Input Listener on hidden input
  $('vp-hidden-input').addEventListener('input', async e => {
    if (!state.activeId) return;
    if (e.data) {
      await api(`/api/browser/type?id=${state.activeId}`, 'POST', { text: e.data });
      $('vp-hidden-input').value = '';
      refreshScreenshot();
    }
  });

  // Quick Action Bar
  $('btn-scroll-down').onclick = async () => {
    if (!state.activeId) return;
    await api(`/api/browser/key?id=${state.activeId}`, 'POST', { key: 'PageDown' });
    setTimeout(refreshScreenshot, 300);
  };

  $('btn-scroll-up').onclick = async () => {
    if (!state.activeId) return;
    await api(`/api/browser/key?id=${state.activeId}`, 'POST', { key: 'PageUp' });
    setTimeout(refreshScreenshot, 300);
  };

  $('btn-tab-next').onclick = async () => {
    if (!state.activeId) return;
    await api(`/api/browser/key?id=${state.activeId}`, 'POST', { key: 'Tab' });
    setTimeout(refreshScreenshot, 300);
  };

  // Accumulated Scroll Emulation (Prevent HTTP flood)
  let pendingScrollY = 0;
  let scrollTimeout = null;
  let lastScrollX = 640;
  let lastScrollY = 400;

  function flushScroll() {
    if (!state.activeId || pendingScrollY === 0) return;
    const sendY = pendingScrollY;
    pendingScrollY = 0;
    api(`/api/browser/scroll?id=${state.activeId}`, 'POST', { deltaY: sendY, x: lastScrollX, y: lastScrollY })
      .then(refreshScreenshot)
      .catch(() => {});
  }

  function getScaledCoords(clientX, clientY) {
    const rect = $('vp-screen').getBoundingClientRect();
    const scaleX = 1280 / rect.width;
    const scaleY = 750 / rect.height;
    const x = Math.max(0, Math.min(1280, Math.round((clientX - rect.left) * scaleX)));
    const y = Math.max(0, Math.min(750, Math.round((clientY - rect.top) * scaleY)));
    return { x, y };
  }

  // Mouse Wheel Scroll Emulation
  $('viewport-wrapper').addEventListener('wheel', e => {
    if (!state.activeId) return;
    const coords = getScaledCoords(e.clientX, e.clientY);
    lastScrollX = coords.x;
    lastScrollY = coords.y;

    const url = $('vp-url-input').value || '';
    // Jika sedang di halaman Reels dan kursor berada di area video (bukan di panel komentar x > 950)
    if (url.includes('/reels/') && coords.x < 950) {
      const key = e.deltaY > 0 ? 'ArrowDown' : 'ArrowUp';
      if (!scrollTimeout) {
        scrollTimeout = setTimeout(() => {
          api(`/api/browser/key?id=${state.activeId}`, 'POST', { key }).then(refreshScreenshot);
          scrollTimeout = null;
        }, 120);
      }
      return;
    }

    pendingScrollY += e.deltaY;
    if (!scrollTimeout) {
      scrollTimeout = setTimeout(() => {
        flushScroll();
        scrollTimeout = null;
      }, 50);
    }
  }, { passive: true });

  // Touch Swipe Scroll Emulation (Mobile)
  let touchStartY = 0;
  $('viewport-wrapper').addEventListener('touchstart', e => {
    if (e.touches.length === 1) {
      touchStartY = e.touches[0].clientY;
      const coords = getScaledCoords(e.touches[0].clientX, e.touches[0].clientY);
      lastScrollX = coords.x;
      lastScrollY = coords.y;
    }
  }, { passive: false });

  // Arah Scroll untuk Swipe Mobile 
  $('viewport-wrapper').addEventListener('touchmove', e => {
    if (!state.activeId || e.touches.length !== 1) return;
    
    // Cegah perilaku browser bawaan (pull to refresh) agar tidak tabrakan dengan scroll emulator
    e.preventDefault();

    const currentY = e.touches[0].clientY;
    const diffY = touchStartY - currentY; // Positif = usap atas (mau scroll ke bawah)
    
    // Cukup usapan ringan (> 8px) tanpa perlu tenaga
    if (Math.abs(diffY) > 8) {
      const coords = getScaledCoords(e.touches[0].clientX, e.touches[0].clientY);
      lastScrollX = coords.x;
      lastScrollY = coords.y;
      const url = $('vp-url-input').value || '';

      // Jika di reels dan bukan di panel komentar, gunakan navigasi mulus ArrowDown/ArrowUp
      if (url.includes('/reels/') && coords.x < 950) {
        const key = diffY > 0 ? 'ArrowDown' : 'ArrowUp';
        api(`/api/browser/key?id=${state.activeId}`, 'POST', { key })
          .then(() => setTimeout(refreshScreenshot, 150))
          .catch(() => {});
      } else {
        const simulateDelta = diffY > 0 ? 350 : -350; 
        pendingScrollY += simulateDelta;
        if (!scrollTimeout) {
          scrollTimeout = setTimeout(() => {
            flushScroll();
            scrollTimeout = null;
          }, 80);
        }
      }
      
      touchStartY = currentY;
    }
  }, { passive: false });

  // Single Cookie Inject Modal
  $('btn-top-inject').onclick = () => {
    if (!state.activeId) return;
    const p = state.profiles.find(x => x.id === state.activeId);
    $('modal-cookie-target').innerText = p ? p.name : 'Aktif';
    $('modal-inject').classList.remove('hidden');
    $('modal-inject').classList.add('flex');
    $('inject-cookie-input').value = '';
    $('cookie-preview').classList.add('hidden');
  };

  $('btn-cancel-inject').onclick = () => {
    $('modal-inject').classList.add('hidden');
    $('modal-inject').classList.remove('flex');
  };

  $('btn-parse-cookie').onclick = async () => {
    const raw = $('inject-cookie-input').value.trim();
    if (!raw) return;
    try {
      const res = await api('/api/cookies/parse', 'POST', { cookies: raw });
      const prev = $('cookie-preview');
      prev.classList.remove('hidden');
      if (res.valid) {
        prev.className = 'p-2.5 rounded text-xs bg-emerald-950/80 border border-emerald-800 text-emerald-300';
        prev.innerText = `✓ Format Terdeteksi: ${res.format.toUpperCase()} (${res.count} cookie siap diinjeksi).`;
      } else {
        prev.className = 'p-2.5 rounded text-xs bg-rose-950/80 border border-rose-800 text-rose-300';
        prev.innerText = `✗ Format Tidak Valid: ${res.error}`;
      }
    } catch (err) {
      alert('Error parsing cookie: ' + err.message);
    }
  };

  $('btn-submit-inject').onclick = async () => {
    const raw = $('inject-cookie-input').value.trim();
    if (!raw || !state.activeId) return;
    try {
      const res = await api('/api/browser/inject-cookies', 'POST', {
        profileId: state.activeId,
        cookies: raw,
        navigateUrl: $('vp-url-input').value || null
      });
      alert(`Berhasil menginjeksi ${res.count} cookie!`);
      $('modal-inject').classList.add('hidden');
      $('modal-inject').classList.remove('flex');
      await refreshProfiles();
      renderList();
      renderActive();
      setTimeout(refreshScreenshot, 500);
    } catch (err) {
      alert('Injeksi cookie gagal: ' + err.message);
    }
  };

  // Bulk Spreadsheet Modal
  $('btn-top-bulk-cookie').onclick = () => {
    $('modal-bulk').classList.remove('hidden');
    $('modal-bulk').classList.add('flex');
    $('bulk-preview-container').classList.add('hidden');
    $('btn-execute-bulk').classList.add('hidden');
  };

  $('btn-cancel-bulk').onclick = () => {
    $('modal-bulk').classList.add('hidden');
    $('modal-bulk').classList.remove('flex');
  };

  $('btn-parse-bulk').onclick = async () => {
    const text = $('bulk-input').value.trim();
    if (!text) return;
    try {
      const data = await api('/api/bulk/parse', 'POST', { rawText: text });
      state.parsedBulkData = data;
      renderBulkPreview(data);
      $('bulk-preview-container').classList.remove('hidden');
      if (data.validCount > 0) {
        $('btn-execute-bulk').classList.remove('hidden');
      }
    } catch (err) {
      alert('Gagal membaca data spreadsheet: ' + err.message);
    }
  };

  $('btn-execute-bulk').onclick = async () => {
    const text = $('bulk-input').value.trim();
    if (!text) return;
    try {
      const res = await api('/api/bulk/import', 'POST', { rawText: text });
      alert(`Selesai! Berhasil membuat & menginjeksi ${res.createdCount} profil dari spreadsheet.`);
      $('modal-bulk').classList.add('hidden');
      $('modal-bulk').classList.remove('flex');
      await refreshProfiles();
      if (res.created && res.created.length > 0) {
        state.activeId = res.created[0].id;
      }
      renderList();
      renderActive();
    } catch (err) {
      alert('Gagal bulk import: ' + err.message);
    }
  };

  // Profile Add/Edit Modal
  $('btn-sidebar-add').onclick = () => {
    $('modal-profile-title').innerText = 'Tambah Profil Baru';
    $('form-id').value = '';
    $('form-name').value = '';
    $('form-url').value = 'https://www.google.com';
    $('form-vpn-node').value = 'indonesia';
    $('form-ua').value = '';
    $('modal-profile').classList.remove('hidden');
    $('modal-profile').classList.add('flex');
  };

  $('btn-cancel-profile').onclick = () => {
    $('modal-profile').classList.add('hidden');
    $('modal-profile').classList.remove('flex');
  };

  $('form-profile').onsubmit = async e => {
    e.preventDefault();
    const id = $('form-id').value;
    const payload = {
      name: $('form-name').value,
      startUrl: $('form-url').value,
      vpnNode: $('form-vpn-node').value,
      userAgent: $('form-ua').value.trim() || undefined,
      useVpn: true
    };
    if (id) {
      await api(`/api/profiles?id=${id}`, 'POST', payload);
    } else {
      const newP = await api('/api/profiles', 'POST', payload);
      state.activeId = newP.id;
    }
    $('modal-profile').classList.add('hidden');
    $('modal-profile').classList.remove('flex');
    await refreshProfiles();
    renderList();
    renderActive();
  };

  $('search').oninput = renderList;
}

window.editProfile = function(id) {
  const p = state.profiles.find(x => x.id === id);
  if (!p) return;
  $('modal-profile-title').innerText = 'Edit Profil';
  $('form-id').value = p.id;
  $('form-name').value = p.name;
  $('form-url').value = p.startUrl || 'https://www.google.com';
  $('form-vpn-node').value = p.vpnNode || 'indonesia';
  $('form-ua').value = p.userAgent || '';
  $('modal-profile').classList.remove('hidden');
  $('modal-profile').classList.add('flex');
};

function renderBulkPreview(data) {
  $('bulk-summary').innerText = `Total: ${data.total} baris | ${data.validCount} valid | ${data.invalidCount} tanpa cookie`;
  $('bulk-preview-body').innerHTML = data.rows.map(r => `
    <tr class="hover:bg-white/[0.04]">
      <td class="p-2 font-mono text-white/40">${r.index}</td>
      <td class="p-2 font-medium text-white">${r.name}</td>
      <td class="p-2 text-white/65 truncate max-w-xs">${r.startUrl}</td>
      <td class="p-2">
        <span class="px-1.5 py-0.5 rounded text-[9.5px] font-mono ${r.isValidCookie ? 'bg-emerald-950 border border-emerald-800 text-emerald-300' : 'bg-rose-950 border border-rose-800 text-rose-300'}">
          ${r.isValidCookie ? 'VALID' : 'NO_COOKIE'}
        </span>
      </td>
      <td class="p-2 font-mono">${r.cookieCount}</td>
      <td class="p-2 uppercase text-white/55">${r.vpnNode}</td>
    </tr>
  `).join('');
}

function renderLogs() {
  const tbody = $('tracker-body');
  if (!state.logs || state.logs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-white/40">Belum ada aktivitas tercatat. Gunakan tombol melayang di pojok kanan bawah.</td></tr>';
    return;
  }
  tbody.innerHTML = state.logs.map(l => `
    <tr class="hover:bg-white/[0.04]">
      <td class="p-2 text-white/45 font-mono text-[10px]">${new Date(l.createdAt).toLocaleTimeString()}</td>
      <td class="p-2 font-medium text-white">${l.accountName || '-'}</td>
      <td class="p-2"><span class="px-1.5 py-0.5 rounded bg-blue-950 border border-blue-800 text-blue-300 text-[9.5px]">${l.action}</span></td>
      <td class="p-2 text-[#0A84FF] hover:underline max-w-xs truncate"><a href="${l.postUrl}" target="_blank">${l.postUrl}</a></td>
      <td class="p-2 text-white/65 max-w-sm truncate">${l.note || '-'}</td>
      <td class="p-2 text-right"><button onclick="deleteLogItem('${l.id}')" class="text-rose-400 hover:text-rose-300 text-[11px]">✕</button></td>
    </tr>
  `).join('');
}

window.deleteLogItem = async function(id) {
  await api(`/api/logs/${id}`, 'DELETE');
  await refreshLogs();
};

async function launchActive() {
  if (!state.activeId) return;
  const btn = $('btn-top-launch');
  btn.disabled = true;
  btn.innerHTML = '<span>Menjalankan...</span>';
  try {
    const res = await api(`/api/browser/launch?id=${state.activeId}`, 'POST');
    await refreshProfiles();
    renderList();
    renderActive();
    $('vp-placeholder').classList.add('hidden');
    $('vp-status-dot').innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Aktif';
    if (res.url) $('vp-url-input').value = res.url;
    refreshScreenshot();
    startPolling();
  } catch (e) {
    alert('Gagal menjalankan instance: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path></svg><span>Jalankan</span>';
  }
}

async function stopActive() {
  if (!state.activeId) return;
  const btn = $('btn-top-stop');
  btn.disabled = true;
  try {
    await api(`/api/browser/stop?id=${state.activeId}`, 'POST');
    await refreshProfiles();
    renderList();
    renderActive();
    $('vp-placeholder').classList.remove('hidden');
    $('vp-status-dot').innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-neutral-600"></span> Offline';
    stopPolling();
  } catch (e) {
    alert('Gagal menghentikan instance: ' + e.message);
  } finally {
    btn.disabled = false;
  }
}

function setLoading(isLoading) {
  const btn = $('btn-vp-go');
  btn.disabled = isLoading;
  btn.innerText = isLoading ? '...' : 'Go';
}

// Flying Action Button (FAB) Controller
const fabBtn = $('fab-toggle-btn');
const fabPanel = $('fab-action-panel');
const fabHide = $('btn-hide-fab');
const fabSubmit = $('btn-fab-submit');
const fabCancel = $('btn-close-fab');

fabBtn.onclick = () => {
  fabPanel.classList.toggle('fab-hidden');
  if (!fabPanel.classList.contains('fab-hidden')) {
    $('fab-input-url').value = $('vp-url-input').value || '';
    $('fab-input-note').focus();
  }
};

fabCancel.onclick = () => {
  fabPanel.classList.add('fab-hidden');
};

fabHide.onclick = () => {
  $('fab-container').classList.add('hidden');
  state.fabHidden = true;
};

fabSubmit.onclick = async () => {
  const postUrl = $('fab-input-url').value.trim();
  const accountName = $('fab-input-account').value.trim();
  const action = $('fab-select-action').value;
  const note = $('fab-input-note').value.trim();

  if (!postUrl) {
    alert('Tautan URL postingan wajib diisi.');
    return;
  }

  try {
    await api('/api/logs', 'POST', {
      profileId: state.activeId || null,
      accountName,
      action,
      postUrl,
      note
    });

    $('fab-input-note').value = '';
    fabPanel.classList.add('fab-hidden');
    alert('Aktivitas berhasil dicatat!');
    await refreshLogs();
  } catch (err) {
    alert('Gagal mencatat log: ' + err.message);
  }
};

document.addEventListener('DOMContentLoaded', load);
