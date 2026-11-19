import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PolicyError,
  assertAcademyIsolation,
  assertActiveActor,
  assertCanAccessFinance,
  assertCanAccessPayroll,
  assertCanCreateMember,
  assertCanLinkParent,
  assertCanToggleMemberStatus,
  assertCanUpdatePermissions,
  canReadStudentRecord,
  isValidAcademyId,
} from '../src/shared/policy';
import type { ActorContext, StudentDoc } from '../src/shared/types';

const ownerAcad1: ActorContext = {
  uid: 'owner_1',
  email: 'owner@acad1.com',
  academyId: 'acad_1',
  role: 'owner',
  perms: ['students', 'teachers', 'groups', 'supervisors', 'parents', 'finance', 'payroll', 'crm', 'reports'],
  status: 'active',
};

const supervisorNoFinance: ActorContext = {
  uid: 'sup_1',
  email: 'sup1@acad1.com',
  academyId: 'acad_1',
  role: 'supervisor',
  perms: ['students', 'groups'],
  status: 'active',
};

const supervisorWithSupervisorsPerm: ActorContext = {
  uid: 'sup_2',
  email: 'sup2@acad1.com',
  academyId: 'acad_1',
  role: 'supervisor',
  perms: ['supervisors', 'teachers', 'students'],
  status: 'active',
};

const teacherA: ActorContext = {
  uid: 'teacher_a',
  email: 'ta@acad1.com',
  academyId: 'acad_1',
  role: 'teacher',
  perms: [],
  status: 'active',
};

const studentA: ActorContext = {
  uid: 'student_a_uid',
  email: 'sa@acad1.com',
  academyId: 'acad_1',
  role: 'student',
  perms: [],
  status: 'active',
};

const parentA: ActorContext = {
  uid: 'parent_a_uid',
  email: 'pa@acad1.com',
  academyId: 'acad_1',
  role: 'parent',
  perms: [],
  status: 'active',
};

const studentOwnedByTeacherA: StudentDoc = {
  id: 'student_a_uid',
  academyId: 'acad_1',
  userId: 'student_a_uid',
  fullName: 'أحمد محمد',
  email: 'sa@acad1.com',
  track: 'حفظ القرآن',
  level: 'المستوى الأول',
  points: 50,
  teacherUids: ['teacher_a'],
  parentUids: ['parent_a_uid'],
  groupIds: ['group_1'],
  status: 'active',
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};

const studentOwnedByTeacherB: StudentDoc = {
  ...studentOwnedByTeacherA,
  id: 'student_b_uid',
  userId: 'student_b_uid',
  fullName: 'يوسف علي',
  teacherUids: ['teacher_b'],
  parentUids: ['parent_b_uid'],
};

describe('Academy identifier validation', () => {
  it('accepts the approved dotted academy id but keeps document ids strict', () => {
    expect(isValidAcademyId('monisak.acadmy')).toBe(true);
    expect(isValidAcademyId('acad_1')).toBe(true);
    expect(isValidAcademyId('../admin')).toBe(false);
  });
});

