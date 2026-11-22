import type { ApiRequest, ApiResponse } from '../../src/server/authMiddleware';

export interface FakeResponse extends ApiResponse {
  statusCode: number;
  body: any;
}

export function makeResponse(): FakeResponse {
  const res: FakeResponse = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
    },
  };
  return res;
}

// Calls a handler the same way the server does: bearer token + JSON body.
export async function callApi(
  handler: (req: ApiRequest, res: ApiResponse) => Promise<void>,
  uid: string | null,
  body: Record<string, unknown> = {}
): Promise<FakeResponse> {
  const res = makeResponse();
  const headers: Record<string, string> = uid ? { authorization: `Bearer tok_${uid}` } : {};
  await handler({ method: 'POST', headers, body }, res);
  return res;
}
