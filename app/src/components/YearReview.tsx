import { useEffect, useMemo, useState } from 'preact/hooks';
import { Sheet } from './Sheet';
import { Button } from './Button';
import { closeSheet } from '../lib/nav';
import { renderYearImage, yearImageName } from '../lib/yearImage';
import type { DayMap } from '../lib/stats';
import type { Task } from '../model/types';

interface Props { open: boolean; task: Task; entries: DayMap | undefined; years: number[] }

/** Preview of the shareable year image, with a year picker (several years) and Share / Save. */
export function YearReview({ open, task, entries, years }: Props) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    let made = '';
    setBlob(null); setUrl(''); setFailed(false);
    renderYearImage(task, entries, year).then(
      (b) => { if (!alive) return; made = URL.createObjectURL(b); setBlob(b); setUrl(made); },
      () => { if (alive) setFailed(true); },
    );
    return () => { alive = false; if (made) URL.revokeObjectURL(made); };
  }, [open, year, task.id, task.name, task.color, task.icon, task.target, entries]);

  const file = useMemo(() => (blob ? new File([blob], yearImageName(task, year), { type: 'image/png' }) : null), [blob]);
  const canShare = !!file && typeof navigator !== 'undefined' && !!navigator.canShare && navigator.canShare({ files: [file] });

  const save = () => {
    if (!url || !file) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <Sheet open={open} onClose={closeSheet} title="Year in review" labelledBy="reviewTitle">
      {years.length > 1 && (
        <div class="year-pick" role="group" aria-label="Year">
          {years.map((y) => <button type="button" key={y} aria-pressed={y === year} onClick={() => setYear(y)}>{y}</button>)}
        </div>
      )}
      <div class="review-frame">
        {url
          ? <img src={url} alt={`${task.name} year in review ${year}`} width={1080} height={1920} />
          : <div class="review-wait">{failed ? 'Could not draw the image.' : 'Drawing…'}</div>}
      </div>
      <div class="row">
        {canShare && file && (
          <Button primary onClick={() => { void navigator.share({ files: [file], title: `${task.name} ${year}` }).catch(() => { /* cancelled */ }); }}>Share</Button>
        )}
        <Button primary={!canShare} disabled={!blob} onClick={save}>Save</Button>
      </div>
    </Sheet>
  );
}
