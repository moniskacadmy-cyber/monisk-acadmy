// server.ts
import "dotenv/config";
import fs2 from "node:fs";
import path2 from "node:path";
import express from "express";

// src/shared/types.ts
var ALL_SUPERVISOR_PERMISSIONS = [
  "students",
  "teachers",
  "groups",
  "supervisors",
  "parents",
  "finance",
  "payroll",
  "crm",
  "reports"
];

// src/shared/policy.ts
var PolicyError = class extends Error {
  constructor(message, statusCode = 403, code = "FORBIDDEN") {
    super(message);
    this.name = "PolicyError";
    this.statusCode = statusCode;
    this.code = code;
  }
};
var SAFE_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;
function isValidDocumentId(id) {
  return typeof id === "string" && SAFE_ID_REGEX.test(id);
}
function sanitizePermissions(perms) {
  if (!Array.isArray(perms)) return [];
  const validSet = new Set(ALL_SUPERVISOR_PERMISSIONS);
  const unique = /* @__PURE__ */ new Set();
  for (const p of perms) {
    if (typeof p === "string" && validSet.has(p)) {
      unique.add(p);
    }
  }
  return Array.from(unique);
}
function assertActiveActor(actor) {
  if (!actor || !actor.uid) {
    throw new PolicyError("\u064A\u062C\u0628 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644 \u0623\u0648\u0644\u064B\u0627.", 401, "UNAUTHENTICATED");
  }
  if (!isValidDocumentId(actor.academyId)) {
    throw new PolicyError("\u0627\u0644\u062D\u0633\u0627\u0628 \u063A\u064A\u0631 \u0645\u0631\u062A\u0628\u0637 \u0628\u0623\u064A \u0623\u0643\u0627\u062F\u064A\u0645\u064A\u0629 \u0635\u0627\u0644\u062D\u0629.", 403, "NO_ACADEMY");
  }
  if (actor.status !== "active") {
    throw new PolicyError("\u062A\u0645 \u062A\u0639\u0637\u064A\u0644 \u0647\u0630\u0627 \u0627\u0644\u062D\u0633\u0627\u0628 \u0648\u0644\u0627 \u064A\u0645\u0644\u0643 \u0635\u0644\u0627\u062D\u064A\u0629 \u0627\u0644\u0648\u0635\u0648\u0644.", 403, "ACCOUNT_DISABLED");
  }
}
function assertAcademyIsolation(actor, requestedAcademyId) {
  assertActiveActor(actor);
  if (requestedAcademyId !== void 0 && requestedAcademyId !== null && requestedAcademyId !== "" && requestedAcademyId !== actor.academyId) {
    throw new PolicyError(
      "\u0645\u062D\u0627\u0648\u0644\u0629 \u0645\u0631\u0641\u0648\u0636\u0629: \u0644\u0627 \u064A\u0645\u0643\u0646\u0643 \u0627\u0644\u0648\u0635\u0648\u0644 \u0625\u0644\u0649 \u0628\u064A\u0627\u0646\u0627\u062A \u0623\u0643\u0627\u062F\u064A\u0645\u064A\u0629 \u0623\u062E\u0631\u0649 \u0623\u0648 \u062A\u0639\u062F\u064A\u0644 \u0645\u0639\u0631\u0641 \u0627\u0644\u0623\u0643\u0627\u062F\u064A\u0645\u064A\u0629.",
      403,
      "CROSS_ACADEMY_FORBIDDEN"
    );
  }
  return actor.academyId;
}
function hasSupervisorPerm(actor, perm) {
  if (actor.status !== "active") return false;
  if (actor.role === "owner") return true;
  if (actor.role === "supervisor") {
    return actor.perms.includes(perm);
  }
  return false;
}
function assertCanCreateMember(actor, targetRole) {
  assertActiveActor(actor);
  if (targetRole === "owner") {
    throw new PolicyError(
      "\u0645\u0631\u0641\u0648\u0636 \u0623\u0645\u0646\u064A\u064B\u0627: \u0644\u0627 \u064A\u0645\u0643\u0646 \u0625\u0646\u0634\u0627\u0621 \u062D\u0633\u0627\u0628 \u0645\u062F\u064A\u0631 \u0623\u0643\u0627\u062F\u064A\u0645\u064A\u0629 \u0639\u0628\u0631 \u0623\u064A \u0648\u0627\u062C\u0647\u0629 \u0623\u0648 \u062F\u0627\u0644\u0629.",
      403,
      "OWNER_CREATION_FORBIDDEN"
    );
  }
  if (actor.role === "owner") {
    return;
  }
  if (actor.role !== "supervisor") {
    throw new PolicyError("\u0644\u064A\u0633 \u0644\u062F\u064A\u0643 \u0635\u0644\u0627\u062D\u064A\u0629 \u0625\u0646\u0634\u0627\u0621 \u0623\u0639\u0636\u0627\u0621.", 403, "ROLE_FORBIDDEN");
  }
  if (targetRole === "supervisor" && !actor.perms.includes("supervisors")) {
    throw new PolicyError(
      "\u0644\u0627 \u064A\u0645\u0644\u0643 \u0627\u0644\u0645\u0634\u0631\u0641 \u0635\u0644\u0627\u062D\u064A\u0629 \u0625\u0646\u0634\u0627\u0621 \u0645\u0634\u0631\u0641\u064A\u0646 \u062F\u0648\u0646 \u062A\u0641\u0648\u064A\u0636 \u0635\u0631\u064A\u062D (supervisors).",
      403,
      "SUPERVISOR_PERM_REQUIRED"
    );
  }
  if (targetRole === "teacher" && !actor.perms.includes("teachers")) {
    throw new PolicyError("\u0635\u0644\u0627\u062D\u064A\u0629 \u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u0639\u0644\u0645\u064A\u0646 \u0645\u0637\u0644\u0648\u0628\u0629 \u0644\u0625\u0646\u0634\u0627\u0621 \u0645\u0639\u0644\u0645.", 403, "TEACHER_PERM_REQUIRED");
  }
  if (targetRole === "student" && !actor.perms.includes("students")) {
    throw new PolicyError("\u0635\u0644\u0627\u062D\u064A\u0629 \u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0637\u0644\u0627\u0628 \u0645\u0637\u0644\u0648\u0628\u0629 \u0644\u0625\u0646\u0634\u0627\u0621 \u0637\u0627\u0644\u0628.", 403, "STUDENT_PERM_REQUIRED");
  }
  if (targetRole === "parent" && !actor.perms.includes("parents") && !actor.perms.includes("students")) {
    throw new PolicyError("\u0635\u0644\u0627\u062D\u064A\u0629 \u0623\u0648\u0644\u064A\u0627\u0621 \u0627\u0644\u0623\u0645\u0648\u0631 \u0623\u0648 \u0627\u0644\u0637\u0644\u0627\u0628 \u0645\u0637\u0644\u0648\u0628\u0629 \u0644\u0625\u0646\u0634\u0627\u0621 \u0648\u0644\u064A \u0623\u0645\u0631.", 403, "PARENT_PERM_REQUIRED");
  }
}
function assertCanToggleMemberStatus(actor, target) {
  assertAcademyIsolation(actor, target.academyId);
  if (target.uid === actor.uid) {
    throw new PolicyError("\u0644\u0627 \u064A\u0645\u0643\u0646\u0643 \u062A\u0639\u0637\u064A\u0644 \u062D\u0633\u0627\u0628\u0643 \u0627\u0644\u0634\u062E\u0635\u064A.", 400, "SELF_DISABLE_FORBIDDEN");
  }
  if (target.role === "owner") {
    throw new PolicyError("\u0644\u0627 \u064A\u0645\u0643\u0646 \u062A\u0639\u0637\u064A\u0644 \u062D\u0633\u0627\u0628 \u0645\u062F\u064A\u0631 \u0627\u0644\u0623\u0643\u0627\u062F\u064A\u0645\u064A\u0629.", 403, "OWNER_PROTECTED");
  }
  if (actor.role === "owner") {
    return;
  }
  if (actor.role !== "supervisor") {
    throw new PolicyError("\u0644\u064A\u0633 \u0644\u062F\u064A\u0643 \u0635\u0644\u0627\u062D\u064A\u0629 \u062A\u0639\u062F\u064A\u0644 \u062D\u0627\u0644\u0629 \u0627\u0644\u0623\u0639\u0636\u0627\u0621.", 403, "ROLE_FORBIDDEN");
  }
  if (target.role === "supervisor" && !actor.perms.includes("supervisors")) {
    throw new PolicyError("\u062A\u0639\u062F\u064A\u0644 \u062D\u0627\u0644\u0629 \u0627\u0644\u0645\u0634\u0631\u0641 \u064A\u062A\u0637\u0644\u0628 \u0635\u0644\u0627\u062D\u064A\u0629 supervisors.", 403, "SUPERVISOR_PERM_REQUIRED");
  }
  if (target.role === "teacher" && !actor.perms.includes("teachers")) {
    throw new PolicyError("\u062A\u0639\u062F\u064A\u0644 \u062D\u0627\u0644\u0629 \u0627\u0644\u0645\u0639\u0644\u0645 \u064A\u062A\u0637\u0644\u0628 \u0635\u0644\u0627\u062D\u064A\u0629 teachers.", 403, "TEACHER_PERM_REQUIRED");
  }
  if (target.role === "student" && !actor.perms.includes("students")) {
    throw new PolicyError("\u062A\u0639\u062F\u064A\u0644 \u062D\u0627\u0644\u0629 \u0627\u0644\u0637\u0627\u0644\u0628 \u064A\u062A\u0637\u0644\u0628 \u0635\u0644\u0627\u062D\u064A\u0629 students.", 403, "STUDENT_PERM_REQUIRED");
  }
  if (target.role === "parent" && !actor.perms.includes("parents") && !actor.perms.includes("students")) {
    throw new PolicyError("\u062A\u0639\u062F\u064A\u0644 \u062D\u0627\u0644\u0629 \u0648\u0644\u064A \u0627\u0644\u0623\u0645\u0631 \u064A\u062A\u0637\u0644\u0628 \u0635\u0644\u0627\u062D\u064A\u0629 parents \u0623\u0648 students.", 403, "PARENT_PERM_REQUIRED");
  }
}
function assertCanUpdatePermissions(actor, targetRole) {
  assertActiveActor(actor);
  if (actor.role !== "owner") {
    throw new PolicyError("\u0641\u0642\u0637 \u0645\u062F\u064A\u0631 \u0627\u0644\u0623\u0643\u0627\u062F\u064A\u0645\u064A\u0629 \u064A\u0645\u0643\u0646\u0647 \u062A\u0639\u062F\u064A\u0644 \u0635\u0644\u0627\u062D\u064A\u0627\u062A \u0627\u0644\u0645\u0634\u0631\u0641\u064A\u0646.", 403, "OWNER_ONLY");
  }
  if (targetRole !== "supervisor") {
    throw new PolicyError("\u062A\u0639\u062F\u064A\u0644 \u0627\u0644\u0635\u0644\u0627\u062D\u064A\u0627\u062A \u0627\u0644\u0645\u062E\u0635\u0635\u0629 \u0645\u062A\u0627\u062D \u0644\u0644\u0645\u0634\u0631\u0641\u064A\u0646 \u0641\u0642\u0637.", 400, "INVALID_TARGET_ROLE");
  }
}
function assertCanManageGroups(actor) {
  assertActiveActor(actor);
  if (!hasSupervisorPerm(actor, "groups")) {
    throw new PolicyError("\u0644\u064A\u0633 \u0644\u062F\u064A\u0643 \u0635\u0644\u0627\u062D\u064A\u0629 \u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u062D\u0644\u0642\u0627\u062A \u0648\u0627\u0644\u0645\u062C\u0645\u0648\u0639\u0627\u062A.", 403, "GROUPS_PERM_REQUIRED");
  }
}
function assertCanManageStudents(actor) {
  assertActiveActor(actor);
  if (!hasSupervisorPerm(actor, "students")) {
    throw new PolicyError("\u0644\u064A\u0633 \u0644\u062F\u064A\u0643 \u0635\u0644\u0627\u062D\u064A\u0629 \u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0637\u0644\u0627\u0628.", 403, "STUDENTS_PERM_REQUIRED");
  }
}
function assertCanLinkParent(actor) {
  assertActiveActor(actor);
  if (actor.role === "parent") {
    throw new PolicyError("\u0644\u0627 \u064A\u0645\u0643\u0646 \u0644\u0648\u0644\u064A \u0627\u0644\u0623\u0645\u0631 \u0631\u0628\u0637 \u0646\u0641\u0633\u0647 \u0628\u0637\u0627\u0644\u0628 \u062F\u0648\u0646 \u0645\u0648\u0627\u0641\u0642\u0629 \u0627\u0644\u0625\u062F\u0627\u0631\u0629.", 403, "PARENT_SELF_LINK_FORBIDDEN");
  }
  if (!hasSupervisorPerm(actor, "parents") && !hasSupervisorPerm(actor, "students")) {
    throw new PolicyError("\u0644\u064A\u0633 \u0644\u062F\u064A\u0643 \u0635\u0644\u0627\u062D\u064A\u0629 \u0631\u0628\u0637 \u0623\u0648\u0644\u064A\u0627\u0621 \u0627\u0644\u0623\u0645\u0648\u0631 \u0628\u0627\u0644\u0637\u0644\u0627\u0628.", 403, "PARENT_LINK_PERM_REQUIRED");
  }
}
function assertCanAccessFinance(actor) {
  assertActiveActor(actor);
  if (!hasSupervisorPerm(actor, "finance")) {
    throw new PolicyError("\u0627\u0644\u0648\u0635\u0648\u0644 \u0625\u0644\u0649 \u0627\u0644\u0645\u0627\u0644\u064A\u0629 \u064A\u062A\u0637\u0644\u0628 \u0635\u0644\u0627\u062D\u064A\u0629 \u0627\u0644\u0645\u062F\u064A\u0631 \u0623\u0648 \u062A\u0641\u0648\u064A\u0636\u064B\u0627 \u0635\u0631\u064A\u062D\u064B\u0627.", 403, "FINANCE_FORBIDDEN");
  }
}
function assertCanAccessPayroll(actor) {
  assertActiveActor(actor);
  if (!hasSupervisorPerm(actor, "payroll")) {
    throw new PolicyError("\u0627\u0644\u0648\u0635\u0648\u0644 \u0625\u0644\u0649 \u0627\u0644\u0631\u0648\u0627\u062A\u0628 \u064A\u062A\u0637\u0644\u0628 \u0635\u0644\u0627\u062D\u064A\u0629 \u0627\u0644\u0645\u062F\u064A\u0631 \u0623\u0648 \u062A\u0641\u0648\u064A\u0636\u064B\u0627 \u0635\u0631\u064A\u062D\u064B\u0627.", 403, "PAYROLL_FORBIDDEN");
  }
}
function assertCanAccessCrm(actor) {
  assertActiveActor(actor);
  if (!hasSupervisorPerm(actor, "crm")) {
    throw new PolicyError("\u0627\u0644\u0648\u0635\u0648\u0644 \u0625\u0644\u0649 \u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0639\u0645\u0644\u0627\u0621 \u0627\u0644\u0645\u062D\u062A\u0645\u0644\u064A\u0646 (CRM) \u064A\u062A\u0637\u0644\u0628 \u062A\u0641\u0648\u064A\u0636\u064B\u0627.", 403, "CRM_FORBIDDEN");
  }
}

