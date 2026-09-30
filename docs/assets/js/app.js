import { createStorageProvider } from './storage/createStorageProvider.js';
import { Store } from './core/store.js';
import { Router } from './core/router.js';
import { toast } from './ui/toast.js';
import { showDialog, closeDialog } from './ui/modal.js';
import { carLabel, money, selectedCar } from './ui/components.js';
import { renderVehicle } from './ui/vehicleRenderer.js';
import { renderShowroom } from './screens/showroom.js';
import { renderGarage } from './screens/garage.js';
import { renderParts } from './screens/parts.js';
import { renderUsedLot } from './screens/usedlot.js';
import { renderQuickRace } from './screens/quickRace.js';
import { renderRoguelike } from './screens/roguelike.js';
import { renderEvents, renderTeams, renderLeaderboards, renderMultiplayer } from './screens/placeholders.js';
import { loadSettings, renderSettings } from './screens/settings.js';
import { renderContentStudio } from './screens/contentStudio.js';
import { renderEngineStudio } from './screens/engineStudio.js';
import { renderPartsStudio } from './screens/partsStudio.js';

const storage = createStorageProvider();
const store = new Store();
const appRoot = document.getElementById('appRoot');
const bootScreen = document.getElementById('bootScreen');
const homeDashboard = document.getElementById('homeDashboard');
const screenRoot = document.getElementById('screenRoot');

loadSettings();

document.addEventListener('error', (event) => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement) || !image.matches('[data-vehicle-image]')) return;
  image.hidden = true;
  const fallback = image.parentElement?.querySelector('[data-vehicle-missing]');
  if (fallback) fallback.hidden = false;
}, true);

const TUTORIAL_ROUTES = {
  welcome: ['home', 'settings', 'content-studio', 'engine-studio', 'parts-studio'],
  buy_first_car: ['home', 'usedlot', 'settings', 'content-studio', 'engine-studio', 'parts-studio'],
  visit_garage: ['home', 'garage', 'settings', 'content-studio', 'engine-studio', 'parts-studio'],
  buy_first_upgrade: ['home', 'garage', 'parts', 'settings', 'content-studio', 'engine-studio', 'parts-studio'],
  install_first_upgrade: ['home', 'garage', 'settings', 'content-studio', 'engine-studio', 'parts-studio'],
  build_stages: ['home', 'quick-race', 'settings', 'content-studio', 'engine-studio', 'parts-studio'],
  first_race: ['home', 'quick-race', 'settings', 'content-studio', 'engine-studio', 'parts-studio']
};

const ROUTE_UNLOCK_LEVELS = {
  home: 1,
  garage: 1,
  parts: 1,
  'quick-race': 1,
  usedlot: 1,
  roguelike: 1,
  leaderboards: 3,
  showroom: 5,
  teams: 5,
  events: 7,
  multiplayer: 10,
  settings: 1,
  'content-studio': 1,
  'engine-studio': 1,
  'parts-studio': 1
};

const ctx = { storage, store, screenRoot, router: null, toast };
const router = new Router(ctx);
ctx.router = router;

router
  .register('home', renderHome)
  .register('showroom', feature(renderShowroom))
  .register('garage', feature(renderGarage))
  .register('parts', feature(renderParts))
  .register('usedlot', feature(renderUsedLot))
  .register('quick-race', feature(renderQuickRace))
  .register('roguelike', feature(renderRoguelike))
  .register('events', feature(renderEvents))
  .register('teams', feature(renderTeams))
  .register('leaderboards', feature(renderLeaderboards))
  .register('multiplayer', feature(renderMultiplayer))
  .register('content-studio', feature(renderContentStudio))
  .register('engine-studio', feature(renderEngineStudio))
  .register('parts-studio', feature(renderPartsStudio))
  .register('settings', feature(renderSettings));

store.onPlayer((player) => {
  renderChrome(player);
  if (router.current() === 'home') renderHomeOverview(player);
});

document.addEventListener('click', (event) => {
  const nav = event.target.closest('[data-nav]');
  if (!nav || appRoot.hidden) return;
  const route = nav.dataset.nav || 'home';
  if (!routeAllowed(store.player, route)) {
    event.preventDefault();
    if (store.player?.activeRace) {
      toast('Race in progress', 'Finish the active pass before leaving the track.');
    } else {
      toast('Tutorial objective first', 'Finish the highlighted tutorial step before opening that section.');
    }
    return;
  }
  if (!nav.disabled) router.navigate(route);
});

document.getElementById('logoutButton')?.addEventListener('click', logout);

boot();

