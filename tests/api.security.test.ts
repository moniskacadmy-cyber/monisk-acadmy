import { beforeEach, describe, expect, it, vi } from 'vitest';
import { callApi } from './helpers/callApi';
import { getDoc, putDoc, putUser, resetFake, setUserDisabled } from './helpers/fakeFirebase';

// Route every handler's Firebase access to the in-memory fake.
vi.mock('../src/server/firebaseAdmin', async () => {
  const fake = await import('./helpers/fakeFirebase');
  return {
    adminDb: fake.adminDb,
    adminAuth: fake.adminAuth,
    adminMessaging: fake.adminMessaging,
    resolvedProjectId: 'test',
    resolvedDatabaseId: '(default)',
  };
});

import * as handlers from '../src/server/handlers';

const A = 'acad_1';
const B = 'acad_2';

function member(academyId: string, uid: string, role: string, extra: Record<string, unknown> = {}) {
  return {
    id: uid,
    uid,
    academyId,
    name: extra.name ?? uid,
    email: `${uid}@test.local`,
    role,
    perms: extra.perms ?? [],
    status: extra.status ?? 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  };
}

function seedMember(academyId: string, uid: string, role: string, extra: Record<string, unknown> = {}) {
  const doc = member(academyId, uid, role, extra);
  putDoc(`academies/${academyId}/members/${uid}`, doc);
  putUser(uid, doc.email, {
    academyId,
    role,
    perms: doc.perms,
    status: doc.status,
  });
}

function seedAcademy() {
  putDoc(`academies/${A}`, { id: A, name: 'أكاديمية أ', currency: 'SAR' });
  putDoc(`academies/${B}`, { id: B, name: 'أكاديمية ب', currency: 'SAR' });

  seedMember(A, 'owner_1', 'owner', { perms: ['students', 'teachers', 'groups', 'supervisors', 'parents', 'crm', 'reports'] });
  seedMember(A, 'sup_1', 'supervisor', { perms: ['students', 'groups'] });
  seedMember(A, 'sup_2', 'supervisor', { perms: ['supervisors', 'teachers', 'students'] });
  seedMember(A, 'teacher_a', 'teacher', { name: 'معلم أ' });
  seedMember(A, 'teacher_b', 'teacher', { name: 'معلم ب' });
  seedMember(A, 'student_a', 'student', { name: 'طالب أ', phone: '01000000001' });
  seedMember(A, 'student_b', 'student', { name: 'طالب ب' });
  seedMember(A, 'parent_a', 'parent', { name: 'ولي أ', phone: '01000000002' });
  seedMember(A, 'parent_b', 'parent', { name: 'ولي ب' });
  seedMember(B, 'owner_2', 'owner', { perms: ['students'] });

  putDoc(`academies/${A}/students/student_a`, {
    id: 'student_a',
    academyId: A,
    userId: 'student_a',
    fullName: 'طالب أ',
    teacherUids: ['teacher_a'],
    parentUids: ['parent_a'],
    groupIds: ['group_a'],
    status: 'active',
  });
  putDoc(`academies/${A}/students/student_b`, {
    id: 'student_b',
    academyId: A,
    userId: 'student_b',
    fullName: 'طالب ب',
    teacherUids: ['teacher_b'],
    parentUids: ['parent_b'],
    groupIds: ['group_b'],
    status: 'active',
  });
  putDoc(`academies/${A}/groups/group_a`, {
    id: 'group_a',
    academyId: A,
    name: 'حلقة أ',
    teacherUid: 'teacher_a',
    studentUserIds: ['student_a'],
    parentUids: ['parent_a'],
    status: 'active',
  });
  putDoc(`academies/${A}/students/student_c`, {
    id: 'student_c',
    academyId: A,
    userId: 'student_c',
    fullName: 'طالب ج',
    teacherUids: ['teacher_a'],
    parentUids: [],
    groupIds: ['group_a'],
    status: 'active',
  });
  putDoc(`academies/${A}/groups/group_b`, {
    id: 'group_b',
    academyId: A,
    name: 'حلقة ب',
    teacherUid: 'teacher_b',
    studentUserIds: ['student_b'],
    parentUids: ['parent_b'],
    status: 'active',
  });
}

beforeEach(() => {
  resetFake();
  seedAcademy();
});