// src/server/firebaseAdmin.ts
import fs from "node:fs";
import path from "node:path";
import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
function loadAppletConfig() {
  try {
    const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, "utf-8");
      return JSON.parse(raw);
    }
  } catch {
  }
  return {};
}
var appletConfig = loadAppletConfig();
function createAdminApp() {
  if (getApps().length > 0) {
    return getApp();
  }
  const projectId = process.env.FIREBASE_PROJECT_ID || appletConfig.projectId;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (projectId && clientEmail && privateKey) {
    return initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, "\n")
      }),
      projectId,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || appletConfig.storageBucket
    });
  }
  return initializeApp({
    ...projectId ? { projectId } : {},
    ...appletConfig.storageBucket ? { storageBucket: appletConfig.storageBucket } : {}
  });
}
var adminApp = createAdminApp();
var databaseId = process.env.FIREBASE_DATABASE_ID || appletConfig.firestoreDatabaseId;
var adminAuth = getAuth(adminApp);
var adminDb = databaseId && databaseId !== "(default)" ? getFirestore(adminApp, databaseId) : getFirestore(adminApp);
var adminMessaging = getMessaging(adminApp);
var resolvedProjectId = process.env.FIREBASE_PROJECT_ID || appletConfig.projectId || "";

// src/server/audit.ts
async function writeAuditLog(input) {
  const ref = adminDb.collection("academies").doc(input.academyId).collection("auditLogs").doc();
  const createdAt = (/* @__PURE__ */ new Date()).toISOString();
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
    createdAt
  });
}

