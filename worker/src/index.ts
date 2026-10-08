// TaskTracker sync worker: Google redirect sign-in, KV sessions, D1 task/entry sync.
// See docs/ARCHITECTURE.md for the contract.

import { HttpError, json } from './lib/json';
import { corsHeaders } from './middleware/cors';
import { authCallback, authLogout, authStart } from './routes/auth';
import { blockRoute, boardRoute, createGroupRoute, joinGroupRoute, leaveRoute, previewGroupRoute, removeRoute, reportRoute, shoutRoute, unblockRoute } from './routes/groups';
import { deleteMe, me, myBlocks } from './routes/me';
import { sync } from './routes/sync';
import type { Ctx, Env, Handler } from './types';

const routes: Record<string, Handler | undefined> = {
  'GET /auth/start': authStart,
  'GET /auth/callback': authCallback,
  'POST /auth/logout': authLogout,
  'GET /me': me,
  'DELETE /me': deleteMe,
  'GET /me/blocks': myBlocks,
  'POST /sync': sync,
  'POST /groups': createGroupRoute,
  'GET /groups/preview': previewGroupRoute,
  'POST /groups/join': joinGroupRoute,
};

/** `/groups/:id/<suffix>` routes, matched when no exact entry in `routes` fits. */
const groupIdRoutes: { method: string; suffix: string; handler: (ctx: Ctx, id: string) => Promise<Response> }[] = [
  { method: 'GET', suffix: '/board', handler: boardRoute },
  { method: 'POST', suffix: '/leave', handler: leaveRoute },
  { method: 'POST', suffix: '/remove', handler: removeRoute },
  { method: 'POST', suffix: '/shout', handler: shoutRoute },
  { method: 'POST', suffix: '/block', handler: blockRoute },
  { method: 'POST', suffix: '/unblock', handler: unblockRoute },
  { method: 'POST', suffix: '/report', handler: reportRoute },
];

function matchGroupIdRoute(method: string, pathname: string): { handler: (ctx: Ctx, id: string) => Promise<Response>; id: string } | null {
  if (!pathname.startsWith('/groups/')) return null;
  const rest = pathname.slice('/groups/'.length);
  for (const r of groupIdRoutes) {
    if (r.method !== method || !rest.endsWith(r.suffix)) continue;
    const id = rest.slice(0, -r.suffix.length);
    if (id && !id.includes('/')) return { handler: r.handler, id };
  }
  return null;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const url = new URL(req.url);
    const ctx: Ctx = { req, env, url, cors };
    const exact = routes[req.method + ' ' + url.pathname];
    const idMatch = exact ? null : matchGroupIdRoute(req.method, url.pathname);
    if (!exact && !idMatch) return json({ error: 'not found' }, 404, cors);

    try {
      return exact ? await exact(ctx) : await idMatch!.handler(ctx, idMatch!.id);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status, cors);
      console.error(e);
      return json({ error: 'server error' }, 500, cors);
    }
  },
} satisfies ExportedHandler<Env>;
