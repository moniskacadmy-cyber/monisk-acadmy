import {
  PolicyError,
  assertCanAccessCrm,
  assertCanAccessFinance,
  assertCanAccessPayroll,
  assertCanCreateMember,
  assertCanLinkParent,
  assertCanManageGroups,
  assertCanManageStudents,
  assertCanToggleMemberStatus,
  assertCanUpdatePermissions,
  isValidDocumentId,
  sanitizePermissions,
} from '../shared/policy';
import type {
  AcademyRole,
  GroupDoc,
  InvoiceDoc,
  MemberDoc,
  StudentDoc,
  SupervisorPermission,
} from '../shared/types';
import { writeAuditLog } from './audit';
import { authenticateActor, handleApiError, type ApiRequest, type ApiResponse } from './authMiddleware';
import { adminAuth, adminDb, adminMessaging } from './firebaseAdmin';

function str(val: unknown, max = 200): string {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, max);
}

function num(val: unknown, fallback = 0): number {
  const parsed = Number(val);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function academyRef(academyId: string) {
  return adminDb.collection('academies').doc(academyId);
}

// 1. Create Member (Owner or Authorized Supervisor; NEVER Owner)
export async function handleCreateMember(req: ApiRequest, res: ApiResponse): Promise<void> {
  try {
    const actor = await authenticateActor(req);
    const body = req.body || {};

    const name = str(body.name, 120);
    const email = str(body.email, 200).toLowerCase();
    const password = typeof body.password === 'string' ? body.password : '';
    const phone = str(body.phone, 40);
    const role = str(body.role, 32) as AcademyRole;
    const requestedPerms = sanitizePermissions(body.perms);
    const track = str(body.track, 100) || 'القرآن الكريم';
    const level = str(body.level, 100) || 'المستوى التمهيدي';

    if (name.length < 2) {
      throw new PolicyError('يرجى إدخال الاسم الكامل (حرفان على الأقل).', 400, 'INVALID_NAME');
    }
    if (!email || !email.includes('@')) {
      throw new PolicyError('يرجى إدخال بريد إلكتروني صحيح.', 400, 'INVALID_EMAIL');
    }
    if (password.length < 8) {
      throw new PolicyError('كلمة المرور يجب أن تكون 8 أحرف على الأقل.', 400, 'WEAK_PASSWORD');
    }
    if (!['owner', 'supervisor', 'teacher', 'student', 'parent'].includes(role)) {
      throw new PolicyError('الدور المحدد غير صالح.', 400, 'INVALID_ROLE');
    }

    assertCanCreateMember(actor, role);

    const perms: SupervisorPermission[] = role === 'supervisor' ? requestedPerms : [];

    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName: name,
      emailVerified: true,
      disabled: false,
    });

    const now = new Date().toISOString();
    const memberDoc: MemberDoc = {
      id: userRecord.uid,
      uid: userRecord.uid,
      academyId: actor.academyId,
      name,
      email,
      ...(phone ? { phone } : {}),
      role,
      perms,
      status: 'active',
      createdBy: actor.uid,
      createdAt: now,
      updatedAt: now,
    };

    const batch = adminDb.batch();
    batch.set(academyRef(actor.academyId).collection('members').doc(userRecord.uid), memberDoc);

    if (role === 'student') {
      const studentDoc: StudentDoc = {
        id: userRecord.uid,
        academyId: actor.academyId,
        userId: userRecord.uid,
        fullName: name,
        email,
        ...(phone ? { phone } : {}),
        track,
        level,
        points: 0,
        teacherUids: [],
        parentUids: [],
        groupIds: [],
        status: 'active',
        createdAt: now,
        updatedAt: now,
      };
      batch.set(academyRef(actor.academyId).collection('students').doc(userRecord.uid), studentDoc);
    }

    // Keep the audit record in the same atomic Firestore batch as the member.
    const auditRef = academyRef(actor.academyId).collection('auditLogs').doc();
    batch.set(auditRef, {
      id: auditRef.id,
      academyId: actor.academyId,
      actorUid: actor.uid,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'CREATE_MEMBER',
      targetCollection: 'members',
      targetId: userRecord.uid,
      details: { role, perms, email },
      createdAt: now,
    });

    try {
      await adminAuth.setCustomUserClaims(userRecord.uid, {
        academyId: actor.academyId,
        role,
        perms,
        status: 'active',
      });
      await batch.commit();
    } catch (creationError) {
      // Avoid leaving an orphaned Auth account when claims or Firestore writes fail.
      try {
        await adminAuth.deleteUser(userRecord.uid);
      } catch (cleanupError) {
        console.error('[API] Failed to clean up incomplete member account:', cleanupError);
      }
      throw creationError;
    }

    res.status(201).json({ ok: true, member: memberDoc });
  } catch (err) {
    handleApiError(res, err);
  }
}

