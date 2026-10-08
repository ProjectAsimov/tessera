import { useEffect, useState } from 'preact/hooks';
import { IconButton, Button } from '../components/Button';
import { StatTile, StatRow } from '../components/StatTile';
import { Heatmap } from '../components/Heatmap';
import { Leaderboard } from '../components/Leaderboard';
import { Sheet } from '../components/Sheet';
import { Icon } from '../components/Icon';
import { toast } from '../components/Toast';
import { Terms } from '../components/Terms';
import { entries, taskById, updateTask, deleteTask, wallet } from '../model/store';
import { toggleToday, bumpToday } from '../model/rewards';
import { onDays, taskStats, yearsWithData, tier } from '../lib/stats';
import { todayIso, shortMonth, monthName, parseDay } from '../lib/dates';
import { perfectWeeks, perfectMonths } from '../lib/badges';
import { YearReview } from '../components/YearReview';
import { taskVars } from '../lib/theme';
import { back, push, openSheet, closeSheet, swapSheet, sheet, leaveTask } from '../lib/nav';
import { lastSyncAt } from '../model/sync';
import { board, boardError, loadBoard, clearBoard, shareTask, leaveCurrentGroup, removeGroupMember, inviteLink, shoutTo, blockedIds, blockedNames, blockMember, unblockMember, reportMember, REPORT_MAX } from '../model/groups';
import './Task.css';

