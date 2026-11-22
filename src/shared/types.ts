export type AcademyRole = 'owner' | 'supervisor' | 'teacher' | 'student' | 'parent';

export type SupervisorPermission =
  | 'students'
  | 'teachers'
  | 'groups'
  | 'supervisors'
  | 'parents'
  | 'crm'
  | 'reports';

export const ALL_SUPERVISOR_PERMISSIONS: SupervisorPermission[] = [
  'students',
  'teachers',
  'groups',
  'supervisors',
  'parents',
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
  currency: string;
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

export type ConversationKind = 'direct' | 'group';

export interface ConversationDoc {
  id: string;
  academyId: string;
  kind: ConversationKind;
  title: string;
  participantUids: string[];
  /** Display names only. Phone numbers are never stored in conversations. */
  participantNames: Record<string, string>;
  /** Per-user timestamp of the last time they read the conversation (ISO). */
  lastReadAt: Record<string, string>;
  lastMessageText: string;
  lastMessageAt: string;
  lastMessageSenderUid: string;
  lastMessageSenderName: string;
  createdBy: string;
  createdAt: string;
}

export interface MessageDoc {
  id: string;
  academyId: string;
  conversationId: string;
  participantUids: string[];
  senderUid: string;
  senderName: string;
  senderRole: AcademyRole;
  text: string;
  createdAt: string;
}

export interface NotificationDoc {
  id: string;
  academyId: string;
  recipientUids: string[];
  title: string;
  body: string;
  category: 'session' | 'evaluation' | 'system' | 'message';
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
  sizeBytes: number;
  contentType: string;
  uploadedBy: string;
  createdAt: string;
}
