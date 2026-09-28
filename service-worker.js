const CACHE = 'forever-racing-shell-v0.3.0-a';
const SHELL = [
  './',
  './manifest.webmanifest',
  './assets/css/app.css',
  './assets/art/cars/cars-top-down-v1.png',
  './assets/art/cars/vehicles/2005-ford-mustang-gt-top-down-v03a.png',
  './assets/art/cars/vehicles/1998-honda-civic-dx-top-down-v03a.png',
  './assets/art/cars/vehicles/2003-nissan-350z-side-profile.png',
  './assets/art/cars/vehicles/2005-ford-mustang-gt-side-profile.png',
  './assets/art/cars/vehicles/1998-honda-civic-dx-side-profile.png',
  './assets/art/cars/vehicles/1998-honda-civic-dx-top-down.png',
  './assets/art/cars/vehicles/2003-nissan-350z-top-down.png',
  './assets/art/cars/vehicles/2004-subaru-impreza-wrx-sti-top-down.png',
  './assets/art/cars/vehicles/2005-ford-mustang-gt-top-down.png',
  './assets/js/app.js',
  './assets/js/core/api.js',
  './assets/js/core/store.js',
  './assets/js/core/router.js',
  './assets/js/domain/LocalGameService.js',
  './assets/js/storage/StorageProvider.js',
  './assets/js/storage/ApiStorageProvider.js',
  './assets/js/storage/LocalStorageProvider.js',
  './assets/js/storage/createStorageProvider.js',
  './assets/js/ui/toast.js',
  './assets/js/ui/modal.js',
  './assets/js/ui/components.js',
  './assets/js/ui/vehicleRenderer.js',
  './assets/js/screens/showroom.js',
  './assets/js/screens/garage.js',
  './assets/js/screens/parts.js',
  './assets/js/screens/usedlot.js',
  './assets/js/screens/quickRace.js',
  './assets/js/screens/roguelike.js',
  './assets/js/screens/placeholders.js',
  './assets/js/screens/settings.js',
  './data/catalog/cars.json',
  './data/catalog/parts.json',
  './data/catalog/engines.json',
  './data/config/game.json',
  './data/config/build-stages.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/api/')) return;

  event.respondWith(
    fetch(request, { cache: 'no-store' }).then((response) => {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(request, copy));
      return response;
    }).catch(async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      if (request.mode === 'navigate') return caches.match('./');
      return Response.error();
    })
  );
});
