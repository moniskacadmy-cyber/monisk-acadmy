import 'dotenv/config';

const EXPECTED_PROJECT_ID = 'monisakacadmy';
const EXPECTED_DATABASE_ID = 'ai-studio-d56df56b-4921-4e23-8608-51b87386123a';

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`متغير البيئة ${name} مطلوب.`);
  return value;
}

async function main() {
  // Validate configuration before loading Firebase Admin (which initializes on import).
  const projectId = requiredEnv('FIREBASE_PROJECT_ID');
  const databaseId = requiredEnv('FIREBASE_DATABASE_ID');
  const clientEmail = requiredEnv('FIREBASE_CLIENT_EMAIL');
  const privateKey = requiredEnv('FIREBASE_PRIVATE_KEY');
  const academyId = requiredEnv('BOOTSTRAP_ACADEMY_ID');
  const academyName = requiredEnv('BOOTSTRAP_ACADEMY_NAME');
  const ownerEmail = requiredEnv('BOOTSTRAP_OWNER_EMAIL').toLowerCase();
  const ownerPassword = requiredEnv('BOOTSTRAP_OWNER_PASSWORD');
  const ownerName = process.env.BOOTSTRAP_OWNER_NAME?.trim() || 'مدير أكاديمية مؤنسك';

  if (projectId !== EXPECTED_PROJECT_ID) {
    throw new Error(`رفض التنفيذ: مشروع Firebase المحدد ليس المشروع المعتمد (${EXPECTED_PROJECT_ID}).`);
  }
  if (databaseId !== EXPECTED_DATABASE_ID) {
    throw new Error(`رفض التنفيذ: قاعدة البيانات المحددة ليست قاعدة الأكاديمية المعتمدة (${EXPECTED_DATABASE_ID}).`);
  }
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(academyId)) {
    throw new Error('معرّف الأكاديمية غير صالح.');
  }
  if (academyName !== 'مؤنسك') {
    throw new Error('اسم الأكاديمية يجب أن يطابق الاسم الذي تم اعتماده: مؤنسك.');
  }
  if (ownerEmail !== 'shirefshaker2@gmail.com') {
    throw new Error('البريد الإلكتروني لا يطابق بريد المدير الأول المعتمد.');
  }
  if (ownerPassword.length < 12) {
    throw new Error('كلمة المرور يجب أن تكون 12 حرفًا على الأقل.');
  }
  if (!clientEmail.includes('@') || !privateKey.includes('PRIVATE KEY')) {
    throw new Error('بيانات اعتماد Firebase Admin غير مكتملة أو غير صالحة شكليًا.');
  }

  const { adminAuth, adminDb, resolvedProjectId, resolvedDatabaseId } =
    await import('../src/server/firebaseAdmin');
  const { ALL_SUPERVISOR_PERMISSIONS } = await import('../src/shared/types');

  if (resolvedProjectId !== EXPECTED_PROJECT_ID || resolvedDatabaseId !== EXPECTED_DATABASE_ID) {
    throw new Error('رفض التنفيذ: Firebase Admin اتصل بمشروع أو قاعدة بيانات غير متطابقين مع الإعدادات المعتمدة.');
  }

  const academyRef = adminDb.collection('academies').doc(academyId);
  const ownerEmailNormalized = ownerEmail;

  // Never adopt an existing Auth account: this script may only create a brand-new owner.
  try {
    await adminAuth.getUserByEmail(ownerEmailNormalized);
    throw new Error('يوجد حساب Auth بهذا البريد بالفعل؛ تم الإيقاف دون تغيير الحساب أو صلاحياته.');
  } catch (error) {
    if ((error as { code?: string }).code !== 'auth/user-not-found') throw error;
  }

  // Preflight check for a clear error; the transaction below repeats this atomically.
  const academySnapshot = await academyRef.get();
  if (academySnapshot.exists) {
    throw new Error('الأكاديمية موجودة بالفعل؛ تم الإيقاف دون تعديل بياناتها أو مالكها.');
  }

  let createdUid: string | undefined;
  try {
    const userRecord = await adminAuth.createUser({
      email: ownerEmailNormalized,
      password: ownerPassword,
      displayName: ownerName,
      emailVerified: false,
      disabled: false,
    });
    createdUid = userRecord.uid;

    await adminAuth.setCustomUserClaims(createdUid, {
      academyId,
      role: 'owner',
      perms: ALL_SUPERVISOR_PERMISSIONS,
      status: 'active',
    });

    const now = new Date().toISOString();
    const memberRef = academyRef.collection('members').doc(createdUid);
    const auditRef = academyRef.collection('auditLogs').doc();

    await adminDb.runTransaction(async (transaction) => {
      const currentAcademy = await transaction.get(academyRef);
      if (currentAcademy.exists) {
        throw new Error('الأكاديمية أُنشئت بالتزامن؛ تم إلغاء التأسيس.');
      }

      transaction.create(academyRef, {
        id: academyId,
        name: academyName,
        slug: academyId,
        ownerUid: createdUid,
        planStatus: 'active',
        createdAt: now,
        updatedAt: now,
      });

      transaction.create(memberRef, {
        id: createdUid,
        uid: createdUid,
        academyId,
        name: ownerName,
        email: ownerEmailNormalized,
        role: 'owner',
        perms: ALL_SUPERVISOR_PERMISSIONS,
        status: 'active',
        createdBy: 'CLI_BOOTSTRAP',
        createdAt: now,
        updatedAt: now,
      });

      transaction.create(auditRef, {
        id: auditRef.id,
        academyId,
        actorUid: createdUid,
        actorEmail: ownerEmailNormalized,
        actorRole: 'owner',
        action: 'BOOTSTRAPPED_OWNER',
        targetCollection: 'academies',
        targetId: academyId,
        details: { academyName, ownerEmail: ownerEmailNormalized },
        createdAt: now,
      });
    });

    console.log(`تم تأسيس أكاديمية "${academyName}" وتعيين المدير الأول بنجاح.`);
    console.log('لم يتم تعيين عملة افتراضية للأكاديمية؛ تُحدد العملة لكل طالب على حدة.');
  } catch (error) {
    // The Auth user was created by this run only. Clean it up if Firestore setup fails.
    if (createdUid) {
      try {
        await adminAuth.setCustomUserClaims(createdUid, null);
        await adminAuth.deleteUser(createdUid);
      } catch (cleanupError) {
        console.error('تحذير: تعذّر تنظيف حساب Auth الذي أنشأته المحاولة الفاشلة؛ يلزم فحص يدوي.', cleanupError);
      }
    }
    throw error;
  }
}

main().catch((error) => {
  console.error('فشل تأسيس المدير الأول:', error);
  process.exit(1);
});
