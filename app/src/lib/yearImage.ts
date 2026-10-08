// Year in review: a 1080x1920 PNG drawn client-side on an offscreen canvas (docs/ARCHITECTURE.md, Slice B).
import { h, render } from 'preact';
import { Icon } from '../components/Icon';
import { accentHex, rgba } from './palette';
import { iso, addDays, pad, shortMonth, todayIso, yearOf } from './dates';
import { bestStreak, countedDays, countYear, fillOf, onDays, type DayMap } from './stats';
import { perfectWeeks, perfectMonths } from './badges';
import type { Task } from '../model/types';

export const IMAGE_W = 1080;
export const IMAGE_H = 1920;
export const SITE = 'projectasimov.github.io/tessera';

const BG = '#0c0a12', PANEL = '#15121d', TEXT = '#f2eef8', MUTED = '#8a839a', CELL = '#25202f';
const FONT = 'Inter, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif';
const HEAT_ROWS = 2;

export interface YearStats { days: number; best: number; weeks: number; months: number; perfectMonths: string[] }

export function yearStats(entries: DayMap | undefined, y: number, today = todayIso()): YearStats {
  const lastDay = y + '-12-31';
  const upTo = lastDay < today ? lastDay : today;
  const inYear = new Set<string>();
  for (const d of onDays(entries)) if (yearOf(d) === y) inYear.add(d);
  const pm = perfectMonths(entries, upTo).filter((m) => m.startsWith(y + '-'));
  return {
    days: countYear(countedDays(entries), y),
    best: bestStreak(inYear),
    weeks: perfectWeeks(entries, upTo).filter((s) => yearOf(s) === y).length,
    months: pm.length,
    perfectMonths: pm,
  };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** The task icon, rasterised from the same JSX the app renders (Icon.tsx). */
async function iconImage(task: Task, color: string, px: number): Promise<HTMLImageElement | null> {
  try {
    const host = document.createElement('div');
    render(h(Icon, { name: task.icon, size: px, strokeWidth: 2 }), host);
    const svg = host.firstElementChild;
    if (!svg) return null;
    const xml = svg.outerHTML.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"').replace(/currentColor/g, color);
    render(null, host);
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
    await img.decode();
    return img;
  } catch {
    return null;
  }
}

async function loadFonts(): Promise<void> {
  try {
    await Promise.all([document.fonts.load('700 48px Inter'), document.fonts.load('500 28px Inter')]);
  } catch { /* system fallback */ }
}

function spacing(ctx: CanvasRenderingContext2D, px: number): void {
  if ('letterSpacing' in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = px + 'px';
}

export async function renderYearImage(task: Task, entries: DayMap | undefined, year: number): Promise<Blob> {
  await loadFonts();
  const c = accentHex(task.color, false);
  const canvas = document.createElement('canvas');
  canvas.width = IMAGE_W;
  canvas.height = IMAGE_H;
  const ctx = canvas.getContext('2d')!;
  const st = yearStats(entries, year);
  const target = task.target;
  const today = todayIso();

  // Background and glow.
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, IMAGE_W, IMAGE_H);
  const glow = ctx.createRadialGradient(540, 330, 0, 540, 330, 900);
  glow.addColorStop(0, rgba(c, 0.3));
  glow.addColorStop(1, rgba(c, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, IMAGE_W, IMAGE_H);

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  // Header: icon + name in the task colour.
  const icon = await iconImage(task, c, 240);
  if (icon) ctx.drawImage(icon, 80, 108, 112, 112);
  const maxW = IMAGE_W - 214 - 80;
  let size = 68;
  ctx.fillStyle = c;
  do { ctx.font = `700 ${size}px ${FONT}`; size -= 2; } while (ctx.measureText(task.name).width > maxW && size > 30);
  ctx.fillText(task.name, 214, 184, maxW);

  ctx.fillStyle = MUTED;
  ctx.font = `700 34px ${FONT}`;
  spacing(ctx, 6);
  ctx.fillText('YEAR IN REVIEW', 84, 330);
  spacing(ctx, 0);
  ctx.fillStyle = TEXT;
  ctx.font = `700 250px ${FONT}`;
  ctx.fillText(String(year), 70, 560);

  // The year grid, two rows of weeks, like the Heatmap.
  const cardX = 60, cardY = 630, cardW = IMAGE_W - 120, inset = 36;
  const innerW = cardW - inset * 2;
  const start = new Date(year, 0, 1);
  start.setDate(start.getDate() - start.getDay());
  const weeks = Math.ceil(((new Date(year, 11, 31).getTime() - start.getTime()) / 86400000 + 1) / 7);
  const per = Math.ceil(weeks / HEAT_ROWS);
  const pitch = innerW / per, gap = 4, cs = pitch - gap;
  const labelH = 52, gridH = pitch * 7;
  const rowH = labelH + gridH, rowGap = 40;
  const cardH = inset * 2 + rowH * HEAT_ROWS + rowGap * (HEAT_ROWS - 1);
  ctx.fillStyle = PANEL;
  roundRect(ctx, cardX, cardY, cardW, cardH, 36);
  ctx.fill();
  const perfect = new Set(st.perfectMonths);

  for (let r = 0; r < HEAT_ROWS; r++) {
    const w0 = r * per, w1 = Math.min(weeks, w0 + per);
    if (w0 >= w1) break;
    const oy = cardY + inset + r * (rowH + rowGap);
    const ox = cardX + inset;
    // Month labels.
    ctx.font = `500 22px ${FONT}`;
    ctx.textBaseline = 'middle';
    for (let m = 0; m < 12; m++) {
      const col = Math.floor((new Date(year, m, 1).getTime() - start.getTime()) / 86400000 / 7);
      if (col < w0 || col >= w1) continue;
      const label = shortMonth(m);
      const pw = ctx.measureText(label).width + 26, ph = 34;
      const px = Math.min(ox + (col - w0) * pitch, ox + innerW - pw);
      const isPerfect = perfect.has(year + '-' + pad(m + 1));
      roundRect(ctx, px, oy, pw, ph, 17);
      if (isPerfect) { ctx.fillStyle = rgba(c, 0.3); ctx.fill(); ctx.strokeStyle = c; } else ctx.strokeStyle = CELL;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = isPerfect ? TEXT : MUTED;
      ctx.textAlign = 'center';
      ctx.fillText(label, px + pw / 2, oy + ph / 2 + 1);
      ctx.textAlign = 'left';
    }
    ctx.textBaseline = 'alphabetic';
    // Squares.
    const gy = oy + labelH;
    for (let i = w0 * 7; i < w1 * 7; i++) {
      const cur = addDays(start, i);
      if (cur.getFullYear() !== year) continue;
      const k = iso(cur);
      const col = Math.floor(i / 7) - w0, row = i % 7;
      const x = ox + col * pitch, y = gy + row * pitch;
      const e = entries?.[k];
      if (k > today) {
        ctx.strokeStyle = CELL; ctx.lineWidth = 2;
        roundRect(ctx, x + 1, y + 1, cs - 2, cs - 2, 5); ctx.stroke();
      } else if (e?.on && e.kind) {
        roundRect(ctx, x, y, cs, cs, 6);
        ctx.fillStyle = rgba(c, 0.3); ctx.fill();
        ctx.strokeStyle = c; ctx.lineWidth = 2;
        roundRect(ctx, x + 1, y + 1, cs - 2, cs - 2, 5); ctx.stroke();
      } else if (e?.on) {
        roundRect(ctx, x, y, cs, cs, 6);
        ctx.fillStyle = c; ctx.fill();
      } else {
        roundRect(ctx, x, y, cs, cs, 6);
        ctx.fillStyle = CELL; ctx.fill();
        const fill = fillOf(e, target);
        if (fill > 0) {
          ctx.save();
          ctx.clip();
          ctx.fillStyle = c;
          ctx.fillRect(x, y + cs * (1 - fill), cs, cs * fill);
          ctx.restore();
        }
      }
    }
  }

  // Stats, 2 x 2.
  const boxW = (IMAGE_W - 120 - 24) / 2, boxH = 198;
  const sy = cardY + cardH + 48;
  const stats: [number, string][] = [
    [st.days, st.days === 1 ? 'day done' : 'days done'],
    [st.best, 'best streak'],
    [st.weeks, st.weeks === 1 ? 'perfect week' : 'perfect weeks'],
    [st.months, st.months === 1 ? 'perfect month' : 'perfect months'],
  ];
  stats.forEach(([v, label], i) => {
    const x = 60 + (i % 2) * (boxW + 24), y = sy + Math.floor(i / 2) * (boxH + 24);
    ctx.fillStyle = PANEL;
    roundRect(ctx, x, y, boxW, boxH, 32);
    ctx.fill();
    ctx.fillStyle = i < 2 ? TEXT : c;
    ctx.font = `700 104px ${FONT}`;
    ctx.fillText(String(v), x + 40, y + 112);
    ctx.fillStyle = MUTED;
    ctx.font = `500 34px ${FONT}`;
    ctx.fillText(label, x + 42, y + 164);
  });

  // Footer.
  ctx.textAlign = 'center';
  ctx.fillStyle = MUTED;
  ctx.font = `500 32px ${FONT}`;
  ctx.fillText('Tessera · ' + SITE, IMAGE_W / 2, IMAGE_H - 64);

  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
  });
}

export function yearImageName(task: Task, year: number): string {
  const slug = task.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'task';
  return `tessera-${slug}-${year}.png`;
}