// 2. Disable / Enable Member
export async function handleDisableMember(req: ApiRequest, res: ApiResponse): Promise<void> {
  try {
    const actor = await authenticateActor(req);
    const body = req.body || {};
    const targetUid = str(body.uid, 128);
    const nextStatus = body.status === 'active' ? 'active' : 'disabled';

    if (!isValidDocumentId(targetUid)) {
      throw new PolicyError('معرف العضو غير صالح.', 400, 'INVALID_UID');
    }

    const targetRef = academyRef(actor.academyId).collection('members').doc(targetUid);
    const targetSnap = await targetRef.get();
    if (!targetSnap.exists) {
      throw new PolicyError('العضو غير موجود في هذه الأكاديمية.', 404, 'MEMBER_NOT_FOUND');
    }

    const target = targetSnap.data() as MemberDoc;
    assertCanToggleMemberStatus(actor, target);

    await adminAuth.updateUser(targetUid, { disabled: nextStatus === 'disabled' });
    await adminAuth.setCustomUserClaims(targetUid, {
      academyId: actor.academyId,
      role: target.role,
      perms: sanitizePermissions(target.perms),
      status: nextStatus,
    });
    if (nextStatus === 'disabled') {
      await adminAuth.revokeRefreshTokens(targetUid);
    }

    const updatedAt = new Date().toISOString();
    await targetRef.update({ status: nextStatus, updatedAt });

    await writeAuditLog({
      academyId: actor.academyId,
      actor,
      action: nextStatus === 'disabled' ? 'DISABLE_MEMBER' : 'ENABLE_MEMBER',
      targetCollection: 'members',
      targetId: targetUid,
      details: { previousStatus: target.status, nextStatus, role: target.role },
    });

    res.status(200).json({ ok: true, uid: targetUid, status: nextStatus });
  } catch (err) {
    handleApiError(res, err);
  }
}

// 3. Update Supervisor Permissions (Owner Only)
export async function handleUpdatePermissions(req: ApiRequest, res: ApiResponse): Promise<void> {
  try {
    const actor = await authenticateActor(req);
    const body = req.body || {};
    const targetUid = str(body.uid, 128);
    const perms = sanitizePermissions(body.perms);

    if (!isValidDocumentId(targetUid)) {
      throw new PolicyError('معرف المشرف غير صالح.', 400, 'INVALID_UID');
    }

    const targetRef = academyRef(actor.academyId).collection('members').doc(targetUid);
    const targetSnap = await targetRef.get();
    if (!targetSnap.exists) {
      throw new PolicyError('المشرف غير موجود.', 404, 'MEMBER_NOT_FOUND');
    }

    const target = targetSnap.data() as MemberDoc;
    assertCanUpdatePermissions(actor, target.role);

    await adminAuth.setCustomUserClaims(targetUid, {
      academyId: actor.academyId,
      role: target.role,
      perms,
      status: target.status,
    });

    await targetRef.update({
      perms,
      updatedAt: new Date().toISOString(),
    });

    await writeAuditLog({
      academyId: actor.academyId,
      actor,
      action: 'UPDATE_SUPERVISOR_PERMS',
      targetCollection: 'members',
      targetId: targetUid,
      details: { perms },
    });

    res.status(200).json({ ok: true, uid: targetUid, perms });
  } catch (err) {
    handleApiError(res, err);
  }
}

// 4. Upsert / Archive Student
export async function handleUpsertStudent(req: ApiRequest, res: ApiResponse): Promise<void> {
  try {
    const actor = await authenticateActor(req);
    assertCanManageStudents(actor);

    const body = req.body || {};
    const studentId = str(body.id, 128);
    const fullName = str(body.fullName, 120);
    const email = str(body.email, 200).toLowerCase();
    const phone = str(body.phone, 40);
    const track = str(body.track, 100) || 'القرآن الكريم';
    const level = str(body.level, 100) || 'المستوى الأول';
    const status = body.status === 'archived' ? 'archived' : 'active';

    if (fullName.length < 2) {
      throw new PolicyError('يرجى إدخال اسم الطالب.', 400, 'INVALID_NAME');
    }

    const studentsCol = academyRef(actor.academyId).collection('students');
    const now = new Date().toISOString();

    if (studentId) {
      if (!isValidDocumentId(studentId)) {
        throw new PolicyError('معرف الطالب غير صالح.', 400, 'INVALID_ID');
      }
      const ref = studentsCol.doc(studentId);
      const snap = await ref.get();
      if (!snap.exists) {
        throw new PolicyError('ملف الطالب غير موجود.', 404, 'STUDENT_NOT_FOUND');
      }
      await ref.update({
        fullName,
        ...(email ? { email } : {}),
        phone,
        track,
        level,
        status,
        updatedAt: now,
      });

      await writeAuditLog({
        academyId: actor.academyId,
        actor,
        action: 'UPDATE_STUDENT',
        targetCollection: 'students',
        targetId: studentId,
        details: { fullName, track, level, status },
      });

      res.status(200).json({ ok: true, id: studentId });
      return;
    }

    // Create standalone student profile + auth account if password supplied
    const password = typeof body.password === 'string' ? body.password : '';
    if (!email || !email.includes('@') || password.length < 8) {
      throw new PolicyError(
        'لإنشاء طالب جديد يلزم بريد إلكتروني صحيح وكلمة مرور (8 أحرف على الأقل).',
        400,
        'STUDENT_CREDENTIALS_REQUIRED'
      );
    }

    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName: fullName,
      emailVerified: true,
      disabled: false,
    });

    await adminAuth.setCustomUserClaims(userRecord.uid, {
      academyId: actor.academyId,
      role: 'student',
      perms: [],
      status: 'active',
    });

    const memberDoc: MemberDoc = {
      id: userRecord.uid,
      uid: userRecord.uid,
      academyId: actor.academyId,
      name: fullName,
      email,
      ...(phone ? { phone } : {}),
      role: 'student',
      perms: [],
      status: 'active',
      createdBy: actor.uid,
      createdAt: now,
      updatedAt: now,
    };

    const studentDoc: StudentDoc = {
      id: userRecord.uid,
      academyId: actor.academyId,
      userId: userRecord.uid,
      fullName,
      email,
      ...(phone ? { phone } : {}),
      track,
      level,
      points: 0,
      teacherUids: [],
      parentUids: [],
      groupIds: [],
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    const batch = adminDb.batch();
    batch.set(academyRef(actor.academyId).collection('members').doc(userRecord.uid), memberDoc);
    batch.set(studentsCol.doc(userRecord.uid), studentDoc);
    await batch.commit();

    await writeAuditLog({
      academyId: actor.academyId,
      actor,
      action: 'CREATE_STUDENT',
      targetCollection: 'students',
      targetId: userRecord.uid,
      details: { fullName, email, track, level },
    });

    res.status(201).json({ ok: true, student: studentDoc });
  } catch (err) {
    handleApiError(res, err);
  }
}

