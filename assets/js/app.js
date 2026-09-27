import { createStorageProvider } from './storage/createStorageProvider.js';
import { Store } from './core/store.js';
import { Router } from './core/router.js';
import { toast } from './ui/toast.js';
import { showDialog, closeDialog } from './ui/modal.js';
import { carLabel, money, selectedCar } from './ui/components.js';
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
const homeHero = document.getElementById('homeHero');
const homeGrid = document.getElementById('homeGrid');
const screenRoot = document.getElementById('screenRoot');

loadSettings();

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

store.onPlayer(renderPlayerCard);

document.addEventListener('click', (event) => {
  const nav = event.target.closest('[data-nav]');
  if (nav && !appRoot.hidden) router.navigate(nav.dataset.nav || 'home');
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
}

function lockApp() {
  appRoot.hidden = true;
  screenRoot.innerHTML = '';
}

function finishBoot() {
  if (!bootScreen) return;
  bootScreen.classList.add('is-done');
  setTimeout(() => bootScreen.remove(), 320);
}

function showLogin() {
  const dialog = showDialog(`
    <form class="dialog-body" data-login-form>
      <div class="hero__eyebrow">FOREVER RACING • DEVELOPMENT ACCESS</div>
      <h2 style="margin-top:7px">Sign in to continue</h2>
      <p>${storage.mode === 'local' ? 'GitHub Pages development mode uses a simulated local Admin identity and browser-local save data.' : 'Guest access is intentionally disabled. Player state is tied to an authenticated server session so the game never exposes a guest-mode UI.'}</p>
      <div class="field"><label for="loginUsername">Username</label><input id="loginUsername" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required></div>
      <div class="field"><label for="loginPassword">Password</label><input id="loginPassword" name="password" type="password" autocomplete="current-password" required></div>
      <div class="form-error" data-login-error></div>
      <div class="dialog-actions"><button class="button button--primary button--wide" type="submit">Enter Forever Racing</button></div>
      <p style="margin:12px 0 0;text-align:center;font-size:10px">Development credentials: <strong>Admin</strong> / <strong>12345</strong></p>
    </form>`, { locked: true });

  setTimeout(() => dialog.querySelector('input')?.focus(), 50);
  dialog.querySelector('[data-login-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = event.submitter;
    const error = dialog.querySelector('[data-login-error]');
    const form = new FormData(event.currentTarget);
    submit.disabled = true;
    submit.textContent = 'Signing in…';
    error.textContent = '';
    try {
      const session = await storage.login(String(form.get('username') || ''), String(form.get('password') || ''));
      closeDialog(dialog);
      await enterGame(session);
      toast('Welcome back', storage.mode === 'local' ? 'Local development session established.' : 'Server session established.');
    } catch (err) {
      error.textContent = err.message;
      submit.disabled = false;
      submit.textContent = 'Enter Forever Racing';
    }
  });
}

function showFatal(message) {
  const dialog = showDialog(`<div class="dialog-body"><h2>Forever Racing could not start</h2><p>${escapeText(message)}</p><div class="dialog-actions"><button class="button button--primary" type="button" data-retry>Retry</button></div></div>`, { locked: true });
  dialog.querySelector('[data-retry]')?.addEventListener('click', () => location.reload());
}

async function logout() {
  const button = document.getElementById('logoutButton');
  if (button) button.disabled = true;
  try {
    await storage.logout();
  } catch (error) {
    toast('Sign out warning', error.message);
  } finally {
    storage.clearCsrf();
    store.clear();
    lockApp();
    history.replaceState(null, '', location.pathname + location.search);
    showLogin();
    if (button) button.disabled = false;
  }
}

async function renderHome() {
  homeHero.hidden = false;
  homeGrid.hidden = false;
  screenRoot.innerHTML = '';
  renderPlayerCard(store.player);
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function feature(renderer) {
  return async (context) => {
    homeHero.hidden = true;
    homeGrid.hidden = true;
    await renderer(context);
    window.scrollTo({ top: 0, behavior: document.documentElement.dataset.reduceMotion === 'true' ? 'auto' : 'smooth' });
  };
}

function renderPlayerCard(player) {
  if (!player) return;
  const current = selectedCar(player);
  setText('playerName', player.user?.username || 'Admin');
  setText('statCars', player.garage?.length || 0);
  setText('statCredits', money(player.wallet?.credits || 0));
  setText('statWins', player.stats?.wins || 0);
  setText('currentCarName', current ? carLabel(current) : 'None');
  const ticker = document.getElementById('tickerText');
  if (ticker) {
    ticker.textContent = current
      ? `Current car: ${carLabel(current)} • ${current.derived?.hp || 0} hp • ${money(player.wallet?.credits || 0)} credits available.`
      : 'No current car yet. Start in the Showroom or hunt the Used Car Lot.';
  }
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
  addEventListener('load', () => navigator.serviceWorker.register('service-worker.js').catch(() => {}));
}
