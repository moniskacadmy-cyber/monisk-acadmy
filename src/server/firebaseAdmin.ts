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

function createAdminApp(): App {
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
        privateKey: privateKey.replace(/\\n/g, '\n'),
      }),
      projectId,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || appletConfig.storageBucket,
    });
  }

  // Application Default Credentials (AI Studio preview environment)
  return initializeApp({
    ...(projectId ? { projectId } : {}),
    ...(appletConfig.storageBucket ? { storageBucket: appletConfig.storageBucket } : {}),
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
