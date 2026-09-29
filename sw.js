/* Service worker — Puisi
   Sengaja TIDAK meng-cache index.html atau aset apa pun: aplikasi ini butuh
   koneksi ke Supabase untuk berfungsi, dan cache lama bisa membuat perubahan
   (sandi, konfigurasi, perbaikan) tertunda tampil. Peran sw.js di sini murni:
   1) syarat teknis agar bisa dipasang ke layar utama (installable PWA), dan
   2) menampilkan & menangani ketukan notifikasi push.
*/
/* Isi ini sama seperti CONFIG.SUPABASE_URL / CONFIG.SUPABASE_KEY di index.html.
   Anon key BUKAN rahasia (dipakai juga di index.html, terlihat siapa saja yang buka
   DevTools) — aman ditaruh di sini. */
const SUPABASE_URL = 'https://zwsllgsjfnypwritsxfx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3c2xsZ3NqZm55cHdyaXRzeGZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk4NDcwMzIsImV4cCI6MjEwNTQyMzAzMn0.QckLgUtiw3peQt4x2cmi1w8hSzyxWdaixP-Bbp85-2w';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

/* Tandai pesan sebagai "diterima" (delivered_at) tepat saat notifikasi tampil —
   tidak menunggu aplikasi dibuka. Gagal diam-diam kalau offline/endpoint belum
   terdaftar; notifikasi tetap harus tampil apa pun yang terjadi di sini. */
async function ackDelivered(room) {
  if (!room) return;
  try {
    const sub = await self.registration.pushManager.getSubscription();
    if (!sub) return;
    await fetch(SUPABASE_URL + '/rest/v1/rpc/push_ack_delivered', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY },
      body: JSON.stringify({ p_endpoint: sub.endpoint, p_room: room })
    });
  } catch (e) {}
}

/* Notifikasi push masuk.
   Payload yang diharapkan dari server (opsional, semua punya nilai cadangan):
   { title, body, room: 'saskia'|'selpia', count }
   Isi pesan sendiri TIDAK pernah dikirim lewat push — hanya info generik. */
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {}
  const room = (data.room === 'saskia' || data.room === 'selpia') ? data.room : null;
  const title = data.title || 'Puisi';
  const body = data.body || 'Ada yang baru untukmu.';
  const tag = room ? 'rk-' + room : 'rk-msg';
  event.waitUntil((async () => {
    await self.registration.showNotification(title, {
      body,
      tag,
      renotify: true,
      icon: 'icons/icon-192.png',
      badge: 'icons/badge-72.png',
      data: { room, count: data.count || 1 }
    });
    await ackDelivered(room);   // setelah notifikasi tampil, supaya jaringan lambat tidak menundanya
  })());
});

/* Ketukan notifikasi: fokuskan/​buka tab yang ada, lalu minta halaman pindah
   ke ruang yang tepat (lewat postMessage — ditangani di index.html). */
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const room = event.notification.data && event.notification.data.room;
  event.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of list) {
      if ('focus' in c) { c.postMessage({ type: 'open-room', room }); return c.focus(); }
    }
    if (self.clients.openWindow) return self.clients.openWindow(room ? './?room=' + room : './');
  })());
});

self.addEventListener('notificationclose', () => {}); // tak perlu tindakan

/* Browser kadang memutar/mengganti langganan push (mis. kedaluwarsa). Tanpa ini,
   notifikasi diam-diam berhenti sampai aplikasi dibuka lagi. Di sini kita berlangganan
   ulang dan memindahkan perangkat ke endpoint baru lewat RPC push_rotate (tanpa login;
   yang jadi bukti hanyalah endpoint lama). */
self.addEventListener('pushsubscriptionchange', event => {
  event.waitUntil((async () => {
    try {
      const old = event.oldSubscription || null;
      const key = (old && old.options && old.options.applicationServerKey) ||
                  (event.newSubscription && event.newSubscription.options && event.newSubscription.options.applicationServerKey);
      const sub = event.newSubscription || (key ? await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }) : null);
      if (!sub || !old) return;
      const j = sub.toJSON();
      if (!j.keys) return;
      await fetch(SUPABASE_URL + '/rest/v1/rpc/push_rotate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY },
        body: JSON.stringify({ p_old_endpoint: old.endpoint, p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth })
      });
    } catch (e) {}
  })());
});
