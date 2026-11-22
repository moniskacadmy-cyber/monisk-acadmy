import 'dotenv/config';
import type { UserRecord } from 'firebase-admin/auth';
import {
  adminAuth,
  adminDb,
  resolvedDatabaseId,
  resolvedProjectId,
} from '../src/server/firebaseAdmin';
import { isValidDocumentId } from '../src/shared/policy';
import { ALL_SUPERVISOR_PERMISSIONS } from '../src/shared/types';

function getFirebaseErrorCode(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : '';
}

async function resolveTargetUser(params: {
  ownerUid: string;
  ownerEmail: string;
  ownerPassword: string;
  ownerName: string;
}): Promise<UserRecord> {
  const { ownerUid, ownerEmail, ownerPassword, ownerName } = params;

  if (ownerUid) {
    const byUid = await adminAuth.getUser(ownerUid);
    if (ownerEmail && byUid.email && byUid.email.toLowerCase() !== ownerEmail) {
      throw new Error(
        `المستخدم صاحب المعرف ${ownerUid} بريده (${byUid.email}) لا يطابق BOOTSTRAP_OWNER_EMAIL (${ownerEmail}).`
      );
    }
    console.log(`تم العثور على المستخدم عبر UID: ${byUid.uid}`);
    return byUid;
  }

  try {
    const existing = await adminAuth.getUserByEmail(ownerEmail);
    console.log(`تم العثور على المستخدم: ${existing.uid}`);
    return existing;
  } catch (err) {
    if (getFirebaseErrorCode(err) !== 'auth/user-not-found') {
      throw err;
    }

    if (ownerPassword.length < 8) {
      throw new Error(
        'المستخدم غير موجود بعد في Firebase Auth، لذا يلزم ضبط BOOTSTRAP_OWNER_PASSWORD (8 أحرف على الأقل) لإنشائه.'
      );
    }

    const created = await adminAuth.createUser({
      email: ownerEmail,
      password: ownerPassword,
      displayName: ownerName,
      emailVerified: true,
      disabled: false,
    });
    console.log(`تم إنشاء حساب المدير الأول: ${created.uid}`);
    return created;
  }
}

async function main() {
  const academyId = (process.env.BOOTSTRAP_ACADEMY_ID || 'academy_main').trim();
  const academyName = (process.env.BOOTSTRAP_ACADEMY_NAME || 'أكاديمية النور التعليمية').trim();
  const ownerUid = (process.env.BOOTSTRAP_OWNER_UID || '').trim();
  const ownerEmail = (process.env.BOOTSTRAP_OWNER_EMAIL || '').trim().toLowerCase();
  const ownerPassword = process.env.BOOTSTRAP_OWNER_PASSWORD || '';
  const ownerName = (process.env.BOOTSTRAP_OWNER_NAME || 'مدير الأكاديمية').trim();

  if (!isValidDocumentId(academyId)) {
    console.error(
      `قيمة BOOTSTRAP_ACADEMY_ID غير صالحة (${academyId}). يجب أن تحتوي أحرفًا إنجليزية أو أرقامًا أو _ . - فقط.`
    );
    process.exit(1);
  }

  if (!ownerEmail && !ownerUid) {
    console.error(
      'يرجى ضبط BOOTSTRAP_OWNER_EMAIL (أو BOOTSTRAP_OWNER_UID) قبل تشغيل السكربت. وتُطلب BOOTSTRAP_OWNER_PASSWORD (8 أحرف على الأقل) عند إنشاء حساب جديد فقط.'
    );
    process.exit(1);
  }

  console.log(
    `[Bootstrap] Project=${resolvedProjectId || '(unknown)'} | FirestoreDB=${resolvedDatabaseId} | Academy=${academyId}`
  );

  let userRecord = await resolveTargetUser({
    ownerUid,
    ownerEmail,
    ownerPassword,
    ownerName,
  });

  const resolvedEmail = (userRecord.email || ownerEmail).trim().toLowerCase();
  if (!resolvedEmail) {
    throw new Error('حساب Firebase Auth لا يحتوي على بريد إلكتروني.');
  }

  // Ensure existing owner accounts satisfy verified + active requirements in rules.
  if (!userRecord.emailVerified || userRecord.disabled || (!userRecord.displayName && ownerName)) {
    userRecord = await adminAuth.updateUser(userRecord.uid, {
      emailVerified: true,
      disabled: false,
      ...(userRecord.displayName ? {} : { displayName: ownerName }),
    });
  }

  const now = new Date().toISOString();
  const academyRef = adminDb.collection('academies').doc(academyId);
  const memberRef = academyRef.collection('members').doc(userRecord.uid);
  const [academySnap, memberSnap] = await Promise.all([academyRef.get(), memberRef.get()]);

  const existingAcademy = academySnap.exists
    ? (academySnap.data() as { createdAt?: string; currency?: string })
    : undefined;
  const existingMember = memberSnap.exists
    ? (memberSnap.data() as { createdAt?: string; createdBy?: string })
    : undefined;

  // Write Firestore records FIRST so Auth claims never point to a missing member document.
  const batch = adminDb.batch();
  batch.set(
    academyRef,
    {
      id: academyId,
      name: academyName,
      slug: academyId,
      currency: existingAcademy?.currency || 'SAR',
      ownerUid: userRecord.uid,
      planStatus: 'active',
      createdAt: existingAcademy?.createdAt || now,
      updatedAt: now,
    },
    { merge: true }
  );

  batch.set(
    memberRef,
    {
      id: userRecord.uid,
      uid: userRecord.uid,
      academyId,
      name: ownerName || userRecord.displayName || 'مدير الأكاديمية',
      email: resolvedEmail,
      role: 'owner',
      perms: ALL_SUPERVISOR_PERMISSIONS,
      status: 'active',
      createdBy: existingMember?.createdBy || 'CLI_BOOTSTRAP',
      createdAt: existingMember?.createdAt || now,
      updatedAt: now,
    },
    { merge: true }
  );

  const auditRef = academyRef.collection('auditLogs').doc();
  batch.set(auditRef, {
    id: auditRef.id,
    academyId,
    actorUid: userRecord.uid,
    actorEmail: resolvedEmail,
    actorRole: 'owner',
    action: 'BOOTSTRAPPED_OWNER',
    targetCollection: 'academies',
    targetId: academyId,
    details: {
      academyName,
      ownerEmail: resolvedEmail,
      databaseId: resolvedDatabaseId,
    },
    createdAt: now,
  });

  await batch.commit();

  // Sync Firebase Auth custom claims after Firestore commit succeeds.
  await adminAuth.setCustomUserClaims(userRecord.uid, {
    academyId,
    role: 'owner',
    perms: ALL_SUPERVISOR_PERMISSIONS,
    status: 'active',
  });

  console.log(
    `تم تأسيس الأكاديمية (${academyId}) وتعيين ${resolvedEmail} (UID: ${userRecord.uid}) كمدير أول بنجاح على قاعدة البيانات (${resolvedDatabaseId}).`
  );
}

main().catch((err) => {
  console.error('فشل تأسيس المدير الأول:', err);
  process.exit(1);
});