export function TaskScreen({ taskId }: { taskId: string }) {
  const task = taskById(taskId);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareCode, setShareCode] = useState<string | null>(null);
  const [copyNote, setCopyNote] = useState('');
  const [reportFor, setReportFor] = useState<{ userId: string; name: string } | null>(null);
  const [reportText, setReportText] = useState('');
  const [reportErr, setReportErr] = useState('');
  const [reportBusy, setReportBusy] = useState(false);

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
  const pWeeks = perfectWeeks(map, today);
  const pMonths = perfectMonths(map, today);
  const pMonthSet = new Set(pMonths);
  const years = yearsWithData(map);
  const decemberLate = new Date().getMonth() === 11 && new Date().getDate() >= 15;
  const weekLabel = (s: string) => {
    const d = parseDay(s);
    return `Week of ${shortMonth(d.getMonth())} ${d.getDate()}${d.getFullYear() === st.year ? '' : ', ' + d.getFullYear()}`;
  };
  const monthLabel = (m: string) => `${monthName(+m.slice(5, 7) - 1)} ${m.slice(0, 4)}`;
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

  const onBlock = async (userId: string, name: string) => {
    if (!task.groupId) return;
    if (!confirm(`Block ${name}? They will disappear from your leaderboard and can't send you shoutouts. You can unblock them from Members.`)) return;
    await blockMember(task.groupId, userId, name);
  };

  const onReport = (userId: string, name: string) => {
    setReportFor({ userId, name });
    setReportText('');
    setReportErr('');
    openSheet('report');
  };

  const sendReport = async () => {
    if (!task.groupId || !reportFor || reportBusy) return;
    setReportBusy(true);
    const err = await reportMember(task.groupId, reportFor.userId, reportText);
    setReportBusy(false);
    if (err) { setReportErr(err); return; }
    closeSheet();
    toast("Thanks, we'll look into it.");
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

      <button type="button" class="wallet-pill" onClick={() => openSheet('settings')} aria-label={`Wallet: ${w.gems} tiles, ${w.freezes} streak freezes`}>
        <span><span class="tile-ico" aria-hidden="true" /> {w.gems}</span>
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

      {(pWeeks.length > 0 || pMonths.length > 0) && (
        <div class="badges" aria-label="Badges">
          {pWeeks.length > 0 && (
            <button type="button" class="badge-pill" onClick={() => openSheet('weeks')}>
              <span aria-hidden="true">{'\u2726'}</span> {pWeeks.length} perfect {pWeeks.length === 1 ? 'week' : 'weeks'}
            </button>
          )}
          {pMonths.length > 0 && (
            <button type="button" class="badge-pill" onClick={() => openSheet('months')}>
              <span aria-hidden="true">{'\u25C6'}</span> {pMonths.length} perfect {pMonths.length === 1 ? 'month' : 'months'}
            </button>
          )}
        </div>
      )}

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

      {years.map((y) => (
        <Heatmap key={y} year={y} entries={map} target={task.target} perfect={pMonthSet} onOpenMonth={(yy, m) => push({ name: 'month', taskId, y: yy, m })} />
      ))}
      <p class="home-hint">Tap the grid to open a month and edit past days.</p>

      <Sheet open={sheet.value === 'menu'} onClose={closeSheet} title={task.name} labelledBy="menuTitle">
        <div class="menu">
          {decemberLate && <button type="button" onClick={() => { swapSheet('review'); }}>Year in review</button>}
          {!task.groupId && (
            <button type="button" onClick={onShare} disabled={shareBusy}>{shareBusy ? 'Creating group…' : 'Share'}</button>
          )}
          {!decemberLate && <button type="button" onClick={() => { swapSheet('review'); }}>Year in review</button>}
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

      <Sheet open={sheet.value === 'weeks'} onClose={closeSheet} title="Perfect weeks" labelledBy="weeksTitle">
        <p class="acct">All seven days, Sunday to Saturday, marked for real. Frozen and repaired days don't count. {'\u002B'}10 tiles each.</p>
        <div class="badge-list">
          {pWeeks.slice().reverse().map((s) => <div class="badge-row" key={s}><span aria-hidden="true">{'\u2726'}</span>{weekLabel(s)}</div>)}
        </div>
      </Sheet>

      <Sheet open={sheet.value === 'months'} onClose={closeSheet} title="Perfect months" labelledBy="monthsTitle">
        <p class="acct">Every day of the month marked for real. {'\u002B'}50 tiles each.</p>
        <div class="badge-list">
          {pMonths.slice().reverse().map((m) => <div class="badge-row" key={m}><span aria-hidden="true">{'\u25C6'}</span>{monthLabel(m)}</div>)}
        </div>
      </Sheet>

      <YearReview open={sheet.value === 'review'} task={task} entries={map} years={years} />

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
        <Terms />
      </Sheet>

      <Sheet open={sheet.value === 'members'} onClose={closeSheet} title="Members" labelledBy="membersTitle">
        <div class="member-list">
          {board.value?.members.map((m) => (
            <div class="member-row" key={m.userId}>
              <span class="member-name">
                {m.name}
                {m.isHost && <span class="gtag">host</span>}
                {m.isMe && <span class="gtag">you</span>}
              </span>
              {!m.isMe && (
                <span class="member-actions">
                  <Button onClick={() => onReport(m.userId, m.name)}>Report</Button>
                  <Button onClick={() => onBlock(m.userId, m.name)}>Block</Button>
                  {isHost && <Button warn onClick={() => onRemove(m.userId, m.name)}>Remove</Button>}
                </span>
              )}
            </div>
          ))}
        </div>
        {blockedIds.value.size > 0 && (
          <>
            <p class="sheet-label">Blocked</p>
            <div class="member-list">
              {Array.from(blockedIds.value).map((id) => (
                <div class="member-row" key={id}>
                  <span class="member-name">{blockedNames.value[id] ?? 'Blocked member'}</span>
                  <span class="member-actions">
                    <Button onClick={() => { if (task.groupId) void unblockMember(task.groupId, id); }}>Unblock</Button>
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </Sheet>

      <Sheet open={sheet.value === 'report'} onClose={closeSheet} title={reportFor ? `Report ${reportFor.name}` : 'Report'} labelledBy="reportTitle" doneLabel="Cancel">
        <p class="acct">Tell us what happened. We review every report.</p>
        <textarea
          class="field report-text"
          rows={4}
          value={reportText}
          maxLength={REPORT_MAX}
          placeholder="What is the problem?"
          aria-label="Reason for the report"
          onInput={(e) => { setReportText((e.currentTarget as HTMLTextAreaElement).value); setReportErr(''); }}
        />
        <div class={'report-count' + (reportText.length > REPORT_MAX ? ' over' : '')} aria-live="polite">{reportText.length} / {REPORT_MAX}</div>
        {reportErr && <div class="note" role="alert">{reportErr}</div>}
        <div class="row">
          <Button primary disabled={reportBusy || !reportText.trim() || reportText.length > REPORT_MAX} onClick={() => { void sendReport(); }}>{reportBusy ? 'Sending…' : 'Send'}</Button>
        </div>
      </Sheet>
    </div>
  );
}
