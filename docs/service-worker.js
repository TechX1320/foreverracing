const CACHE = 'forever-racing-shell-v0.6.0-a.2';
const SHELL = [
  './',
  './manifest.webmanifest',
  './favicon.svg',
  './assets/css/app.css',
  './assets/art/race/road.jpg',
  './assets/art/race/race_track.png',
  './assets/art/race/start.png',
  './assets/art/race/finish.png',
  './assets/art/race/divider.png',
  './assets/art/race/shadow.png',
  './assets/art/race/xmas.png',
  './assets/art/race/smoke.png',
  './assets/art/cars/race/golf_gti/body.png',
  './assets/art/cars/race/golf_gti/wheel.png',
  './assets/art/cars/race/golf_gti/disk.png',
  './assets/art/cars/race/golf_gti/detail.png',
  './assets/art/cars/race/mazda_rx8/body.png',
  './assets/art/cars/race/mazda_rx8/wheel.png',
  './assets/art/cars/race/mazda_rx8/disk.png',
  './assets/art/cars/race/mazda_rx8/detail.png',
  './assets/art/cars/race/renault_clio/body.png',
  './assets/art/cars/race/renault_clio/wheel.png',
  './assets/art/cars/race/renault_clio/disk.png',
  './assets/art/cars/race/renault_clio/detail.png',
  './assets/art/cars/atlas/cars-1.png',
  './assets/art/cars/atlas/cars-2.png',
  './assets/art/cars/atlas/cars-3.png',
  './assets/art/cars/atlas/cars-4.png',
  './assets/art/cars/atlas/cars-5.png',
  './assets/art/cars/layered/golf_gti/certified.png',
  './assets/art/cars/layered/golf_gti/body.webp',
  './assets/art/cars/layered/golf_gti/wheel.webp',
  './assets/art/cars/layered/golf_gti/disk.webp',
  './assets/art/cars/layered/golf_gti/detail.webp',
  './assets/art/cars/layered/mazda_rx8/certified.png',
  './assets/art/cars/layered/mazda_rx8/body.webp',
  './assets/art/cars/layered/mazda_rx8/wheel.webp',
  './assets/art/cars/layered/mazda_rx8/disk.webp',
  './assets/art/cars/layered/mazda_rx8/detail.webp',
  './assets/art/cars/layered/renault_clio/certified.png',
  './assets/art/cars/layered/renault_clio/body.webp',
  './assets/art/cars/layered/renault_clio/wheel.webp',
  './assets/art/cars/layered/renault_clio/disk.webp',
  './assets/art/cars/layered/renault_clio/detail.png',
  './assets/js/app.js',
  './assets/js/core/api.js',
  './assets/js/core/store.js',
  './assets/js/core/router.js',
  './assets/js/domain/LocalGameService.js',
  './assets/js/domain/RaceSimulator.js',
  './assets/js/domain/PerformanceIndex.js',
  './assets/js/domain/ContentRelease.js',
  './assets/js/domain/EngineCatalog.js',
  './assets/js/domain/EngineSwap.js',
  './assets/js/domain/CircuitCatalog.js',
  './assets/js/domain/ForcedInduction.js',
  './assets/js/domain/PartCatalog.js',
  './assets/js/domain/PowerModel.js',
  './assets/js/domain/Tuning.js',
  './assets/js/content/ContentStudioEngineCatalog.js',
  './assets/js/content/ContentStudioPartCatalog.js',
  './assets/js/content/ContentStudioCircuitCatalog.js',
  './assets/js/screens/engineStudio.js',
  './assets/js/screens/engineSwapShop.js',
  './assets/js/screens/partsStudio.js',
  './assets/js/screens/circuitStudio.js',
  './assets/js/storage/StorageProvider.js',
  './assets/js/storage/ApiStorageProvider.js',
  './assets/js/storage/LocalStorageProvider.js',
  './assets/js/storage/createStorageProvider.js',
  './assets/js/ui/toast.js',
  './assets/js/ui/modal.js',
  './assets/js/ui/components.js',
  './assets/js/ui/vehicleRenderer.js',
  './assets/js/ui/partDyno.js',
  './assets/js/ui/racePresentation.js',
  './assets/js/content/ContentStudioCatalog.js',
  './assets/js/screens/contentStudio.js',
  './assets/js/screens/showroom.js',
  './assets/js/screens/garage.js',
  './assets/js/screens/parts.js',
  './assets/js/screens/usedlot.js',
  './assets/js/screens/quickRace.js',
  './assets/js/screens/roguelike.js',
  './assets/js/screens/placeholders.js',
  './assets/js/screens/settings.js',
  './data/catalog/cars.json',
  './data/catalog/car-art.json',
  './data/catalog/parts.json',
  './data/catalog/engines.json',
  './data/catalog/circuits.json',
  './data/config/game.json',
  './data/config/build-stages.json',
  './data/config/racing.json'
]

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