export async function handleArchiveStudent(req: ApiRequest, res: ApiResponse): Promise<void> {
  try {
    const actor = await authenticateActor(req);
    assertCanManageStudents(actor);

    const studentId = str(req.body?.studentId, 128);
    const nextStatus = req.body?.status === 'active' ? 'active' : 'archived';

    if (!isValidDocumentId(studentId)) {
      throw new PolicyError('معرف الطالب غير صالح.', 400, 'INVALID_ID');
    }

    const ref = academyRef(actor.academyId).collection('students').doc(studentId);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new PolicyError('الطالب غير موجود.', 404, 'STUDENT_NOT_FOUND');
    }

    await ref.update({ status: nextStatus, updatedAt: new Date().toISOString() });

    await writeAuditLog({
      academyId: actor.academyId,
      actor,
      action: nextStatus === 'archived' ? 'ARCHIVE_STUDENT' : 'RESTORE_STUDENT',
      targetCollection: 'students',
      targetId: studentId,
      details: { status: nextStatus },
    });

    res.status(200).json({ ok: true, studentId, status: nextStatus });
  } catch (err) {
    handleApiError(res, err);
  }
}

// 5. Create / Update / Archive Group + sync student teacherUids & groupIds
export async function handleCreateOrUpdateGroup(req: ApiRequest, res: ApiResponse): Promise<void> {
  try {
    const actor = await authenticateActor(req);
    assertCanManageGroups(actor);

    const body = req.body || {};
    const groupId = str(body.id, 128);
    const name = str(body.name, 120);
    const subject = str(body.subject, 120) || 'تحفيظ ومراجعة';
    const teacherUid = str(body.teacherUid, 128);
    const scheduleText = str(body.scheduleText, 200);
    const meetingLink = str(body.meetingLink, 400);
    const rawStudentIds = Array.isArray(body.studentIds) ? body.studentIds : [];
    const studentIds = Array.from(
      new Set(rawStudentIds.filter((s): s is string => isValidDocumentId(s)))
    ).slice(0, 100);

    if (name.length < 2) {
      throw new PolicyError('يرجى إدخال اسم الحلقة أو المجموعة.', 400, 'INVALID_GROUP_NAME');
    }
    if (!isValidDocumentId(teacherUid)) {
      throw new PolicyError('يرجى اختيار معلم صحيح للحلقة.', 400, 'INVALID_TEACHER');
    }

    const teacherSnap = await academyRef(actor.academyId).collection('members').doc(teacherUid).get();
    if (!teacherSnap.exists) {
      throw new PolicyError('المعلم غير موجود في هذه الأكاديمية.', 404, 'TEACHER_NOT_FOUND');
    }
    const teacher = teacherSnap.data() as MemberDoc;
    if (teacher.role !== 'teacher' || teacher.status !== 'active') {
      throw new PolicyError('الحساب المختار ليس معلمًا نشطًا في الأكاديمية.', 400, 'INVALID_TEACHER_ROLE');
    }

    const groupsCol = academyRef(actor.academyId).collection('groups');
    const studentsCol = academyRef(actor.academyId).collection('students');

    const ref = groupId ? groupsCol.doc(groupId) : groupsCol.doc();
    const existingSnap = groupId ? await ref.get() : null;
    if (groupId && (!existingSnap || !existingSnap.exists)) {
      throw new PolicyError('المجموعة غير موجودة.', 404, 'GROUP_NOT_FOUND');
    }

    const previousGroup = existingSnap?.exists ? (existingSnap.data() as GroupDoc) : null;

    // Fetch validated student docs to compute studentUserIds & parentUids
    const studentUserIds = new Set<string>();
    const parentUids = new Set<string>();
    const validStudentIds: string[] = [];

    const studentDocsMap = new Map<string, StudentDoc>();
    for (const sid of studentIds) {
      const sSnap = await studentsCol.doc(sid).get();
      if (sSnap.exists) {
        const sData = sSnap.data() as StudentDoc;
        studentDocsMap.set(sid, sData);
        validStudentIds.push(sid);
        studentUserIds.add(sData.userId);
        for (const pUid of sData.parentUids || []) {
          parentUids.add(pUid);
        }
      }
    }

    const now = new Date().toISOString();
    const groupDoc: GroupDoc = {
      id: ref.id,
      academyId: actor.academyId,
      name,
      subject,
      teacherUid,
      teacherName: teacher.name,
      studentIds: validStudentIds,
      studentUserIds: Array.from(studentUserIds),
      parentUids: Array.from(parentUids),
      scheduleText,
      ...(meetingLink ? { meetingLink } : {}),
      status: body.status === 'archived' ? 'archived' : 'active',
      createdAt: previousGroup?.createdAt || now,
      updatedAt: now,
    };

    const batch = adminDb.batch();
    batch.set(ref, groupDoc);

    // Sync added students
    for (const [sid, sData] of studentDocsMap.entries()) {
      const nextGroupIds = Array.from(new Set([...(sData.groupIds || []), ref.id]));
      const nextTeacherUids = Array.from(new Set([...(sData.teacherUids || []), teacherUid]));
      batch.update(studentsCol.doc(sid), {
        groupIds: nextGroupIds,
        teacherUids: nextTeacherUids,
        updatedAt: now,
      });
    }

    // Remove groupId from removed students
    if (previousGroup) {
      const removedIds = previousGroup.studentIds.filter((id) => !validStudentIds.includes(id));
      for (const removedId of removedIds) {
        const remSnap = await studentsCol.doc(removedId).get();
        if (remSnap.exists) {
          const remData = remSnap.data() as StudentDoc;
          const remainingGroupIds = (remData.groupIds || []).filter((gid) => gid !== ref.id);
          // Recompute remaining teacherUids from active groups
          const remainingTeachers = new Set<string>();
          for (const gid of remainingGroupIds) {
            const gSnap = await groupsCol.doc(gid).get();
            if (gSnap.exists) {
              const g = gSnap.data() as GroupDoc;
              if (g.status === 'active') remainingTeachers.add(g.teacherUid);
            }
          }
          batch.update(studentsCol.doc(removedId), {
            groupIds: remainingGroupIds,
            teacherUids: Array.from(remainingTeachers),
            updatedAt: now,
          });
        }
      }
    }

    await batch.commit();

    await writeAuditLog({
      academyId: actor.academyId,
      actor,
      action: previousGroup ? 'UPDATE_GROUP' : 'CREATE_GROUP',
      targetCollection: 'groups',
      targetId: ref.id,
      details: { name, teacherUid, studentCount: validStudentIds.length },
    });

    res.status(previousGroup ? 200 : 201).json({ ok: true, group: groupDoc });
  } catch (err) {
    handleApiError(res, err);
  }
}

