import { useState } from 'preact/hooks';
import { IconButton, Button } from '../components/Button';
import { MonthCalendar } from '../components/MonthCalendar';
import { Sheet } from '../components/Sheet';
import { toast } from '../components/Toast';
import { entries, setDay, taskById, wallet } from '../model/store';
import { toggleAnyDay, repairable, repairDay, REPAIR_COST } from '../model/rewards';
import { onDays } from '../lib/stats';
import { parseDay, todayIso } from '../lib/dates';
import { taskVars } from '../lib/theme';
import { back, replace, openSheet, closeSheet, sheet } from '../lib/nav';
import './Month.css';

function longDate(day: string): string {
  return parseDay(day).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function MonthScreen({ taskId, y, m }: { taskId: string; y: number; m: number }) {
  const task = taskById(taskId);
  const map = entries.value[taskId];
  const days = onDays(map);
  const [repairDayKey, setRepairDay] = useState<string | null>(null);
  const gems = wallet.value.gems;
  const canAfford = gems >= REPAIR_COST;
  const go = (yy: number, mm: number) => {
    if (mm < 0) { mm = 11; yy--; }
    if (mm > 11) { mm = 0; yy++; }
    replace({ name: 'month', taskId, y: yy, m: mm });
  };
  const doRepair = () => {
    if (!repairDayKey) return;
    if (repairDay(taskId, repairDayKey)) {
      toast(`Repaired ${longDate(repairDayKey)}`);
      closeSheet();
    } else toast('Not enough gems');
  };
  return (
    <div class="screen month" style={taskVars(task?.color ?? 'purple')}>
      <header class="top">
        <IconButton icon="back" label="Back to years" onClick={back} />
        <h1 class="center">{task?.name ?? ''} · {y}</h1>
        <span class="spacer" />
      </header>
      <MonthCalendar
        y={y}
        m={m}
        entries={map}
        canRepair={(day) => repairable(map, day, todayIso())}
        onRepair={(day) => { setRepairDay(day); openSheet('repair'); }}
        onToggle={(day) => toggleAnyDay(taskId, day)}
        onSetDays={(list, on) => {
          const t = Date.now();
          for (const day of list) if (days.has(day) !== on) setDay(taskId, day, on, t);
          if (on && list.length && navigator.vibrate) navigator.vibrate(15);
        }}
        onPrev={() => go(y, m - 1)}
        onNext={() => go(y, m + 1)}
      />
      <Sheet open={sheet.value === 'repair'} onClose={closeSheet} title="Repair a day" labelledBy="repairTitle" doneLabel="Cancel">
        {repairDayKey && (
          <>
            <p class="repair-q">Repair {longDate(repairDayKey)} for {REPAIR_COST} gems?</p>
            <p class="acct">
              This fills the missed day inside your streak. It keeps the streak going but does not add to your month, year or total counts.
            </p>
            <p class="acct">
              {canAfford
                ? `You have \u{1F48E} ${gems} gems.`
                : `You have \u{1F48E} ${gems} gems, and a repair costs ${REPAIR_COST}. Earn gems by reaching streak milestones: 7, 30, 100 and 365 days, or a new best streak.`}
            </p>
            <div class="row">
              <Button primary disabled={!canAfford} onClick={doRepair}>Repair for {REPAIR_COST} gems</Button>
            </div>
          </>
        )}
      </Sheet>
    </div>
  );
}