describe('Dirty-dozen adversarial payloads at the API layer', () => {
  it('1. user with no academy claims is rejected', async () => {
    putUser('orphan', 'orphan@test.local', {});
    const res = await callApi(handlers.handleCreateMember, 'orphan', { name: 'x', email: 'x@x.com', password: '12345678', role: 'student' });
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('NO_ACADEMY_CLAIMS');
  });

  it('2. owner of academy A cannot spoof academyId B in the body', async () => {
    const res = await callApi(handlers.handleCreateMember, 'owner_1', {
      academyId: B,
      name: 'Someone',
      email: 'someone@x.com',
      password: '12345678',
      role: 'teacher',
    });
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('CROSS_ACADEMY_FORBIDDEN');
  });

  it('3. nobody can create an owner through the API, even the owner', async () => {
    const res = await callApi(handlers.handleCreateMember, 'owner_1', {
      name: 'Second Owner',
      email: 'o2@x.com',
      password: '12345678',
      role: 'owner',
    });
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('OWNER_CREATION_FORBIDDEN');
  });

  it('4. supervisor without "supervisors" permission cannot create a supervisor', async () => {
    const res = await callApi(handlers.handleCreateMember, 'sup_1', {
      name: 'New Sup',
      email: 'ns@x.com',
      password: '12345678',
      role: 'supervisor',
      perms: ['students'],
    });
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('SUPERVISOR_PERM_REQUIRED');
  });

  it('5. teacher cannot change anyone\'s permissions', async () => {
    const res = await callApi(handlers.handleUpdatePermissions, 'teacher_a', {
      uid: 'sup_1',
      perms: ['supervisors', 'finance'],
    });
    expect(res.statusCode).toBe(403);
  });

  it('6. teacher cannot notify a student who is not theirs', async () => {
    const res = await callApi(handlers.handleSendNotification, 'teacher_a', {
      title: 'تنبيه',
      body: 'رسالة لطالب آخر',
      category: 'system',
      recipientUids: ['student_b'],
    });
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('RECIPIENT_OUT_OF_SCOPE');
  });

  it('6b. teacher CAN notify their own student and that student\'s parent', async () => {
    const res = await callApi(handlers.handleSendNotification, 'teacher_a', {
      title: 'تنبيه',
      body: 'حصة الغد',
      category: 'session',
      recipientUids: ['student_a', 'parent_a'],
    });
    expect(res.statusCode).toBe(201);
    expect(res.body.notification.recipientUids.sort()).toEqual(['parent_a', 'student_a']);
  });

  it('8. parent cannot link themselves to a student', async () => {
    const res = await callApi(handlers.handleLinkParentToStudent, 'parent_a', {
      parentUid: 'parent_a',
      studentId: 'student_b',
    });
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('PARENT_SELF_LINK_FORBIDDEN');
  });

  it('12. disabled member is blocked even with a still-valid token', async () => {
    putDoc(`academies/${A}/members/sup_1`, { ...getDoc(`academies/${A}/members/sup_1`), status: 'disabled' });
    setUserDisabled('sup_1', false);
    const res = await callApi(handlers.handleCreateMember, 'sup_1', {
      name: 'x',
      email: 'x@x.com',
      password: '12345678',
      role: 'teacher',
    });
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('ACCOUNT_DISABLED');
  });

  it('13. request without a token is rejected', async () => {
    const res = await callApi(handlers.handleCreateMember, null, {});
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe('MISSING_TOKEN');
  });
});

describe('Finance module is fully removed', () => {
  it('no finance or payroll handlers are exported', () => {
    const exported = Object.keys(handlers);
    expect(exported.some((k) => /Invoice|Payment|Payroll/.test(k))).toBe(false);
  });
});

