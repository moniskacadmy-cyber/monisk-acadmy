// Vercel catch-all function. Every request to /api/* lands here.
// Routing is delegated to src/server/apiRouter.ts so this file and server.ts
// always expose exactly the same endpoints.

import { dispatchApi, type RoutableRequest } from '../src/server/apiRouter';
import type { ApiResponse } from '../src/server/authMiddleware';

export default async function handler(req: RoutableRequest, res: ApiResponse): Promise<void> {
  try {
    await dispatchApi(req, res);
  } catch (err) {
    console.error('[API] Unhandled error in dispatcher:', err);
    res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', error: 'حدث خطأ غير متوقع في الخادم.' });
  }
}
