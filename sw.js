/* Service worker — Puisi
   Sengaja TIDAK meng-cache index.html atau aset apa pun: aplikasi ini butuh
   koneksi ke Supabase untuk berfungsi, dan cache lama bisa membuat perubahan
   (sandi, konfigurasi, perbaikan) tertunda tampil. Peran sw.js di sini murni:
   1) syarat teknis agar bisa dipasang ke layar utama (installable PWA), dan
   2) menampilkan & menangani ketukan notifikasi push.
*/
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

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
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      renotify: true,
      icon: 'icons/icon-192.png',
      badge: 'icons/badge-72.png',
      data: { room, count: data.count || 1 }
    })
  );
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