describe('Chat (server-written messages)', () => {
  it('creates a direct chat, and reuses the same one on the second call', async () => {
    const first = await callApi(handlers.handleCreateConversation, 'teacher_a', { participantUids: ['student_a'] });
    expect(first.statusCode).toBe(201);
    expect(first.body.conversation.kind).toBe('direct');

    const second = await callApi(handlers.handleCreateConversation, 'student_a', { participantUids: ['teacher_a'] });
    expect(second.statusCode).toBe(200);
    expect(second.body.created).toBe(false);
    expect(second.body.conversation.id).toBe(first.body.conversation.id);
  });

  it('stores names only, never phone numbers, in conversations', async () => {
    const res = await callApi(handlers.handleCreateConversation, 'teacher_a', { participantUids: ['student_a'] });
    const serialized = JSON.stringify(res.body.conversation);
    expect(serialized).not.toContain('01000000001');
    expect(serialized).not.toContain('@test.local');
    expect(res.body.conversation.participantNames.student_a).toBe('طالب أ');
  });

  it('group chat needs a name and at least two other people', async () => {
    const noName = await callApi(handlers.handleCreateConversation, 'owner_1', {
      participantUids: ['teacher_a', 'teacher_b'],
    });
    expect(noName.statusCode).toBe(400);

    const ok = await callApi(handlers.handleCreateConversation, 'owner_1', {
      title: 'فريق المعلمين',
      participantUids: ['teacher_a', 'teacher_b'],
    });
    expect(ok.statusCode).toBe(201);
    expect(ok.body.conversation.kind).toBe('group');
    expect(ok.body.conversation.title).toBe('فريق المعلمين');
  });

  it('cannot start a chat with a disabled member', async () => {
    putDoc(`academies/${A}/members/student_b`, { ...getDoc(`academies/${A}/members/student_b`), status: 'disabled' });
    const res = await callApi(handlers.handleCreateConversation, 'teacher_b', { participantUids: ['student_b'] });
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('PARTICIPANT_DISABLED');
  });

  it('participant can send; the conversation summary is updated', async () => {
    const conv = await callApi(handlers.handleCreateConversation, 'teacher_a', { participantUids: ['student_a'] });
    const id = conv.body.conversation.id;

    const sent = await callApi(handlers.handleSendMessage, 'teacher_a', { conversationId: id, text: 'السلام عليكم' });
    expect(sent.statusCode).toBe(201);
    expect(sent.body.message.senderUid).toBe('teacher_a');
    expect(sent.body.message.senderName).toBe('معلم أ');

    const stored = getDoc(`academies/${A}/conversations/${id}`);
    expect(stored?.lastMessageText).toBe('السلام عليكم');
    expect(stored?.lastMessageSenderUid).toBe('teacher_a');
    expect(stored?.lastReadAt.teacher_a).toBeTruthy();
  });

  it('non-participant cannot send into someone else\'s chat', async () => {
    const conv = await callApi(handlers.handleCreateConversation, 'teacher_a', { participantUids: ['student_a'] });
    const res = await callApi(handlers.handleSendMessage, 'teacher_b', {
      conversationId: conv.body.conversation.id,
      text: 'تسلل',
    });
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('NOT_PARTICIPANT');
  });

  it('rejects empty and oversized messages', async () => {
    const conv = await callApi(handlers.handleCreateConversation, 'teacher_a', { participantUids: ['student_a'] });
    const id = conv.body.conversation.id;
    const empty = await callApi(handlers.handleSendMessage, 'teacher_a', { conversationId: id, text: '   ' });
    expect(empty.statusCode).toBe(400);
    const long = await callApi(handlers.handleSendMessage, 'teacher_a', { conversationId: id, text: 'x'.repeat(2001) });
    expect(long.statusCode).toBe(400);
  });

  it('mark-as-read only works for participants', async () => {
    const conv = await callApi(handlers.handleCreateConversation, 'teacher_a', { participantUids: ['student_a'] });
    const id = conv.body.conversation.id;
    const outsider = await callApi(handlers.handleMarkConversationRead, 'parent_b', { conversationId: id });
    expect(outsider.statusCode).toBe(403);
    const insider = await callApi(handlers.handleMarkConversationRead, 'student_a', { conversationId: id });
    expect(insider.statusCode).toBe(200);
  });

  it('contacts list has names and roles only, no phones or emails', async () => {
    const res = await callApi(handlers.handleListContacts, 'student_b');
    expect(res.statusCode).toBe(200);
    for (const c of res.body.contacts) {
      expect(Object.keys(c).sort()).toEqual(['name', 'role', 'uid']);
    }
    expect(JSON.stringify(res.body)).not.toContain('01000000001');
  });
});

