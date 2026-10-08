import { todayIso } from '../lib/dates';
import type { Me, SyncRequest, SyncResponse, ApiError, GroupPreview, GroupBoard, GroupAndTask, ShoutResult } from './types';

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
};