// src/server/authMiddleware.ts
var VALID_ROLES = ["owner", "supervisor", "teacher", "student", "parent"];
function extractBearerToken(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  const headerStr = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (!headerStr || !headerStr.startsWith("Bearer ")) {
    throw new PolicyError("\u0631\u0645\u0632 \u0627\u0644\u0645\u0635\u0627\u062F\u0642\u0629 \u0645\u0641\u0642\u0648\u062F.", 401, "MISSING_TOKEN");
  }
  const token = headerStr.slice("Bearer ".length).trim();
  if (!token) {
    throw new PolicyError("\u0631\u0645\u0632 \u0627\u0644\u0645\u0635\u0627\u062F\u0642\u0629 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D.", 401, "INVALID_TOKEN");
  }
  return token;
}
async function authenticateActor(req) {
  const idToken = extractBearerToken(req);
  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(idToken);
  } catch {
    throw new PolicyError("\u062C\u0644\u0633\u0629 \u0627\u0644\u062F\u062E\u0648\u0644 \u0645\u0646\u062A\u0647\u064A\u0629 \u0623\u0648 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D\u0629. \u064A\u0631\u062C\u0649 \u0625\u0639\u0627\u062F\u0629 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644.", 401, "INVALID_TOKEN");
  }
  const claimAcademyId = typeof decoded.academyId === "string" ? decoded.academyId : "";
  const claimRole = typeof decoded.role === "string" ? decoded.role : "";
  if (!claimAcademyId || !VALID_ROLES.includes(claimRole)) {
    throw new PolicyError(
      "\u0627\u0644\u062D\u0633\u0627\u0628 \u063A\u064A\u0631 \u0645\u0631\u062A\u0628\u0637 \u0628\u0623\u064A \u0623\u0643\u0627\u062F\u064A\u0645\u064A\u0629 \u0623\u0648 \u0644\u0627 \u064A\u0645\u0644\u0643 \u062F\u0648\u0631\u064B\u0627 \u0645\u0639\u062A\u0645\u062F\u064B\u0627.",
      403,
      "NO_ACADEMY_CLAIMS"
    );
  }
  const memberSnap = await adminDb.collection("academies").doc(claimAcademyId).collection("members").doc(decoded.uid).get();
  if (!memberSnap.exists) {
    throw new PolicyError("\u0633\u062C\u0644 \u0627\u0644\u0639\u0636\u0648\u064A\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F \u062F\u0627\u062E\u0644 \u0627\u0644\u0623\u0643\u0627\u062F\u064A\u0645\u064A\u0629.", 403, "MEMBER_NOT_FOUND");
  }
  const member = memberSnap.data();
  const actor = {
    uid: decoded.uid,
    email: decoded.email || member.email || "",
    academyId: claimAcademyId,
    role: member.role,
    perms: sanitizePermissions(member.perms),
    status: member.status
  };
  assertActiveActor(actor);
  assertAcademyIsolation(actor, req.body?.academyId);
  return actor;
}
function handleApiError(res, err) {
  if (err instanceof PolicyError) {
    res.status(err.statusCode).json({
      ok: false,
      code: err.code,
      error: err.message
    });
    return;
  }
  const message = err instanceof Error ? err.message : "\u062D\u062F\u062B \u062E\u0637\u0623 \u063A\u064A\u0631 \u0645\u062A\u0648\u0642\u0639 \u0641\u064A \u0627\u0644\u062E\u0627\u062F\u0645.";
  if (message.includes("PERMISSION_DENIED") || message.includes("7 PERMISSION_DENIED")) {
    res.status(403).json({
      ok: false,
      code: "IAM_PERMISSION_DENIED",
      error: "\u062A\u0639\u0630\u0631 \u0648\u0635\u0648\u0644 \u0627\u0644\u062E\u0627\u062F\u0645 \u0625\u0644\u0649 Firebase. \u062A\u0623\u0643\u062F \u0645\u0646 \u0645\u0646\u062D \u062D\u0633\u0627\u0628 \u0627\u0644\u062E\u062F\u0645\u0629 \u0623\u062F\u0648\u0627\u0631 IAM \u0627\u0644\u0645\u0637\u0644\u0648\u0628\u0629 (Datastore User \u0648 Firebase Authentication Admin) \u0639\u0644\u0649 \u0645\u0634\u0631\u0648\u0639 monisakacadmy."
    });
    return;
  }
  res.status(500).json({
    ok: false,
    code: "INTERNAL_ERROR",
    error: message
  });
}

