import { render } from 'preact';
import { effect } from '@preact/signals';
import './styles/tokens.css';
import './styles/base.css';
import './styles/flame.css';
import { App } from './app';
import { migrateLegacy } from './model/migrate';
import * as store from './model/store';
import { session, syncOn, statusNote, welcomed, finishSignIn, reloadSessionPrefs } from './model/session';
import { startSync, sync } from './model/sync';
import { autoFreeze } from './model/rewards';
import { startTheme, reloadThemePrefs } from './lib/theme';
import { startNav, openSheet } from './lib/nav';
import { startRipple } from './lib/ripple';
import { MOCK, setApi } from './model/api';
import { captureJoinHash, checkPendingJoin, startGroups } from './model/groups';

async function boot(): Promise<void> {
  captureJoinHash();
  if (MOCK) {
    setApi((await import('./dev/mockApi')).mockApi);
    await (await import('./dev/seed')).applySeedParams();
  }
  migrateLegacy();
  reloadSessionPrefs();
  reloadThemePrefs();
  store.load();
  // With sync available, the freeze check runs after the first sync (so another device's freeze is seen first).
  if (!(session.value && syncOn.value)) autoFreeze();
  startTheme();
  startNav();
  startRipple();
  startGroups();

  // The status line reflects account state unless an event (sync, sign-in) says otherwise.
  effect(() => {
    if (!session.value) statusNote.value = 'Not signed in. Days are kept only on this device.';
    else if (!syncOn.value) statusNote.value = 'Sync is off.';
  });

  render(<App />, document.getElementById('app')!);

  startSync();
  const signedInNow = await finishSignIn();
  if (!signedInNow && session.value) void sync();
  const joinHandled = await checkPendingJoin();
  if (!session.value && !welcomed.value && !joinHandled) openSheet('welcome');
  if (MOCK) (await import('./dev/seed')).applyScreenParam();
}

void boot();

// Service worker: reload once when a new version takes over, so updates show
// up without clearing the app. Only in production builds (the SW is generated at build time).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloaded) { reloaded = true; location.reload(); }
  });
  navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => { /* offline or unsupported */ });
}
