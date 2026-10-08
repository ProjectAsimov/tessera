import { useEffect, useState } from 'preact/hooks';
import { IconButton, Button } from '../components/Button';
import { StatTile, StatRow } from '../components/StatTile';
import { Heatmap } from '../components/Heatmap';
import { Leaderboard } from '../components/Leaderboard';
import { Sheet } from '../components/Sheet';
import { Icon } from '../components/Icon';
import { toast } from '../components/Toast';
import { entries, taskById, updateTask, deleteTask, wallet } from '../model/store';
import { toggleToday, bumpToday } from '../model/rewards';
import { onDays, taskStats, yearsWithData, tier } from '../lib/stats';
import { todayIso, shortMonth } from '../lib/dates';
import { taskVars } from '../lib/theme';
import { back, push, openSheet, closeSheet, swapSheet, sheet, leaveTask } from '../lib/nav';
import { lastSyncAt } from '../model/sync';
import { board, boardError, loadBoard, clearBoard, shareTask, leaveCurrentGroup, removeGroupMember, inviteLink, shoutTo } from '../model/groups';
import './Task.css';

export function TaskScreen({ taskId }: { taskId: string }) {
  const task = taskById(taskId);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareCode, setShareCode] = useState<string | null>(null);
  const [copyNote, setCopyNote] = useState('');

  useEffect(() => {
    if (task?.groupId) void loadBoard(task.groupId);
    else clearBoard();
    // Re-runs after the board's group id changes and after each sync completes.
  }, [task?.groupId, lastSyncAt.value]);

  if (!task || task.deleted) {
    return (
      <div class="screen">
        <header class="top"><IconButton icon="back" label="Back" onClick={back} /><h1>Task</h1><span class="spacer" /></header>
        <p class="hint">This task is gone.</p>
      </div>
    );
  }
  const today = todayIso();
  const map = entries.value[taskId];
  const days = onDays(map);
  const st = taskStats(map);
  const done = days.has(today);
  const multi = task.target > 1;
  const nToday = map?.[today]?.n ?? 0;
  const flame = tier(st.streak);
  const w = wallet.value;
  const isHost = board.value?.members.find((m) => m.isMe)?.isHost ?? false;

  const pop = () => {
    const b = document.querySelector<HTMLElement>('.screen.task .today');
    if (b) { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
  };
  const onToday = () => {
    if (toggleToday(taskId)) pop();
  };
  const onPlus = () => {
    const before = done;
    const e = bumpToday(taskId, 1);
    if (e.on && !before) pop();
  };
  const onMinus = () => { bumpToday(taskId, -1); };

  const onShare = async () => {
    setShareBusy(true);
    const res = await shareTask(taskId).catch(() => null);
    setShareBusy(false);
    if (!res) { toast('Could not create the group. Try again.'); return; }
    setCopyNote('');
    setShareCode(res.group.inviteCode);
    swapSheet('share');
  };

  const onInvite = () => {
    const code = board.value?.group.inviteCode ?? null;
    setCopyNote('');
    setShareCode(code);
    openSheet('share');
  };

  const onLeave = async () => {
    if (!task.groupId) return;
    if (!confirm(`Leave "${board.value?.group.name ?? task.name}"? You'll keep your own days.`)) return;
    await leaveCurrentGroup(task.groupId);
  };

  const onRemove = async (userId: string, name: string) => {
    if (!task.groupId) return;
    if (!confirm(`Remove ${name} from the group?`)) return;
    await removeGroupMember(task.groupId, userId);
  };

  const link = shareCode ? inviteLink(shareCode) : '';
  const canShareNative = typeof navigator !== 'undefined' && !!navigator.share;

  return (
    <div class="screen task" style={taskVars(task.color)}>
      <header class="top">
        <IconButton icon="back" label="Back to tasks" onClick={back} />
        <h1 class="center"><span class="task-title"><Icon name={task.icon} size={16} />{task.name}</span></h1>
        <IconButton icon="dots" label="More" onClick={() => openSheet('menu')} />
      </header>

      <button type="button" class="wallet-pill" onClick={() => openSheet('settings')} aria-label={`Wallet: ${w.gems} gems, ${w.freezes} streak freezes`}>
        <span>{'💎'} {w.gems}</span>
        <span>{'❄'} {w.freezes}</span>
      </button>

      {multi ? (
        <div class={'today multi' + (done ? ' done' : '') + (flame ? ' flame-' + flame : '')}>
          <button type="button" class="step rip" onClick={onMinus} disabled={nToday <= 0} aria-label="Take one event back">&minus;</button>
          <div class="today-txt" aria-live="polite">
            Logged {nToday} of {task.target} today
            <small>{done ? (st.streak > 1 ? `It counts. Day ${st.streak} in a row` : 'It counts today') : `${Math.ceil(0.7 * task.target)} counts as a day`}</small>
          </div>
          <button type="button" class="step rip" onClick={onPlus} disabled={nToday >= task.target} aria-label="Log one more event">+</button>
        </div>
      ) : (
        <button type="button" class={'today rip' + (done ? ' done' : '') + (flame ? ' flame-' + flame : '')} onClick={onToday} aria-pressed={done}>
          {done ? <>Done today &#10003;<small>{st.streak > 1 ? `Day ${st.streak} in a row. ` : ''}Tap to undo</small></>
                : <>Mark today<small>{st.streak > 0 ? `Keep your ${st.streak}-day streak going` : 'Tap once to light up today'}</small></>}
        </button>
      )}

      <StatRow>
        <StatTile value={st.streak} label="day streak" sub={`best ${st.best}`} />
        <StatTile value={st.thisMonth} label="this month" sub={`${st.monthDelta > 0 ? '+' : ''}${st.monthDelta} vs ${shortMonth(st.month ? st.month - 1 : 11)}`} up={st.monthDelta > 0} />
        <StatTile value={st.thisYear} label={`in ${st.year}`} sub={`${st.total} all time`} />
      </StatRow>

      {task.groupId && board.value && (
        <Leaderboard
          group={board.value.group}
          members={board.value.members}
          isHost={isHost}
          onInvite={onInvite}
          onLeave={onLeave}
          onManage={() => openSheet('members')}
          onShout={(userId) => { void shoutTo(task.groupId!, userId); }}
        />
      )}
      {task.groupId && !board.value && boardError.value && <p class="hint">Couldn't load leaderboard.</p>}

      {yearsWithData(map).map((y) => (
        <Heatmap key={y} year={y} entries={map} target={task.target} onOpenMonth={(yy, m) => push({ name: 'month', taskId, y: yy, m })} />
      ))}
      <p class="home-hint">Tap the grid to open a month and edit past days.</p>

      <Sheet open={sheet.value === 'menu'} onClose={closeSheet} title={task.name} labelledBy="menuTitle">
        <div class="menu">
          {!task.groupId && (
            <button type="button" onClick={onShare} disabled={shareBusy}>{shareBusy ? 'Creating group…' : 'Share'}</button>
          )}
          <button type="button" onClick={() => swapSheet('edit')}>Rename</button>
          <button type="button" onClick={() => swapSheet('edit')}>Change color or icon</button>
          <button type="button" onClick={() => {
            const archiving = !task.archived;
            updateTask(taskId, { archived: archiving ? 1 : 0 });
            if (archiving) leaveTask(taskId); else closeSheet();
          }}>{task.archived ? 'Unarchive' : 'Archive'}</button>
          <button type="button" class="warn" onClick={() => {
            if (!confirm(`Delete "${task.name}" and all its days? This cannot be undone.`)) return;
            deleteTask(taskId);
            leaveTask(taskId);
          }}>Delete</button>
        </div>
      </Sheet>

      <Sheet open={sheet.value === 'share'} onClose={closeSheet} title="Invite" labelledBy="shareTitle">
        <p class="acct">Anyone with this link can join and get their own "{task.name}" to track, right beside yours on the leaderboard.</p>
        <p class="field share-link">{link || 'Creating link…'}</p>
        <div class="row">
          <Button
            onClick={() => {
              if (!link) return;
              if (navigator.clipboard?.writeText) {
                navigator.clipboard.writeText(link).then(
                  () => setCopyNote('Copied.'),
                  () => setCopyNote('Copy failed. Select the text and copy it by hand.'),
                );
              } else setCopyNote('Clipboard unavailable. Select the text and copy it by hand.');
            }}
          >
            Copy
          </Button>
          {canShareNative && (
            <Button onClick={() => { if (link) void navigator.share({ title: task.name, url: link }).catch(() => { /* cancelled */ }); }}>
              Share
            </Button>
          )}
        </div>
        <div class="note">{copyNote}</div>
      </Sheet>

      <Sheet open={sheet.value === 'members'} onClose={closeSheet} title="Members" labelledBy="membersTitle">
        <div class="menu">
          {board.value?.members.map((m) => (
            <div class="member-row" key={m.userId}>
              <span class="member-name">
                {m.name}
                {m.isHost && <span class="gtag">host</span>}
              </span>
              {!m.isHost && <Button warn onClick={() => onRemove(m.userId, m.name)}>Remove</Button>}
            </div>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
