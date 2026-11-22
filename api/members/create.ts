import { handleCreateMember } from '../../src/server/handlers.js';
import type { ApiRequest, ApiResponse } from '../../src/server/authMiddleware.js';

interface VercelRequest extends ApiRequest {
  url?: string;
}

export default async function handler(req: VercelRequest, res: ApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method Not Allowed' });
    return;
  }

  await handleCreateMember(req, res);
}