export async function handleArchiveGroup(req: ApiRequest, res: ApiResponse): Promise<void> {
  try {
    const actor = await authenticateActor(req);
    assertCanManageGroups(actor);

    const groupId = str(req.body?.groupId, 128);
    const nextStatus = req.body?.status === 'active' ? 'active' : 'archived';
    if (!isValidDocumentId(groupId)) {
      throw new PolicyError('معرف المجموعة غير صالح.', 400, 'INVALID_ID');
    }

    const ref = academyRef(actor.academyId).collection('groups').doc(groupId);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new PolicyError('المجموعة غير موجودة.', 404, 'GROUP_NOT_FOUND');
    }

    await ref.update({ status: nextStatus, updatedAt: new Date().toISOString() });

    await writeAuditLog({
      academyId: actor.academyId,
      actor,
      action: nextStatus === 'archived' ? 'ARCHIVE_GROUP' : 'RESTORE_GROUP',
      targetCollection: 'groups',
      targetId: groupId,
      details: { status: nextStatus },
    });

    res.status(200).json({ ok: true, groupId, status: nextStatus });
  } catch (err) {
    handleApiError(res, err);
  }
}

// 6. Link / Unlink Parent to Student (Admin-approved ONLY; parents cannot self-link)
export async function handleLinkParentToStudent(req: ApiRequest, res: ApiResponse): Promise<void> {
  try {
    const actor = await authenticateActor(req);
    assertCanLinkParent(actor);

    const body = req.body || {};
    const parentUid = str(body.parentUid, 128);
    const studentId = str(body.studentId, 128);
    const relation = str(body.relation, 60) || 'ولي أمر';
    const action = body.action === 'revoke' ? 'revoke' : 'link';

    if (!isValidDocumentId(parentUid) || !isValidDocumentId(studentId)) {
      throw new PolicyError('معرف ولي الأمر أو الطالب غير صالح.', 400, 'INVALID_IDS');
    }

    const parentSnap = await academyRef(actor.academyId).collection('members').doc(parentUid).get();
    if (!parentSnap.exists) {
      throw new PolicyError('حساب ولي الأمر غير موجود في الأكاديمية.', 404, 'PARENT_NOT_FOUND');
    }
    const parent = parentSnap.data() as MemberDoc;
    if (parent.role !== 'parent') {
      throw new PolicyError('الحساب المختار ليس بصلاحية ولي أمر.', 400, 'INVALID_PARENT_ROLE');
    }

    const studentRef = academyRef(actor.academyId).collection('students').doc(studentId);
    const studentSnap = await studentRef.get();
    if (!studentSnap.exists) {
      throw new PolicyError('ملف الطالب غير موجود.', 404, 'STUDENT_NOT_FOUND');
    }
    const student = studentSnap.data() as StudentDoc;

    const linkId = `${parentUid}_${studentId}`;
    const linkRef = academyRef(actor.academyId).collection('parentLinks').doc(linkId);
    const now = new Date().toISOString();

    const nextParentUids =
      action === 'link'
        ? Array.from(new Set([...(student.parentUids || []), parentUid]))
        : (student.parentUids || []).filter((id) => id !== parentUid);

    const batch = adminDb.batch();
    batch.set(linkRef, {
      id: linkId,
      academyId: actor.academyId,
      parentUid,
      parentName: parent.name,
      parentEmail: parent.email,
      studentId,
      studentUserId: student.userId,
      studentName: student.fullName,
      relation,
      status: action === 'link' ? 'active' : 'revoked',
      approvedBy: actor.uid,
      createdAt: now,
      updatedAt: now,
    });
    batch.update(studentRef, { parentUids: nextParentUids, updatedAt: now });

    // Sync parentUids onto student's groups so parents can see child's groups cleanly
    for (const gid of student.groupIds || []) {
      const gRef = academyRef(actor.academyId).collection('groups').doc(gid);
      const gSnap = await gRef.get();
      if (gSnap.exists) {
        const gData = gSnap.data() as GroupDoc;
        const gParents =
          action === 'link'
            ? Array.from(new Set([...(gData.parentUids || []), parentUid]))
            : (gData.parentUids || []).filter((id) => id !== parentUid);
        batch.update(gRef, { parentUids: gParents, updatedAt: now });
      }
    }

    await batch.commit();

    await writeAuditLog({
      academyId: actor.academyId,
      actor,
      action: action === 'link' ? 'LINK_PARENT_STUDENT' : 'REVOKE_PARENT_STUDENT',
      targetCollection: 'parentLinks',
      targetId: linkId,
      details: { parentUid, studentId, relation },
    });

    res.status(200).json({ ok: true, linkId, status: action === 'link' ? 'active' : 'revoked' });
  } catch (err) {
    handleApiError(res, err);
  }
}

