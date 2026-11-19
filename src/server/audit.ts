import type { ActorContext } from '../shared/types';
import { adminDb } from './firebaseAdmin';

interface WriteAuditInput {
  academyId: string;
  actor: Pick<ActorContext, 'uid' | 'email' | 'role'>;
  action: string;
  targetCollection: string;
  targetId: string;
  details: Record<string, unknown>;
}

export async function writeAuditLog(input: WriteAuditInput): Promise<void> {
  const ref = adminDb.collection('academies').doc(input.academyId).collection('auditLogs').doc();
  const createdAt = new Date().toISOString();

  await ref.set({
    id: ref.id,
    academyId: input.academyId,
    actorUid: input.actor.uid,
    actorEmail: input.actor.email,
    actorRole: input.actor.role,
    action: input.action,
    targetCollection: input.targetCollection,
    targetId: input.targetId,
    details: input.details,
    createdAt,
  });
}
