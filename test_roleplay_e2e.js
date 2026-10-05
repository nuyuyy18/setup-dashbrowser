/**
 * DashBrowser End-to-End Roleplay & Integration Test
 * Simulates Admin (Web Server) + Team Operator (Local Desktop/Tauri Client)
 */
const assert = require('assert');

const SERVER_URL = 'http://127.0.0.1:8200';

async function roleplayTest() {
  console.log('========================================================');
  console.log('🎭 ROLEPLAY & END-TO-END TEST: DASHBROWSER TAURI WORKFLOW');
  console.log('========================================================\n');

  // STEP 1: [ADMIN ROLE] Memasukkan Akun Massal dari Spreadsheet di Server Dashboard
  console.log('👤 [ROLE: ADMIN @ SERVER DASHBOARD]');
  console.log('1. Memasukkan spreadsheet akun promo Threads & IG...');
  
  const rawSpreadsheetData = 
`Akun Threads Talent A\thttps://www.threads.net\tsessionid=test_threads_tok_9911; ds_user_id=8831920\tsingapore
Akun IG Promotor B\thttps://www.instagram.com\tsessionid=test_ig_tok_5522; ds_user_id=7711920\tindonesia`;

  const parseRes = await fetch(`${SERVER_URL}/api/bulk/parse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rawText: rawSpreadsheetData })
  }).then(r => r.json());

  console.log(`   ✓ Hasil parse spreadsheet: ${parseRes.total} akun terdeteksi, ${parseRes.validCount} valid.`);
  assert.strictEqual(parseRes.validCount, 2, 'Harus terdeteksi 2 akun valid');

  const importRes = await fetch(`${SERVER_URL}/api/bulk/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rawText: rawSpreadsheetData })
  }).then(r => r.json());

  console.log(`   ✓ ${importRes.createdCount} akun profil berhasil disimpan di server vault.`);
  assert.strictEqual(importRes.createdCount, 2);

  const targetAccount = importRes.created[0];
  console.log(`   ✓ Akun terpilih untuk tim: "${targetAccount.name}" (ID: ${targetAccount.id})\n`);

  // STEP 2: [ADMIN ROLE] Menerbitkan 3-Hour Session Bundle
  console.log('2. Menerbitkan 3-Hour Session Bundle untuk tim operator...');
  const bundleRes = await fetch(`${SERVER_URL}/api/profiles/${targetAccount.id}/bundle`).then(r => r.json());
  
  assert.strictEqual(bundleRes.ok, true);
  const bundle = bundleRes.bundle;
  console.log(`   ✓ Bundle diterbitkan! Berlaku s.d: ${bundle.expiresAt} (TTL: ${bundle.ttlHours} jam)`);
  console.log(`   ✓ Signature token: ${bundle.signature}\n`);

  // STEP 3: [OPERATOR ROLE] Tim Operator Membuka Klien Desktop (Tauri / Local Client)
  console.log('🧑‍💻 [ROLE: TIM OPERATOR @ DESKTOP TAURI CLIENT]');
  console.log('3. Klien desktop Tauri melakukan handshake ke server vault...');
  
  const profilesPull = await fetch(`${SERVER_URL}/api/profiles`).then(r => r.json());
  console.log(`   ✓ Terhubung ke server! Daftar profil yang tersedia: ${profilesPull.length} akun.`);
  assert(profilesPull.length >= 2);

  console.log('4. Mengunduh payload bundle akun yang ditugaskan...');
  const operatorBundle = await fetch(`${SERVER_URL}/api/profiles/${targetAccount.id}/bundle`).then(r => r.json());
  
  // Validasi masa berlaku (3 Jam)
  const now = Date.now();
  const expiryTime = new Date(operatorBundle.bundle.expiresAt).getTime();
  assert(now < expiryTime, 'Bundle harus belum kedaluwarsa');
  const sisaMenit = Math.round((expiryTime - now) / 60000);
  console.log(`   ✓ Bundle terverifikasi valid! Sisa masa aktif sesi: ${sisaMenit} menit.`);
  console.log(`   ✓ Browser lokal di-booting dengan GPU asli & cookie (${operatorBundle.bundle.cookieCount} item).\n`);

  // STEP 4: [OPERATOR ROLE] Melakukan Tugas (Komentar di Postingan Target)
  console.log('5. Operator selesai berkomentar di postingan target...');
  const targetPostUrl = 'https://www.threads.net/@influencer/post/C9x81aB';
  const commentText = 'Keren banget analisisnya bang, izin bookmark ya!';
  
  console.log(`   - Tautan Postingan : ${targetPostUrl}`);
  console.log(`   - Isi Komentar     : "${commentText}"`);
  console.log('   - Mengirim laporan aktivitas ke server pusat...');

  const logSubmitRes = await fetch(`${SERVER_URL}/api/logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      postUrl: targetPostUrl,
      action: 'Komentar',
      note: commentText,
      accountName: operatorBundle.bundle.name,
      profileId: operatorBundle.bundle.profileId
    })
  }).then(r => r.json());

  console.log(`   ✓ Laporan berhasil tersimpan di server! (Log ID: ${logSubmitRes.id})\n`);

  // STEP 5: [ADMIN ROLE] Rekapan & Verifikasi di Dashboard Pusat
  console.log('👤 [ROLE: ADMIN @ SERVER DASHBOARD]');
  console.log('6. Memeriksa rekapan seluruh aktivitas tim hari ini...');
  
  const allLogs = await fetch(`${SERVER_URL}/api/logs`).then(r => r.json());
  const foundLog = allLogs.find(l => l.id === logSubmitRes.id);
  
  assert(foundLog, 'Log dari operator harus tercatat di database server');
  console.log(`   ✓ Terverifikasi: Total ${allLogs.length} aktivitas tercatat.`);
  console.log(`   ✓ Log terbaru: [${foundLog.action}] Akun "${foundLog.accountName}" pada ${foundLog.postUrl}`);
  console.log(`   ✓ Catatan: "${foundLog.note}"`);

  console.log('\n========================================================');
  console.log('🎉 SEMUA TAHAPAN ROLEPLAY & UJI INTEGRASI BERJALAN NORMAL!');
  console.log('========================================================\n');
}

roleplayTest().catch(err => {
  console.error('❌ Uji Roleplay Gagal:', err);
  process.exit(1);
});
