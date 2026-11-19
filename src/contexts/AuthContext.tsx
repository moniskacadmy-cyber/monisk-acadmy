import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, testConnection } from '../lib/firebase';
import { sanitizePermissions } from '../shared/policy';
import type { AcademyDoc, AcademyRole, ActorContext, MemberDoc } from '../shared/types';

export type AccessState =
  | 'loading'
  | 'unauthenticated'
  | 'no_academy'
  | 'disabled'
  | 'authorized';

interface AuthContextValue {
  user: User | null;
  actor: ActorContext | null;
  academy: AcademyDoc | null;
  accessState: AccessState;
  accessMessage: string;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshClaims: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const VALID_ROLES: AcademyRole[] = ['owner', 'supervisor', 'teacher', 'student', 'parent'];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [actor, setActor] = useState<ActorContext | null>(null);
  const [academy, setAcademy] = useState<AcademyDoc | null>(null);
  const [accessState, setAccessState] = useState<AccessState>('loading');
  const [accessMessage, setAccessMessage] = useState('');

  const resolveUserContext = useCallback(async (firebaseUser: User | null) => {
    if (!firebaseUser) {
      setUser(null);
      setActor(null);
      setAcademy(null);
      setAccessState('unauthenticated');
      setAccessMessage('');
      return;
    }

    setUser(firebaseUser);
    setAccessState('loading');

    try {
      const tokenResult = await firebaseUser.getIdTokenResult(true);
      const claims = tokenResult.claims;
      const academyId = typeof claims.academyId === 'string' ? claims.academyId : '';
      const role = typeof claims.role === 'string' ? (claims.role as AcademyRole) : null;
      const claimStatus = claims.status;

      if (!academyId || !role || !VALID_ROLES.includes(role)) {
        setActor(null);
        setAcademy(null);
        setAccessState('no_academy');
        setAccessMessage(
          'هذا الحساب مسجل في المصادقة، لكنه غير مرتبط بأي أكاديمية أو دور معتمد.'
        );
        return;
      }

      if (claimStatus !== 'active') {
        setActor(null);
        setAcademy(null);
        setAccessState('disabled');
        setAccessMessage('تم تعطيل صلاحية هذا الحساب من إدارة الأكاديمية.');
        return;
      }

      const memberSnap = await getDoc(doc(db, 'academies', academyId, 'members', firebaseUser.uid));
      if (!memberSnap.exists()) {
        setActor(null);
        setAcademy(null);
        setAccessState('no_academy');
        setAccessMessage('سجل العضوية غير موجود داخل الأكاديمية.');
        return;
      }

      const memberData = memberSnap.data() as MemberDoc;
      if (memberData.status !== 'active') {
        setActor(null);
        setAcademy(null);
        setAccessState('disabled');
        setAccessMessage('تم إيقاف هذا الحساب حاليًا. يرجى مراجعة إدارة الأكاديمية.');
        return;
      }

      const academySnap = await getDoc(doc(db, 'academies', academyId));
      const academyData = academySnap.exists() ? (academySnap.data() as AcademyDoc) : null;

      setAcademy(academyData);
      setActor({
        uid: firebaseUser.uid,
        email: firebaseUser.email || memberData.email || '',
        academyId,
        role: memberData.role,
        perms: sanitizePermissions(memberData.perms),
        status: memberData.status,
      });
      setAccessState('authorized');
      setAccessMessage('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'تعذر التحقق من صلاحيات الحساب.';
      setActor(null);
      setAcademy(null);
      setAccessState('no_academy');
      setAccessMessage(msg);
    }
  }, []);

  useEffect(() => {
    void testConnection();
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      void resolveUserContext(firebaseUser);
    });
    return () => unsub();
  }, [resolveUserContext]);

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email.trim(), password);
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  const refreshClaims = async () => {
    if (auth.currentUser) {
      await resolveUserContext(auth.currentUser);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        actor,
        academy,
        accessState,
        accessMessage,
        signIn,
        signOut,
        refreshClaims,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
