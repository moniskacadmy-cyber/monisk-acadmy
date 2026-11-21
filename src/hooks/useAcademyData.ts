import { useEffect, useState } from 'react';
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type Query,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { hasSupervisorPerm } from '../shared/policy';
import type {
  ActorContext,
  AttendanceDoc,
  AuditLogDoc,
  ConversationDoc,
  EvaluationDoc,
  GroupDoc,
  InvoiceDoc,
  LeadDoc,
  MemberDoc,
  NotificationDoc,
  ParentLinkDoc,
  PaymentDoc,
  PayrollDoc,
  ResourceFileDoc,
  SessionDoc,
  StudentDoc,
} from '../shared/types';

export interface AcademyDataState {
  loading: boolean;
  members: MemberDoc[];
  students: StudentDoc[];
  groups: GroupDoc[];
  sessions: SessionDoc[];
  attendance: AttendanceDoc[];
  evaluations: EvaluationDoc[];
  parentLinks: ParentLinkDoc[];
  invoices: InvoiceDoc[];
  payments: PaymentDoc[];
  payroll: PayrollDoc[];
  leads: LeadDoc[];
  auditLogs: AuditLogDoc[];
  conversations: ConversationDoc[];
  notifications: NotificationDoc[];
  resources: ResourceFileDoc[];
}

const EMPTY_STATE: AcademyDataState = {
  loading: true,
  members: [],
  students: [],
  groups: [],
  sessions: [],
  attendance: [],
  evaluations: [],
  parentLinks: [],
  invoices: [],
  payments: [],
  payroll: [],
  leads: [],
  auditLogs: [],
  conversations: [],
  notifications: [],
  resources: [],
};

