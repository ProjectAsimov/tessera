// Slice A.1: account deletion. The server removes everything and kills every
// session (DELETE /me); here we return the device to a fresh, signed-out install.
import { api, HttpError } from './api';
import { session, setSession, syncOn, welcomed, statusNote } from './session';
import * as store from './store';
import { clearBoard, clearPendingJoin, resetBlocks } from './groups';
import { resetToHome } from '../lib/nav';
import { toast } from '../components/Toast';

/** Keys that survive deletion: appearance only. */
const KEEP_KEYS = new Set(['tt.theme', 'tt.accent']);

function clearLocalKeys(): void {
  try {
    for (const k of Object.keys(localStorage)) {
      if ((k.startsWith('tt.') && !KEEP_KEYS.has(k)) || k.startsWith('gymyears.')) localStorage.removeItem(k);
    }
  } catch { /* storage blocked */ }
}

/** Settings → Delete account. Resolves true when the account is gone and the device is clean. */
export async function deleteAccount(): Promise<boolean> {
  const s = session.value;
  if (!s) return false;
  try {
    await api.deleteAccount(s.token);
  } catch (e) {
    // 401: the account is already gone (deleted on another device); finish the cleanup here.
    if (!(e instanceof HttpError && e.status === 401)) {
      toast('Could not delete the account. Check your connection and try again.');
      return false;
    }
  }
  setSession(null);
  store.resetLocal();
  clearBoard();
  clearPendingJoin();
  resetBlocks();
  clearLocalKeys();
  syncOn.value = true;
  welcomed.value = false;
  statusNote.value = 'Not signed in. Days are kept only on this device.';
  // Settings + the delete sheet are stacked; pop them and any task screens.
  resetToHome(2);
  toast('Account deleted');
  return true;
}
