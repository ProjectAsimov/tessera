import { useRef, useState } from 'preact/hooks';
import { iso, MONTHS, todayIso } from '../lib/dates';
import { countMonth, countedDays, onDays, type DayMap } from '../lib/stats';
import { Card } from './Card';
import { IconButton } from './Button';
import './MonthCalendar.css';

interface Props {
  y: number;
  m: number;
  entries: DayMap | undefined;
  /** A missed day that costs tiles to fill (a gap in a streak, last 7 days). */
  canRepair?: (day: string) => boolean;
  onRepair?: (day: string) => void;
  onToggle: (day: string) => void;
  /** Sets every day in `list` to `on`; used by press-and-slide. Falls back to onToggle per day. */
  onSetDays?: (list: string[], on: boolean) => void;
  onPrev: () => void;
  onNext: () => void;
  /** Word used in aria labels, e.g. "done". */
  doneWord?: string;
}

interface Drag { start: string; x: number; y: number; active: boolean; on: boolean; id: number }

/** Every day between two ISO dates, inclusive, in order. */
function span(a: string, b: string): string[] {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  const out: string[] = [];
  const d = new Date(+lo.slice(0, 4), +lo.slice(5, 7) - 1, +lo.slice(8, 10));
  for (let k = iso(d); k <= hi; d.setDate(d.getDate() + 1), k = iso(d)) out.push(k);
  return out;
}

export function MonthCalendar({ y, m, entries, canRepair, onRepair, onToggle, onSetDays, onPrev, onNext, doneWord = 'done' }: Props) {
  const t = todayIso();
  const days = onDays(entries);
  const now = new Date();
  const first = new Date(y, m, 1);
  const dim = new Date(y, m + 1, 0).getDate();
  const isCurrent = y === now.getFullYear() && m === now.getMonth();

  // Press-and-slide: a horizontal move from a day starts a range; the range is
  // every day between the start and the day under the finger, not just the
  // cells touched. Vertical moves are left to the page so scrolling still works.
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const [range, setRange] = useState<{ list: string[]; on: boolean } | null>(null);
  const dayAt = (x: number, yy: number) => (document.elementFromPoint(x, yy)?.closest('[data-day]') as HTMLElement | null)?.dataset.day ?? null;
  const commit = (list: string[], on: boolean) => {
    const eligible = list.filter((k) => k <= t && !(on && canRepair?.(k)));
    if (onSetDays) onSetDays(eligible, on);
    else for (const k of eligible) if (days.has(k) !== on) onToggle(k);
  };
  const onDown = (e: PointerEvent) => {
    const k = (e.currentTarget as HTMLElement).dataset.day;
    if (!k || e.button !== 0) return;
    drag.current = { start: k, x: e.clientX, y: e.clientY, active: false, on: !days.has(k), id: e.pointerId };
  };
  const onMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (!d.active) {
      const dx = Math.abs(e.clientX - d.x), dy = Math.abs(e.clientY - d.y);
      if (dy > 8 && dy > dx) { drag.current = null; return; } // scrolling
      if (dx < 8) return;
      d.active = true;
      (e.currentTarget as HTMLElement).setPointerCapture(d.id);
      if (navigator.vibrate) navigator.vibrate(10);
    }
    const cur = dayAt(e.clientX, e.clientY);
    if (cur) setRange({ list: span(d.start, cur), on: d.on });
  };
  const onUp = (e: PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d?.active) return;
    const cur = dayAt(e.clientX, e.clientY) ?? d.start;
    commit(span(d.start, cur), d.on);
    setRange(null);
    suppressClick.current = true; // the click that follows the release must not toggle again
  };
  const onCancel = () => { drag.current = null; setRange(null); };
  const inRange = new Set(range?.list ?? []);

  const cells = [];
  for (let i = 0; i < first.getDay(); i++) cells.push(<span key={'b' + i} class="c blank" />);
  for (let d = 1; d <= dim; d++) {
    const k = iso(new Date(y, m, d));
    const on = days.has(k);
    const future = k > t;
    const sel = !future && inRange.has(k);
    const kind = on ? entries?.[k]?.kind ?? 0 : 0;
    const repair = !on && !!canRepair?.(k);
    cells.push(
      <button
        type="button"
        key={k}
        data-day={k}
        class={['c', on && 'on', kind && 'fz', repair && 'rp', k === t && 'today-cell', future && 'future', sel && (range!.on ? 'sel-on' : 'sel-off')].filter(Boolean).join(' ')}
        disabled={future}
        aria-label={`${MONTHS[m]} ${d}${on ? ', ' + (kind === 1 ? 'frozen' : kind === 2 ? 'repaired' : doneWord) : ''}${repair ? ', missed. Repair with tiles' : ''}`}
        aria-pressed={on}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onCancel}
        onClick={() => {
          if (suppressClick.current) { suppressClick.current = false; return; }
          if (repair && onRepair) onRepair(k); else onToggle(k);
        }}
      >
        {d}
        {kind > 0 && <span class="fzg" aria-hidden="true">❄</span>}
      </button>,
    );
  }
  return (
    <Card aria-label="Month calendar">
      <div class="cal-head">
        <h2>{MONTHS[m]} {y} <span>{countMonth(countedDays(entries), y, m)} days</span></h2>
        <div class="cal-nav">
          <IconButton icon="back" label="Previous month" onClick={onPrev} />
          <IconButton icon="next" label="Next month" onClick={onNext} disabled={isCurrent} />
        </div>
      </div>
      <div class="wk" aria-hidden="true">
        <span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>
      </div>
      <div class="cal">{cells}</div>
      <p class="hint">Tap a day to mark or unmark it. Press and slide to do a whole stretch at once. A missed day inside a streak can be repaired for tiles.</p>
    </Card>
  );
}
