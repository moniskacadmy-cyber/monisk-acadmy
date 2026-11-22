import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  doc,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
} from 'firebase/firestore';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { getStorage } from 'firebase/storage';
import appletConfig from '../../firebase-applet-config.json';

function envOrFallback(envVal: string | undefined, fallback: string): string {
  const trimmed = envVal?.trim();
  return trimmed ? trimmed : fallback;
}

const firebaseConfig = {
  apiKey: envOrFallback(import.meta.env.VITE_FIREBASE_API_KEY, appletConfig.apiKey),
  authDomain: envOrFallback(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN, appletConfig.authDomain),
  projectId: envOrFallback(import.meta.env.VITE_FIREBASE_PROJECT_ID, appletConfig.projectId),
  storageBucket: envOrFallback(
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    appletConfig.storageBucket
  ),
  messagingSenderId: envOrFallback(
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appletConfig.messagingSenderId
  ),
  appId: envOrFallback(import.meta.env.VITE_FIREBASE_APP_ID, appletConfig.appId),
};

const databaseId = envOrFallback(
  import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID,
  appletConfig.firestoreDatabaseId
);

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

function initDb() {
  const targetDatabaseId =
    databaseId && databaseId !== '(default)' ? databaseId : undefined;
  try {
    return initializeFirestore(
      app,
      { experimentalForceLongPolling: true },
      targetDatabaseId
    );
  } catch {
    return targetDatabaseId ? getFirestore(app, targetDatabaseId) : getFirestore(app);
  }
}

export const db = initDb();
export const storage = getStorage(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): void {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
}

export async function testConnection(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return false;
  }
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      try {
        const dbName = encodeURIComponent(databaseId || '(default)');
        const probeUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
          firebaseConfig.projectId
        )}/databases/${dbName}/documents/test/connection?key=${encodeURIComponent(
          firebaseConfig.apiKey
        )}`;
        const res = await fetch(probeUrl);
        if (res.status === 200 || res.status === 401 || res.status === 403) {
          return true;
        }
        console.error('Please check your Firebase configuration (client is offline).');
        return false;
      } catch {
        console.warn('Firestore connection check skipped: network appears offline.');
        return false;
      }
    }
    // permission-denied means we reached the live Firestore backend successfully
    return true;
  }
}

export async function registerWebPushToken(): Promise<string | null> {
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
  if (!vapidKey) return null;
  const supported = await isSupported().catch(() => false);
  if (!supported || typeof window === 'undefined' || !('Notification' in window)) return null;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return null;

  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  const messaging = getMessaging(app);
  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: registration,
  });
  return token || null;
}
