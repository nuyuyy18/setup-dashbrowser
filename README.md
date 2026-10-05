# DashBrowser 🛡️

**DashBrowser** adalah Multi-Account Stealth Profile Manager berbasis **CloakBrowser** (Stealth Chromium anti-detection engine dari CloakHQ). Memungkinkan Anda mengelola banyak akun secara terpisah dengan cookie, storage, proxy, dan Chrome extension tersendiri.

---

## 🚀 Fitur Utama

1. **Multi-Account Profile Switcher**:
   - Isolasi total cookie, local storage, dan session per profil/akun.
   - Indikator LED status profil yang sedang aktif (`RUNNING` / `STOPPED`).
   - Quick launch & stop 1-click dari dashboard atau sidebar.

2. **Stealth Engine (CloakBrowser Chromium)**:
   - Built-in C++ fingerprint patches (WebGL, Canvas, WebRTC, Audio, Screen, TLS fingerprint).
   - Menembus bot detection (Cloudflare Turnstile, reCAPTCHA, FingerprintJS, BrowserScan).
   - Stealth Humanize: emulasi gerakan mouse dan tombol keyboard mirip manusia.

3. **Extension Support**:
   - Import Chrome Extensions dari unpacked folder atau file `.zip` / `.crx`.
   - Pilih dan pasang extension mana saja ke masing-masing profil secara bebas.

4. **Proxy & Auto-GeoIP**:
   - Mendukung proxy **HTTP / HTTPS / SOCKS5** dengan otentikasi username & password.
   - Auto-GeoIP: otomatis menyelaraskan timezone dan locale browser sesuai IP lokasi proxy.

---

## 📦 Cara Menjalankan Aplikasi

### 1. Install Dependencies
```bash
npm install
```

### 2. Jalankan DashBrowser
```bash
npm start
```

---

## 🧩 Cara Menggunakan Extension

1. Buka tab **Extensions** di sidebar DashBrowser.
2. Klik **Import Folder** (pilih folder unpacked extension yang berisi `manifest.json`) atau **Import ZIP / CRX**.
3. Buka tab **Profiles** -> Klik tombol **✏️ Edit** pada profil akun pilihan Anda.
4. Di bagian **Attached Extensions**, beri centang pada extension yang ingin dipakai.
5. Klik **Save Profile** dan tekan **🚀 Launch**. Extension akan otomatis dimuat ke dalam instance CloakBrowser stealth akun tersebut!

---

## 🔑 Lisensi & Session Concurrent

- CloakBrowser binary **100% Gratis** untuk 1 concurrent session (1 browser aktif).
- Jika Anda ingin menjalankan banyak browser stealth sekaligus secara serentak, Anda dapat memasukkan license key di tab **⚙️ Cloak Engine Settings**.