// 7. Sessions, Attendance & Evaluations (Teacher for own group OR Supervisor/Owner)
export async function handleRecordSession(req: ApiRequest, res: ApiResponse): Promise<void> {
  try {
    const actor = await authenticateActor(req);
    const body = req.body || {};
    const groupId = str(body.groupId, 128);
    const title = str(body.title, 160);
    const scheduledDate = str(body.scheduledDate, 40) || new Date().toISOString().slice(0, 10);
    const durationMinutes = Math.max(10, Math.min(360, num(body.durationMinutes, 45)));
    const notes = str(body.notes, 1000);
    const status = body.status === 'completed' ? 'completed' : body.status === 'cancelled' ? 'cancelled' : 'scheduled';

    if (!isValidDocumentId(groupId) || title.length < 2) {
      throw new PolicyError('يرجى تحديد الحلقة وعنوان الحصة.', 400, 'INVALID_SESSION');
    }

    const groupSnap = await academyRef(actor.academyId).collection('groups').doc(groupId).get();
    if (!groupSnap.exists) {
      throw new PolicyError('الحلقة غير موجودة.', 404, 'GROUP_NOT_FOUND');
    }
    const group = groupSnap.data() as GroupDoc;

    const canManage =
      actor.role === 'owner' ||
      (actor.role === 'supervisor' && actor.perms.includes('groups')) ||
      (actor.role === 'teacher' && group.teacherUid === actor.uid);

    if (!canManage) {
      throw new PolicyError('لا يمكنك تسجيل حصة لحلقة غير مخصصة لك.', 403, 'GROUP_FORBIDDEN');
    }

    const sessionRef = academyRef(actor.academyId).collection('sessions').doc();
    const now = new Date().toISOString();
    const sessionDoc = {
      id: sessionRef.id,
      academyId: actor.academyId,
      groupId,
      groupName: group.name,
      teacherUid: group.teacherUid,
      studentUserIds: group.studentUserIds || [],
      parentUids: group.parentUids || [],
      title,
      scheduledDate,
      durationMinutes,
      ...(notes ? { notes } : {}),
      status,
      createdAt: now,
      updatedAt: now,
    };

    const batch = adminDb.batch();
    batch.set(sessionRef, sessionDoc);

    const attendanceItems = Array.isArray(body.attendance) ? body.attendance : [];
    const evaluationItems = Array.isArray(body.evaluations) ? body.evaluations : [];

    for (const item of attendanceItems) {
      if (!item || typeof item !== 'object') continue;
      const entry = item as Record<string, unknown>;
      const studentId = str(entry.studentId, 128);
      if (!isValidDocumentId(studentId)) continue;
      const sSnap = await academyRef(actor.academyId).collection('students').doc(studentId).get();
      if (!sSnap.exists) continue;
      const student = sSnap.data() as StudentDoc;

      const attStatus = ['present', 'absent', 'late', 'excused'].includes(String(entry.status))
        ? String(entry.status)
        : 'present';
      const attRef = academyRef(actor.academyId).collection('attendance').doc();
      batch.set(attRef, {
        id: attRef.id,
        academyId: actor.academyId,
        sessionId: sessionRef.id,
        groupId,
        studentId,
        studentUserId: student.userId,
        studentName: student.fullName,
        teacherUid: group.teacherUid,
        parentUids: student.parentUids || [],
        date: scheduledDate,
        status: attStatus,
        note: str(entry.note, 500),
        createdAt: now,
        updatedAt: now,
      });
    }

    for (const item of evaluationItems) {
      if (!item || typeof item !== 'object') continue;
      const entry = item as Record<string, unknown>;
      const studentId = str(entry.studentId, 128);
      if (!isValidDocumentId(studentId)) continue;
      const sSnap = await academyRef(actor.academyId).collection('students').doc(studentId).get();
      if (!sSnap.exists) continue;
      const student = sSnap.data() as StudentDoc;

      const pointsAwarded = Math.max(0, Math.min(100, num(entry.pointsAwarded, 10)));
      const evalRef = academyRef(actor.academyId).collection('evaluations').doc();
      batch.set(evalRef, {
        id: evalRef.id,
        academyId: actor.academyId,
        sessionId: sessionRef.id,
        groupId,
        studentId,
        studentUserId: student.userId,
        studentName: student.fullName,
        teacherUid: group.teacherUid,
        parentUids: student.parentUids || [],
        surahOrLesson: str(entry.surahOrLesson, 160) || title,
        memorizationScore: Math.max(0, Math.min(100, num(entry.memorizationScore, 90))),
        revisionScore: Math.max(0, Math.min(100, num(entry.revisionScore, 90))),
        recitationScore: Math.max(0, Math.min(100, num(entry.recitationScore, 90))),
        pointsAwarded,
        ...(str(entry.certificateTitle, 160) ? { certificateTitle: str(entry.certificateTitle, 160) } : {}),
        ...(str(entry.notes, 1000) ? { notes: str(entry.notes, 1000) } : {}),
        evaluatedAt: scheduledDate,
        createdAt: now,
      });

      batch.update(academyRef(actor.academyId).collection('students').doc(studentId), {
        points: (student.points || 0) + pointsAwarded,
        updatedAt: now,
      });
    }

    await batch.commit();

    await writeAuditLog({
      academyId: actor.academyId,
      actor,
      action: 'RECORD_SESSION',
      targetCollection: 'sessions',
      targetId: sessionRef.id,
      details: {
        groupId,
        attendanceCount: attendanceItems.length,
        evaluationCount: evaluationItems.length,
      },
    });

    res.status(201).json({ ok: true, session: sessionDoc });
  } catch (err) {
    handleApiError(res, err);
  }
}

