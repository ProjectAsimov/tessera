import { todayIso } from '../lib/dates';
import type { Me, SyncRequest, SyncResponse, ApiError, GroupPreview, GroupBoard, GroupAndTask, ShoutResult, MyBlocks } from './types';

export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) || 'https://tasktracker-sync.projectasimov.workers.dev';
export const MOCK: boolean = import.meta.env.VITE_MOCK_API === '1';

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface Api {
  /** Where the browser goes to sign in; the worker redirects back with `#session=`. */
  authStartUrl(returnTo: string): string;
  me(token: string): Promise<Me>;
  sync(token: string, body: SyncRequest): Promise<SyncResponse>;
  logout(token: string): Promise<void>;
  // Phase 2: groups and leaderboard.
  createGroup(token: string, taskId: string): Promise<GroupAndTask>;
  previewGroup(code: string): Promise<GroupPreview>;
  joinGroup(token: string, code: string): Promise<GroupAndTask>;
  board(token: string, groupId: string, today: string): Promise<GroupBoard>;
  leaveGroup(token: string, groupId: string): Promise<void>;
  removeMember(token: string, groupId: string, userId: string): Promise<void>;
  // Slice A: shoutouts.
  shout(token: string, groupId: string, userId: string): Promise<ShoutResult>;
  // Slice A.1: account deletion, report and block.
  deleteAccount(token: string): Promise<void>;
  myBlocks(token: string): Promise<MyBlocks>;
  block(token: string, groupId: string, userId: string): Promise<void>;
  unblock(token: string, groupId: string, userId: string): Promise<void>;
  report(token: string, groupId: string, userId: string, reason: string): Promise<void>;
  // Slice C: Web Push.
  pushKey(): Promise<{ publicKey: string }>;
  pushSubscribe(token: string, body: PushSubscribeBody): Promise<void>;
  pushPrefs(token: string, body: { endpoint: string; reminderHour: number | null; weekly: boolean }): Promise<void>;
  pushUnsubscribe(token: string, endpoint: string): Promise<void>;
  pushTest(token: string, endpoint: string): Promise<void>;
}

export interface PushSubscribeBody {
  subscription: unknown;
  tz: string;
  reminderHour: number | null;
  weekly: boolean;
}

async function request<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { Authorization: 'Bearer ' + token, ...(init.headers as Record<string, string> | undefined) };
  if (init.body) headers['Content-Type'] = 'application/json';
  const r = await fetch(API_URL + path, { ...init, headers });
  if (!r.ok) {
    let msg = '';
    try { msg = ((await r.json()) as ApiError).error; } catch { /* no body */ }
    throw new HttpError(r.status, msg || 'HTTP ' + r.status);
  }
  return (await r.json()) as T;
}

/** Like `request`, but for the one route that takes no session (`/groups/preview`). */
async function requestPublic<T>(path: string): Promise<T> {
  const r = await fetch(API_URL + path);
  if (!r.ok) {
    let msg = '';
    try { msg = ((await r.json()) as ApiError).error; } catch { /* no body */ }
    throw new HttpError(r.status, msg || 'HTTP ' + r.status);
  }
  return (await r.json()) as T;
}

