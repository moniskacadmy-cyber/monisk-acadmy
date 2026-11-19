import 'dotenv/config';

const EXPECTED_PROJECT_ID = 'monisakacadmy';
const EXPECTED_DATABASE_ID = 'ai-studio-d56df56b-4921-4e23-8608-51b87386123a';
const EXPECTED_ACADEMY_ID = 'monisak.acadmy';
const EXPECTED_ACADEMY_NAME = 'مؤنسك';
const EXPECTED_OWNER_EMAIL = 'shirefshaker2@gmail.com';
const EXPECTED_OWNER_UID = 'pLfi3BitknW00yhlex2WzQf29IT2';

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`متغير البيئة ${name} مطلوب.`);
  return value;
}

async function main() {
  const projectId = requiredEnv('FIREBASE_PROJECT_ID');
  const databaseId = requiredEnv('FIREBASE_DATABASE_ID');

  if (projectId !== EXPECTED_PROJECT_ID) {
    throw new Error(`رفض التنفيذ: المشروع يجب أن يكون ${EXPECTED_PROJECT_ID}.`);
  }
  if (databaseId !== EXPECTED_DATABASE_ID) {
    throw new Error('رفض التنفيذ: قاعدة Firestore المحددة غير مطابقة لقاعدة الأكاديمية.');
  }

  // Uses Cloud Shell Application Default Credentials. No downloaded service-account key is needed.
  const { adminAuth, adminDb, resolvedProjectId, resolvedDatabaseId } =
    await import('../src/server/firebaseAdmin');
  const { ALL_SUPERVISOR_PERMISSIONS } = await import('../src/shared/types');

  if (resolvedProjectId !== EXPECTED_PROJECT_ID || resolvedDatabaseId !== EXPECTED_DATABASE_ID) {
    throw new Error('رفض التنفيذ: اتصال Firebase Admin لا يطابق المشروع وقاعدة البيانات المعتمدين.');
  }

  const user = await adminAuth.getUserByEmail(EXPECTED_OWNER_EMAIL);
  if (user.uid !== EXPECTED_OWNER_UID) {
    throw new Error('رفض التنفيذ: UID الحساب لا يطابق الحساب الذي تم التحقق منه مسبقًا.');
  }
  if ((user.email || '').toLowerCase() !== EXPECTED_OWNER_EMAIL) {
    throw new Error('رفض التنفيذ: البريد الإلكتروني للحساب غير مطابق.');
  }
  if (user.disabled) {
    throw new Error('تم الإيقاف: حساب المدير معطّل في Firebase Authentication.');
  }

  const currentClaims = user.customClaims || {};
  if ('academyId' in currentClaims || 'role' in currentClaims || 'status' in currentClaims) {
    throw new Error('تم الإيقاف: الحساب يحمل بالفعل بيانات صلاحيات. لن يتم استبدال أي صلاحيات موجودة.');
  }

  const academyRef = adminDb.collection('academies').doc(EXPECTED_ACADEMY_ID);
  const memberRef = academyRef.collection('members').doc(user.uid);
  const auditRef = academyRef.collection('auditLogs').doc();
  const existingAcademy = await academyRef.get();
  const existingMember = await memberRef.get();

  if (existingAcademy.exists || existingMember.exists) {
    throw new Error('تم الإيقاف: الأكاديمية أو عضوية المدير موجودة بالفعل. لا توجد بيانات سيتم استبدالها.');
  }

  const now = new Date().toISOString();
  const ownerName = user.displayName?.trim() || 'مدير أكاديمية مؤنسك';

  await adminDb.runTransaction(async (transaction) => {
    const [academySnapshot, memberSnapshot] = await Promise.all([
      transaction.get(academyRef),
      transaction.get(memberRef),
    ]);
    if (academySnapshot.exists || memberSnapshot.exists) {
      throw new Error('تم الإيقاف: ظهرت بيانات أكاديمية أو عضوية أثناء التأسيس.');
    }

    transaction.create(academyRef, {
      id: EXPECTED_ACADEMY_ID,
      name: EXPECTED_ACADEMY_NAME,
      slug: EXPECTED_ACADEMY_ID,
      currency: 'EGP',
      ownerUid: user.uid,
      planStatus: 'active',
      createdAt: now,
      updatedAt: now,
    });

    transaction.create(memberRef, {
      id: user.uid,
      uid: user.uid,
      academyId: EXPECTED_ACADEMY_ID,
      name: ownerName,
      email: EXPECTED_OWNER_EMAIL,
      role: 'owner',
      perms: ALL_SUPERVISOR_PERMISSIONS,
      status: 'active',
      createdBy: 'CLOUD_SHELL_FIRST_OWNER_BOOTSTRAP',
      createdAt: now,
      updatedAt: now,
    });

    transaction.create(auditRef, {
      id: auditRef.id,
      academyId: EXPECTED_ACADEMY_ID,
      actorUid: user.uid,
      actorEmail: EXPECTED_OWNER_EMAIL,
      actorRole: 'owner',
      action: 'BOOTSTRAPPED_EXISTING_OWNER',
      targetCollection: 'academies',
      targetId: EXPECTED_ACADEMY_ID,
      details: { academyName: EXPECTED_ACADEMY_NAME, ownerEmail: EXPECTED_OWNER_EMAIL },
      createdAt: now,
    });
  });

  try {
    await adminAuth.setCustomUserClaims(user.uid, {
      ...currentClaims,
      academyId: EXPECTED_ACADEMY_ID,
      role: 'owner',
      perms: ALL_SUPERVISOR_PERMISSIONS,
      status: 'active',
    });
  } catch (error) {
    try {
      await adminDb.runTransaction(async (transaction) => {
        const [academyAfter, memberAfter, auditAfter] = await Promise.all([
          transaction.get(academyRef),
          transaction.get(memberRef),
          transaction.get(auditRef),
        ]);
        const isThisRun = academyAfter.exists
          && memberAfter.exists
          && auditAfter.exists
          && academyAfter.data()?.ownerUid === user.uid
          && memberAfter.data()?.createdBy === 'CLOUD_SHELL_FIRST_OWNER_BOOTSTRAP'
          && auditAfter.data()?.action === 'BOOTSTRAPPED_EXISTING_OWNER'
          && auditAfter.data()?.actorUid === user.uid;
        if (isThisRun) {
          transaction.delete(auditRef);
          transaction.delete(memberRef);
          transaction.delete(academyRef);
        } else {
          throw new Error('لم يتم التراجع تلقائيًا لأن بيانات Firestore لم تعد تطابق ما أنشأته هذه المحاولة.');
        }
      });
    } catch (cleanupError) {
      console.error('تنبيه مهم: فشل تعيين الصلاحيات وفشل التراجع عن مستندات التأسيس؛ يلزم فحص يدوي.', cleanupError);
    }
    throw error;
  }

  console.log('نجح تأسيس أكاديمية مؤنسك وربط حساب المدير الحالي بدور owner.');
  console.log('سجّل الخروج من الموقع ثم ادخل مرة أخرى لتحديث Firebase ID token.');
  console.log('لم يتم إنشاء حساب Auth جديد أو تغيير كلمة المرور أو إعداد عملة افتراضية.');
}

main().catch((error) => {
  console.error('فشل تأسيس المدير الأول:', error);
  process.exit(1);
});
