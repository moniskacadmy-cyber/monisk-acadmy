import { adminAuth, adminDb, resolvedProjectId } from '../src/server/firebaseAdmin';

const academyId = process.env.CLAIM_REPAIR_ACADEMY_ID || '';
const ownerUid = process.env.CLAIM_REPAIR_OWNER_UID || '';
const ownerEmail = (process.env.CLAIM_REPAIR_OWNER_EMAIL || '').trim().toLowerCase();

async function main() {
  if (resolvedProjectId !== 'monisakacadmies') throw new Error('Wrong Firebase project; no claims changed.');
  if (academyId !== 'academy_main' || !ownerUid || !ownerEmail) {
    throw new Error('Missing or invalid target configuration; no claims changed.');
  }

  const academyRef = adminDb.collection('academies').doc(academyId);
  const [academySnap, memberSnap, userRecord] = await Promise.all([
    academyRef.get(),
    academyRef.collection('members').doc(ownerUid).get(),
    adminAuth.getUser(ownerUid),
  ]);

  if (!academySnap.exists || !memberSnap.exists) throw new Error('Academy or membership is missing.');
  const academy = academySnap.data()!;
  const member = memberSnap.data()!;

  if (academy.ownerUid !== ownerUid) throw new Error('Academy owner UID mismatch.');
  if (member.uid !== ownerUid || member.academyId !== academyId) throw new Error('Membership identity mismatch.');
  if (String(member.email || '').toLowerCase() !== ownerEmail ||
      String(userRecord.email || '').toLowerCase() !== ownerEmail) throw new Error('Owner email mismatch.');
  if (member.role !== 'owner' || member.status !== 'active') throw new Error('Membership is not an active owner.');
  if (!Array.isArray(member.perms)) throw new Error('Owner permissions are missing or malformed.');

  await adminAuth.setCustomUserClaims(ownerUid, {
    academyId,
    role: 'owner',
    perms: member.perms,
    status: 'active',
  });

  const saved = (await adminAuth.getUser(ownerUid)).customClaims || {};
  if (saved.academyId !== academyId || saved.role !== 'owner' || saved.status !== 'active') {
    throw new Error('Claims write could not be verified.');
  }

  console.log(JSON.stringify({
    ok: true,
    projectId: resolvedProjectId,
    academyId,
    role: saved.role,
    status: saved.status,
    permissionsCount: Array.isArray(saved.perms) ? saved.perms.length : 0,
    note: 'Claims repaired. Owner must sign out and sign in once to refresh the ID token.',
  }, null, 2));
}

main().catch((error) => {
  console.error('Owner claims repair failed:', error);
  process.exit(1);
});
