export type AcademyRole = 'owner' | 'supervisor' | 'teacher' | 'student' | 'parent';

export type SupervisorPermission =
  | 'students'
  | 'teachers'
  | 'groups'
  | 'supervisors'
  | 'parents'
  | 'finance'
  | 'payroll'
  | 'crm'
  | 'reports';

export const ALL_SUPERVISOR_PERMISSIONS: SupervisorPermission[] = [
  'students',
  'teachers',
  'groups',
  'supervisors',
  'parents',
  'finance',
  'payroll',
  'crm',
  'reports',
];

export type MemberStatus = 'active' | 'disabled';

export interface AuthClaims {
  academyId: string;
  role: AcademyRole;
  perms: SupervisorPermission[];
  status: MemberStatus;
}

export interface ActorContext {
  uid: string;
  email: string;
  academyId: string;
  role: AcademyRole;
  perms: SupervisorPermission[];
  status: MemberStatus;
}

export interface AcademyDoc {
  id: string;
  name: string;
  slug: string;
  /** Optional legacy/default currency; student and payroll records carry their own currency. */
  currency?: string;
  ownerUid: string;
  planStatus: 'active' | 'suspended';
  createdAt: string;
  updatedAt: string;
}

export interface MemberDoc {
  id: string;
  uid: string;
  academyId: string;
  name: string;
  email: string;
  phone?: string;
  role: AcademyRole;
  perms: SupervisorPermission[];
  status: MemberStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface StudentDoc {
  id: string;
  academyId: string;
  userId: string;
  fullName: string;
  email: string;
  phone?: string;
  /** Optional for legacy records; new student records always store a supported ISO currency code. */
  currency?: string;
  track: string;
  level: string;
  points: number;
  teacherUids: string[];
  parentUids: string[];
  groupIds: string[];
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface GroupDoc {
  id: string;
  academyId: string;
  name: string;
  subject: string;
  teacherUid: string;
  teacherName: string;
  studentIds: string[];
  studentUserIds?: string[];
  parentUids?: string[];
  scheduleText: string;
  meetingLink?: string;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface SessionDoc {
  id: string;
  academyId: string;
  groupId: string;
  groupName: string;
  teacherUid: string;
  studentUserIds?: string[];
  parentUids?: string[];
  title: string;
  scheduledDate: string;
  durationMinutes: number;
  notes?: string;
  status: 'scheduled' | 'completed' | 'cancelled';
  createdAt: string;
  updatedAt: string;
}

export interface AttendanceDoc {
  id: string;
  academyId: string;
  sessionId: string;
  groupId: string;
  studentId: string;
  studentUserId: string;
  studentName: string;
  teacherUid: string;
  parentUids: string[];
  date: string;
  status: 'present' | 'absent' | 'late' | 'excused';
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EvaluationDoc {
  id: string;
  academyId: string;
  sessionId?: string;
  groupId: string;
  studentId: string;
  studentUserId: string;
  studentName: string;
  teacherUid: string;
  parentUids: string[];
  surahOrLesson: string;
  memorizationScore: number;
  revisionScore: number;
  recitationScore: number;
  pointsAwarded: number;
  certificateTitle?: string;
  notes?: string;
  evaluatedAt: string;
  createdAt: string;
}

export interface ParentLinkDoc {
  id: string;
  academyId: string;
  parentUid: string;
  parentName: string;
  parentEmail: string;
  studentId: string;
  studentUserId: string;
  studentName: string;
  relation: string;
  status: 'active' | 'revoked';
  approvedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceDoc {
  id: string;
  academyId: string;
  studentId: string;
  studentName: string;
  parentUids: string[];
  title: string;
  amount: number;
  paidAmount: number;
  currency: string;
  dueDate: string;
  status: 'pending' | 'partial' | 'paid' | 'overdue' | 'cancelled';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentDoc {
  id: string;
  academyId: string;
  invoiceId: string;
  studentId: string;
  studentName: string;
  amount: number;
  currency: string;
  method: 'cash' | 'bank_transfer' | 'card' | 'online';
  reference?: string;
  recordedBy: string;
  paidAt: string;
  createdAt: string;
}

export interface PayrollDoc {
  id: string;
  academyId: string;
  memberUid: string;
  memberName: string;
  role: AcademyRole;
  periodMonth: string;
  baseAmount: number;
  bonusAmount: number;
  deductionAmount: number;
  netAmount: number;
  currency: string;
  status: 'draft' | 'approved' | 'paid';
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface LeadDoc {
  id: string;
  academyId: string;
  fullName: string;
  phone: string;
  email?: string;
  interestTrack: string;
  source: string;
  stage: 'new' | 'contacted' | 'trial' | 'enrolled' | 'lost';
  notes?: string;
  assignedToUid?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogDoc {
  id: string;
  academyId: string;
  actorUid: string;
  actorEmail: string;
  actorRole: AcademyRole;
  action: string;
  targetCollection: string;
  targetId: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface ConversationDoc {
  id: string;
  academyId: string;
  title: string;
  participantUids: string[];
  participantNames: Record<string, string>;
  lastMessageText: string;
  lastMessageAt: string;
  createdBy: string;
  createdAt: string;
}

export interface MessageDoc {
  id: string;
  academyId: string;
  conversationId: string;
  participantUids?: string[];
  senderUid: string;
  senderName: string;
  senderRole: AcademyRole;
  text: string;
  attachmentUrl?: string;
  attachmentName?: string;
  createdAt: string;
}

export interface NotificationDoc {
  id: string;
  academyId: string;
  recipientUids: string[];
  title: string;
  body: string;
  category: 'session' | 'evaluation' | 'finance' | 'system' | 'message';
  createdBy: string;
  readBy: string[];
  createdAt: string;
}

export interface ResourceFileDoc {
  id: string;
  academyId: string;
  groupId: string;
  teacherUid: string;
  studentUserIds?: string[];
  parentUids?: string[];
  title: string;
  fileName: string;
  storagePath: string;
  downloadUrl: string;
  sizeBytes: number;
  contentType: string;
  uploadedBy: string;
  createdAt: string;
}
