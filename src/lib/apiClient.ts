import { auth } from './firebase';

export async function callProtectedApi<T = Record<string, unknown>>(
  endpoint: string,
  payload: Record<string, unknown> = {}
): Promise<T> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('يجب تسجيل الدخول لتنفيذ هذه العملية.');
  }

  const idToken = await user.getIdToken();
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(payload),
  });

  const data = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
  } & T;

  if (!response.ok || data.ok === false) {
    throw new Error(data.error || `تعذر إتمام الطلب (${response.status}).`);
  }

  return data;
}
