import { iso, addDays, MONTHS, shortMonth, todayIso } from '../lib/dates';
import { countMonth, countYear, countedDays, fillOf, type DayMap } from '../lib/stats';
import { Card } from './Card';
import './Heatmap.css';

const HEAT_ROWS = 2;

interface Props {
  year: number;
  entries: DayMap | undefined;
  /** Events per day; squares fill by n/target for multi-event tasks. */
  target: number;
  onOpenMonth: (y: number, m: number) => void;
}

/** One year, every day as a read-only square, weeks as columns, wrapped into two rows. */
export function Heatmap({ year: y, entries, target, onOpenMonth }: Props) {
  const days = countedDays(entries); // freeze / repair days keep a streak but do not count here
  const t = todayIso();
  const now = new Date();
  const total = countYear(days, y);
  const start = new Date(y, 0, 1);
  start.setDate(start.getDate() - start.getDay());
  const weeks = Math.ceil(((new Date(y, 11, 31).getTime() - start.getTime()) / 86400000 + 1) / 7);
  const per = Math.ceil(weeks / HEAT_ROWS);
  const canOpen = (m: number) => y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth());

  const rows = [];
  for (let r = 0; r < HEAT_ROWS; r++) {
    const w0 = r * per, w1 = Math.min(weeks, w0 + per);
    if (w0 >= w1) break;
    const labels = [];
    for (let m = 0; m < 12; m++) {
      const col = Math.floor((new Date(y, m, 1).getTime() - start.getTime()) / 86400000 / 7);
      if (col < w0 || col >= w1) continue;
      // Pills sit at their week column; the last one may overhang into the card padding
      // rather than being pushed onto its neighbour.
      const style = { left: `min(${((col - w0) / per) * 100}%, calc(100% - 21px))` };
      labels.push(
        <button
          type="button"
          key={m}
          style={style}
          disabled={!canOpen(m)}
          aria-label={`Open ${MONTHS[m]} ${y}, ${countMonth(days, y, m)} days`}
          onClick={() => onOpenMonth(y, m)}
        >
          {shortMonth(m)}
        </button>,
      );
    }
    const cells = [];
    for (let i = w0 * 7; i < w1 * 7; i++) {
      const cur = addDays(start, i);
      const k = iso(cur);
      let cls = '';
      let fill = 0;
      let m = -1;
      if (cur.getFullYear() !== y) cls = 'x';
      else {
        const e = entries?.[k];
        if (k > t) cls = 'f';
        else if (e?.on) cls = e.kind ? 'on fz' : 'on';
        else { fill = fillOf(e, target); cls = fill > 0 ? 'p' : ''; }
        if (k === t) cls += ' t';
        m = cur.getMonth();
      }
      cells.push(<i key={i} class={cls || undefined} style={fill > 0 ? { '--fill': String(fill) } : undefined} data-m={m >= 0 ? m : undefined} />);
    }
    rows.push(
      <div key={'l' + r} class="hm">{labels}</div>,
      <div
        key={'g' + r}
        class="hg"
        style={{ gridTemplateColumns: `repeat(${per},1fr)` }}
        onClick={(e) => {
          const el = (e.target as HTMLElement).closest('[data-m]') as HTMLElement | null;
          if (!el || !el.dataset.m) return;
          const m = +el.dataset.m;
          if (canOpen(m)) onOpenMonth(y, m);
        }}
      >
        {cells}
      </div>,
    );
  }

  return (
    <Card class="year">
      <div class="year-head">
        <h2>{y}</h2>
        <span>{total}{total === 1 ? ' day' : ' days'}</span>
      </div>
      {rows}
    </Card>
  );
}
