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

  const claimAcademyId = typeof decoded.academyId === 'string' ? decoded.academyId.trim() : '';
  const claimRole = typeof decoded.role === 'string' ? decoded.role.trim() : '';

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

  if (member.academyId !== claimAcademyId || member.role !== claimRole) {
    throw new PolicyError(
      'صلاحيات الجلسة غير متطابقة مع سجل العضوية. يرجى تحديث الجلسة أو إعادة تسجيل الدخول.',
      403,
      'NO_ACADEMY_CLAIMS'
    );
  }

  const actor: ActorContext = {
    uid: decoded.uid,
    email: decoded.email || member.email || '',
    academyId: claimAcademyId,
    role: member.role,
    perms: sanitizePermissions(member.perms),
    status: member.status,
  };

  assertActiveActor(actor);

  let parsedBody: Record<string, unknown> | undefined = req.body;
  if (typeof req.body === 'string') {
    try {
      parsedBody = JSON.parse(req.body) as Record<string, unknown>;
      req.body = parsedBody;
    } catch {
      throw new PolicyError('تنسيق بيانات الطلب غير صالح.', 400, 'INVALID_JSON_BODY');
    }
  }

  // Never trust client-supplied academyId if it differs from server-verified claims
  assertAcademyIsolation(actor, parsedBody?.academyId);

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

  // Firebase Admin errors carry a string `code` such as 'auth/email-already-exists'
  const firebaseCode = (err as { code?: unknown } | null)?.code;
  if (firebaseCode === 'auth/email-already-exists') {
    res.status(409).json({
      ok: false,
      code: 'EMAIL_ALREADY_EXISTS',
      error: 'هذا البريد الإلكتروني مسجل بالفعل في النظام.',
    });
    return;
  }
  if (firebaseCode === 'auth/invalid-email') {
    res.status(400).json({
      ok: false,
      code: 'INVALID_EMAIL',
      error: 'صيغة البريد الإلكتروني غير صالحة.',
    });
    return;
  }
  if (firebaseCode === 'auth/invalid-password') {
    res.status(400).json({
      ok: false,
      code: 'WEAK_PASSWORD',
      error: 'كلمة المرور غير مطابقة لمتطلبات Firebase Auth (6 أحرف على الأقل).',
    });
    return;
  }
  if (firebaseCode === 'auth/operation-not-allowed') {
    res.status(403).json({
      ok: false,
      code: 'AUTH_PROVIDER_DISABLED',
      error: 'مزود البريد الإلكتروني وكلمة المرور غير مفعّل في Firebase Authentication.',
    });
    return;
  }
  if (
    firebaseCode === 'auth/insufficient-permission' ||
    firebaseCode === 'auth/internal-error' ||
    firebaseCode === 'app/invalid-credential'
  ) {
    console.error('[API] Firebase Admin permission/credential error:', err);
    res.status(403).json({
      ok: false,
      code: 'IAM_PERMISSION_DENIED',
      error:
        'تعذر وصول الخادم إلى Firebase Auth أو Firestore. تأكد من إعداد FIREBASE_CLIENT_EMAIL وFIREBASE_PRIVATE_KEY أو منح حساب الخدمة صلاحيات datastore.user وfirebaseauth.admin.',
    });
    return;
  }

  // Full details stay in server logs; the client only gets a generic message.
  console.error('[API] Unexpected error:', err);

  const message = err instanceof Error ? err.message : '';
  if (message.includes('PERMISSION_DENIED') || firebaseCode === 7) {
    res.status(403).json({
      ok: false,
      code: 'IAM_PERMISSION_DENIED',
      error:
        'تعذر وصول الخادم إلى قاعدة البيانات. تأكد من صلاحيات حساب الخدمة (IAM) أو متغيرات Firebase Admin.',
    });
    return;
  }

  res.status(500).json({
    ok: false,
    code: 'INTERNAL_ERROR',
    error: 'حدث خطأ غير متوقع في الخادم. حاول مرة أخرى لاحقًا.',
  });
}