describe('Mandatory RBAC & Tenant Isolation Policy Suite', () => {
  it('1. User without academyId is rejected and sees nothing', () => {
    const orphanUser: ActorContext = {
      uid: 'orphan_1',
      email: 'orphan@test.com',
      academyId: '',
      role: 'student',
      perms: [],
      status: 'active',
    };
    expect(() => assertActiveActor(orphanUser)).toThrowError(PolicyError);
    expect(canReadStudentRecord(orphanUser, studentOwnedByTeacherA)).toBe(false);
  });

  it('2. Disabled member is blocked immediately', () => {
    const disabledOwner: ActorContext = { ...ownerAcad1, status: 'disabled' };
    expect(() => assertActiveActor(disabledOwner)).toThrowError(PolicyError);
    expect(canReadStudentRecord(disabledOwner, studentOwnedByTeacherA)).toBe(false);
  });

  it('3. Supervisor CANNOT create an owner (privilege escalation blocked)', () => {
    expect(() => assertCanCreateMember(supervisorWithSupervisorsPerm, 'owner')).toThrowError(PolicyError);
    expect(() => assertCanCreateMember(ownerAcad1, 'owner')).toThrowError(PolicyError);
  });

  it('4. Supervisor CANNOT create another supervisor without explicit "supervisors" permission', () => {
    expect(() => assertCanCreateMember(supervisorNoFinance, 'supervisor')).toThrowError(PolicyError);
    expect(() => assertCanCreateMember(supervisorWithSupervisorsPerm, 'supervisor')).not.toThrow();
  });

  it('5. Teacher CANNOT read another teacher students', () => {
    expect(canReadStudentRecord(teacherA, studentOwnedByTeacherA)).toBe(true);
    expect(canReadStudentRecord(teacherA, studentOwnedByTeacherB)).toBe(false);
  });

  it('6. Student CANNOT read another student record', () => {
    expect(canReadStudentRecord(studentA, studentOwnedByTeacherA)).toBe(true);
    expect(canReadStudentRecord(studentA, studentOwnedByTeacherB)).toBe(false);
  });

  it('7. Parent CANNOT read unlinked child and CANNOT self-link', () => {
    expect(canReadStudentRecord(parentA, studentOwnedByTeacherA)).toBe(true);
    expect(canReadStudentRecord(parentA, studentOwnedByTeacherB)).toBe(false);
    expect(() => assertCanLinkParent(parentA)).toThrowError(PolicyError);
    expect(() => assertCanLinkParent(ownerAcad1)).not.toThrow();
  });

  it('8. Owner of Academy 1 CANNOT access Academy 2 or spoof academyId in payload', () => {
    expect(() => assertAcademyIsolation(ownerAcad1, 'acad_2')).toThrowError(PolicyError);
    expect(assertAcademyIsolation(ownerAcad1, 'acad_1')).toBe('acad_1');
    const studentInAcad2: StudentDoc = { ...studentOwnedByTeacherA, academyId: 'acad_2' };
    expect(canReadStudentRecord(ownerAcad1, studentInAcad2)).toBe(false);
  });

  it('9. Supervisor without explicit finance/payroll delegation is blocked from finance & payroll', () => {
    expect(() => assertCanAccessFinance(supervisorNoFinance)).toThrowError(PolicyError);
    expect(() => assertCanAccessPayroll(supervisorNoFinance)).toThrowError(PolicyError);
    expect(() => assertCanAccessFinance(ownerAcad1)).not.toThrow();
    expect(() => assertCanAccessPayroll(ownerAcad1)).not.toThrow();
  });

  it('10. Only Owner can update supervisor permissions or protect owner from disablement', () => {
    expect(() => assertCanUpdatePermissions(supervisorWithSupervisorsPerm, 'supervisor')).toThrowError(PolicyError);
    expect(() => assertCanUpdatePermissions(ownerAcad1, 'supervisor')).not.toThrow();
    expect(() =>
      assertCanToggleMemberStatus(supervisorWithSupervisorsPerm, {
        uid: 'owner_1',
        academyId: 'acad_1',
        role: 'owner',
      })
    ).toThrowError(PolicyError);
  });
});

describe('Firestore & Storage Rules Static Hardening Verification', () => {
  const rulesText = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf-8');

  it('contains default-deny safety net and locks down sensitive server-only write collections', () => {
    expect(rulesText).toContain('match /{document=**}');
    expect(rulesText).toContain('allow read, write: if false;');
    expect(rulesText).toContain('match /members/{uid}');
    expect(rulesText).toContain('match /parentLinks/{linkId}');
    expect(rulesText).toContain('match /auditLogs/{logId}');
    expect(rulesText).toContain('match /payroll/{payrollId}');
    expect(rulesText).toContain('request.auth.token.academyId == academyId');
    expect(rulesText).toContain('a-zA-Z0-9._');
    const listRules = rulesText.match(/allow list: if [\s\S]*?;/g) || [];
    expect(listRules.length).toBeGreaterThan(0);
    expect(listRules.filter((rule) => !rule.includes('if false;') && !rule.includes('isActiveMember(academyId)'))).toHaveLength(0);
    expect(listRules.some((rule) => rule.includes('belongsToAcademy(academyId)'))).toBe(false);
    expect(rulesText).toContain('request.auth.uid in existing().teacherUids');
    expect(rulesText).toContain('existing().userId == request.auth.uid');
    expect(rulesText).toContain('request.auth.uid in existing().parentUids');
    expect((rulesText.match(/function isValidAcademyId\(id\)/g) || []).length).toBe(1);
    expect(rulesText.trimEnd().endsWith('}')).toBe(true);
    expect(rulesText).not.toContain('\n);\n    }\n\n    function isValidAcademyId');
  });
});
