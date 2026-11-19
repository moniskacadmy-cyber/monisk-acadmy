import {
  PolicyError,
  assertAcademyIsolation,
  assertActiveActor,
  sanitizePermissions,
} from '../shared/policy';
import type { AcademyRole, ActorContext, MemberDoc } from '../shared/types';
import { adminAuth, adminDb } from './firebaseAdmin';

export interface ApiRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: Record<string, unknown>;
  query?: Record<string, unknown>;
}

export interface ApiResponse {
  status(code: number): ApiResponse;
  json(body: unknown): void;
}

const VALID_ROLES: AcademyRole[] = ['owner', 'supervisor', 'teacher', 'student', 'parent'];

function extractBearerToken(req: ApiRequest): string {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  const headerStr = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (!headerStr || !headerStr.startsWith('Bearer ')) {
    throw new PolicyError('رمز المصادقة مفقود.', 401, 'MISSING_TOKEN');
  }
  const token = headerStr.slice('Bearer '.length).trim();
  if (!token) {
    throw new PolicyError('رمز المصادقة غير صالح.', 401, 'INVALID_TOKEN');
  }
  return token;
}

export async function authenticateActor(req: ApiRequest): Promise<ActorContext> {
  const idToken = extractBearerToken(req);

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(idToken);
  } catch {
    throw new PolicyError('جلسة الدخول منتهية أو غير صالحة. يرجى إعادة تسجيل الدخول.', 401, 'INVALID_TOKEN');
  }

  const claimAcademyId = typeof decoded.academyId === 'string' ? decoded.academyId : '';
  const claimRole = typeof decoded.role === 'string' ? decoded.role : '';

  if (!claimAcademyId || !VALID_ROLES.includes(claimRole as AcademyRole)) {
    throw new PolicyError(
      'الحساب غير مرتبط بأي أكاديمية أو لا يملك دورًا معتمدًا.',
      403,
      'NO_ACADEMY_CLAIMS'
    );
  }

  const memberSnap = await adminDb
    .collection('academies')
    .doc(claimAcademyId)
    .collection('members')
    .doc(decoded.uid)
    .get();

  if (!memberSnap.exists) {
    throw new PolicyError('سجل العضوية غير موجود داخل الأكاديمية.', 403, 'MEMBER_NOT_FOUND');
  }

  const member = memberSnap.data() as MemberDoc;

  const actor: ActorContext = {
    uid: decoded.uid,
    email: decoded.email || member.email || '',
    academyId: claimAcademyId,
    role: member.role,
    perms: sanitizePermissions(member.perms),
    status: member.status,
  };

  assertActiveActor(actor);

  // Never trust client-supplied academyId if it differs from server-verified claims
  assertAcademyIsolation(actor, req.body?.academyId);

  return actor;
}

export function handleApiError(res: ApiResponse, err: unknown): void {
  if (err instanceof PolicyError) {
    res.status(err.statusCode).json({
      ok: false,
      code: err.code,
      error: err.message,
    });
    return;
  }

  const message = err instanceof Error ? err.message : 'حدث خطأ غير متوقع في الخادم.';
  if (message.includes('PERMISSION_DENIED') || message.includes('7 PERMISSION_DENIED')) {
    res.status(403).json({
      ok: false,
      code: 'IAM_PERMISSION_DENIED',
      error:
        'تعذر وصول الخادم إلى Firebase. تأكد من منح حساب الخدمة أدوار IAM المطلوبة (Datastore User و Firebase Authentication Admin) على مشروع monisakacadmy.',
    });
    return;
  }

  res.status(500).json({
    ok: false,
    code: 'INTERNAL_ERROR',
    error: message,
  });
}
