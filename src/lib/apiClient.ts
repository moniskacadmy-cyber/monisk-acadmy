import { auth } from './firebase';
import {
  ApiError,
  buildApiUrl,
  describeInvalidBody,
  describeJsonFailure,
  describeNonJsonFailure,
} from './apiResponse';

const REQUEST_TIMEOUT_MS = 20000;

async function executeProtectedFetch(
  url: string,
  payload: Record<string, unknown>,
  forceRefreshToken: boolean
): Promise<{ response: Response; body: Record<string, unknown> | null }> {
  const user = auth.currentUser;
  if (!user) {
    throw new ApiError('يجب تسجيل الدخول لتنفيذ هذه العملية.', 401, 'UNAUTHENTICATED');
  }

  const idToken = await user.getIdToken(forceRefreshToken);
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === 'AbortError';
    throw new ApiError(
      aborted
        ? 'انتهت مهلة الاتصال بالخادم. حاول مرة أخرى.'
        : 'تعذر الوصول إلى الخادم. تحقق من الاتصال أو من أن السيرفر يعمل.',
      0,
      aborted ? 'TIMEOUT' : 'NETWORK_ERROR'
    );
  } finally {
    window.clearTimeout(timer);
  }

  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();

  let body: Record<string, unknown> | null = null;
  if (contentType.includes('application/json') && text) {
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      body = null;
    }
  }

  return { response, body };
}

/**
 * Calls a protected API endpoint with the current user's ID token.
 * endpoint must start with /api/ (for example "/api/members/create").
 */
export async function callProtectedApi<T = Record<string, unknown>>(
  endpoint: string,
  payload: Record<string, unknown> = {}
): Promise<T> {
  if (!auth.currentUser) {
    throw new ApiError('يجب تسجيل الدخول لتنفيذ هذه العملية.', 401, 'UNAUTHENTICATED');
  }

  const url = buildApiUrl(endpoint, import.meta.env.VITE_API_BASE_URL as string | undefined);
  let { response, body } = await executeProtectedFetch(url, payload, false);

  if (
    response.status === 401 ||
    (response.status === 403 && body?.code === 'NO_ACADEMY_CLAIMS')
  ) {
    ({ response, body } = await executeProtectedFetch(url, payload, true));
  }

  // Not JSON at all: the request did not reach the API code (wrong host, static hosting, preview server...).
  if (body === null) {
    throw response.ok ? describeInvalidBody(endpoint) : describeNonJsonFailure(endpoint, response.status);
  }

  if (!response.ok || body.ok === false) {
    throw describeJsonFailure(response.status, body as { error?: unknown; code?: unknown });
  }

  return body as T;
}
