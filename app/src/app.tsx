import { navDir, screens, sheet, top } from './lib/nav';
import { Home } from './screens/Home';
import { TaskScreen } from './screens/Task';
import { MonthScreen } from './screens/Month';
import { Settings } from './screens/Settings';
import { Welcome } from './screens/Welcome';
import { TaskForm } from './screens/TaskForm';
import { Join } from './screens/Join';
import { Toast } from './components/Toast';
import { MilestoneOverlay } from './components/MilestoneOverlay';

export function App() {
  void screens.value; // subscribe
  const cur = top();
  const editingId = cur.name === 'home' ? undefined : cur.taskId;
  // Keyed by depth + screen identity (not month/year) so moving between months doesn't re-slide.
  const animKey = screens.value.length + ':' + cur.name + ':' + (cur.name === 'home' ? '' : cur.taskId);
  return (
    <>
      <div class="screen-anim" key={animKey} data-dir={navDir.value ?? undefined}>
        {cur.name === 'home' && <Home />}
        {cur.name === 'task' && <TaskScreen key={cur.taskId} taskId={cur.taskId} />}
        {cur.name === 'month' && <MonthScreen taskId={cur.taskId} y={cur.y} m={cur.m} />}
      </div>
      <Settings open={sheet.value === 'settings'} />
      <Welcome open={sheet.value === 'welcome'} />
      <TaskForm open={sheet.value === 'add'} />
      <TaskForm open={sheet.value === 'edit'} taskId={editingId} />
      <Join open={sheet.value === 'join'} />
      <MilestoneOverlay />
      <Toast />
    </>
  );
}
