import 'dotenv/config';
import { adminAuth, adminDb } from '../src/server/firebaseAdmin';
import { ALL_SUPERVISOR_PERMISSIONS } from '../src/shared/types';

async function main() {
  const academyId = process.env.BOOTSTRAP_ACADEMY_ID || 'academy_main';
  const academyName = process.env.BOOTSTRAP_ACADEMY_NAME || 'أكاديمية النور التعليمية';
  const ownerEmail = (process.env.BOOTSTRAP_OWNER_EMAIL || '').trim().toLowerCase();
  const ownerPassword = process.env.BOOTSTRAP_OWNER_PASSWORD || '';
  const ownerName = process.env.BOOTSTRAP_OWNER_NAME || 'مدير الأكاديمية';

  if (!ownerEmail || ownerPassword.length < 8) {
    console.error(
      'يرجى ضبط BOOTSTRAP_OWNER_EMAIL و BOOTSTRAP_OWNER_PASSWORD (8 أحرف على الأقل) قبل تشغيل السكربت.'
    );
    process.exit(1);
  }

  let userRecord;
  try {
    userRecord = await adminAuth.getUserByEmail(ownerEmail);
    console.log(`تم العثور على المستخدم: ${userRecord.uid}`);
  } catch {
    userRecord = await adminAuth.createUser({
      email: ownerEmail,
      password: ownerPassword,
      displayName: ownerName,
      emailVerified: true,
      disabled: false,
    });
    console.log(`تم إنشاء حساب المدير الأول: ${userRecord.uid}`);
  }

  await adminAuth.setCustomUserClaims(userRecord.uid, {
    academyId,
    role: 'owner',
    perms: ALL_SUPERVISOR_PERMISSIONS,
    status: 'active',
  });

  const now = new Date().toISOString();
  const academyRef = adminDb.collection('academies').doc(academyId);

  const batch = adminDb.batch();
  batch.set(
    academyRef,
    {
      id: academyId,
      name: academyName,
      slug: academyId,
      currency: 'SAR',
      ownerUid: userRecord.uid,
      planStatus: 'active',
      createdAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  batch.set(academyRef.collection('members').doc(userRecord.uid), {
    id: userRecord.uid,
    uid: userRecord.uid,
    academyId,
    name: ownerName,
    email: ownerEmail,
    role: 'owner',
    perms: ALL_SUPERVISOR_PERMISSIONS,
    status: 'active',
    createdBy: 'CLI_BOOTSTRAP',
    createdAt: now,
    updatedAt: now,
  });

  const auditRef = academyRef.collection('auditLogs').doc();
  batch.set(auditRef, {
    id: auditRef.id,
    academyId,
    actorUid: userRecord.uid,
    actorEmail: ownerEmail,
    actorRole: 'owner',
    action: 'BOOTSTRAPPED_OWNER',
    targetCollection: 'academies',
    targetId: academyId,
    details: { academyName, ownerEmail },
    createdAt: now,
  });

  await batch.commit();
  console.log(`تم تأسيس الأكاديمية (${academyId}) وتعيين ${ownerEmail} كمدير أول بنجاح.`);
}

main().catch((err) => {
  console.error('فشل تأسيس المدير الأول:', err);
  process.exit(1);
});