// 8. Finance: Invoices & Payments (Owner or Supervisor with 'finance')
export async function handleCreateInvoice(req: ApiRequest, res: ApiResponse): Promise<void> {
  try {
    const actor = await authenticateActor(req);
    assertCanAccessFinance(actor);

    const body = req.body || {};
    const studentId = str(body.studentId, 128);
    const title = str(body.title, 160);
    const amount = num(body.amount, 0);
    const currency = str(body.currency, 12) || 'SAR';
    const dueDate = str(body.dueDate, 40) || new Date().toISOString().slice(0, 10);

    if (!isValidDocumentId(studentId) || title.length < 2 || amount <= 0) {
      throw new PolicyError('يرجى إدخال بيانات فاتورة صحيحة ومبلغ أكبر من صفر.', 400, 'INVALID_INVOICE');
    }

    const studentSnap = await academyRef(actor.academyId).collection('students').doc(studentId).get();
    if (!studentSnap.exists) {
      throw new PolicyError('الطالب غير موجود.', 404, 'STUDENT_NOT_FOUND');
    }
    const student = studentSnap.data() as StudentDoc;

    const ref = academyRef(actor.academyId).collection('invoices').doc();
    const now = new Date().toISOString();
    const invoice: InvoiceDoc = {
      id: ref.id,
      academyId: actor.academyId,
      studentId,
      studentName: student.fullName,
      parentUids: student.parentUids || [],
      title,
      amount,
      paidAmount: 0,
      currency,
      dueDate,
      status: 'pending',
      createdBy: actor.uid,
      createdAt: now,
      updatedAt: now,
    };

    await ref.set(invoice);

    await writeAuditLog({
      academyId: actor.academyId,
      actor,
      action: 'CREATE_INVOICE',
      targetCollection: 'invoices',
      targetId: ref.id,
      details: { studentId, amount, currency },
    });

    res.status(201).json({ ok: true, invoice });
  } catch (err) {
    handleApiError(res, err);
  }
}

export async function handleRecordPayment(req: ApiRequest, res: ApiResponse): Promise<void> {
  try {
    const actor = await authenticateActor(req);
    assertCanAccessFinance(actor);

    const body = req.body || {};
    const invoiceId = str(body.invoiceId, 128);
    const amount = num(body.amount, 0);
    const method = ['cash', 'bank_transfer', 'card', 'online'].includes(String(body.method))
      ? (String(body.method) as 'cash' | 'bank_transfer' | 'card' | 'online')
      : 'bank_transfer';
    const reference = str(body.reference, 120);

    if (!isValidDocumentId(invoiceId) || amount <= 0) {
      throw new PolicyError('يرجى تحديد الفاتورة ومبلغ السداد.', 400, 'INVALID_PAYMENT');
    }

    const invoiceRef = academyRef(actor.academyId).collection('invoices').doc(invoiceId);
    const invoiceSnap = await invoiceRef.get();
    if (!invoiceSnap.exists) {
      throw new PolicyError('الفاتورة غير موجودة.', 404, 'INVOICE_NOT_FOUND');
    }
    const invoice = invoiceSnap.data() as InvoiceDoc;

    const newPaid = Math.min(invoice.amount, (invoice.paidAmount || 0) + amount);
    const newStatus = newPaid >= invoice.amount ? 'paid' : 'partial';
    const now = new Date().toISOString();

    const payRef = academyRef(actor.academyId).collection('payments').doc();
    const payment = {
      id: payRef.id,
      academyId: actor.academyId,
      invoiceId,
      studentId: invoice.studentId,
      studentName: invoice.studentName,
      amount,
      currency: invoice.currency,
      method,
      ...(reference ? { reference } : {}),
      recordedBy: actor.uid,
      paidAt: now.slice(0, 10),
      createdAt: now,
    };

    const batch = adminDb.batch();
    batch.set(payRef, payment);
    batch.update(invoiceRef, { paidAmount: newPaid, status: newStatus, updatedAt: now });
    await batch.commit();

    await writeAuditLog({
      academyId: actor.academyId,
      actor,
      action: 'RECORD_PAYMENT',
      targetCollection: 'payments',
      targetId: payRef.id,
      details: { invoiceId, amount, newStatus },
    });

    res.status(201).json({ ok: true, payment });
  } catch (err) {
    handleApiError(res, err);
  }
}

