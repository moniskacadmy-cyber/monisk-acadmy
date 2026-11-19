import type {
  AcademyRole,
  ActorContext,
  MemberDoc,
  StudentDoc,
  SupervisorPermission,
} from './types';
import { ALL_SUPERVISOR_PERMISSIONS } from './types';

export class PolicyError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode = 403, code = 'FORBIDDEN') {
    super(message);
    this.name = 'PolicyError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const SAFE_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;
export const SAFE_ACADEMY_ID_REGEX = /^[a-zA-Z0-9._-]{1,128}$/;

export function isValidAcademyId(id: unknown): id is string {
  return typeof id === 'string' && SAFE_ACADEMY_ID_REGEX.test(id);
}

export function isValidDocumentId(id: unknown): id is string {
  return typeof id === 'string' && SAFE_ID_REGEX.test(id);
}

export function sanitizePermissions(perms: unknown): SupervisorPermission[] {
  if (!Array.isArray(perms)) return [];
  const validSet = new Set<string>(ALL_SUPERVISOR_PERMISSIONS);
  const unique = new Set<SupervisorPermission>();
  for (const p of perms) {
    if (typeof p === 'string' && validSet.has(p)) {
      unique.add(p as SupervisorPermission);
    }
  }
  return Array.from(unique);
}

export function assertActiveActor(actor: ActorContext | null | undefined): asserts actor is ActorContext {
  if (!actor || !actor.uid) {
    throw new PolicyError('يجب تسجيل الدخول أولًا.', 401, 'UNAUTHENTICATED');
  }
  if (!isValidAcademyId(actor.academyId)) {
    throw new PolicyError('الحساب غير مرتبط بأي أكاديمية صالحة.', 403, 'NO_ACADEMY');
  }
  if (actor.status !== 'active') {
    throw new PolicyError('تم تعطيل هذا الحساب ولا يملك صلاحية الوصول.', 403, 'ACCOUNT_DISABLED');
  }
}

export function assertAcademyIsolation(actor: ActorContext, requestedAcademyId?: unknown): string {
  assertActiveActor(actor);
  if (
    requestedAcademyId !== undefined &&
    requestedAcademyId !== null &&
    requestedAcademyId !== '' &&
    requestedAcademyId !== actor.academyId
  ) {
    throw new PolicyError(
      'محاولة مرفوضة: لا يمكنك الوصول إلى بيانات أكاديمية أخرى أو تعديل معرف الأكاديمية.',
      403,
      'CROSS_ACADEMY_FORBIDDEN'
    );
  }
  return actor.academyId;
}

export function hasSupervisorPerm(actor: ActorContext, perm: SupervisorPermission): boolean {
  if (actor.status !== 'active') return false;
  if (actor.role === 'owner') return true;
  if (actor.role === 'supervisor') {
    return actor.perms.includes(perm);
  }
  return false;
}

export function assertCanCreateMember(actor: ActorContext, targetRole: AcademyRole): void {
  assertActiveActor(actor);

  // Security invariant: nobody can create an owner via any API or UI.
  if (targetRole === 'owner') {
    throw new PolicyError(
      'مرفوض أمنيًا: لا يمكن إنشاء حساب مدير أكاديمية عبر أي واجهة أو دالة.',
      403,
      'OWNER_CREATION_FORBIDDEN'
    );
  }

  if (actor.role === 'owner') {
    return;
  }

  if (actor.role !== 'supervisor') {
    throw new PolicyError('ليس لديك صلاحية إنشاء أعضاء.', 403, 'ROLE_FORBIDDEN');
  }

  if (targetRole === 'supervisor' && !actor.perms.includes('supervisors')) {
    throw new PolicyError(
      'لا يملك المشرف صلاحية إنشاء مشرفين دون تفويض صريح (supervisors).',
      403,
      'SUPERVISOR_PERM_REQUIRED'
    );
  }

  if (targetRole === 'teacher' && !actor.perms.includes('teachers')) {
    throw new PolicyError('صلاحية إدارة المعلمين مطلوبة لإنشاء معلم.', 403, 'TEACHER_PERM_REQUIRED');
  }

  if (targetRole === 'student' && !actor.perms.includes('students')) {
    throw new PolicyError('صلاحية إدارة الطلاب مطلوبة لإنشاء طالب.', 403, 'STUDENT_PERM_REQUIRED');
  }

  if (
    targetRole === 'parent' &&
    !actor.perms.includes('parents') &&
    !actor.perms.includes('students')
  ) {
    throw new PolicyError('صلاحية أولياء الأمور أو الطلاب مطلوبة لإنشاء ولي أمر.', 403, 'PARENT_PERM_REQUIRED');
  }
}

export function assertCanToggleMemberStatus(
  actor: ActorContext,
  target: Pick<MemberDoc, 'uid' | 'academyId' | 'role'>
): void {
  assertAcademyIsolation(actor, target.academyId);

  if (target.uid === actor.uid) {
    throw new PolicyError('لا يمكنك تعطيل حسابك الشخصي.', 400, 'SELF_DISABLE_FORBIDDEN');
  }

  if (target.role === 'owner') {
    throw new PolicyError('لا يمكن تعطيل حساب مدير الأكاديمية.', 403, 'OWNER_PROTECTED');
  }

  if (actor.role === 'owner') {
    return;
  }

  if (actor.role !== 'supervisor') {
    throw new PolicyError('ليس لديك صلاحية تعديل حالة الأعضاء.', 403, 'ROLE_FORBIDDEN');
  }

  if (target.role === 'supervisor' && !actor.perms.includes('supervisors')) {
    throw new PolicyError('تعديل حالة المشرف يتطلب صلاحية supervisors.', 403, 'SUPERVISOR_PERM_REQUIRED');
  }
  if (target.role === 'teacher' && !actor.perms.includes('teachers')) {
    throw new PolicyError('تعديل حالة المعلم يتطلب صلاحية teachers.', 403, 'TEACHER_PERM_REQUIRED');
  }
  if (target.role === 'student' && !actor.perms.includes('students')) {
    throw new PolicyError('تعديل حالة الطالب يتطلب صلاحية students.', 403, 'STUDENT_PERM_REQUIRED');
  }
  if (
    target.role === 'parent' &&
    !actor.perms.includes('parents') &&
    !actor.perms.includes('students')
  ) {
    throw new PolicyError('تعديل حالة ولي الأمر يتطلب صلاحية parents أو students.', 403, 'PARENT_PERM_REQUIRED');
  }
}

export function assertCanUpdatePermissions(actor: ActorContext, targetRole: AcademyRole): void {
  assertActiveActor(actor);
  if (actor.role !== 'owner') {
    throw new PolicyError('فقط مدير الأكاديمية يمكنه تعديل صلاحيات المشرفين.', 403, 'OWNER_ONLY');
  }
  if (targetRole !== 'supervisor') {
    throw new PolicyError('تعديل الصلاحيات المخصصة متاح للمشرفين فقط.', 400, 'INVALID_TARGET_ROLE');
  }
}

export function assertCanManageGroups(actor: ActorContext): void {
  assertActiveActor(actor);
  if (!hasSupervisorPerm(actor, 'groups')) {
    throw new PolicyError('ليس لديك صلاحية إدارة الحلقات والمجموعات.', 403, 'GROUPS_PERM_REQUIRED');
  }
}

export function assertCanManageStudents(actor: ActorContext): void {
  assertActiveActor(actor);
  if (!hasSupervisorPerm(actor, 'students')) {
    throw new PolicyError('ليس لديك صلاحية إدارة الطلاب.', 403, 'STUDENTS_PERM_REQUIRED');
  }
}

export function assertCanLinkParent(actor: ActorContext): void {
  assertActiveActor(actor);
  if (actor.role === 'parent') {
    throw new PolicyError('لا يمكن لولي الأمر ربط نفسه بطالب دون موافقة الإدارة.', 403, 'PARENT_SELF_LINK_FORBIDDEN');
  }
  if (!hasSupervisorPerm(actor, 'parents') && !hasSupervisorPerm(actor, 'students')) {
    throw new PolicyError('ليس لديك صلاحية ربط أولياء الأمور بالطلاب.', 403, 'PARENT_LINK_PERM_REQUIRED');
  }
}

export function assertCanAccessFinance(actor: ActorContext): void {
  assertActiveActor(actor);
  if (!hasSupervisorPerm(actor, 'finance')) {
    throw new PolicyError('الوصول إلى المالية يتطلب صلاحية المدير أو تفويضًا صريحًا.', 403, 'FINANCE_FORBIDDEN');
  }
}

export function assertCanAccessPayroll(actor: ActorContext): void {
  assertActiveActor(actor);
  if (!hasSupervisorPerm(actor, 'payroll')) {
    throw new PolicyError('الوصول إلى الرواتب يتطلب صلاحية المدير أو تفويضًا صريحًا.', 403, 'PAYROLL_FORBIDDEN');
  }
}

export function assertCanAccessCrm(actor: ActorContext): void {
  assertActiveActor(actor);
  if (!hasSupervisorPerm(actor, 'crm')) {
    throw new PolicyError('الوصول إلى إدارة العملاء المحتملين (CRM) يتطلب تفويضًا.', 403, 'CRM_FORBIDDEN');
  }
}

export function canReadStudentRecord(actor: ActorContext, student: StudentDoc): boolean {
  if (actor.status !== 'active' || actor.academyId !== student.academyId) {
    return false;
  }
  if (actor.role === 'owner') return true;
  if (actor.role === 'supervisor') {
    return (
      actor.perms.includes('students') ||
      actor.perms.includes('groups') ||
      actor.perms.includes('reports') ||
      actor.perms.includes('parents')
    );
  }
  if (actor.role === 'teacher') {
    return student.teacherUids.includes(actor.uid);
  }
  if (actor.role === 'student') {
    return student.userId === actor.uid;
  }
  if (actor.role === 'parent') {
    return student.parentUids.includes(actor.uid);
  }
  return false;
}
