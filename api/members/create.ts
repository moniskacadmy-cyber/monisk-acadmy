import { handleCreateMember } from '../../src/server/handlers';
import type { ApiRequest, ApiResponse } from '../../src/server/authMiddleware';

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
