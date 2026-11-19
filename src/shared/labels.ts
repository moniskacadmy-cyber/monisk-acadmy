import type { AcademyRole, SupervisorPermission } from './types';

export const ROLE_LABELS: Record<AcademyRole, string> = {
  owner: 'مدير الأكاديمية',
  supervisor: 'مشرف',
  teacher: 'معلم',
  student: 'طالب',
  parent: 'ولي أمر',
};

export const PERMISSION_LABELS: Record<SupervisorPermission, string> = {
  students: 'إدارة الطلاب',
  teachers: 'إدارة المعلمين',
  groups: 'إدارة الحلقات والمجموعات',
  supervisors: 'إنشاء وإدارة المشرفين',
  parents: 'ربط أولياء الأمور',
  finance: 'المالية والفواتير والمدفوعات',
  payroll: 'الرواتب والمستحقات',
  crm: 'إدارة المسجلين الجدد (CRM)',
  reports: 'التقارير الشاملة',
};

export const ATTENDANCE_LABELS: Record<string, string> = {
  present: 'حاضر',
  absent: 'غائب',
  late: 'متأخر',
  excused: 'معذور',
};

export const LEAD_STAGE_LABELS: Record<string, string> = {
  new: 'طلب جديد',
  contacted: 'تم التواصل',
  trial: 'حصة تجريبية',
  enrolled: 'تم التسجيل',
  lost: 'غير مهتم',
};

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  pending: 'قيد الانتظار',
  partial: 'مدفوعة جزئيًا',
  paid: 'مدفوعة بالكامل',
  overdue: 'متأخرة',
  cancelled: 'ملغاة',
};

export function formatDateArabic(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('ar-SA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

export function formatCurrency(amount: number, currency = 'SAR'): string {
  return `${Number(amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} ${currency}`;
}
