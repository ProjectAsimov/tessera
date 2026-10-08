import { useRef } from 'preact/hooks';
import { Icon } from './Icon';
import { taskVars } from '../lib/theme';
import type { Task } from '../model/types';
import './ListRow.css';

/** One square of the 14-day strip. */
export interface StripCell {
  /** 0..1 share of the day's target logged. */
  fill: number;
  /** The day counts (fully lit). */
  on: boolean;
  /** Covered by a freeze or a repair (lighter square). */
  fz: boolean;
}

interface Props {
  task: Task;
  streak: number;
  /** Flame tier 0-4. */
  tier: number;
  /** Last 14 days, oldest first. */
  strip: StripCell[];
  /** Events logged today (multi-event tasks). */
  n: number;
  doneToday: boolean;
  onOpen: () => void;
  onToggleToday: (e: MouseEvent) => void;
  /** Multi-event: long-press on the check button takes one event back. */
  onDecrement?: () => void;
}

export function ListRow({ task, streak, tier, strip, n, doneToday, onOpen, onToggleToday, onDecrement }: Props) {
  const streakText = streak === 1 ? '1 day streak' : `${streak} day streak`;
  const grouped = !!task.groupId;
  const multi = task.target > 1;
  const hold = useRef<{ timer?: ReturnType<typeof setTimeout>; fired: boolean }>({ fired: false });
  const startHold = () => {
    if (!multi || !onDecrement) return;
    hold.current.fired = false;
    hold.current.timer = setTimeout(() => {
      hold.current.fired = true;
      if (navigator.vibrate) navigator.vibrate(20);
      onDecrement();
    }, 500);
  };
  const endHold = () => clearTimeout(hold.current.timer);
  const todayLabel = multi
    ? `${task.name}: ${n} of ${task.target} today. Tap to add one${onDecrement ? ', hold to take one back' : ''}`
    : doneToday ? `${task.name}: done today. Tap to undo` : `${task.name}: mark today`;
  return (
    <div class={'lrow' + (tier ? ' flame-' + tier : '')} style={taskVars(task.color)}>
      <button
        type="button"
        class="lrow-main rip"
        onClick={onOpen}
        aria-label={`${task.name}, ${streakText}${grouped ? ', shared with a group' : ''}. Open`}
      >
        <span class="lrow-icon"><Icon name={task.icon} size={20} /></span>
        <span class="lrow-text">
          <span class="lrow-name">
            {task.name}
            {grouped && <Icon name="users" size={13} class="lrow-group" />}
          </span>
          <span class="lrow-sub">{streakText}</span>
          <span class="lrow-strip" aria-hidden="true">
            {strip.map((c, i) => (
              <i
                key={i}
                class={c.on ? (c.fz ? 'on fz' : 'on') : c.fill > 0 ? 'p' : i === strip.length - 1 ? 't' : undefined}
                style={!c.on && c.fill > 0 ? { '--fill': String(c.fill) } : undefined}
              />
            ))}
          </span>
        </span>
      </button>
      <button
        type="button"
        class={'lrow-today rip' + (doneToday ? ' done' : '') + (multi ? ' multi' : '')}
        aria-pressed={doneToday}
        aria-label={todayLabel}
        onPointerDown={startHold}
        onPointerUp={endHold}
        onPointerLeave={endHold}
        onPointerCancel={endHold}
        onContextMenu={(e) => { if (multi) e.preventDefault(); }}
        onClick={(e) => {
          if (hold.current.fired) { hold.current.fired = false; return; }
          onToggleToday(e);
        }}
      >
        {multi ? <span class="lrow-count">{n}/{task.target}</span> : <Icon name="check" size={26} strokeWidth={3} />}
      </button>
    </div>
  );
}
