// Pure helpers for talking to the API. No Firebase imports, so they can be unit-tested.

export const API_PREFIX = '/api/';

/** Builds a full URL for an API path. VITE_API_BASE_URL is optional (empty = same origin). */
export function buildApiUrl(endpoint: string, base: string | undefined = ''): string {
  if (!endpoint.startsWith(API_PREFIX)) {
    throw new Error(`مسار غير صالح للـ API: ${endpoint}`);
  }
  const cleanBase = (base || '').replace(/\/+$/, '');
  return `${cleanBase}${endpoint}`;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Explains a failed API response in Arabic. Called when the body is not the JSON we expect.
 * A bare 404 with an HTML or empty body means the request never reached the API code.
 */
export function describeNonJsonFailure(endpoint: string, status: number): ApiError {
  if (status === 404) {
    return new ApiError(
      `المسار ${endpoint} غير موجود على الخادم الحالي. شغّل السيرفر بالأمر npm run dev، أو تأكد أن دوال /api منشورة على Vercel، ولا تستخدم npm run preview لوحده لأنه لا يعرض الـ API.`,
      status,
      'API_NOT_FOUND'
    );
  }
  if (status === 502 || status === 503 || status === 504) {
    return new ApiError(
      `خادم الـ API غير متاح الآن (${status}) عند ${endpoint}. شغّل السيرفر بالأمر npm run dev ثم أعد المحاولة.`,
      status,
      'API_UNAVAILABLE'
    );
  }
  if (status >= 500) {
    return new ApiError(`الخادم أعاد خطأ داخليًا (${status}) عند ${endpoint}. راجع سجلات الخادم.`, status, 'SERVER_ERROR');
  }
  return new ApiError(`استجابة غير متوقعة من الخادم (${status}) عند ${endpoint}.`, status, 'BAD_RESPONSE');
}

/** The server answered 2xx but the body was not JSON. */
export function describeInvalidBody(endpoint: string): ApiError {
  return new ApiError(`استجابة الخادم عند ${endpoint} ليست JSON صالحة. تحقق من أن الطلب يصل إلى دوال الـ API.`, 200, 'BAD_RESPONSE');
}

/** Error for a JSON body that reports failure (ok === false or non-2xx status). */
export function describeJsonFailure(status: number, body: { error?: unknown; code?: unknown }): ApiError {
  const message =
    typeof body.error === 'string' && body.error.trim() ? body.error : `تعذر إتمام الطلب (${status}).`;
  const code = typeof body.code === 'string' ? body.code : 'REQUEST_FAILED';
  return new ApiError(message, status, code);
}
