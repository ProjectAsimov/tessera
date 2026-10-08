// Object model, per docs/ARCHITECTURE.md.

export type ColorId = 'purple' | 'blue' | 'teal' | 'green' | 'yellow' | 'orange' | 'red' | 'pink';

export type IconId =
  | 'dumbbell' | 'run' | 'book' | 'water' | 'meditate' | 'pill'
  | 'sleep' | 'food' | 'code' | 'music' | 'pen' | 'check';

export interface User {
  id: string;      // Google `sub`
  name: string;
  email: string;
  created: number; // ms
}

export interface Task {
  id: string;       // client UUID
  ownerId: string;
  name: string;
  color: ColorId;
  icon: IconId;
  archived: 0 | 1;
  groupId?: string;
  created: number;  // ms
  updated: number;  // ms; drives merge (newest wins)
  deleted: 0 | 1;   // soft delete; still syncs so removals reach other devices
  target: number;   // events per day (1-20); > 1 is a multi-event task
}

export interface Entry {
  taskId: string;
  day: string;  // YYYY-MM-DD
  on: 0 | 1;    // 0 is a tombstone so removals sync
  t: number;    // ms; drives merge (newest wins)
  n: number;    // events logged that day (0 when off)
  kind: EntryKind; // 0 normal, 1 freeze, 2 repair
}

export type EntryKind = 0 | 1 | 2;

/** Per-user gems and freezes; client-authoritative, merged by `updated` (newest wins). */
export interface Wallet {
  gems: number;
  freezes: number;
  milestones: string[]; // awarded keys
  updated: number;      // ms
}

// Phase 2.
export interface Group {
  id: string;
  name: string;
  hostId: string;
  inviteCode: string;
  memberLimit: number;
  members: number;
  created: number;
}

export interface Membership {
  groupId: string;
  userId: string;
  taskId: string;
  joined: number;
}

export interface Member {
  userId: string;
  name: string;
  isHost: boolean;
  isMe: boolean;
  streak: number;
  month: number;
  total: number;
  lastDay: string | null;
  shouts: number;          // shoutouts received in the last 7 days
  shoutedToday: boolean;   // whether the caller already sent this member one today
  friend: number;          // consecutive days both the caller and this member were on
}

export interface GroupPreview {
  name: string;
  hostName: string;
  members: number;
  memberLimit: number;
}

export interface GroupBoard {
  group: Group;
  members: Member[];
}

export interface GroupAndTask {
  group: Group;
  task: Task;
}

// API shapes.
export interface Me { id: string; name: string; email: string }
export interface SyncRequest { tasks: Task[]; entries: Entry[]; wallet?: Wallet }
export interface SyncResponse { tasks: Task[]; entries: Entry[]; wallet: Wallet; now: number }
export interface ShoutResult { ok: true; count: number }
export interface ApiError { error: string }

export interface Session { token: string; name: string; email: string }

// Local persisted state (`tt.state.v1`).
export interface PersistedState {
  tasks: Task[];
  entries: Record<string, Record<string, Entry>>; // taskId -> day -> entry
  pending: { tasks: string[]; entries: string[] }; // task ids; "taskId|day" keys
  /** Id of the task created by the on-device legacy migration, until the first sync reconciles it. */
  legacyTaskId?: string;
  wallet?: Wallet;
  /** True while the wallet has changes the server has not seen. */
  walletPending?: boolean;
}
