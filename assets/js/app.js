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
  welcome: ['home', 'settings'],
  buy_first_car: ['home', 'showroom', 'settings'],
  visit_garage: ['home', 'garage', 'settings'],
  buy_first_upgrade: ['home', 'garage', 'parts', 'settings'],
  install_first_upgrade: ['home', 'garage', 'parts', 'settings'],
  build_stages: ['home', 'garage', 'parts', 'settings'],
  first_race: ['home', 'garage', 'parts', 'quick-race', 'settings']
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
    toast('Tutorial objective first', 'Finish the highlighted FTUE step before opening that section.');
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
  router.start();
  if (!location.hash) router.navigate('home', { replace: true });
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
      <p>${storage.mode === 'local' ? 'GitHub Pages uses a simulated local identity and browser-local save. Admin is a disposable FTUE test account: signing out wipes its player save.' : 'Player state is tied to an authenticated server session. Only one active session per account is allowed; Admin is reset when it signs out.'}</p>
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
      <h2>Build cars. Move them forward.</h2>
      <p>Buy cars, develop them through increasingly serious Build Stages, race them, collect them, and eventually compete through events, teams and longer PvE runs.</p>
      <div class="ftue-points">
        <div><b>1</b><span><strong>Get a car</strong>Choose a platform you actually want to build.</span></div>
        <div><b>2</b><span><strong>Modify it</strong>Stage 1 teaches the upgrade system with clear, permanent progression.</span></div>
        <div><b>3</b><span><strong>Race it</strong>Your build changes the numbers that drive the race simulation.</span></div>
      </div>
      <div class="dialog-actions"><button class="button button--primary" data-start-ftue>START WITH A CAR</button></div>
    </div>`, { locked: true });

  dialog.querySelector('[data-start-ftue]')?.addEventListener('click', async (event) => {
    event.currentTarget.disabled = true;
    try {
      const data = await storage.tutorialAdvance('welcome_complete');
      store.setPlayer(data.player);
      closeDialog(dialog);
      router.navigate(data.player?.tutorial?.step === 'visit_garage' ? 'garage' : 'showroom');
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
    if (reset) toast('Admin reset', 'Player data was erased. The next login starts at FTUE.');
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
  const current = selectedCar(player);
  setText('playerName', player.user?.username || 'Admin');
  setText('statCredits', money(player.wallet?.credits || 0));
  setText('statLevel', player.progression?.level || 1);
  setText('statExp', player.progression?.exp || 0);
  setText('statRep', player.progression?.rep || 0);
  setText('currentCarName', current ? carLabel(current) : 'None');
  setText('currentStage', current ? `S${Number(current.buildStage || 1)}` : '-');
  setText('statusHp', current ? current.derived?.hp || 0 : '-');
  setText('statusWeight', current ? current.derived?.weight || 0 : '-');
  renderObjectiveRail(player);
  applyTutorialNavigation(player);
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
  if (factory) factory.textContent = current ? current.displayName : 'Visit the Showroom to start a build.';
  if (stats) stats.innerHTML = current
    ? `<span><b>${current.derived?.hp || 0}</b> HP</span><span><b>${current.derived?.torque || 0}</b> LB-FT</span><span><b>${current.derived?.weight || 0}</b> LB</span><span><b>${current.base?.drivetrain || '-'}</b> DRIVE</span>`
    : '<span><b>-</b> HP</span><span><b>-</b> LB-FT</span><span><b>-</b> LB</span><span><b>-</b> DRIVE</span>';
  if (build) build.innerHTML = current
    ? `<b>BUILD STAGE ${Number(current.buildStage || 1)}</b><span>${stageName(Number(current.buildStage || 1))}</span>`
    : '<b>BUILD STAGE -</b><span>No active build.</span>';

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
    node.innerHTML = '<span class="rail-state rail-state--done">BASICS COMPLETE</span><p>Build what you want. The tutorial no longer restricts navigation.</p>';
    return;
  }
  const info = objectiveInfo(tutorial.step);
  node.innerHTML = `<span class="rail-state">${info.code}</span><strong>${info.title}</strong><p>${info.copy}</p>${info.route ? `<button class="rail-link" data-nav="${info.route}">${info.action}</button>` : ''}`;
}

function routeAllowed(player, route) {
  const tutorial = player?.tutorial;
  if (tutorial?.status !== 'active') return true;
  const allowed = TUTORIAL_ROUTES[tutorial.step] || ['home', 'settings'];
  return allowed.includes(route);
}

function applyTutorialNavigation(player) {
  document.querySelectorAll('button[data-nav]').forEach((button) => {
    const locked = !routeAllowed(player, button.dataset.nav || 'home');
    button.disabled = locked;
    button.classList.toggle('is-locked', locked);
  });
}

function objectiveInfo(step) {
  const map = {
    welcome: { code: 'FTUE 1/7', title: 'Start the tutorial', copy: 'A short introduction will explain the core loop.', action: '', route: '' },
    buy_first_car: { code: 'FTUE 2/7', title: 'Choose your first car', copy: 'Pick one of the three starter platforms in the Showroom.', action: 'OPEN SHOWROOM', route: 'showroom' },
    visit_garage: { code: 'FTUE 3/7', title: 'Read your car', copy: 'Visit the Garage and learn the stats and Build Stage.', action: 'OPEN GARAGE', route: 'garage' },
    buy_first_upgrade: { code: 'FTUE 4/7', title: 'Buy an upgrade', copy: 'The Parts screen shows exactly what the upgrade will change.', action: 'OPEN PARTS', route: 'parts' },
    install_first_upgrade: { code: 'FTUE 5/7', title: 'Install the part', copy: 'Purchased parts do not affect the car until installed.', action: 'OPEN PARTS', route: 'parts' },
    build_stages: { code: 'FTUE 6/7', title: 'Understand Build Stages', copy: 'See how Stage 1 grows into street-race and full-race builds.', action: 'OPEN PARTS', route: 'parts' },
    first_race: { code: 'FTUE 7/7', title: 'Run your first race', copy: 'Put the build into the current text race simulation.', action: 'QUICK RACE', route: 'quick-race' }
  };
  return map[step] || { code: 'FTUE', title: 'Continue', copy: 'Follow the highlighted game action.', action: '', route: '' };
}

function stageName(stage) {
  return ({ 1: 'Street / Stock Chassis', 2: 'Street Race', 3: 'Front-Half / Tube Chassis', 4: 'Full Race Car' })[stage] || 'Unknown';
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