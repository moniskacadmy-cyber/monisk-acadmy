import {
  handleArchiveGroup,
  handleArchiveStudent,
  handleCreateConversation,
  handleCreateInvoice,
  handleCreateMember,
  handleCreateOrUpdateGroup,
  handleCreatePayroll,
  handleDisableMember,
  handleLinkParentToStudent,
  handleRecordPayment,
  handleRecordSession,
  handleRegisterResource,
  handleSendNotification,
  handleUpdatePermissions,
  handleUpsertLead,
  handleUpsertStudent,
} from '../src/server/handlers';
import type { ApiRequest, ApiResponse } from '../src/server/authMiddleware';

interface VercelRequest extends ApiRequest {
  url?: string;
}

export default async function handler(req: VercelRequest, res: ApiResponse): Promise<void> {
  const pathPart = (req.url || '').split('?')[0].replace(/^\/api\/?/, '');

  if (req.method === 'GET' && pathPart === 'health') {
    res.status(200).json({ ok: true, service: 'منصة الأكاديميات (Vercel)' });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method Not Allowed' });
    return;
  }

  switch (pathPart) {
    case 'members/create':
      return handleCreateMember(req, res);
    case 'members/disable':
      return handleDisableMember(req, res);
    case 'members/permissions':
      return handleUpdatePermissions(req, res);
    case 'students/upsert':
      return handleUpsertStudent(req, res);
    case 'students/archive':
      return handleArchiveStudent(req, res);
    case 'groups/upsert':
      return handleCreateOrUpdateGroup(req, res);
    case 'groups/archive':
      return handleArchiveGroup(req, res);
    case 'parent-links/link':
      return handleLinkParentToStudent(req, res);
    case 'sessions/record':
      return handleRecordSession(req, res);
    case 'finance/invoice':
      return handleCreateInvoice(req, res);
    case 'finance/payment':
      return handleRecordPayment(req, res);
    case 'finance/payroll':
      return handleCreatePayroll(req, res);
    case 'crm/lead':
      return handleUpsertLead(req, res);
    case 'conversations/create':
      return handleCreateConversation(req, res);
    case 'notifications/send':
      return handleSendNotification(req, res);
    case 'resources/register':
      return handleRegisterResource(req, res);
    default:
      res.status(404).json({ ok: false, error: 'نقطة النهاية غير موجودة.' });
  }
}
