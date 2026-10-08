import { useEffect } from 'preact/hooks';
import { milestone, dismissMilestone, MILESTONE_MS } from '../model/rewards';
import { taskVars } from '../lib/theme';
import './MilestoneOverlay.css';

/** Full-screen streak milestone: task color, the big number, what it earned. Gone after 1.2 s or on tap. */
export function MilestoneOverlay() {
  const m = milestone.value;
  useEffect(() => {
    if (!m) return;
    const id = setTimeout(dismissMilestone, MILESTONE_MS);
    return () => clearTimeout(id);
  }, [m?.id]);
  if (!m) return null;
  return (
    <div class="ms" key={m.id} style={taskVars(m.color)} role="status" aria-live="assertive" onClick={dismissMilestone}>
      <div class="ms-body">
        <div class="ms-num">{m.days}</div>
        <div class="ms-days">{m.days === 1 ? 'day' : 'days'}</div>
        {m.gems > 0 && <div class="ms-gems">+{m.gems} {'\u{1F48E}'} gems</div>}
        {m.freeze && <div class="ms-gems">+1 {'❄'} streak freeze</div>}
      </div>
    </div>
  );
}
