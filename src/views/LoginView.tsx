import React, { useState } from 'react';
import { Lock, Mail, Moon, Shield, Sun } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

export function LoginView() {
  const { signIn } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await signIn(email, password);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('invalid-credential') || msg.includes('wrong-password') || msg.includes('user-not-found')) {
        setError('البريد الإلكتروني أو كلمة المرور غير صحيحة.');
      } else if (msg.includes('too-many-requests')) {
        setError('تم تجاوز عدد المحاولات المسموح بها. يرجى الانتظار قليلًا.');
      } else if (msg.includes('user-disabled')) {
        setError('تم تعطيل هذا الحساب من قبل إدارة الأكاديمية.');
      } else {
        setError('تعذر تسجيل الدخول. تأكد من تفعيل مصادقة البريد وكلمة المرور واتصالك بالإنترنت.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-between bg-slate-50 px-4 py-8 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between">
        <span className="font-display text-lg font-bold text-slate-900 dark:text-white">
          منصة الأكاديميات
        </span>
        <button
          type="button"
          onClick={toggleTheme}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          aria-label="تبديل المظهر"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>

      <div className="mx-auto my-8 w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 sm:p-8 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-6">
          <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-400">
            <Shield className="h-5 w-5" />
          </div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            تسجيل الدخول إلى الأكاديمية
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            الدخول متاح فقط للحسابات المعتمدة من إدارة الأكاديمية. لا يوجد تسجيل عام.
          </p>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <label htmlFor="login-email" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              البريد الإلكتروني
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute top-3 right-3 h-4 w-4 text-slate-400" />
              <input
                id="login-email"
                type="email"
                required
                autoComplete="email"
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@academy.com"
                className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pr-10 pl-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label htmlFor="login-password" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              كلمة المرور
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute top-3 right-3 h-4 w-4 text-slate-400" />
              <input
                id="login-password"
                type="password"
                required
                autoComplete="current-password"
                dir="ltr"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pr-10 pl-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-800 disabled:opacity-60 dark:bg-teal-600 dark:hover:bg-teal-700"
          >
            {submitting ? 'جاري التحقق من الصلاحيات...' : 'دخول آمن'}
          </button>
        </form>
      </div>

      <footer className="mx-auto w-full max-w-5xl text-center text-xs text-slate-500 dark:text-slate-400">
        عزل كامل لكل أكاديمية عبر Custom Claims وقواعد Firestore الآمنة
      </footer>
    </div>
  );
}