async function boot() {
  try {
    const session = await storage.session();
    finishBoot();
    if (!session.authenticated) {
      lockApp();
      showLogin();
      return;
    }
    await enterGame(session);
  } catch (error) {
    finishBoot();
    lockApp();
    showFatal(error.message || 'Unable to start Forever Racing.');
  }
}

async function enterGame(session) {
  storage.setCsrf(session.csrf);
  store.setPlayer(session.player);
  appRoot.hidden = false;
  if (session.player?.activeRace && router.current() !== 'quick-race') {
    history.replaceState(null, '', '#/quick-race');
  } else if (!location.hash) {
    history.replaceState(null, '', '#/home');
  }
  router.start();
  if (session.player?.tutorial?.status === 'active' && session.player?.tutorial?.step === 'welcome') {
    scheduleWelcomeTutorial();
  }
}

function lockApp() {
  appRoot.hidden = true;
  screenRoot.innerHTML = '';
}

function finishBoot() {
  if (!bootScreen) return;
  bootScreen.classList.add('is-done');
  setTimeout(() => bootScreen.remove(), 220);
}

function showLogin() {
  const dialog = showDialog(`
    <form class="dialog-body login-panel" data-login-form>
      <span class="section-label">FOREVER RACING / DEVELOPMENT ACCESS</span>
      <h2>Sign in</h2>
      <p>${storage.mode === 'local' ? 'GitHub Pages uses a simulated local identity and browser-local save. Admin is a disposable tutorial test account: signing out wipes its player save.' : 'Player state is tied to an authenticated server session. Only one active session per account is allowed; Admin is reset when it signs out.'}</p>
      <div class="field"><label for="loginUsername">Username</label><input id="loginUsername" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required></div>
      <div class="field"><label for="loginPassword">Password</label><input id="loginPassword" name="password" type="password" autocomplete="current-password" required></div>
      <div class="form-error" data-login-error></div>
      <div class="dialog-actions"><button class="button button--primary button--wide" type="submit">ENTER GARAGE</button></div>
      <p class="dev-credential">Dev: <strong>Admin</strong> / <strong>12345</strong></p>
    </form>`, { locked: true });

  setTimeout(() => dialog.querySelector('input')?.focus(), 30);
  dialog.querySelector('[data-login-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = event.submitter;
    const error = dialog.querySelector('[data-login-error]');
    const form = new FormData(event.currentTarget);
    submit.disabled = true;
    error.textContent = '';
    try {
      const session = await storage.login(String(form.get('username') || ''), String(form.get('password') || ''));
      closeDialog(dialog);
      await enterGame(session);
    } catch (err) {
      error.textContent = err.message;
      submit.disabled = false;
    }
  });
}

function scheduleWelcomeTutorial(attempt = 0) {
  setTimeout(() => {
    const tutorial = store.player?.tutorial;
    if (tutorial?.status !== 'active' || tutorial?.step !== 'welcome') return;
    if (document.querySelector('dialog[open]')) {
      if (attempt < 40) scheduleWelcomeTutorial(attempt + 1);
      return;
    }
    showWelcomeTutorial();
  }, attempt === 0 ? 80 : 50);
}

function showWelcomeTutorial() {
  if (document.querySelector('dialog[open]')) return;
  const dialog = showDialog(`
    <div class="dialog-body ftue-welcome">
      <span class="section-label">FIRST TIME IN FOREVER RACING</span>
      <h2>Start at the bottom. Build your way up.</h2>
      <p>Your first goal is simple: find a starter car, make one upgrade, and take it down the 1/4 mile.</p>
      <div class="ftue-points">
        <div><b>1</b><span><strong>Find a beater</strong>Your first car comes from the Classifieds, not a new-car showroom.</span></div>
        <div><b>2</b><span><strong>Make it yours</strong>Buy and install one guided Intake upgrade.</span></div>
        <div><b>3</b><span><strong>Run the quarter</strong>Your first pass is a clean local test-and-tune race.</span></div>
      </div>
      <div class="dialog-actions"><button class="button button--primary button--wide ftue-primary-action" data-start-ftue>SELECT FIRST CAR</button></div>
    </div>`, { locked: true });

  dialog.querySelector('[data-start-ftue]')?.addEventListener('click', async (event) => {
    event.currentTarget.disabled = true;
    try {
      const data = await storage.tutorialAdvance('welcome_complete');
      store.setPlayer(data.player);
      closeDialog(dialog);
      router.navigate(data.player?.tutorial?.step === 'visit_garage' ? 'garage' : 'usedlot');
    } catch (err) {
      toast('Tutorial error', err.message);
      event.currentTarget.disabled = false;
    }
  });
}