const fetchApi: Api = {
  authStartUrl: (returnTo) => API_URL + '/auth/start?return=' + encodeURIComponent(returnTo),
  me: (token) => request<Me>('/me', token),
  sync: (token, body) => request<SyncResponse>('/sync', token, { method: 'POST', body: JSON.stringify(body) }),
  logout: async (token) => { await request<{ ok: true }>('/auth/logout', token, { method: 'POST' }); },
  createGroup: (token, taskId) => request<GroupAndTask>('/groups', token, { method: 'POST', body: JSON.stringify({ taskId }) }),
  previewGroup: (code) => requestPublic<GroupPreview>('/groups/preview?code=' + encodeURIComponent(code)),
  joinGroup: (token, code) => request<GroupAndTask>('/groups/join', token, { method: 'POST', body: JSON.stringify({ code }) }),
  board: (token, groupId, today) => request<GroupBoard>(`/groups/${groupId}/board?today=${encodeURIComponent(today)}`, token),
  leaveGroup: async (token, groupId) => { await request<{ ok: true }>(`/groups/${groupId}/leave`, token, { method: 'POST' }); },
  removeMember: async (token, groupId, userId) => { await request<{ ok: true }>(`/groups/${groupId}/remove`, token, { method: 'POST', body: JSON.stringify({ userId }) }); },
  // `today` is the client's local date: "one shoutout per day" follows the user's day, not the server's.
  shout: (token, groupId, userId) => request<ShoutResult>(`/groups/${groupId}/shout`, token, { method: 'POST', body: JSON.stringify({ userId, today: todayIso() }) }),
  deleteAccount: async (token) => { await request<{ ok: true }>('/me', token, { method: 'DELETE' }); },
  myBlocks: (token) => request<MyBlocks>('/me/blocks', token),
  block: async (token, groupId, userId) => { await request<{ ok: true }>(`/groups/${groupId}/block`, token, { method: 'POST', body: JSON.stringify({ userId }) }); },
  unblock: async (token, groupId, userId) => { await request<{ ok: true }>(`/groups/${groupId}/unblock`, token, { method: 'POST', body: JSON.stringify({ userId }) }); },
  report: async (token, groupId, userId, reason) => { await request<{ ok: true }>(`/groups/${groupId}/report`, token, { method: 'POST', body: JSON.stringify({ userId, reason }) }); },
  pushKey: () => requestPublic<{ publicKey: string }>('/push/key'),
  pushSubscribe: async (token, body) => { await request<{ ok: true }>('/push/subscribe', token, { method: 'POST', body: JSON.stringify(body) }); },
  pushPrefs: async (token, body) => { await request<{ ok: true }>('/push/prefs', token, { method: 'POST', body: JSON.stringify(body) }); },
  pushUnsubscribe: async (token, endpoint) => { await request<{ ok: true }>('/push/unsubscribe', token, { method: 'POST', body: JSON.stringify({ endpoint }) }); },
  pushTest: async (token, endpoint) => { await request<{ ok: true }>('/push/test', token, { method: 'POST', body: JSON.stringify({ endpoint }) }); },
};

let impl: Api = fetchApi;

/** Swap the implementation (the mock API in dev). */
export function setApi(a: Api): void { impl = a; }

/** Delegating facade so callers can import `api` once and the implementation can be swapped at boot. */
export const api: Api = {
  authStartUrl: (r) => impl.authStartUrl(r),
  me: (t) => impl.me(t),
  sync: (t, b) => impl.sync(t, b),
  logout: (t) => impl.logout(t),
  createGroup: (t, taskId) => impl.createGroup(t, taskId),
  previewGroup: (c) => impl.previewGroup(c),
  joinGroup: (t, c) => impl.joinGroup(t, c),
  board: (t, g, today) => impl.board(t, g, today),
  leaveGroup: (t, g) => impl.leaveGroup(t, g),
  removeMember: (t, g, u) => impl.removeMember(t, g, u),
  shout: (t, g, u) => impl.shout(t, g, u),
  deleteAccount: (t) => impl.deleteAccount(t),
  myBlocks: (t) => impl.myBlocks(t),
  block: (t, g, u) => impl.block(t, g, u),
  unblock: (t, g, u) => impl.unblock(t, g, u),
  report: (t, g, u, r) => impl.report(t, g, u, r),
  pushKey: () => impl.pushKey(),
  pushSubscribe: (t, b) => impl.pushSubscribe(t, b),
  pushPrefs: (t, b) => impl.pushPrefs(t, b),
  pushUnsubscribe: (t, e) => impl.pushUnsubscribe(t, e),
  pushTest: (t, e) => impl.pushTest(t, e),
};
