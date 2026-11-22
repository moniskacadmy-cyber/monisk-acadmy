// Single source of truth for every /api route.
// Used by the Express server (server.ts, dev and self-hosted production)
// and by the Vercel catch-all function (api/[...slug].ts).
// Keeping one table here prevents the two runtimes from drifting apart.

import type { ApiRequest, ApiResponse } from './authMiddleware';
import {
  handleArchiveGroup,
  handleArchiveStudent,
  handleBackfillSessionFinance,
  handleCreateConversation,
  handleCreateMember,
  handleCreateOrUpdateGroup,
  handleDisableMember,
  handleGetEarningsSummary,
  handleLinkParentToStudent,
  handleListContacts,
  handleMarkConversationRead,
  handleRecordSession,
  handleRegisterResource,
  handleSendMessage,
  handleSendNotification,
  handleSetTeacherRate,
  handleUpdatePermissions,
  handleUpsertLead,
  handleUpsertStudent,
} from './handlers';

export type ApiHandler = (req: ApiRequest, res: ApiResponse) => Promise<void>;

/** Request shape shared by Express and Vercel (both expose url and optionally query). */
export interface RoutableRequest extends ApiRequest {
  method?: string;
  url?: string;
  query?: Record<string, unknown>;
  body?: any;
}

/** Keys are the path after "/api/", without leading or trailing slashes. */
export const API_ROUTES: Readonly<Record<string, ApiHandler>> = {
  'members/create': handleCreateMember,
  'members/disable': handleDisableMember,
  'members/permissions': handleUpdatePermissions,
  'students/upsert': handleUpsertStudent,
  'students/archive': handleArchiveStudent,
  'groups/upsert': handleCreateOrUpdateGroup,
  'groups/archive': handleArchiveGroup,
  'parent-links/link': handleLinkParentToStudent,
  'sessions/record': handleRecordSession,
  'crm/lead': handleUpsertLead,
  'conversations/create': handleCreateConversation,
  'conversations/send': handleSendMessage,
  'conversations/read': handleMarkConversationRead,
  'contacts/list': handleListContacts,
  'notifications/send': handleSendNotification,
  'resources/register': handleRegisterResource,
  'teachers/rate': handleSetTeacherRate,
  'earnings/summary': handleGetEarningsSummary,
  'earnings/backfill': handleBackfillSessionFinance,
};

/**
 * Turns a raw URL (or a Vercel `slug` query value) into a route key.
 * "/api/members/create?x=1" -> "members/create"
 * "/api/members/create/"    -> "members/create"
 * "/api"                    -> ""
 * Returns null when the URL is not under /api at all.
 */
export function normalizeRoutePath(rawUrl: string | undefined | null): string | null {
  if (!rawUrl) return null;
  const withoutQuery = rawUrl.split('?')[0].split('#')[0];
  let decoded: string;
  try {
    decoded = decodeURIComponent(withoutQuery);
  } catch {
    return null;
  }
  const collapsed = decoded.replace(/\/{2,}/g, '/');
  if (collapsed !== '/api' && !collapsed.startsWith('/api/')) return null;
  return collapsed.slice('/api'.length).replace(/^\/+|\/+$/g, '');
}

/** Resolves the route key from the URL first, then from the Vercel catch-all `slug` query. */
export function resolveRouteKey(req: RoutableRequest): string | null {
  const fromUrl = normalizeRoutePath(req.url);
  if (fromUrl !== null) return fromUrl;

  const slug = req.query?.slug;
  if (Array.isArray(slug)) return slug.join('/').replace(/^\/+|\/+$/g, '');
  if (typeof slug === 'string') return slug.replace(/^\/+|\/+$/g, '');
  return null;
}

/** Dispatches one API request. Always answers with JSON. */
export async function dispatchApi(req: RoutableRequest, res: ApiResponse): Promise<void> {
  const method = (req.method || 'GET').toUpperCase();
  const key = resolveRouteKey(req);

  if (key === 'health') {
    if (method !== 'GET') {
      res.status(405).json({ ok: false, code: 'METHOD_NOT_ALLOWED', error: 'طريقة الطلب غير مسموحة.' });
      return;
    }
    res.status(200).json({ ok: true, service: 'منصة الأكاديميات' });
    return;
  }

  if (key === null) {
    res.status(404).json({ ok: false, code: 'NOT_API_PATH', error: 'المسار المطلوب ليس مسار API.' });
    return;
  }

  const handler = API_ROUTES[key];
  if (!handler) {
    res.status(404).json({
      ok: false,
      code: 'ROUTE_NOT_FOUND',
      error: `نقطة الـ API غير موجودة: /api/${key}`,
    });
    return;
  }

  if (method !== 'POST') {
    res.status(405).json({ ok: false, code: 'METHOD_NOT_ALLOWED', error: 'هذه النقطة تقبل طلبات POST فقط.' });
    return;
  }

  // Some runtimes hand the JSON body over as a string. Parse it once here.
  if (typeof req.body === 'string') {
    try {
      req.body = JSON.parse(req.body) as Record<string, unknown>;
    } catch {
      res.status(400).json({ ok: false, code: 'INVALID_JSON', error: 'صيغة البيانات المرسلة غير صالحة.' });
      return;
    }
  }

  await handler(req as ApiRequest, res);
}
