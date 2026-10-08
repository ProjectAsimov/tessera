import { useState } from 'preact/hooks';
import { Sheet } from '../components/Sheet';
import { Button, GoogleButton } from '../components/Button';
import { Segmented } from '../components/Segmented';
import { Swatches } from '../components/Swatches';
import { mode, setMode, accent, setAccent, type Mode } from '../lib/theme';
import { session, syncOn, setSyncOn, signIn, signOut } from '../model/session';
import { sync } from '../model/sync';
import { exportBackup, importBackup, eraseAll, tasks, wallet } from '../model/store';
import { REPAIR_COST } from '../model/rewards';
import { showArchived, setShowArchived } from '../lib/prefs';
import { MOCK } from '../model/api';
import { closeSheet, openSheet, sheet } from '../lib/nav';
import { GUIDELINES_URL, PRIVACY_URL } from '../components/Terms';
import { deleteAccount } from '../model/account';
import './Settings.css';

const MODES: ReadonlyArray<{ value: Mode; label: string }> = [
  { value: 'auto', label: 'Auto' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' },
];
const ON_OFF = [{ value: '1', label: 'On' }, { value: '0', label: 'Off' }] as const;

export function Settings({ open }: { open: boolean }) {
  const [io, setIo] = useState('');
  const [note, setNote] = useState('');
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);
  const s = session.value;
  const on = syncOn.value;

  const doSignOut = () => {
    if (!confirm('Sign out on this device? Your days stay here and in your account.')) return;
    signOut();
  };
  const showBackup = () => {
    const b = exportBackup();
    setIo(JSON.stringify(b));
    setNote(`${b.tasks.filter((t) => !t.deleted).length} tasks and ${b.entries.filter((e) => e.on).length} days in backup text.`);
  };
  const copy = () => {
    const txt = JSON.stringify(exportBackup());
    setIo(txt);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(txt).then(() => setNote('Copied.'), () => setNote('Copy failed. Select the text and copy it by hand.'));
    } else setNote('Clipboard unavailable. Select the text and copy it by hand.');
  };
  const restore = () => {
    const v = io.trim();
    if (!v) { setNote('Paste backup text first.'); return; }
    try {
      const r = importBackup(v);
      setNote(`Restored. ${r.tasks} tasks and ${r.days} days updated.`);
    } catch {
      setNote('That text is not a valid backup.');
    }
  };
  const erase = () => {
    if (!confirm('Erase every task and every logged day? This cannot be undone.')) return;
    eraseAll();
    setNote('Erased.');
  };

  const startDelete = () => { setTyped(''); setDeleting(false); openSheet('delete'); };
  const confirmDelete = async () => {
    if (deleting || typed.trim().toLowerCase() !== 'delete') return;
    setDeleting(true);
    const ok = await deleteAccount();
    if (!ok) setDeleting(false);
  };

  return (
    <>
    <Sheet open={open} onClose={closeSheet} title="Settings" labelledBy="settingsTitle">
      <p class="sheet-label">Account</p>
      <p class="acct">
        {s ? `Signed in as ${s.email || s.name || 'your Google account'}.` : 'Not signed in. Days are kept only on this device.'}
      </p>
      {!s && <GoogleButton onClick={signIn}>{MOCK ? 'Sign in (mock)' : 'Continue with Google'}</GoogleButton>}
      {s && (
        <div class="row">
          {on && <Button onClick={() => { void sync(); }}>Sync now</Button>}
          <Button warn onClick={doSignOut}>Sign out</Button>
          <Button warn onClick={startDelete}>Delete account</Button>
        </div>
      )}
      <p class="legal-links">
        <a href={PRIVACY_URL} target="_blank" rel="noopener">Privacy policy</a>
        <a href={GUIDELINES_URL} target="_blank" rel="noopener">Community guidelines</a>
      </p>

      {s && (
        <>
          <p class="sheet-label">Sync across devices</p>
          <Segmented options={ON_OFF} value={on ? '1' : '0'} label="Sync" onChange={(v) => { setSyncOn(v === '1'); if (v === '1') void sync(); }} />
          <p class="acct" style={{ marginTop: 8 }}>
            {on ? 'Changes reach every device signed in with this account.' : 'Changes stay on this device until you turn sync back on.'}
          </p>
        </>
      )}

      <p class="sheet-label">Wallet</p>
      <div class="wallet-row">
        <span class="wallet-chip"><b><span class="tile-ico" aria-hidden="true" /> {wallet.value.gems}</b> tiles</span>
        <span class="wallet-chip"><b>{'❄'}×{wallet.value.freezes}</b> streak freezes</span>
      </div>
      <p class="acct" style={{ marginTop: 8 }}>
        Tiles are earned by reaching a streak of 7, 30, 100 or 365 days, and by setting a new best streak of 7 or more. Every 14 days of a streak banks a streak freeze (up to 2). A freeze covers yesterday for you if you missed it. A tile repair ({REPAIR_COST} tiles) fills a missed day inside a streak, from a task's month view.
      </p>

      <p class="sheet-label">Mode</p>
      <Segmented options={MODES} value={mode.value} label="Mode" onChange={setMode} />

      <p class="sheet-label">Color</p>
      <Swatches value={accent.value} onChange={setAccent} />

      <p class="sheet-label">Archived tasks</p>
      <Segmented
        options={[{ value: '1', label: 'Show' }, { value: '0', label: 'Hide' }] as const}
        value={showArchived.value ? '1' : '0'}
        label="Show archived"
        onChange={(v) => setShowArchived(v === '1')}
      />
      <p class="acct" style={{ marginTop: 8 }}>
        {tasks.value.filter((t) => !t.deleted && t.archived).length} archived. Archived tasks keep their days and can be brought back from their menu.
      </p>

      <details class="tools">
        <summary>Backup and restore</summary>
        <p>Copy the text below somewhere safe now and then, and paste it back here if you get a new phone. Old "Gym years" backups (a list of days) restore into a Gym task.</p>
        <div class="row">
          <Button onClick={showBackup}>Show backup text</Button>
          <Button onClick={copy}>Copy to clipboard</Button>
          <Button onClick={restore}>Restore from text</Button>
          <Button warn onClick={erase}>Erase everything</Button>
        </div>
        <textarea class="io" value={io} onInput={(e) => setIo((e.currentTarget as HTMLTextAreaElement).value)} placeholder='Paste backup text here to restore, or tap "Show backup text".' />
        <div class="note">{note}</div>
      </details>
    </Sheet>

    <Sheet open={sheet.value === 'delete'} onClose={closeSheet} title="Delete account" labelledBy="deleteTitle" doneLabel="Cancel">
      <p class="acct">This permanently deletes:</p>
      <ul class="del-list">
        <li>your tasks, days and tiles</li>
        <li>groups you host, for everyone in them</li>
        <li>your membership in other people's groups</li>
      </ul>
      <p class="acct">It happens on every device you are signed in on, and <b>it cannot be undone</b>.</p>
      <label class="sheet-label danger-label" for="delConfirm">Type DELETE to confirm</label>
      <input
        id="delConfirm"
        class="field"
        type="text"
        autocomplete="off"
        autocapitalize="characters"
        spellcheck={false}
        value={typed}
        onInput={(e) => setTyped((e.currentTarget as HTMLInputElement).value)}
      />
      <div class="row">
        <Button warn disabled={deleting || typed.trim().toLowerCase() !== 'delete'} onClick={() => { void confirmDelete(); }}>{deleting ? 'Deleting…' : 'Delete my account'}</Button>
      </div>
    </Sheet>
    </>
  );
}
