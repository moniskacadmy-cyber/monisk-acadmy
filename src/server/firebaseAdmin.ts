import fs from 'node:fs';
import path from 'node:path';
import { cert, getApp, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';

interface AppletConfig {
  projectId?: string;
  firestoreDatabaseId?: string;
  storageBucket?: string;
}

function loadAppletConfig(): AppletConfig {
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(raw) as AppletConfig;
    }
  } catch {
    // Fallback to environment variables when deployed externally (e.g. Vercel)
  }
  return {};
}

const appletConfig = loadAppletConfig();

function normalizePrivateKey(rawKey?: string): string | null {
  if (!rawKey) return null;

  let candidate = rawKey.trim();
  if (!candidate) return null;

  // Strip trailing comma if copied directly from a JSON file
  if (candidate.endsWith(',')) {
    candidate = candidate.slice(0, -1).trim();
  }

  // Unwrap JSON-quoted string or full service account JSON object
  if (candidate.startsWith('{')) {
    try {
      const parsed = JSON.parse(candidate) as { private_key?: unknown };
      if (typeof parsed.private_key === 'string') {
        candidate = parsed.private_key.trim();
      }
    } catch {
      // Continue with raw candidate
    }
  } else if (
    (candidate.startsWith('"') && candidate.endsWith('"')) ||
    (candidate.startsWith("'") && candidate.endsWith("'"))
  ) {
    try {
      const unquoted = JSON.parse(
        candidate.startsWith("'") ? `"${candidate.slice(1, -1).replace(/"/g, '\\"')}"` : candidate
      );
      if (typeof unquoted === 'string') {
        candidate = unquoted.trim();
      }
    } catch {
      candidate = candidate.slice(1, -1).trim();
    }
  }

  // Decode base64-encoded PEM if applicable (e.g., LS0tLS1CRUdJTi...)
  if (!candidate.includes('-----BEGIN') && /^[A-Za-z0-9+/=\s]+$/.test(candidate)) {
    try {
      const decoded = Buffer.from(candidate.replace(/\s+/g, ''), 'base64').toString('utf8').trim();
      if (decoded.includes('-----BEGIN')) {
        candidate = decoded;
      }
    } catch {
      // Ignore invalid base64
    }
  }

  // Normalize escaped newlines (including double-escaped \\n) and CRLF
  candidate = candidate
    .replace(/\\\\r\\\\n/g, '\n')
    .replace(/\\\\n/g, '\n')
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .trim();

  // Reconstruct valid 64-char PEM lines if newlines inside the key body were flattened to spaces
  const pemMatch = candidate.match(
    /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]+?)-----END \1-----/
  );
  if (!pemMatch) {
    return null;
  }

  const label = pemMatch[1];
  const body = pemMatch[2].replace(/\s+/g, '');
  if (!body) {
    return null;
  }

  const wrappedBody = body.match(/.{1,64}/g)?.join('\n') || body;
  return `-----BEGIN ${label}-----\n${wrappedBody}\n-----END ${label}-----\n`;
}

function createAdminApp(): App {
  if (getApps().length > 0) {
    return getApp();
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || appletConfig.projectId;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const normalizedPrivateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || appletConfig.storageBucket;

  if (projectId && clientEmail && normalizedPrivateKey) {
    try {
      return initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey: normalizedPrivateKey,
        }),
        projectId,
        ...(storageBucket ? { storageBucket } : {}),
      });
    } catch (err) {
      console.warn(
        '[Firebase Admin] Failed to initialize with FIREBASE_PRIVATE_KEY; falling back to Application Default Credentials:',
        err instanceof Error ? err.message : String(err)
      );
    }
  } else if (process.env.FIREBASE_PRIVATE_KEY) {
    console.warn(
      '[Firebase Admin] FIREBASE_PRIVATE_KEY is not a valid PEM private key; falling back to Application Default Credentials.'
    );
  }

  // Application Default Credentials (AI Studio preview environment)
  return initializeApp({
    ...(projectId ? { projectId } : {}),
    ...(storageBucket ? { storageBucket } : {}),
  });
}

const adminApp = createAdminApp();
const databaseId = process.env.FIREBASE_DATABASE_ID || appletConfig.firestoreDatabaseId;

export const adminAuth: Auth = getAuth(adminApp);
export const adminDb: Firestore =
  databaseId && databaseId !== '(default)'
    ? getFirestore(adminApp, databaseId)
    : getFirestore(adminApp);
export const adminMessaging: Messaging = getMessaging(adminApp);
export const resolvedProjectId = process.env.FIREBASE_PROJECT_ID || appletConfig.projectId || '';
export const resolvedDatabaseId = databaseId || '(default)';
