import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'حدث خطأ غير متوقع في التطبيق.',
    };
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div
          dir="rtl"
          className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-slate-900 dark:bg-slate-950 dark:text-slate-100"
        >
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-slate-900">
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">
              تعذر عرض هذه الصفحة
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              تم إيقاف العملية لحماية بيانات الأكاديمية أو بسبب تعذر صلاحيات الوصول.
            </p>
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 font-mono text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
              {this.state.errorMessage}
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-6 rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-800"
            >
              إعادة تحميل المنصة
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