// 9. Payroll (Owner or Supervisor with 'payroll')
export async function handleCreatePayroll(req: ApiRequest, res: ApiResponse): Promise<void> {
  try {
    const actor = await authenticateActor(req);
    assertCanAccessPayroll(actor);

    const body = req.body || {};
    const memberUid = str(body.memberUid, 128);
    const periodMonth = str(body.periodMonth, 20);
    const baseAmount = Math.max(0, num(body.baseAmount, 0));
    const bonusAmount = Math.max(0, num(body.bonusAmount, 0));
    const deductionAmount = Math.max(0, num(body.deductionAmount, 0));
    const currency = str(body.currency, 12) || 'SAR';
    const status = ['draft', 'approved', 'paid'].includes(String(body.status))
      ? String(body.status)
      : 'approved';
    const notes = str(body.notes, 500);

    if (!isValidDocumentId(memberUid) || !periodMonth) {
      throw new PolicyError('يرجى تحديد العضو والشهر.', 400, 'INVALID_PAYROLL');
    }

    const memberSnap = await academyRef(actor.academyId).collection('members').doc(memberUid).get();
    if (!memberSnap.exists) {
      throw new PolicyError('العضو غير موجود.', 404, 'MEMBER_NOT_FOUND');
    }
    const member = memberSnap.data() as MemberDoc;

    const netAmount = Math.max(0, baseAmount + bonusAmount - deductionAmount);
    const ref = academyRef(actor.academyId).collection('payroll').doc();
    const now = new Date().toISOString();

    const record = {
      id: ref.id,
      academyId: actor.academyId,
      memberUid,
      memberName: member.name,
      role: member.role,
      periodMonth,
      baseAmount,
      bonusAmount,
      deductionAmount,
      netAmount,
      currency,
      status,
      ...(notes ? { notes } : {}),
      createdBy: actor.uid,
      createdAt: now,
      updatedAt: now,
    };

    await ref.set(record);

    await writeAuditLog({
      academyId: actor.academyId,
      actor,
      action: 'CREATE_PAYROLL',
      targetCollection: 'payroll',
      targetId: ref.id,
      details: { memberUid, periodMonth, netAmount, status },
    });

    res.status(201).json({ ok: true, payroll: record });
  } catch (err) {
    handleApiError(res, err);
  }
}

// 10. CRM Leads (Owner or Supervisor with 'crm')
export async function handleUpsertLead(req: ApiRequest, res: ApiResponse): Promise<void> {
  try {
    const actor = await authenticateActor(req);
    assertCanAccessCrm(actor);

    const body = req.body || {};
    const leadId = str(body.id, 128);
    const fullName = str(body.fullName, 120);
    const phone = str(body.phone, 40);
    const email = str(body.email, 200);
    const interestTrack = str(body.interestTrack, 120) || 'تحفيظ القرآن';
    const source = str(body.source, 80) || 'مباشر';
    const stage = ['new', 'contacted', 'trial', 'enrolled', 'lost'].includes(String(body.stage))
      ? String(body.stage)
      : 'new';
    const notes = str(body.notes, 800);

    if (fullName.length < 2 || phone.length < 5) {
      throw new PolicyError('يرجى إدخال الاسم ورقم الهاتف.', 400, 'INVALID_LEAD');
    }

    const col = academyRef(actor.academyId).collection('leads');
    const now = new Date().toISOString();

    if (leadId) {
      if (!isValidDocumentId(leadId)) {
        throw new PolicyError('معرف السجل غير صالح.', 400, 'INVALID_ID');
      }
      const ref = col.doc(leadId);
      const snap = await ref.get();
      if (!snap.exists) {
        throw new PolicyError('السجل غير موجود.', 404, 'LEAD_NOT_FOUND');
      }
      await ref.update({
        fullName,
        phone,
        ...(email ? { email } : {}),
        interestTrack,
        source,
        stage,
        ...(notes ? { notes } : {}),
        updatedAt: now,
      });

      await writeAuditLog({
        academyId: actor.academyId,
        actor,
        action: 'UPDATE_LEAD',
        targetCollection: 'leads',
        targetId: leadId,
        details: { stage },
      });

      res.status(200).json({ ok: true, id: leadId });
      return;
    }

    const ref = col.doc();
    const lead = {
      id: ref.id,
      academyId: actor.academyId,
      fullName,
      phone,
      ...(email ? { email } : {}),
      interestTrack,
      source,
      stage,
      ...(notes ? { notes } : {}),
      createdBy: actor.uid,
      createdAt: now,
      updatedAt: now,
    };

    await ref.set(lead);

    await writeAuditLog({
      academyId: actor.academyId,
      actor,
      action: 'CREATE_LEAD',
      targetCollection: 'leads',
      targetId: ref.id,
      details: { fullName, stage },
    });

    res.status(201).json({ ok: true, lead });
  } catch (err) {
    handleApiError(res, err);
  }
}

