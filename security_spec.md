# Security Specification (Phase 0 — Payload-First TDD)

## 1. Data Invariants
1. **Strict Tenant Isolation (`academyId`)**: Every user can belong to at most one active academy stored in server-signed Firebase Auth Custom Claims (`request.auth.token.academyId`) and verified against `/academies/{academyId}/members/{uid}`.
2. **Server-Authoritative Roles**: Roles (`owner`, `supervisor`, `teacher`, `student`, `parent`) and `perms` are written strictly by Firebase Admin SDK on the server. Client writes to `members`, `parentLinks`, `auditLogs`, `payroll`, `invoices`, and `payments` are completely denied in `firestore.rules`.
3. **No Owner Creation**: No API endpoint or Firestore rule permits creating an `owner` member. Only the offline CLI bootstrap script can create the initial academy owner.
4. **Role-Level Data Isolation**:
   - Teacher can only read/query students where `uid in resource.data.teacherUids` and groups where `resource.data.teacherUid == uid`.
   - Student can only read/query their own student record (`resource.data.userId == uid`), attendance (`studentUserId == uid`), and evaluations (`studentUserId == uid`).
   - Parent can only read/query students where `uid in resource.data.parentUids`, and cannot create `parentLinks` or mutate `parentUids`.
   - Supervisor without explicit `finance` / `payroll` / `supervisors` permissions cannot access those collections or endpoints.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unauthenticated / No-Academy User Read**: User with `academyId: null` attempts `get` or `list` on `/academies/acad_1/students`. -> **PERMISSION_DENIED**.
2. **Cross-Academy Spoof**: Owner of `acad_1` sends `academyId: "acad_2"` in request body or Firestore path. -> **403 / PERMISSION_DENIED**.
3. **Owner Escalation**: Supervisor with `["supervisors"]` attempts `POST /api/members/create` with `{ role: "owner" }`. -> **403 FORBIDDEN**.
4. **Unauthorized Supervisor Creation**: Supervisor without `"supervisors"` perm attempts `POST /api/members/create` with `{ role: "supervisor" }`. -> **403 FORBIDDEN**.
5. **Client Self-Promotion in Firestore**: Teacher attempts direct Firestore `update` on `/academies/acad_1/members/{uid}` to set `role: "owner"`. -> **PERMISSION_DENIED**.
6. **Teacher Cross-Reading Students**: Teacher A queries `/academies/acad_1/students` without `array-contains` on `teacherUids` or tries `get` on Teacher B's student. -> **PERMISSION_DENIED**.
7. **Student Snooping**: Student A tries `get` on Student B's evaluation or attendance record. -> **PERMISSION_DENIED**.
8. **Parent Self-Linking**: Parent calls `POST /api/parent-links/link` or attempts direct Firestore write to `/academies/acad_1/parentLinks`. -> **403 / PERMISSION_DENIED**.
9. **Parent Reading Unlinked Child**: Parent tries `get` on student where `uid` is not in `parentUids`. -> **PERMISSION_DENIED**.
10. **Teacher Reading Payroll / Finance**: Teacher tries `list` on `/academies/acad_1/payroll` or `/academies/acad_1/invoices`. -> **PERMISSION_DENIED**.
11. **Supervisor Without Finance Perm**: Supervisor with `["students"]` tries `POST /api/finance/invoice` or `list` on `payroll`. -> **403 / PERMISSION_DENIED**.
12. **Disabled Member Residual Access**: Member with `status: "disabled"` attempts Firestore `get` or API call using an un-expired token. -> **403 / PERMISSION_DENIED**.
