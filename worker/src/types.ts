export interface Env {
  DAYS: KVNamespace;
  DB: D1Database;
  ALLOWED_ORIGINS: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
}

/** What a session token resolves to in KV (`s:<sha256(token)>`). */
export interface Session {
  sub: string;
  name: string;
  email: string;
  at: number;
}

export interface Task {
  id: string;
  ownerId: string;
  name: string;
  color: string;
  icon: string;
  archived: 0 | 1;
  groupId: string | null;
  created: number;
  updated: number;
  deleted: 0 | 1;
  /** Events per day (1-20). A day counts when n >= ceil(0.7 * target). */
  target: number;
}

export interface Entry {
  taskId: string;
  day: string;
  on: 0 | 1;
  t: number;
  /** Events logged that day. */
  n: number;
  /** 0 normal, 1 freeze, 2 repair. Kinds 1 and 2 keep streaks but not month/total. */
  kind: 0 | 1 | 2;
}

export interface Wallet {
  gems: number;
  freezes: number;
  milestones: string[];
  updated: number;
}

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
  shouts: number;
  shoutedToday: boolean;
  friend: number;
}

export interface Ctx {
  req: Request;
  env: Env;
  url: URL;
  cors: Record<string, string>;
}

export type Handler = (ctx: Ctx) => Promise<Response>;