function showFatal(message) {
  const dialog = showDialog(`<div class="dialog-body"><h2>Forever Racing could not start</h2><p>${escapeText(message)}</p><div class="dialog-actions"><button class="button button--primary" type="button" data-retry>RETRY</button></div></div>`, { locked: true });
  dialog.querySelector('[data-retry]')?.addEventListener('click', () => location.reload());
}

async function logout() {
  const button = document.getElementById('logoutButton');
  if (button) button.disabled = true;
  let reset = false;
  try {
    const result = await storage.logout();
    reset = Boolean(result?.reset);
  } catch (error) {
    toast('Sign out warning', error.message);
  } finally {
    storage.clearCsrf();
    store.clear();
    lockApp();
    history.replaceState(null, '', location.pathname + location.search);
    showLogin();
    if (reset) toast('Admin reset', 'Player data was erased. The next login starts at the tutorial.');
    if (button) button.disabled = false;
  }
}

async function renderHome() {
  homeDashboard.hidden = false;
  screenRoot.innerHTML = '';
  renderHomeOverview(store.player);
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function feature(renderer) {
  return async (context) => {
    homeDashboard.hidden = true;
    await renderer(context);
    window.scrollTo({ top: 0, behavior: document.documentElement.dataset.reduceMotion === 'true' ? 'auto' : 'smooth' });
  };
}

function renderChrome(player) {
  if (!player) return;
  setText('railPlayerName', player.user?.username || 'Admin');
  setText('railCredits', money(player.wallet?.credits || 0));
  setText('railLevel', player.progression?.level || 1);
  setText('railExp', player.progression?.exp || 0);
  setText('railRep', player.progression?.rep || 0);
  renderObjectiveRail(player);
  applyTutorialNavigation(player);
  applyNavigationVisibility(player);
}

function renderHomeOverview(player) {
  const current = selectedCar(player);
  const visual = document.getElementById('homeVehicleVisual');
  const name = document.getElementById('homeCarName');
  const factory = document.getElementById('homeCarFactory');
  const stats = document.getElementById('homeCarStats');
  const build = document.getElementById('homeBuildSummary');
  const activity = document.getElementById('homeActivity');

  if (visual) visual.innerHTML = current ? renderVehicle(current, { stage: Number(current.buildStage || 1), view: 'showroom' }) : '<div class="no-car-visual">NO CURRENT CAR</div>';
  if (name) name.textContent = current ? carLabel(current) : 'No current car';
  if (factory) factory.textContent = current ? current.displayName : 'Find a starter in Classifieds to begin your first build.';
  if (stats) stats.innerHTML = current
    ? `<span><b>${current.derived?.hp || 0}</b> HP</span><span><b>${current.derived?.torque || 0}</b> LB-FT</span><span><b>${current.derived?.weight || 0}</b> LB</span><span><b>${current.base?.drivetrain || '-'}</b> DRIVE</span>`
    : '<span><b>-</b> HP</span><span><b>-</b> LB-FT</span><span><b>-</b> LB</span><span><b>-</b> DRIVE</span>';
  if (build) build.innerHTML = current
    ? `<b>BUILD TYPE</b><span>${stageName(Number(current.buildStage || 1))}</span>`
    : '<b>BUILD TYPE</b><span>No active build.</span>';

  if (activity) {
    const rows = [...(player.transactions || [])].slice(-6).reverse();
    activity.innerHTML = rows.length
      ? rows.map((row) => `<div><span>${escapeText(row.description || row.type)}</span><b class="${Number(row.amount) >= 0 ? 'good' : ''}">${Number(row.amount) > 0 ? '+' : ''}${money(row.amount || 0)}</b></div>`).join('')
      : '<div><span>No activity yet.</span><b>-</b></div>';
  }
}

function renderObjectiveRail(player) {
  const node = document.getElementById('tutorialRail');
  if (!node) return;
  const tutorial = player?.tutorial || {};
  if (tutorial.status !== 'active') {
    node.innerHTML = '<span class="rail-state rail-state--done">BASICS COMPLETE</span><strong>Enter The Circuit</strong><p>Your career starts at local meets. More game systems unlock as your Level rises.</p><button class="rail-link" data-nav="roguelike">OPEN THE CIRCUIT</button>';
    return;
  }
  const info = objectiveInfo(tutorial.step);
  node.innerHTML = `<span class="rail-state">${info.code}</span><strong>${info.title}</strong><p>${info.copy}</p>${info.route ? `<button class="rail-link" data-nav="${info.route}">${info.action}</button>` : ''}`;
}

function routeAllowed(player, route) {
  if (player?.activeRace && route !== 'quick-race') return false;
  const tutorial = player?.tutorial;
  if (tutorial?.status === 'active') {
    const allowed = TUTORIAL_ROUTES[tutorial.step] || ['home', 'settings'];
    return allowed.includes(route);
  }
  const requiredLevel = Number(ROUTE_UNLOCK_LEVELS[route] || 1);
  return Number(player?.progression?.level || 1) >= requiredLevel;
}

function applyTutorialNavigation(player) {
  const tutorialActive = player?.tutorial?.status === 'active';
  const level = Number(player?.progression?.level || 1);
  document.querySelectorAll('button[data-nav]').forEach((button) => {
    const route = button.dataset.nav || 'home';
    const locked = !routeAllowed(player, route);
    button.disabled = locked;
    button.classList.toggle('is-locked', locked);

    const subtitle = button.querySelector('span');
    if (subtitle && !button.dataset.defaultSubtitle) button.dataset.defaultSubtitle = subtitle.textContent || '';
    const requiredLevel = Number(ROUTE_UNLOCK_LEVELS[route] || 1);
    if (!tutorialActive && locked && requiredLevel > level && subtitle) {
      subtitle.textContent = `Unlocks Lv ${requiredLevel}`;
      button.title = `Unlocks at Level ${requiredLevel}`;
    } else if (subtitle && button.dataset.defaultSubtitle) {
      subtitle.textContent = button.dataset.defaultSubtitle;
      button.title = '';
    }
  });
}

function applyNavigationVisibility(player) {
  const showroom = document.querySelector('.nav-rail button[data-nav="showroom"]');
  if (showroom) showroom.hidden = player?.tutorial?.status === 'active';

  const studio = document.querySelector('.nav-rail button[data-nav="content-studio"]');
  if (studio) {
    const username = String(player?.user?.username || "").toLowerCase();
    studio.hidden = storage.mode !== 'local' && username !== 'admin';
  }
}

function objectiveInfo(step) {
  const map = {
    welcome: { code: 'STEP 1/6', title: 'Start the tutorial', copy: 'A short introduction will explain the core loop.', action: '', route: '' },
    buy_first_car: { code: 'STEP 2/6', title: 'Choose your first car', copy: 'Pick one of the highlighted starter cars from the Classifieds.', action: 'OPEN CLASSIFIEDS', route: 'usedlot' },
    visit_garage: { code: 'STEP 3/6', title: 'Read your car', copy: 'Visit the Garage and learn the car stats and Build Type.', action: 'OPEN GARAGE', route: 'garage' },
    buy_first_upgrade: { code: 'STEP 4/6', title: 'Buy the Intake', copy: 'The tutorial locks you to Intake. Buy the Stage 1 Intake to continue.', action: 'OPEN PARTS', route: 'parts' },
    install_first_upgrade: { code: 'STEP 5/6', title: 'Install the Intake', copy: 'Open Garage Inventory and install the Intake you just bought.', action: 'OPEN GARAGE', route: 'garage' },
    build_stages: { code: 'STEP 6/6', title: 'Run your first race', copy: 'Build-type conversion will be introduced later when the Street Car is actually complete.', action: 'QUICK RACE', route: 'quick-race' },
    first_race: { code: 'STEP 6/6', title: 'Run the 1/4 mile', copy: 'Quick Race is now the only route. Start the highlighted 1/4-mile pass.', action: 'START FIRST RACE', route: 'quick-race' }
  };
  return map[step] || { code: 'STEP', title: 'Continue', copy: 'Follow the highlighted game action.', action: '', route: '' };
}

function stageName(stage) {
  return ({ 1: 'Street Car', 2: 'Street Race Car', 3: 'Front-Half Race Car', 4: 'Full Race Car' })[stage] || 'Unknown';
}

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = String(value);
}

function escapeText(value) {
  const div = document.createElement('div');
  div.textContent = String(value ?? '');
  return div.innerHTML;
}

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  addEventListener('load', async () => {
    const localDev = document.documentElement.dataset.storageMode === 'local';
    if (localDev) {
      await clearForeverRacingCaches({ unregister: true });
      return;
    }
    const build = document.documentElement.dataset.build || '';
    navigator.serviceWorker.register(`service-worker.js?v=${encodeURIComponent(build)}`, { updateViaCache: 'none' })
      .then((registration) => registration.update())
      .catch(() => {});
  });
}

async function clearForeverRacingCaches({ unregister = false } = {}) {
  if (unregister && 'serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations().catch(() => []);
    await Promise.all(registrations.map((registration) => registration.unregister().catch(() => false)));
  }
  if ('caches' in window) {
    const keys = await caches.keys().catch(() => []);
    await Promise.all(keys.filter((key) => key.startsWith('forever-racing-shell-')).map((key) => caches.delete(key)));
  }
}