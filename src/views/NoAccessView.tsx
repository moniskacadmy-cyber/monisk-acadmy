import { RefreshCw, ShieldAlert, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export function NoAccessView() {
  const { user, accessState, accessMessage, signOut, refreshClaims } = useAuth();

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-6 sm:p-8 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400">
          <ShieldAlert className="h-6 w-6" />
        </div>

        <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">
          {accessState === 'disabled'
            ? 'الحساب موقوف مؤقتًا'
            : 'الحساب غير مرتبط بأكاديمية'}
        </h1>

        <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          {accessMessage || 'لا يملك هذا الحساب صلاحية دخول لأي أكاديمية حاليًا.'}
        </p>

        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
          <p className="font-semibold text-slate-900 dark:text-white">بيانات الجلسة الحالية:</p>
          <p className="mt-1 font-mono" dir="ltr">
            {user?.email} ({user?.uid})
          </p>
          <p className="mt-2 text-slate-500 dark:text-slate-400">
            وفق سياسة الأمان، لا يستطيع المستخدم بدون <span className="font-mono">academyId</span>{' '}
            قراءة أو تعديل أي بيانات. لتأسيس المدير الأول لأكاديمية جديدة، يشغّل المسؤول سكربت{' '}
            <span className="font-mono">npm run seed:owner</span> من الخادم مرة واحدة فقط.
          </p>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void refreshClaims()}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-800"
          >
            <RefreshCw className="h-4 w-4" />
            <span>إعادة فحص الصلاحيات</span>
          </button>
          <button
            type="button"
            onClick={() => void signOut()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <LogOut className="h-4 w-4" />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </div>
    </div>
  );
}