export function useAcademyData(actor: ActorContext | null): AcademyDataState {
  const [state, setState] = useState<AcademyDataState>(EMPTY_STATE);

  useEffect(() => {
    if (!actor || !actor.academyId || actor.status !== 'active') {
      setState({ ...EMPTY_STATE, loading: false });
      return;
    }

    const academyId = actor.academyId;
    const unsubs: Unsubscribe[] = [];
    const base = (colName: string) =>
      query(collection(db, 'academies', academyId, colName), where('academyId', '==', academyId));

    const listen = <T,>(
      q: Query,
      key: keyof Omit<AcademyDataState, 'loading'>,
      pathLabel: string
    ) => {
      const unsub = onSnapshot(
        q,
        (snap) => {
          const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
          setState((prev) => ({ ...prev, loading: false, [key]: items }));
        },
        (err) => {
          handleFirestoreError(err, OperationType.LIST, `academies/${academyId}/${pathLabel}`);
        }
      );
      unsubs.push(unsub);
    };

    const canSeeMembers =
      actor.role === 'owner' ||
      hasSupervisorPerm(actor, 'supervisors') ||
      hasSupervisorPerm(actor, 'teachers') ||
      hasSupervisorPerm(actor, 'students') ||
      hasSupervisorPerm(actor, 'parents') ||
      hasSupervisorPerm(actor, 'payroll');

    if (canSeeMembers) {
      listen<MemberDoc>(query(base('members'), orderBy('createdAt', 'desc')), 'members', 'members');
    } else {
      listen<MemberDoc>(
        query(base('members'), where('uid', '==', actor.uid)),
        'members',
        'members'
      );
    }

    // Students
    if (
      actor.role === 'owner' ||
      hasSupervisorPerm(actor, 'students') ||
      hasSupervisorPerm(actor, 'groups') ||
      hasSupervisorPerm(actor, 'reports') ||
      hasSupervisorPerm(actor, 'parents')
    ) {
      listen<StudentDoc>(
        query(base('students'), orderBy('createdAt', 'desc')),
        'students',
        'students'
      );
    } else if (actor.role === 'teacher') {
      listen<StudentDoc>(
        query(base('students'), where('teacherUids', 'array-contains', actor.uid)),
        'students',
        'students'
      );
    } else if (actor.role === 'student') {
      listen<StudentDoc>(
        query(base('students'), where('userId', '==', actor.uid)),
        'students',
        'students'
      );
    } else if (actor.role === 'parent') {
      listen<StudentDoc>(
        query(base('students'), where('parentUids', 'array-contains', actor.uid)),
        'students',
        'students'
      );
    }

    // Groups
    if (
      actor.role === 'owner' ||
      hasSupervisorPerm(actor, 'groups') ||
      hasSupervisorPerm(actor, 'students') ||
      hasSupervisorPerm(actor, 'reports')
    ) {
      listen<GroupDoc>(query(base('groups'), orderBy('createdAt', 'desc')), 'groups', 'groups');
    } else if (actor.role === 'teacher') {
      listen<GroupDoc>(
        query(base('groups'), where('teacherUid', '==', actor.uid)),
        'groups',
        'groups'
      );
    } else if (actor.role === 'student') {
      listen<GroupDoc>(
        query(base('groups'), where('studentUserIds', 'array-contains', actor.uid)),
        'groups',
        'groups'
      );
    } else if (actor.role === 'parent') {
      listen<GroupDoc>(
        query(base('groups'), where('parentUids', 'array-contains', actor.uid)),
        'groups',
        'groups'
      );
    }

    // Sessions
    if (actor.role === 'owner' || hasSupervisorPerm(actor, 'groups') || hasSupervisorPerm(actor, 'reports')) {
      listen<SessionDoc>(
        query(base('sessions'), orderBy('createdAt', 'desc'), limit(100)),
        'sessions',
        'sessions'
      );
    } else if (actor.role === 'teacher') {
      listen<SessionDoc>(
        query(base('sessions'), where('teacherUid', '==', actor.uid)),
        'sessions',
        'sessions'
      );
    } else if (actor.role === 'student') {
      listen<SessionDoc>(
        query(base('sessions'), where('studentUserIds', 'array-contains', actor.uid)),
        'sessions',
        'sessions'
      );
    } else if (actor.role === 'parent') {
      listen<SessionDoc>(
        query(base('sessions'), where('parentUids', 'array-contains', actor.uid)),
        'sessions',
        'sessions'
      );
    }

    // Attendance
    if (
      actor.role === 'owner' ||
      hasSupervisorPerm(actor, 'students') ||
      hasSupervisorPerm(actor, 'groups') ||
      hasSupervisorPerm(actor, 'reports')
    ) {
      listen<AttendanceDoc>(
        query(base('attendance'), orderBy('createdAt', 'desc'), limit(150)),
        'attendance',
        'attendance'
      );
    } else if (actor.role === 'teacher') {
      listen<AttendanceDoc>(
        query(base('attendance'), where('teacherUid', '==', actor.uid)),
        'attendance',
        'attendance'
      );
    } else if (actor.role === 'student') {
      listen<AttendanceDoc>(
        query(base('attendance'), where('studentUserId', '==', actor.uid)),
        'attendance',
        'attendance'
      );
    } else if (actor.role === 'parent') {
      listen<AttendanceDoc>(
        query(base('attendance'), where('parentUids', 'array-contains', actor.uid)),
        'attendance',
        'attendance'
      );
    }

    // Evaluations
    if (
      actor.role === 'owner' ||
      hasSupervisorPerm(actor, 'students') ||
      hasSupervisorPerm(actor, 'groups') ||
      hasSupervisorPerm(actor, 'reports')
    ) {
      listen<EvaluationDoc>(
        query(base('evaluations'), orderBy('createdAt', 'desc'), limit(150)),
        'evaluations',
        'evaluations'
      );
    } else if (actor.role === 'teacher') {
      listen<EvaluationDoc>(
        query(base('evaluations'), where('teacherUid', '==', actor.uid)),
        'evaluations',
        'evaluations'
      );
    } else if (actor.role === 'student') {
      listen<EvaluationDoc>(
        query(base('evaluations'), where('studentUserId', '==', actor.uid)),
        'evaluations',
        'evaluations'
      );
    } else if (actor.role === 'parent') {
      listen<EvaluationDoc>(
        query(base('evaluations'), where('parentUids', 'array-contains', actor.uid)),
        'evaluations',
        'evaluations'
      );
    }

    // Parent Links
    if (actor.role === 'owner' || hasSupervisorPerm(actor, 'parents') || hasSupervisorPerm(actor, 'students')) {
      listen<ParentLinkDoc>(
        query(base('parentLinks'), orderBy('createdAt', 'desc')),
        'parentLinks',
        'parentLinks'
      );
    } else if (actor.role === 'parent') {
      listen<ParentLinkDoc>(
        query(base('parentLinks'), where('parentUid', '==', actor.uid)),
        'parentLinks',
        'parentLinks'
      );
    }

    // Finance (Invoices & Payments)
    if (hasSupervisorPerm(actor, 'finance')) {
      listen<InvoiceDoc>(
        query(base('invoices'), orderBy('createdAt', 'desc')),
        'invoices',
        'invoices'
      );
      listen<PaymentDoc>(
        query(base('payments'), orderBy('createdAt', 'desc')),
        'payments',
        'payments'
      );
    } else if (actor.role === 'parent') {
      listen<InvoiceDoc>(
        query(base('invoices'), where('parentUids', 'array-contains', actor.uid)),
        'invoices',
        'invoices'
      );
    }

    // Payroll (Owner or Payroll Supervisor ONLY)
    if (hasSupervisorPerm(actor, 'payroll')) {
      listen<PayrollDoc>(
        query(base('payroll'), orderBy('createdAt', 'desc')),
        'payroll',
        'payroll'
      );
    }

    // CRM Leads
    if (hasSupervisorPerm(actor, 'crm')) {
      listen<LeadDoc>(query(base('leads'), orderBy('createdAt', 'desc')), 'leads', 'leads');
    }

    // Audit Logs (Owner ONLY)
    if (actor.role === 'owner') {
      listen<AuditLogDoc>(
        query(base('auditLogs'), orderBy('createdAt', 'desc'), limit(150)),
        'auditLogs',
        'auditLogs'
      );
    }

    // Conversations & Notifications (scoped to participant/recipient)
    listen<ConversationDoc>(
      query(base('conversations'), where('participantUids', 'array-contains', actor.uid)),
      'conversations',
      'conversations'
    );
    listen<NotificationDoc>(
      query(base('notifications'), where('recipientUids', 'array-contains', actor.uid)),
      'notifications',
      'notifications'
    );

    // Resources
    if (actor.role === 'owner' || hasSupervisorPerm(actor, 'groups') || hasSupervisorPerm(actor, 'students')) {
      listen<ResourceFileDoc>(
        query(base('resources'), orderBy('createdAt', 'desc')),
        'resources',
        'resources'
      );
    } else if (actor.role === 'teacher') {
      listen<ResourceFileDoc>(
        query(base('resources'), where('teacherUid', '==', actor.uid)),
        'resources',
        'resources'
      );
    } else if (actor.role === 'student') {
      listen<ResourceFileDoc>(
        query(base('resources'), where('studentUserIds', 'array-contains', actor.uid)),
        'resources',
        'resources'
      );
    } else if (actor.role === 'parent') {
      listen<ResourceFileDoc>(
        query(base('resources'), where('parentUids', 'array-contains', actor.uid)),
        'resources',
        'resources'
      );
    }

    // Ensure loading flips off even if user has few collections subscribed
    const timer = window.setTimeout(() => {
      setState((prev) => (prev.loading ? { ...prev, loading: false } : prev));
    }, 800);

    return () => {
      window.clearTimeout(timer);
      unsubs.forEach((u) => u());
    };
  }, [actor]);

  return state;
}