// 11. Conversations & Notifications & Resources
export async function handleCreateConversation(req: ApiRequest, res: ApiResponse): Promise<void> {
  try {
    const actor = await authenticateActor(req);
    const body = req.body || {};
    const title = str(body.title, 160);
    const rawUids = Array.isArray(body.participantUids) ? body.participantUids : [];
    const participantUids = Array.from(
      new Set([actor.uid, ...rawUids.filter((u): u is string => isValidDocumentId(u))])
    ).slice(0, 20);

    if (title.length < 2 || participantUids.length < 2) {
      throw new PolicyError('يرجى إدخال عنوان المحادثة واختيار مشارك واحد على الأقل.', 400, 'INVALID_CONVERSATION');
    }

    const participantNames: Record<string, string> = {};
    for (const uid of participantUids) {
      const mSnap = await academyRef(actor.academyId).collection('members').doc(uid).get();
      if (!mSnap.exists) {
        throw new PolicyError('أحد المشاركين غير منتمٍ لهذه الأكاديمية.', 403, 'INVALID_PARTICIPANT');
      }
      const mData = mSnap.data() as MemberDoc;
      participantNames[uid] = mData.name;
    }

    const ref = academyRef(actor.academyId).collection('conversations').doc();
    const now = new Date().toISOString();
    const docData = {
      id: ref.id,
      academyId: actor.academyId,
      title,
      participantUids,
      participantNames,
      lastMessageText: '',
      lastMessageAt: now,
      createdBy: actor.uid,
      createdAt: now,
    };

    await ref.set(docData);
    res.status(201).json({ ok: true, conversation: docData });
  } catch (err) {
    handleApiError(res, err);
  }
}

export async function handleSendNotification(req: ApiRequest, res: ApiResponse): Promise<void> {
  try {
    const actor = await authenticateActor(req);
    if (!['owner', 'supervisor', 'teacher'].includes(actor.role)) {
      throw new PolicyError('ليس لديك صلاحية إرسال إشعارات.', 403, 'NOTIFICATION_FORBIDDEN');
    }

    const body = req.body || {};
    const title = str(body.title, 160);
    const messageBody = str(body.body, 600);
    const category = ['session', 'evaluation', 'finance', 'system', 'message'].includes(String(body.category))
      ? String(body.category)
      : 'system';
    const rawRecipients = Array.isArray(body.recipientUids) ? body.recipientUids : [];
    const recipientUids = Array.from(
      new Set(rawRecipients.filter((u): u is string => isValidDocumentId(u)))
    ).slice(0, 150);

    if (title.length < 2 || messageBody.length < 2 || recipientUids.length === 0) {
      throw new PolicyError('يرجى تحديد المستلمين وعنوان ونص الإشعار.', 400, 'INVALID_NOTIFICATION');
    }

    const ref = academyRef(actor.academyId).collection('notifications').doc();
    const now = new Date().toISOString();
    const notification = {
      id: ref.id,
      academyId: actor.academyId,
      recipientUids,
      title,
      body: messageBody,
      category,
      createdBy: actor.uid,
      readBy: [],
      createdAt: now,
    };

    await ref.set(notification);

    // Best-effort FCM push delivery for users with registered tokens
    const tokens: string[] = [];
    for (const uid of recipientUids.slice(0, 50)) {
      const tSnap = await academyRef(actor.academyId).collection('fcmTokens').doc(uid).get();
      if (tSnap.exists) {
        const token = (tSnap.data() as { token?: string }).token;
        if (token) tokens.push(token);
      }
    }

    let fcmSent = 0;
    if (tokens.length > 0) {
      try {
        const pushRes = await adminMessaging.sendEachForMulticast({
          tokens,
          notification: { title, body: messageBody },
          data: { academyId: actor.academyId, category },
        });
        fcmSent = pushRes.successCount;
      } catch {
        // In-app Firestore notification already succeeded
      }
    }

    res.status(201).json({ ok: true, notification, fcmSent });
  } catch (err) {
    handleApiError(res, err);
  }
}

export async function handleRegisterResource(req: ApiRequest, res: ApiResponse): Promise<void> {
  try {
    const actor = await authenticateActor(req);
    if (!['owner', 'supervisor', 'teacher'].includes(actor.role)) {
      throw new PolicyError('ليس لديك صلاحية رفع ملفات تعليمية.', 403, 'RESOURCE_FORBIDDEN');
    }

    const body = req.body || {};
    const groupId = str(body.groupId, 128);
    const title = str(body.title, 160);
    const fileName = str(body.fileName, 200);
    const storagePath = str(body.storagePath, 400);
    const downloadUrl = str(body.downloadUrl, 1000);
    const contentType = str(body.contentType, 120) || 'application/octet-stream';
    const sizeBytes = Math.max(0, num(body.sizeBytes, 0));

    if (!isValidDocumentId(groupId) || !title || !storagePath || !downloadUrl) {
      throw new PolicyError('بيانات الملف غير مكتملة.', 400, 'INVALID_RESOURCE');
    }

    const groupSnap = await academyRef(actor.academyId).collection('groups').doc(groupId).get();
    if (!groupSnap.exists) {
      throw new PolicyError('الحلقة غير موجودة.', 404, 'GROUP_NOT_FOUND');
    }
    const group = groupSnap.data() as GroupDoc;

    if (actor.role === 'teacher' && group.teacherUid !== actor.uid) {
      throw new PolicyError('لا يمكنك رفع ملف لحلقة معلم آخر.', 403, 'GROUP_FORBIDDEN');
    }

    const ref = academyRef(actor.academyId).collection('resources').doc();
    const resource = {
      id: ref.id,
      academyId: actor.academyId,
      groupId,
      teacherUid: group.teacherUid,
      studentUserIds: group.studentUserIds || [],
      parentUids: group.parentUids || [],
      title,
      fileName,
      storagePath,
      downloadUrl,
      sizeBytes,
      contentType,
      uploadedBy: actor.uid,
      createdAt: new Date().toISOString(),
    };

    await ref.set(resource);
    await writeAuditLog({
      academyId: actor.academyId,
      actor,
      action: 'UPLOAD_RESOURCE',
      targetCollection: 'resources',
      targetId: ref.id,
      details: { groupId, fileName, sizeBytes },
    });

    res.status(201).json({ ok: true, resource });
  } catch (err) {
    handleApiError(res, err);
  }
}