// src/server/handlers.ts
function str(val, max = 200) {
  if (typeof val !== "string") return "";
  return val.trim().slice(0, max);
}
function num(val, fallback = 0) {
  const parsed = Number(val);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function academyRef(academyId) {
  return adminDb.collection("academies").doc(academyId);
}
async function handleCreateMember(req, res) {
  try {
    const actor = await authenticateActor(req);
    const body = req.body || {};
    const name = str(body.name, 120);
    const email = str(body.email, 200).toLowerCase();
    const password = typeof body.password === "string" ? body.password : "";
    const phone = str(body.phone, 40);
    const role = str(body.role, 32);
    const requestedPerms = sanitizePermissions(body.perms);
    const track = str(body.track, 100) || "\u0627\u0644\u0642\u0631\u0622\u0646 \u0627\u0644\u0643\u0631\u064A\u0645";
    const level = str(body.level, 100) || "\u0627\u0644\u0645\u0633\u062A\u0648\u0649 \u0627\u0644\u062A\u0645\u0647\u064A\u062F\u064A";
    if (name.length < 2) {
      throw new PolicyError("\u064A\u0631\u062C\u0649 \u0625\u062F\u062E\u0627\u0644 \u0627\u0644\u0627\u0633\u0645 \u0627\u0644\u0643\u0627\u0645\u0644 (\u062D\u0631\u0641\u0627\u0646 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644).", 400, "INVALID_NAME");
    }
    if (!email || !email.includes("@")) {
      throw new PolicyError("\u064A\u0631\u062C\u0649 \u0625\u062F\u062E\u0627\u0644 \u0628\u0631\u064A\u062F \u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A \u0635\u062D\u064A\u062D.", 400, "INVALID_EMAIL");
    }
    if (password.length < 8) {
      throw new PolicyError("\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u064A\u062C\u0628 \u0623\u0646 \u062A\u0643\u0648\u0646 8 \u0623\u062D\u0631\u0641 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644.", 400, "WEAK_PASSWORD");
    }
    if (!["owner", "supervisor", "teacher", "student", "parent"].includes(role)) {
      throw new PolicyError("\u0627\u0644\u062F\u0648\u0631 \u0627\u0644\u0645\u062D\u062F\u062F \u063A\u064A\u0631 \u0635\u0627\u0644\u062D.", 400, "INVALID_ROLE");
    }
    assertCanCreateMember(actor, role);
    const perms = role === "supervisor" ? requestedPerms : [];
    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName: name,
      emailVerified: true,
      disabled: false
    });
    await adminAuth.setCustomUserClaims(userRecord.uid, {
      academyId: actor.academyId,
      role,
      perms,
      status: "active"
    });
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const memberDoc = {
      id: userRecord.uid,
      uid: userRecord.uid,
      academyId: actor.academyId,
      name,
      email,
      ...phone ? { phone } : {},
      role,
      perms,
      status: "active",
      createdBy: actor.uid,
      createdAt: now,
      updatedAt: now
    };
    const batch = adminDb.batch();
    batch.set(academyRef(actor.academyId).collection("members").doc(userRecord.uid), memberDoc);
    if (role === "student") {
      const studentDoc = {
        id: userRecord.uid,
        academyId: actor.academyId,
        userId: userRecord.uid,
        fullName: name,
        email,
        ...phone ? { phone } : {},
        track,
        level,
        points: 0,
        teacherUids: [],
        parentUids: [],
        groupIds: [],
        status: "active",
        createdAt: now,
        updatedAt: now
      };
      batch.set(academyRef(actor.academyId).collection("students").doc(userRecord.uid), studentDoc);
    }
    await batch.commit();
    await writeAuditLog({
      academyId: actor.academyId,
      actor,
      action: "CREATE_MEMBER",
      targetCollection: "members",
      targetId: userRecord.uid,
      details: { role, perms, email }
    });
    res.status(201).json({ ok: true, member: memberDoc });
  } catch (err) {
    handleApiError(res, err);
  }
}
async function handleDisableMember(req, res) {
  try {
    const actor = await authenticateActor(req);
    const body = req.body || {};
    const targetUid = str(body.uid, 128);
    const nextStatus = body.status === "active" ? "active" : "disabled";
    if (!isValidDocumentId(targetUid)) {
      throw new PolicyError("\u0645\u0639\u0631\u0641 \u0627\u0644\u0639\u0636\u0648 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D.", 400, "INVALID_UID");
    }
    const targetRef = academyRef(actor.academyId).collection("members").doc(targetUid);
    const targetSnap = await targetRef.get();
    if (!targetSnap.exists) {
      throw new PolicyError("\u0627\u0644\u0639\u0636\u0648 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F \u0641\u064A \u0647\u0630\u0647 \u0627\u0644\u0623\u0643\u0627\u062F\u064A\u0645\u064A\u0629.", 404, "MEMBER_NOT_FOUND");
    }
    const target = targetSnap.data();
    assertCanToggleMemberStatus(actor, target);
    await adminAuth.updateUser(targetUid, { disabled: nextStatus === "disabled" });
    await adminAuth.setCustomUserClaims(targetUid, {
      academyId: actor.academyId,
      role: target.role,
      perms: sanitizePermissions(target.perms),
      status: nextStatus
    });
    if (nextStatus === "disabled") {
      await adminAuth.revokeRefreshTokens(targetUid);
    }
    const updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    await targetRef.update({ status: nextStatus, updatedAt });
    await writeAuditLog({
      academyId: actor.academyId,
      actor,
      action: nextStatus === "disabled" ? "DISABLE_MEMBER" : "ENABLE_MEMBER",
      targetCollection: "members",
      targetId: targetUid,
      details: { previousStatus: target.status, nextStatus, role: target.role }
    });
    res.status(200).json({ ok: true, uid: targetUid, status: nextStatus });
  } catch (err) {
    handleApiError(res, err);
  }
}
async function handleUpdatePermissions(req, res) {
  try {
    const actor = await authenticateActor(req);
    const body = req.body || {};
    const targetUid = str(body.uid, 128);
    const perms = sanitizePermissions(body.perms);
    if (!isValidDocumentId(targetUid)) {
      throw new PolicyError("\u0645\u0639\u0631\u0641 \u0627\u0644\u0645\u0634\u0631\u0641 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D.", 400, "INVALID_UID");
    }
    const targetRef = academyRef(actor.academyId).collection("members").doc(targetUid);
    const targetSnap = await targetRef.get();
    if (!targetSnap.exists) {
      throw new PolicyError("\u0627\u0644\u0645\u0634\u0631\u0641 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F.", 404, "MEMBER_NOT_FOUND");
    }
    const target = targetSnap.data();
    assertCanUpdatePermissions(actor, target.role);
    await adminAuth.setCustomUserClaims(targetUid, {
      academyId: actor.academyId,
      role: target.role,
      perms,
      status: target.status
    });
    await targetRef.update({
      perms,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    await writeAuditLog({
      academyId: actor.academyId,
      actor,
      action: "UPDATE_SUPERVISOR_PERMS",
      targetCollection: "members",
      targetId: targetUid,
      details: { perms }
    });
    res.status(200).json({ ok: true, uid: targetUid, perms });
  } catch (err) {
    handleApiError(res, err);
  }
}
async function handleUpsertStudent(req, res) {
  try {
    const actor = await authenticateActor(req);
    assertCanManageStudents(actor);
    const body = req.body || {};
    const studentId = str(body.id, 128);
    const fullName = str(body.fullName, 120);
    const email = str(body.email, 200).toLowerCase();
    const phone = str(body.phone, 40);
    const track = str(body.track, 100) || "\u0627\u0644\u0642\u0631\u0622\u0646 \u0627\u0644\u0643\u0631\u064A\u0645";
    const level = str(body.level, 100) || "\u0627\u0644\u0645\u0633\u062A\u0648\u0649 \u0627\u0644\u0623\u0648\u0644";
    const status = body.status === "archived" ? "archived" : "active";
    if (fullName.length < 2) {
      throw new PolicyError("\u064A\u0631\u062C\u0649 \u0625\u062F\u062E\u0627\u0644 \u0627\u0633\u0645 \u0627\u0644\u0637\u0627\u0644\u0628.", 400, "INVALID_NAME");
    }
    const studentsCol = academyRef(actor.academyId).collection("students");
    const now = (/* @__PURE__ */ new Date()).toISOString();
    if (studentId) {
      if (!isValidDocumentId(studentId)) {
        throw new PolicyError("\u0645\u0639\u0631\u0641 \u0627\u0644\u0637\u0627\u0644\u0628 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D.", 400, "INVALID_ID");
      }
      const ref = studentsCol.doc(studentId);
      const snap = await ref.get();
      if (!snap.exists) {
        throw new PolicyError("\u0645\u0644\u0641 \u0627\u0644\u0637\u0627\u0644\u0628 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F.", 404, "STUDENT_NOT_FOUND");
      }
      await ref.update({
        fullName,
        ...email ? { email } : {},
        phone,
        track,
        level,
        status,
        updatedAt: now
      });
      await writeAuditLog({
        academyId: actor.academyId,
        actor,
        action: "UPDATE_STUDENT",
        targetCollection: "students",
        targetId: studentId,
        details: { fullName, track, level, status }
      });
      res.status(200).json({ ok: true, id: studentId });
      return;
    }
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !email.includes("@") || password.length < 8) {
      throw new PolicyError(
        "\u0644\u0625\u0646\u0634\u0627\u0621 \u0637\u0627\u0644\u0628 \u062C\u062F\u064A\u062F \u064A\u0644\u0632\u0645 \u0628\u0631\u064A\u062F \u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A \u0635\u062D\u064A\u062D \u0648\u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631 (8 \u0623\u062D\u0631\u0641 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644).",
        400,
        "STUDENT_CREDENTIALS_REQUIRED"
      );
    }
    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName: fullName,
      emailVerified: true,
      disabled: false
    });
    await adminAuth.setCustomUserClaims(userRecord.uid, {
      academyId: actor.academyId,
      role: "student",
      perms: [],
      status: "active"
    });
    const memberDoc = {
      id: userRecord.uid,
      uid: userRecord.uid,
      academyId: actor.academyId,
      name: fullName,
      email,
      ...phone ? { phone } : {},
      role: "student",
      perms: [],
      status: "active",
      createdBy: actor.uid,
      createdAt: now,
      updatedAt: now
    };
    const studentDoc = {
      id: userRecord.uid,
      academyId: actor.academyId,
      userId: userRecord.uid,
      fullName,
      email,
      ...phone ? { phone } : {},
      track,
      level,
      points: 0,
      teacherUids: [],
      parentUids: [],
      groupIds: [],
      status: "active",
      createdAt: now,
      updatedAt: now
    };
    const batch = adminDb.batch();
    batch.set(academyRef(actor.academyId).collection("members").doc(userRecord.uid), memberDoc);
    batch.set(studentsCol.doc(userRecord.uid), studentDoc);
    await batch.commit();
    await writeAuditLog({
      academyId: actor.academyId,
      actor,
      action: "CREATE_STUDENT",
      targetCollection: "students",
      targetId: userRecord.uid,
      details: { fullName, email, track, level }
    });
    res.status(201).json({ ok: true, student: studentDoc });
  } catch (err) {
    handleApiError(res, err);
  }
}
async function handleArchiveStudent(req, res) {
  try {
    const actor = await authenticateActor(req);
    assertCanManageStudents(actor);
    const studentId = str(req.body?.studentId, 128);
    const nextStatus = req.body?.status === "active" ? "active" : "archived";
    if (!isValidDocumentId(studentId)) {
      throw new PolicyError("\u0645\u0639\u0631\u0641 \u0627\u0644\u0637\u0627\u0644\u0628 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D.", 400, "INVALID_ID");
    }
    const ref = academyRef(actor.academyId).collection("students").doc(studentId);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new PolicyError("\u0627\u0644\u0637\u0627\u0644\u0628 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F.", 404, "STUDENT_NOT_FOUND");
    }
    await ref.update({ status: nextStatus, updatedAt: (/* @__PURE__ */ new Date()).toISOString() });
    await writeAuditLog({
      academyId: actor.academyId,
      actor,
      action: nextStatus === "archived" ? "ARCHIVE_STUDENT" : "RESTORE_STUDENT",
      targetCollection: "students",
      targetId: studentId,
      details: { status: nextStatus }
    });
    res.status(200).json({ ok: true, studentId, status: nextStatus });
  } catch (err) {
    handleApiError(res, err);
  }
}
async function handleCreateOrUpdateGroup(req, res) {
  try {
    const actor = await authenticateActor(req);
    assertCanManageGroups(actor);
    const body = req.body || {};
    const groupId = str(body.id, 128);
    const name = str(body.name, 120);
    const subject = str(body.subject, 120) || "\u062A\u062D\u0641\u064A\u0638 \u0648\u0645\u0631\u0627\u062C\u0639\u0629";
    const teacherUid = str(body.teacherUid, 128);
    const scheduleText = str(body.scheduleText, 200);
    const meetingLink = str(body.meetingLink, 400);
    const rawStudentIds = Array.isArray(body.studentIds) ? body.studentIds : [];
    const studentIds = Array.from(
      new Set(rawStudentIds.filter((s) => isValidDocumentId(s)))
    ).slice(0, 100);
    if (name.length < 2) {
      throw new PolicyError("\u064A\u0631\u062C\u0649 \u0625\u062F\u062E\u0627\u0644 \u0627\u0633\u0645 \u0627\u0644\u062D\u0644\u0642\u0629 \u0623\u0648 \u0627\u0644\u0645\u062C\u0645\u0648\u0639\u0629.", 400, "INVALID_GROUP_NAME");
    }
    if (!isValidDocumentId(teacherUid)) {
      throw new PolicyError("\u064A\u0631\u062C\u0649 \u0627\u062E\u062A\u064A\u0627\u0631 \u0645\u0639\u0644\u0645 \u0635\u062D\u064A\u062D \u0644\u0644\u062D\u0644\u0642\u0629.", 400, "INVALID_TEACHER");
    }
    const teacherSnap = await academyRef(actor.academyId).collection("members").doc(teacherUid).get();
    if (!teacherSnap.exists) {
      throw new PolicyError("\u0627\u0644\u0645\u0639\u0644\u0645 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F \u0641\u064A \u0647\u0630\u0647 \u0627\u0644\u0623\u0643\u0627\u062F\u064A\u0645\u064A\u0629.", 404, "TEACHER_NOT_FOUND");
    }
    const teacher = teacherSnap.data();
    if (teacher.role !== "teacher" || teacher.status !== "active") {
      throw new PolicyError("\u0627\u0644\u062D\u0633\u0627\u0628 \u0627\u0644\u0645\u062E\u062A\u0627\u0631 \u0644\u064A\u0633 \u0645\u0639\u0644\u0645\u064B\u0627 \u0646\u0634\u0637\u064B\u0627 \u0641\u064A \u0627\u0644\u0623\u0643\u0627\u062F\u064A\u0645\u064A\u0629.", 400, "INVALID_TEACHER_ROLE");
    }
    const groupsCol = academyRef(actor.academyId).collection("groups");
    const studentsCol = academyRef(actor.academyId).collection("students");
    const ref = groupId ? groupsCol.doc(groupId) : groupsCol.doc();
    const existingSnap = groupId ? await ref.get() : null;
    if (groupId && (!existingSnap || !existingSnap.exists)) {
      throw new PolicyError("\u0627\u0644\u0645\u062C\u0645\u0648\u0639\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629.", 404, "GROUP_NOT_FOUND");
    }
    const previousGroup = existingSnap?.exists ? existingSnap.data() : null;
    const studentUserIds = /* @__PURE__ */ new Set();
    const parentUids = /* @__PURE__ */ new Set();
    const validStudentIds = [];
    const studentDocsMap = /* @__PURE__ */ new Map();
    for (const sid of studentIds) {
      const sSnap = await studentsCol.doc(sid).get();
      if (sSnap.exists) {
        const sData = sSnap.data();
        studentDocsMap.set(sid, sData);
        validStudentIds.push(sid);
        studentUserIds.add(sData.userId);
        for (const pUid of sData.parentUids || []) {
          parentUids.add(pUid);
        }
      }
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const groupDoc = {
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
      ...meetingLink ? { meetingLink } : {},
      status: body.status === "archived" ? "archived" : "active",
      createdAt: previousGroup?.createdAt || now,
      updatedAt: now
    };
    const batch = adminDb.batch();
    batch.set(ref, groupDoc);
    for (const [sid, sData] of studentDocsMap.entries()) {
      const nextGroupIds = Array.from(/* @__PURE__ */ new Set([...sData.groupIds || [], ref.id]));
      const nextTeacherUids = Array.from(/* @__PURE__ */ new Set([...sData.teacherUids || [], teacherUid]));
      batch.update(studentsCol.doc(sid), {
        groupIds: nextGroupIds,
        teacherUids: nextTeacherUids,
        updatedAt: now
      });
    }
    if (previousGroup) {
      const removedIds = previousGroup.studentIds.filter((id) => !validStudentIds.includes(id));
      for (const removedId of removedIds) {
        const remSnap = await studentsCol.doc(removedId).get();
        if (remSnap.exists) {
          const remData = remSnap.data();
          const remainingGroupIds = (remData.groupIds || []).filter((gid) => gid !== ref.id);
          const remainingTeachers = /* @__PURE__ */ new Set();
          for (const gid of remainingGroupIds) {
            const gSnap = await groupsCol.doc(gid).get();
            if (gSnap.exists) {
              const g = gSnap.data();
              if (g.status === "active") remainingTeachers.add(g.teacherUid);
            }
          }
          batch.update(studentsCol.doc(removedId), {
            groupIds: remainingGroupIds,
            teacherUids: Array.from(remainingTeachers),
            updatedAt: now
          });
        }
      }
    }
    await batch.commit();
    await writeAuditLog({
      academyId: actor.academyId,
      actor,
      action: previousGroup ? "UPDATE_GROUP" : "CREATE_GROUP",
      targetCollection: "groups",
      targetId: ref.id,
      details: { name, teacherUid, studentCount: validStudentIds.length }
    });
    res.status(previousGroup ? 200 : 201).json({ ok: true, group: groupDoc });
  } catch (err) {
    handleApiError(res, err);
  }
}
async function handleArchiveGroup(req, res) {
  try {
    const actor = await authenticateActor(req);
    assertCanManageGroups(actor);
    const groupId = str(req.body?.groupId, 128);
    const nextStatus = req.body?.status === "active" ? "active" : "archived";
    if (!isValidDocumentId(groupId)) {
      throw new PolicyError("\u0645\u0639\u0631\u0641 \u0627\u0644\u0645\u062C\u0645\u0648\u0639\u0629 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D.", 400, "INVALID_ID");
    }
    const ref = academyRef(actor.academyId).collection("groups").doc(groupId);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new PolicyError("\u0627\u0644\u0645\u062C\u0645\u0648\u0639\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629.", 404, "GROUP_NOT_FOUND");
    }
    await ref.update({ status: nextStatus, updatedAt: (/* @__PURE__ */ new Date()).toISOString() });
    await writeAuditLog({
      academyId: actor.academyId,
      actor,
      action: nextStatus === "archived" ? "ARCHIVE_GROUP" : "RESTORE_GROUP",
      targetCollection: "groups",
      targetId: groupId,
      details: { status: nextStatus }
    });
    res.status(200).json({ ok: true, groupId, status: nextStatus });
  } catch (err) {
    handleApiError(res, err);
  }
}
async function handleLinkParentToStudent(req, res) {
  try {
    const actor = await authenticateActor(req);
    assertCanLinkParent(actor);
    const body = req.body || {};
    const parentUid = str(body.parentUid, 128);
    const studentId = str(body.studentId, 128);
    const relation = str(body.relation, 60) || "\u0648\u0644\u064A \u0623\u0645\u0631";
    const action = body.action === "revoke" ? "revoke" : "link";
    if (!isValidDocumentId(parentUid) || !isValidDocumentId(studentId)) {
      throw new PolicyError("\u0645\u0639\u0631\u0641 \u0648\u0644\u064A \u0627\u0644\u0623\u0645\u0631 \u0623\u0648 \u0627\u0644\u0637\u0627\u0644\u0628 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D.", 400, "INVALID_IDS");
    }
    const parentSnap = await academyRef(actor.academyId).collection("members").doc(parentUid).get();
    if (!parentSnap.exists) {
      throw new PolicyError("\u062D\u0633\u0627\u0628 \u0648\u0644\u064A \u0627\u0644\u0623\u0645\u0631 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F \u0641\u064A \u0627\u0644\u0623\u0643\u0627\u062F\u064A\u0645\u064A\u0629.", 404, "PARENT_NOT_FOUND");
    }
    const parent = parentSnap.data();
    if (parent.role !== "parent") {
      throw new PolicyError("\u0627\u0644\u062D\u0633\u0627\u0628 \u0627\u0644\u0645\u062E\u062A\u0627\u0631 \u0644\u064A\u0633 \u0628\u0635\u0644\u0627\u062D\u064A\u0629 \u0648\u0644\u064A \u0623\u0645\u0631.", 400, "INVALID_PARENT_ROLE");
    }
    const studentRef = academyRef(actor.academyId).collection("students").doc(studentId);
    const studentSnap = await studentRef.get();
    if (!studentSnap.exists) {
      throw new PolicyError("\u0645\u0644\u0641 \u0627\u0644\u0637\u0627\u0644\u0628 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F.", 404, "STUDENT_NOT_FOUND");
    }
    const student = studentSnap.data();
    const linkId = `${parentUid}_${studentId}`;
    const linkRef = academyRef(actor.academyId).collection("parentLinks").doc(linkId);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const nextParentUids = action === "link" ? Array.from(/* @__PURE__ */ new Set([...student.parentUids || [], parentUid])) : (student.parentUids || []).filter((id) => id !== parentUid);
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
      status: action === "link" ? "active" : "revoked",
      approvedBy: actor.uid,
      createdAt: now,
      updatedAt: now
    });
    batch.update(studentRef, { parentUids: nextParentUids, updatedAt: now });
    for (const gid of student.groupIds || []) {
      const gRef = academyRef(actor.academyId).collection("groups").doc(gid);
      const gSnap = await gRef.get();
      if (gSnap.exists) {
        const gData = gSnap.data();
        const gParents = action === "link" ? Array.from(/* @__PURE__ */ new Set([...gData.parentUids || [], parentUid])) : (gData.parentUids || []).filter((id) => id !== parentUid);
        batch.update(gRef, { parentUids: gParents, updatedAt: now });
      }
    }
    await batch.commit();
    await writeAuditLog({
      academyId: actor.academyId,
      actor,
      action: action === "link" ? "LINK_PARENT_STUDENT" : "REVOKE_PARENT_STUDENT",
      targetCollection: "parentLinks",
      targetId: linkId,
      details: { parentUid, studentId, relation }
    });
    res.status(200).json({ ok: true, linkId, status: action === "link" ? "active" : "revoked" });
  } catch (err) {
    handleApiError(res, err);
  }
}
async function handleRecordSession(req, res) {
  try {
    const actor = await authenticateActor(req);
    const body = req.body || {};
    const groupId = str(body.groupId, 128);
    const title = str(body.title, 160);
    const scheduledDate = str(body.scheduledDate, 40) || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const durationMinutes = Math.max(10, Math.min(360, num(body.durationMinutes, 45)));
    const notes = str(body.notes, 1e3);
    const status = body.status === "completed" ? "completed" : body.status === "cancelled" ? "cancelled" : "scheduled";
    if (!isValidDocumentId(groupId) || title.length < 2) {
      throw new PolicyError("\u064A\u0631\u062C\u0649 \u062A\u062D\u062F\u064A\u062F \u0627\u0644\u062D\u0644\u0642\u0629 \u0648\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u062D\u0635\u0629.", 400, "INVALID_SESSION");
    }
    const groupSnap = await academyRef(actor.academyId).collection("groups").doc(groupId).get();
    if (!groupSnap.exists) {
      throw new PolicyError("\u0627\u0644\u062D\u0644\u0642\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629.", 404, "GROUP_NOT_FOUND");
    }
    const group = groupSnap.data();
    const canManage = actor.role === "owner" || actor.role === "supervisor" && actor.perms.includes("groups") || actor.role === "teacher" && group.teacherUid === actor.uid;
    if (!canManage) {
      throw new PolicyError("\u0644\u0627 \u064A\u0645\u0643\u0646\u0643 \u062A\u0633\u062C\u064A\u0644 \u062D\u0635\u0629 \u0644\u062D\u0644\u0642\u0629 \u063A\u064A\u0631 \u0645\u062E\u0635\u0635\u0629 \u0644\u0643.", 403, "GROUP_FORBIDDEN");
    }
    const sessionRef = academyRef(actor.academyId).collection("sessions").doc();
    const now = (/* @__PURE__ */ new Date()).toISOString();
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
      ...notes ? { notes } : {},
      status,
      createdAt: now,
      updatedAt: now
    };
    const batch = adminDb.batch();
    batch.set(sessionRef, sessionDoc);
    const attendanceItems = Array.isArray(body.attendance) ? body.attendance : [];
    const evaluationItems = Array.isArray(body.evaluations) ? body.evaluations : [];
    for (const item of attendanceItems) {
      if (!item || typeof item !== "object") continue;
      const entry = item;
      const studentId = str(entry.studentId, 128);
      if (!isValidDocumentId(studentId)) continue;
      const sSnap = await academyRef(actor.academyId).collection("students").doc(studentId).get();
      if (!sSnap.exists) continue;
      const student = sSnap.data();
      const attStatus = ["present", "absent", "late", "excused"].includes(String(entry.status)) ? String(entry.status) : "present";
      const attRef = academyRef(actor.academyId).collection("attendance").doc();
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
        updatedAt: now
      });
    }
    for (const item of evaluationItems) {
      if (!item || typeof item !== "object") continue;
      const entry = item;
      const studentId = str(entry.studentId, 128);
      if (!isValidDocumentId(studentId)) continue;
      const sSnap = await academyRef(actor.academyId).collection("students").doc(studentId).get();
      if (!sSnap.exists) continue;
      const student = sSnap.data();
      const pointsAwarded = Math.max(0, Math.min(100, num(entry.pointsAwarded, 10)));
      const evalRef = academyRef(actor.academyId).collection("evaluations").doc();
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
        ...str(entry.certificateTitle, 160) ? { certificateTitle: str(entry.certificateTitle, 160) } : {},
        ...str(entry.notes, 1e3) ? { notes: str(entry.notes, 1e3) } : {},
        evaluatedAt: scheduledDate,
        createdAt: now
      });
      batch.update(academyRef(actor.academyId).collection("students").doc(studentId), {
        points: (student.points || 0) + pointsAwarded,
        updatedAt: now
      });
    }
    await batch.commit();
    await writeAuditLog({
      academyId: actor.academyId,
      actor,
      action: "RECORD_SESSION",
      targetCollection: "sessions",
      targetId: sessionRef.id,
      details: {
        groupId,
        attendanceCount: attendanceItems.length,
        evaluationCount: evaluationItems.length
      }
    });
    res.status(201).json({ ok: true, session: sessionDoc });
  } catch (err) {
    handleApiError(res, err);
  }
}
async function handleCreateInvoice(req, res) {
  try {
    const actor = await authenticateActor(req);
    assertCanAccessFinance(actor);
    const body = req.body || {};
    const studentId = str(body.studentId, 128);
    const title = str(body.title, 160);
    const amount = num(body.amount, 0);
    const currency = str(body.currency, 12) || "SAR";
    const dueDate = str(body.dueDate, 40) || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    if (!isValidDocumentId(studentId) || title.length < 2 || amount <= 0) {
      throw new PolicyError("\u064A\u0631\u062C\u0649 \u0625\u062F\u062E\u0627\u0644 \u0628\u064A\u0627\u0646\u0627\u062A \u0641\u0627\u062A\u0648\u0631\u0629 \u0635\u062D\u064A\u062D\u0629 \u0648\u0645\u0628\u0644\u063A \u0623\u0643\u0628\u0631 \u0645\u0646 \u0635\u0641\u0631.", 400, "INVALID_INVOICE");
    }
    const studentSnap = await academyRef(actor.academyId).collection("students").doc(studentId).get();
    if (!studentSnap.exists) {
      throw new PolicyError("\u0627\u0644\u0637\u0627\u0644\u0628 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F.", 404, "STUDENT_NOT_FOUND");
    }
    const student = studentSnap.data();
    const ref = academyRef(actor.academyId).collection("invoices").doc();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const invoice = {
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
      status: "pending",
      createdBy: actor.uid,
      createdAt: now,
      updatedAt: now
    };
    await ref.set(invoice);
    await writeAuditLog({
      academyId: actor.academyId,
      actor,
      action: "CREATE_INVOICE",
      targetCollection: "invoices",
      targetId: ref.id,
      details: { studentId, amount, currency }
    });
    res.status(201).json({ ok: true, invoice });
  } catch (err) {
    handleApiError(res, err);
  }
}
async function handleRecordPayment(req, res) {
  try {
    const actor = await authenticateActor(req);
    assertCanAccessFinance(actor);
    const body = req.body || {};
    const invoiceId = str(body.invoiceId, 128);
    const amount = num(body.amount, 0);
    const method = ["cash", "bank_transfer", "card", "online"].includes(String(body.method)) ? String(body.method) : "bank_transfer";
    const reference = str(body.reference, 120);
    if (!isValidDocumentId(invoiceId) || amount <= 0) {
      throw new PolicyError("\u064A\u0631\u062C\u0649 \u062A\u062D\u062F\u064A\u062F \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u0648\u0645\u0628\u0644\u063A \u0627\u0644\u0633\u062F\u0627\u062F.", 400, "INVALID_PAYMENT");
    }
    const invoiceRef = academyRef(actor.academyId).collection("invoices").doc(invoiceId);
    const invoiceSnap = await invoiceRef.get();
    if (!invoiceSnap.exists) {
      throw new PolicyError("\u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629.", 404, "INVOICE_NOT_FOUND");
    }
    const invoice = invoiceSnap.data();
    const newPaid = Math.min(invoice.amount, (invoice.paidAmount || 0) + amount);
    const newStatus = newPaid >= invoice.amount ? "paid" : "partial";
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const payRef = academyRef(actor.academyId).collection("payments").doc();
    const payment = {
      id: payRef.id,
      academyId: actor.academyId,
      invoiceId,
      studentId: invoice.studentId,
      studentName: invoice.studentName,
      amount,
      currency: invoice.currency,
      method,
      ...reference ? { reference } : {},
      recordedBy: actor.uid,
      paidAt: now.slice(0, 10),
      createdAt: now
    };
    const batch = adminDb.batch();
    batch.set(payRef, payment);
    batch.update(invoiceRef, { paidAmount: newPaid, status: newStatus, updatedAt: now });
    await batch.commit();
    await writeAuditLog({
      academyId: actor.academyId,
      actor,
      action: "RECORD_PAYMENT",
      targetCollection: "payments",
      targetId: payRef.id,
      details: { invoiceId, amount, newStatus }
    });
    res.status(201).json({ ok: true, payment });
  } catch (err) {
    handleApiError(res, err);
  }
}
async function handleCreatePayroll(req, res) {
  try {
    const actor = await authenticateActor(req);
    assertCanAccessPayroll(actor);
    const body = req.body || {};
    const memberUid = str(body.memberUid, 128);
    const periodMonth = str(body.periodMonth, 20);
    const baseAmount = Math.max(0, num(body.baseAmount, 0));
    const bonusAmount = Math.max(0, num(body.bonusAmount, 0));
    const deductionAmount = Math.max(0, num(body.deductionAmount, 0));
    const currency = str(body.currency, 12) || "SAR";
    const status = ["draft", "approved", "paid"].includes(String(body.status)) ? String(body.status) : "approved";
    const notes = str(body.notes, 500);
    if (!isValidDocumentId(memberUid) || !periodMonth) {
      throw new PolicyError("\u064A\u0631\u062C\u0649 \u062A\u062D\u062F\u064A\u062F \u0627\u0644\u0639\u0636\u0648 \u0648\u0627\u0644\u0634\u0647\u0631.", 400, "INVALID_PAYROLL");
    }
    const memberSnap = await academyRef(actor.academyId).collection("members").doc(memberUid).get();
    if (!memberSnap.exists) {
      throw new PolicyError("\u0627\u0644\u0639\u0636\u0648 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F.", 404, "MEMBER_NOT_FOUND");
    }
    const member = memberSnap.data();
    const netAmount = Math.max(0, baseAmount + bonusAmount - deductionAmount);
    const ref = academyRef(actor.academyId).collection("payroll").doc();
    const now = (/* @__PURE__ */ new Date()).toISOString();
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
      ...notes ? { notes } : {},
      createdBy: actor.uid,
      createdAt: now,
      updatedAt: now
    };
    await ref.set(record);
    await writeAuditLog({
      academyId: actor.academyId,
      actor,
      action: "CREATE_PAYROLL",
      targetCollection: "payroll",
      targetId: ref.id,
      details: { memberUid, periodMonth, netAmount, status }
    });
    res.status(201).json({ ok: true, payroll: record });
  } catch (err) {
    handleApiError(res, err);
  }
}
async function handleUpsertLead(req, res) {
  try {
    const actor = await authenticateActor(req);
    assertCanAccessCrm(actor);
    const body = req.body || {};
    const leadId = str(body.id, 128);
    const fullName = str(body.fullName, 120);
    const phone = str(body.phone, 40);
    const email = str(body.email, 200);
    const interestTrack = str(body.interestTrack, 120) || "\u062A\u062D\u0641\u064A\u0638 \u0627\u0644\u0642\u0631\u0622\u0646";
    const source = str(body.source, 80) || "\u0645\u0628\u0627\u0634\u0631";
    const stage = ["new", "contacted", "trial", "enrolled", "lost"].includes(String(body.stage)) ? String(body.stage) : "new";
    const notes = str(body.notes, 800);
    if (fullName.length < 2 || phone.length < 5) {
      throw new PolicyError("\u064A\u0631\u062C\u0649 \u0625\u062F\u062E\u0627\u0644 \u0627\u0644\u0627\u0633\u0645 \u0648\u0631\u0642\u0645 \u0627\u0644\u0647\u0627\u062A\u0641.", 400, "INVALID_LEAD");
    }
    const col = academyRef(actor.academyId).collection("leads");
    const now = (/* @__PURE__ */ new Date()).toISOString();
    if (leadId) {
      if (!isValidDocumentId(leadId)) {
        throw new PolicyError("\u0645\u0639\u0631\u0641 \u0627\u0644\u0633\u062C\u0644 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D.", 400, "INVALID_ID");
      }
      const ref2 = col.doc(leadId);
      const snap = await ref2.get();
      if (!snap.exists) {
        throw new PolicyError("\u0627\u0644\u0633\u062C\u0644 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F.", 404, "LEAD_NOT_FOUND");
      }
      await ref2.update({
        fullName,
        phone,
        ...email ? { email } : {},
        interestTrack,
        source,
        stage,
        ...notes ? { notes } : {},
        updatedAt: now
      });
      await writeAuditLog({
        academyId: actor.academyId,
        actor,
        action: "UPDATE_LEAD",
        targetCollection: "leads",
        targetId: leadId,
        details: { stage }
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
      ...email ? { email } : {},
      interestTrack,
      source,
      stage,
      ...notes ? { notes } : {},
      createdBy: actor.uid,
      createdAt: now,
      updatedAt: now
    };
    await ref.set(lead);
    await writeAuditLog({
      academyId: actor.academyId,
      actor,
      action: "CREATE_LEAD",
      targetCollection: "leads",
      targetId: ref.id,
      details: { fullName, stage }
    });
    res.status(201).json({ ok: true, lead });
  } catch (err) {
    handleApiError(res, err);
  }
}
async function handleCreateConversation(req, res) {
  try {
    const actor = await authenticateActor(req);
    const body = req.body || {};
    const title = str(body.title, 160);
    const rawUids = Array.isArray(body.participantUids) ? body.participantUids : [];
    const participantUids = Array.from(
      /* @__PURE__ */ new Set([actor.uid, ...rawUids.filter((u) => isValidDocumentId(u))])
    ).slice(0, 20);
    if (title.length < 2 || participantUids.length < 2) {
      throw new PolicyError("\u064A\u0631\u062C\u0649 \u0625\u062F\u062E\u0627\u0644 \u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0629 \u0648\u0627\u062E\u062A\u064A\u0627\u0631 \u0645\u0634\u0627\u0631\u0643 \u0648\u0627\u062D\u062F \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644.", 400, "INVALID_CONVERSATION");
    }
    const participantNames = {};
    for (const uid of participantUids) {
      const mSnap = await academyRef(actor.academyId).collection("members").doc(uid).get();
      if (!mSnap.exists) {
        throw new PolicyError("\u0623\u062D\u062F \u0627\u0644\u0645\u0634\u0627\u0631\u0643\u064A\u0646 \u063A\u064A\u0631 \u0645\u0646\u062A\u0645\u064D \u0644\u0647\u0630\u0647 \u0627\u0644\u0623\u0643\u0627\u062F\u064A\u0645\u064A\u0629.", 403, "INVALID_PARTICIPANT");
      }
      const mData = mSnap.data();
      participantNames[uid] = mData.name;
    }
    const ref = academyRef(actor.academyId).collection("conversations").doc();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const docData = {
      id: ref.id,
      academyId: actor.academyId,
      title,
      participantUids,
      participantNames,
      lastMessageText: "",
      lastMessageAt: now,
      createdBy: actor.uid,
      createdAt: now
    };
    await ref.set(docData);
    res.status(201).json({ ok: true, conversation: docData });
  } catch (err) {
    handleApiError(res, err);
  }
}
async function handleSendNotification(req, res) {
  try {
    const actor = await authenticateActor(req);
    if (!["owner", "supervisor", "teacher"].includes(actor.role)) {
      throw new PolicyError("\u0644\u064A\u0633 \u0644\u062F\u064A\u0643 \u0635\u0644\u0627\u062D\u064A\u0629 \u0625\u0631\u0633\u0627\u0644 \u0625\u0634\u0639\u0627\u0631\u0627\u062A.", 403, "NOTIFICATION_FORBIDDEN");
    }
    const body = req.body || {};
    const title = str(body.title, 160);
    const messageBody = str(body.body, 600);
    const category = ["session", "evaluation", "finance", "system", "message"].includes(String(body.category)) ? String(body.category) : "system";
    const rawRecipients = Array.isArray(body.recipientUids) ? body.recipientUids : [];
    const recipientUids = Array.from(
      new Set(rawRecipients.filter((u) => isValidDocumentId(u)))
    ).slice(0, 150);
    if (title.length < 2 || messageBody.length < 2 || recipientUids.length === 0) {
      throw new PolicyError("\u064A\u0631\u062C\u0649 \u062A\u062D\u062F\u064A\u062F \u0627\u0644\u0645\u0633\u062A\u0644\u0645\u064A\u0646 \u0648\u0639\u0646\u0648\u0627\u0646 \u0648\u0646\u0635 \u0627\u0644\u0625\u0634\u0639\u0627\u0631.", 400, "INVALID_NOTIFICATION");
    }
    const ref = academyRef(actor.academyId).collection("notifications").doc();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const notification = {
      id: ref.id,
      academyId: actor.academyId,
      recipientUids,
      title,
      body: messageBody,
      category,
      createdBy: actor.uid,
      readBy: [],
      createdAt: now
    };
    await ref.set(notification);
    const tokens = [];
    for (const uid of recipientUids.slice(0, 50)) {
      const tSnap = await academyRef(actor.academyId).collection("fcmTokens").doc(uid).get();
      if (tSnap.exists) {
        const token = tSnap.data().token;
        if (token) tokens.push(token);
      }
    }
    let fcmSent = 0;
    if (tokens.length > 0) {
      try {
        const pushRes = await adminMessaging.sendEachForMulticast({
          tokens,
          notification: { title, body: messageBody },
          data: { academyId: actor.academyId, category }
        });
        fcmSent = pushRes.successCount;
      } catch {
      }
    }
    res.status(201).json({ ok: true, notification, fcmSent });
  } catch (err) {
    handleApiError(res, err);
  }
}
async function handleRegisterResource(req, res) {
  try {
    const actor = await authenticateActor(req);
    if (!["owner", "supervisor", "teacher"].includes(actor.role)) {
      throw new PolicyError("\u0644\u064A\u0633 \u0644\u062F\u064A\u0643 \u0635\u0644\u0627\u062D\u064A\u0629 \u0631\u0641\u0639 \u0645\u0644\u0641\u0627\u062A \u062A\u0639\u0644\u064A\u0645\u064A\u0629.", 403, "RESOURCE_FORBIDDEN");
    }
    const body = req.body || {};
    const groupId = str(body.groupId, 128);
    const title = str(body.title, 160);
    const fileName = str(body.fileName, 200);
    const storagePath = str(body.storagePath, 400);
    const downloadUrl = str(body.downloadUrl, 1e3);
    const contentType = str(body.contentType, 120) || "application/octet-stream";
    const sizeBytes = Math.max(0, num(body.sizeBytes, 0));
    if (!isValidDocumentId(groupId) || !title || !storagePath || !downloadUrl) {
      throw new PolicyError("\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u0644\u0641 \u063A\u064A\u0631 \u0645\u0643\u062A\u0645\u0644\u0629.", 400, "INVALID_RESOURCE");
    }
    const groupSnap = await academyRef(actor.academyId).collection("groups").doc(groupId).get();
    if (!groupSnap.exists) {
      throw new PolicyError("\u0627\u0644\u062D\u0644\u0642\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629.", 404, "GROUP_NOT_FOUND");
    }
    const group = groupSnap.data();
    if (actor.role === "teacher" && group.teacherUid !== actor.uid) {
      throw new PolicyError("\u0644\u0627 \u064A\u0645\u0643\u0646\u0643 \u0631\u0641\u0639 \u0645\u0644\u0641 \u0644\u062D\u0644\u0642\u0629 \u0645\u0639\u0644\u0645 \u0622\u062E\u0631.", 403, "GROUP_FORBIDDEN");
    }
    const ref = academyRef(actor.academyId).collection("resources").doc();
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
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    await ref.set(resource);
    await writeAuditLog({
      academyId: actor.academyId,
      actor,
      action: "UPLOAD_RESOURCE",
      targetCollection: "resources",
      targetId: ref.id,
      details: { groupId, fileName, sizeBytes }
    });
    res.status(201).json({ ok: true, resource });
  } catch (err) {
    handleApiError(res, err);
  }
}

// server.ts
var PORT = Number(process.env.PORT || 3e3);
async function startServer() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "\u0645\u0646\u0635\u0629 \u0627\u0644\u0623\u0643\u0627\u062F\u064A\u0645\u064A\u0627\u062A" });
  });
  app.post("/api/members/create", (req, res) => void handleCreateMember(req, res));
  app.post("/api/members/disable", (req, res) => void handleDisableMember(req, res));
  app.post("/api/members/permissions", (req, res) => void handleUpdatePermissions(req, res));
  app.post("/api/students/upsert", (req, res) => void handleUpsertStudent(req, res));
  app.post("/api/students/archive", (req, res) => void handleArchiveStudent(req, res));
  app.post("/api/groups/upsert", (req, res) => void handleCreateOrUpdateGroup(req, res));
  app.post("/api/groups/archive", (req, res) => void handleArchiveGroup(req, res));
  app.post("/api/parent-links/link", (req, res) => void handleLinkParentToStudent(req, res));
  app.post("/api/sessions/record", (req, res) => void handleRecordSession(req, res));
  app.post("/api/finance/invoice", (req, res) => void handleCreateInvoice(req, res));
  app.post("/api/finance/payment", (req, res) => void handleRecordPayment(req, res));
  app.post("/api/finance/payroll", (req, res) => void handleCreatePayroll(req, res));
  app.post("/api/crm/lead", (req, res) => void handleUpsertLead(req, res));
  app.post("/api/conversations/create", (req, res) => void handleCreateConversation(req, res));
  app.post("/api/notifications/send", (req, res) => void handleSendNotification(req, res));
  app.post("/api/resources/register", (req, res) => void handleRegisterResource(req, res));
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path2.resolve(process.cwd(), "dist");
    app.use(express.static(distDir));
    app.get("*", (_req, res) => {
      const indexHtml = path2.join(distDir, "index.html");
      if (fs2.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send("Build artifacts not found.");
      }
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Academy server listening on http://0.0.0.0:${PORT}`);
  });
}
startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
