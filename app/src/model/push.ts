// Slice C: Web Push. Opt-in from Settings; the worker sends the reminders (docs/ARCHITECTURE.md).
import { signal } from '@preact/signals';
import { api, MOCK } from './api';
import { session } from './session';

export const PUSH_KEY = 'tt.push';
export const DEFAULT_HOUR = 19;

export interface PushState { endpoint: string; reminderHour: number | null; weekly: boolean }
export interface PushPrefs { reminderHour: number | null; weekly: boolean }

function read(): PushState | null {
  try {
    const v = JSON.parse(localStorage.getItem(PUSH_KEY) || 'null') as PushState | null;
    return v && typeof v.endpoint === 'string' ? v : null;
  } catch { return null; }
}
function write(s: PushState | null): void {
  pushState.value = s;
  try {
    if (s) localStorage.setItem(PUSH_KEY, JSON.stringify(s));
    else localStorage.removeItem(PUSH_KEY);
  } catch { /* storage blocked */ }
}

export function permission(): NotificationPermission | 'unsupported' {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

export const pushState = signal<PushState | null>(read());
export const permissionState = signal<NotificationPermission | 'unsupported'>(permission());

export function supported(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof window !== 'undefined' && 'PushManager' in window && 'Notification' in window;
}
/** In the mock build the UI is shown even where real push is missing (headless browsers). */
export function available(): boolean { return supported() || (MOCK && typeof Notification !== 'undefined'); }

export function refreshPermission(): void { permissionState.value = permission(); }

export function urlBase64ToUint8Array(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const tz = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Mock-only stand-in for a browser subscription (no push service in headless Chrome). */
function fakeSubscription(): PushSubscription {
  const json = { endpoint: 'https://push.mock.invalid/send/mock-endpoint-1', expirationTime: null, keys: { p256dh: 'mock-p256dh', auth: 'mock-auth' } };
  return { endpoint: json.endpoint, toJSON: () => json, unsubscribe: async () => true } as unknown as PushSubscription;
}

async function getSubscription(key: string): Promise<PushSubscription> {
  try {
    if (!('PushManager' in window)) throw new Error('no PushManager');
    if (MOCK && !(await navigator.serviceWorker.getRegistration())) throw new Error('no service worker in dev');
    // `ready` never settles when no service worker is registered (dev builds), so don't wait forever.
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('service worker not ready')), 10000)),
    ]);
    return await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
  } catch (e) {
    if (MOCK) return fakeSubscription();
    throw e;
  }
}

async function existingSubscription(): Promise<PushSubscription | null> {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
    const reg = await navigator.serviceWorker.getRegistration();
    return (await reg?.pushManager.getSubscription()) ?? null;
  } catch { return null; }
}

export type EnableResult = 'ok' | 'denied' | 'unsupported' | 'signedout' | 'error';

/** Ask permission, subscribe, and tell the worker. */
export async function enable(prefs: PushPrefs): Promise<EnableResult> {
  const s = session.value;
  if (!s) return 'signedout';
  if (!available()) return 'unsupported';
  const perm = await Notification.requestPermission();
  refreshPermission();
  if (perm !== 'granted') return 'denied';
  try {
    const { publicKey } = await api.pushKey();
    const sub = await getSubscription(publicKey);
    await api.pushSubscribe(s.token, { subscription: sub.toJSON(), tz: tz(), reminderHour: prefs.reminderHour, weekly: prefs.weekly });
    write({ endpoint: sub.endpoint, reminderHour: prefs.reminderHour, weekly: prefs.weekly });
    return 'ok';
  } catch {
    return 'error';
  }
}

export async function updatePrefs(prefs: PushPrefs): Promise<boolean> {
  const s = session.value, cur = pushState.value;
  if (!s || !cur) return false;
  try {
    await api.pushPrefs(s.token, { endpoint: cur.endpoint, reminderHour: prefs.reminderHour, weekly: prefs.weekly });
    write({ endpoint: cur.endpoint, ...prefs });
    return true;
  } catch { return false; }
}

/** Unsubscribe in the browser and on the worker, and forget the local prefs. */
export async function disable(): Promise<boolean> {
  const cur = pushState.value, s = session.value;
  let ok = true;
  try { await (await existingSubscription())?.unsubscribe(); } catch { /* already gone */ }
  if (cur && s) {
    try { await api.pushUnsubscribe(s.token, cur.endpoint); } catch { ok = false; }
  }
  write(null);
  return ok;
}

export async function sendTest(): Promise<boolean> {
  const s = session.value, cur = pushState.value;
  if (!s || !cur) return false;
  try { await api.pushTest(s.token, cur.endpoint); return true; } catch { return false; }
}