describe('Educational files', () => {
  it('resource folder must match the resource id', async () => {
    const res = await callApi(handlers.handleRegisterResource, 'teacher_a', {
      resourceId: 'res_1',
      groupId: 'group_a',
      title: 'مقرر',
      fileName: 'a.pdf',
      storagePath: 'academies/acad_1/resources/res_OTHER/a.pdf',
      sizeBytes: 10,
      contentType: 'application/pdf',
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('INVALID_STORAGE_PATH');
  });

  it('teacher registers a file for own group; no download URL is stored', async () => {
    const res = await callApi(handlers.handleRegisterResource, 'teacher_a', {
      resourceId: 'res_1',
      groupId: 'group_a',
      title: 'مقرر',
      fileName: 'a.pdf',
      storagePath: 'academies/acad_1/resources/res_1/a.pdf',
      sizeBytes: 10,
      contentType: 'application/pdf',
    });
    expect(res.statusCode).toBe(201);
    expect(res.body.resource.downloadUrl).toBeUndefined();
    expect(res.body.resource.studentUserIds).toEqual(['student_a']);
    expect(res.body.resource.parentUids).toEqual(['parent_a']);
  });

  it('teacher cannot upload into another teacher\'s group', async () => {
    const res = await callApi(handlers.handleRegisterResource, 'teacher_a', {
      resourceId: 'res_2',
      groupId: 'group_b',
      title: 'مقرر',
      fileName: 'b.pdf',
      storagePath: 'academies/acad_1/resources/res_2/b.pdf',
      sizeBytes: 10,
      contentType: 'application/pdf',
    });
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('GROUP_FORBIDDEN');
  });
});

describe('Teacher rates and earnings', () => {
  const session = (overrides: Record<string, unknown>) => ({
    groupId: 'group_a',
    title: 'حصة التجويد',
    scheduledDate: '2026-11-10',
    durationMinutes: 90,
    status: 'completed',
    attendance: [],
    evaluations: [],
    ...overrides,
  });

  it('only owner and supervisors can set a teacher rate', async () => {
    const body = { uid: 'teacher_a', hourlyRate: 100 };
    expect((await callApi(handlers.handleSetTeacherRate, 'teacher_a', body)).statusCode).toBe(403);
    expect((await callApi(handlers.handleSetTeacherRate, 'student_a', body)).statusCode).toBe(403);
    expect((await callApi(handlers.handleSetTeacherRate, 'parent_a', body)).statusCode).toBe(403);
    expect((await callApi(handlers.handleSetTeacherRate, 'owner_1', body)).statusCode).toBe(200);
    expect((await callApi(handlers.handleSetTeacherRate, 'sup_1', { uid: 'teacher_a', hourlyRate: 120 })).statusCode).toBe(200);
  });

  it('rate can only be set on teachers and must be a valid number', async () => {
    const notTeacher = await callApi(handlers.handleSetTeacherRate, 'owner_1', { uid: 'student_a', hourlyRate: 50 });
    expect(notTeacher.statusCode).toBe(400);
    expect(notTeacher.body.code).toBe('NOT_A_TEACHER');

    const bad = await callApi(handlers.handleSetTeacherRate, 'owner_1', { uid: 'teacher_a', hourlyRate: -5 });
    expect(bad.statusCode).toBe(400);
    expect(bad.body.code).toBe('INVALID_RATE');
  });

  it('a completed report stores the rate and amount; attended students split it', async () => {
    await callApi(handlers.handleSetTeacherRate, 'owner_1', { uid: 'teacher_a', hourlyRate: 100 });
    const rec = await callApi(handlers.handleRecordSession, 'teacher_a', session({
      attendance: [
        { studentId: 'student_a', status: 'present' },
        { studentId: 'student_c', status: 'late' },
      ],
    }));
    expect(rec.statusCode).toBe(201);

    const fin = getDoc(`academies/${A}/sessionFinance/${rec.body.session.id}`);
    expect(fin?.hourlyRate).toBe(100);
    expect(fin?.amount).toBe(150);
  });

  it('owner sees per-teacher totals, per-student breakdown and the report list', async () => {
    await callApi(handlers.handleSetTeacherRate, 'owner_1', { uid: 'teacher_a', hourlyRate: 100 });
    await callApi(handlers.handleRecordSession, 'teacher_a', session({
      attendance: [
        { studentId: 'student_a', status: 'present' },
        { studentId: 'student_c', status: 'present' },
      ],
    }));

    const res = await callApi(handlers.handleGetEarningsSummary, 'owner_1', {});
    expect(res.statusCode).toBe(200);
    const teacher = res.body.teachers.find((t: { uid: string }) => t.uid === 'teacher_a');
    expect(teacher.amount).toBe(150);
    expect(teacher.minutes).toBe(90);
    expect(teacher.hourlyRate).toBe(100);
    const perStudent = Object.fromEntries(teacher.students.map((s: { studentId: string; amount: number }) => [s.studentId, s.amount]));
    expect(perStudent).toEqual({ student_a: 75, student_c: 75 });
    expect(res.body.reports[0]).toMatchObject({ durationMinutes: 90, amount: 150, teacherName: 'معلم أ' });
    expect(res.body.totals.amount).toBe(150);
  });

  it('a supervisor can also see the summary', async () => {
    const res = await callApi(handlers.handleGetEarningsSummary, 'sup_1', {});
    expect(res.statusCode).toBe(200);
  });

  it('teachers, students and parents cannot see the summary', async () => {
    expect((await callApi(handlers.handleGetEarningsSummary, 'teacher_a', {})).statusCode).toBe(403);
    expect((await callApi(handlers.handleGetEarningsSummary, 'student_a', {})).statusCode).toBe(403);
    expect((await callApi(handlers.handleGetEarningsSummary, 'parent_a', {})).statusCode).toBe(403);
  });

  it('changing the rate does not rewrite past reports', async () => {
    await callApi(handlers.handleSetTeacherRate, 'owner_1', { uid: 'teacher_a', hourlyRate: 100 });
    await callApi(handlers.handleRecordSession, 'teacher_a', session({
      attendance: [{ studentId: 'student_a', status: 'present' }],
    }));
    await callApi(handlers.handleSetTeacherRate, 'owner_1', { uid: 'teacher_a', hourlyRate: 300 });

    const res = await callApi(handlers.handleGetEarningsSummary, 'owner_1', {});
    expect(res.body.reports[0].amount).toBe(150);
    expect(res.body.teachers.find((t: { uid: string }) => t.uid === 'teacher_a').hourlyRate).toBe(300);
  });

  it('report with no rate set counts as zero and is flagged', async () => {
    const rec = await callApi(handlers.handleRecordSession, 'teacher_b', session({
      groupId: 'group_b',
      durationMinutes: 60,
      attendance: [{ studentId: 'student_b', status: 'present' }],
    }));
    expect(rec.statusCode).toBe(201);
    const res = await callApi(handlers.handleGetEarningsSummary, 'owner_1', {});
    const report = res.body.reports.find((r: { sessionId: string }) => r.sessionId === rec.body.session.id);
    expect(report.hourlyRate).toBeNull();
    expect(report.amount).toBe(0);
  });

  it('session with nobody attending shows as unassigned money', async () => {
    await callApi(handlers.handleSetTeacherRate, 'owner_1', { uid: 'teacher_a', hourlyRate: 200 });
    await callApi(handlers.handleRecordSession, 'teacher_a', session({ durationMinutes: 60, attendance: [] }));
    const res = await callApi(handlers.handleGetEarningsSummary, 'owner_1', {});
    const teacher = res.body.teachers.find((t: { uid: string }) => t.uid === 'teacher_a');
    expect(teacher.unassignedAmount).toBe(200);
  });

  it('cancelled sessions create no earnings', async () => {
    await callApi(handlers.handleSetTeacherRate, 'owner_1', { uid: 'teacher_a', hourlyRate: 100 });
    const rec = await callApi(handlers.handleRecordSession, 'teacher_a', session({ status: 'cancelled' }));
    expect(getDoc(`academies/${A}/sessionFinance/${rec.body.session.id}`)).toBeUndefined();
  });

  it('month filter limits the report list', async () => {
    await callApi(handlers.handleSetTeacherRate, 'owner_1', { uid: 'teacher_a', hourlyRate: 100 });
    await callApi(handlers.handleRecordSession, 'teacher_a', session({
      attendance: [{ studentId: 'student_a', status: 'present' }],
    }));
    const november = await callApi(handlers.handleGetEarningsSummary, 'owner_1', { month: '2026-11' });
    const january = await callApi(handlers.handleGetEarningsSummary, 'owner_1', { month: '2026-01' });
    expect(november.body.reports.length).toBe(1);
    expect(january.body.reports.length).toBe(0);
  });

  it('backfill creates earnings for old completed sessions and marks them legacy', async () => {
    await callApi(handlers.handleSetTeacherRate, 'owner_1', { uid: 'teacher_a', hourlyRate: 100 });
    putDoc(`academies/${A}/sessions/old_1`, {
      id: 'old_1', academyId: A, groupId: 'group_a', groupName: 'حلقة أ', teacherUid: 'teacher_a',
      title: 'حصة قديمة', scheduledDate: '2026-10-01', durationMinutes: 60, status: 'completed',
    });
    const first = await callApi(handlers.handleBackfillSessionFinance, 'owner_1', {});
    expect(first.body.created).toBe(1);
    const second = await callApi(handlers.handleBackfillSessionFinance, 'owner_1', {});
    expect(second.body.created).toBe(0);

    const res = await callApi(handlers.handleGetEarningsSummary, 'owner_1', {});
    const old = res.body.reports.find((r: { sessionId: string }) => r.sessionId === 'old_1');
    expect(old).toMatchObject({ amount: 100, legacy: true });
  });

  it('teachers cannot run the backfill', async () => {
    expect((await callApi(handlers.handleBackfillSessionFinance, 'teacher_a', {})).statusCode).toBe(403);
  });
});
