import { auth } from './firebase';

async function sendProtectedRequest<T>(
  endpoint: string,
  payload: Record<string, unknown>,
  forceRefreshToken: boolean
): Promise<{ response: Response; data: ({ ok?: boolean; code?: string; error?: string } & T) | null }> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('يجب تسجيل الدخول لتنفيذ هذه العملية.');
  }

  const idToken = await user.getIdToken(forceRefreshToken);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(payload),
  });

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return { response, data: null };
  }

  const data = (await response.json().catch(() => null)) as
    | ({ ok?: boolean; code?: string; error?: string } & T)
    | null;
  return { response, data };
}

export async function callProtectedApi<T = Record<string, unknown>>(
  endpoint: string,
  payload: Record<string, unknown> = {}
): Promise<T> {
  let { response, data } = await sendProtectedRequest<T>(endpoint, payload, false);

  if (response.status === 401 || (response.status === 403 && data?.code === 'NO_ACADEMY_CLAIMS')) {
    ({ response, data } = await sendProtectedRequest<T>(endpoint, payload, true));
  }

  if (!data) {
    throw new Error(
      `استجابة غير صالحة من الخادم (${response.status}). تأكد من تشغيل مسار الـ API بشكل صحيح.`
    );
  }

  if (!response.ok || data.ok !== true) {
    throw new Error(data.error || `تعذر إتمام الطلب (${response.status}).`);
  }

  return data;
}
