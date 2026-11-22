// Pure earnings helpers shared by the server, tests and UI.
// A session's amount = hourly rate × duration. It is split equally between the students who attended.

export const ATTENDED_STATUSES = ['present', 'late'] as const;

export interface SessionFinanceDoc {
  id: string;
  academyId: string;
  sessionId: string;
  teacherUid: string;
  groupId: string;
  groupName: string;
  title: string;
  scheduledDate: string;
  durationMinutes: number;
  /** Rate in effect when the report was recorded. Null when the teacher had no rate. */
  hourlyRate: number | null;
  amount: number;
  /** True when the report was created later by the backfill (rate taken at backfill time). */
  legacy?: boolean;
  createdAt: string;
}

export interface TeacherRateDoc {
  uid: string;
  academyId: string;
  hourlyRate: number;
  updatedBy: string;
  updatedAt: string;
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calcSessionAmount(hourlyRate: number | null | undefined, durationMinutes: number): number {
  if (!hourlyRate || hourlyRate <= 0 || !durationMinutes || durationMinutes <= 0) return 0;
  return roundMoney((hourlyRate * durationMinutes) / 60);
}

/** Splits an amount equally among students. Returns an empty map when nobody attended. */
export function splitAmongStudents(amount: number, studentIds: string[]): Record<string, number> {
  if (studentIds.length === 0) return {};
  const share = amount / studentIds.length;
  return Object.fromEntries(studentIds.map((id) => [id, share]));
}

/** 90 → "1:30". */
export function formatDuration(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes || 0));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

export function isValidHourlyRate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100000;
}
