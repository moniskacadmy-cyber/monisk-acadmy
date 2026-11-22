import { describe, expect, it, vi } from 'vitest';
import { callApi, makeResponse } from './helpers/callApi';

vi.mock('../src/server/firebaseAdmin', async () => {
  const fake = await import('./helpers/fakeFirebase');
  return {
    adminDb: fake.adminDb,
    adminAuth: fake.adminAuth,
    adminMessaging: fake.adminMessaging,
    resolvedProjectId: 'test',
    resolvedDatabaseId: '(default)',
  };
});

import { API_ROUTES, dispatchApi, normalizeRoutePath } from '../src/server/apiRouter';
import { buildApiUrl, describeInvalidBody, describeNonJsonFailure } from '../src/lib/apiResponse';

describe('route path normalisation', () => {
  it.each([
    ['/api/members/create', 'members/create'],
    ['/api/members/create/', 'members/create'],
    ['/api/members/create?x=1', 'members/create'],
    ['//api//members//create', 'members/create'],
    ['/api', ''],
    ['/api/health', 'health'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeRoutePath(input)).toBe(expected);
  });

  it('returns null for paths that are not under /api', () => {
    expect(normalizeRoutePath('/members/create')).toBeNull();
    expect(normalizeRoutePath('/apix/members')).toBeNull();
    expect(normalizeRoutePath(undefined)).toBeNull();
  });
});

describe('route table', () => {
  it('includes the member creation endpoint', () => {
    expect(typeof API_ROUTES['members/create']).toBe('function');
  });

  it('every route key is clean (no leading slash, no /api prefix)', () => {
    for (const key of Object.keys(API_ROUTES)) {
      expect(key.startsWith('/')).toBe(false);
      expect(key.startsWith('api/')).toBe(false);
    }
  });

  it('removed finance endpoints are gone', () => {
    expect(Object.keys(API_ROUTES).some((k) => k.startsWith('finance/'))).toBe(false);
  });
});

describe('dispatch: the request reaches the handler instead of returning 404', () => {
  it('POST /api/members/create reaches the handler (no token -> 401, not 404)', async () => {
    const res = makeResponse();
    await dispatchApi({ method: 'POST', url: '/api/members/create', headers: {}, body: {} }, res);
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe('MISSING_TOKEN');
  });

  it('works when Vercel supplies only the catch-all slug', async () => {
    const res = makeResponse();
    await dispatchApi({ method: 'POST', headers: {}, body: {}, query: { slug: ['members', 'create'] } }, res);
    expect(res.statusCode).toBe(401);
  });

  it('accepts a JSON body that arrives as a string', async () => {
    const res = makeResponse();
    await dispatchApi({ method: 'POST', url: '/api/members/create', headers: {}, body: '{"name":"x"}' as unknown as Record<string, unknown> }, res);
    expect(res.statusCode).toBe(401);
  });

  it('unknown route gives a JSON 404 that names the route', async () => {
    const res = makeResponse();
    await dispatchApi({ method: 'POST', url: '/api/does/not/exist', headers: {} }, res);
    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe('ROUTE_NOT_FOUND');
    expect(res.body.error).toContain('/api/does/not/exist');
  });

  it('wrong method on a POST route gives 405', async () => {
    const res = makeResponse();
    await dispatchApi({ method: 'GET', url: '/api/members/create', headers: {} }, res);
    expect(res.statusCode).toBe(405);
  });

  it('health check answers 200 JSON', async () => {
    const res = makeResponse();
    await dispatchApi({ method: 'GET', url: '/api/health', headers: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('invalid JSON string body gives 400', async () => {
    const res = makeResponse();
    await dispatchApi({ method: 'POST', url: '/api/members/create', headers: {}, body: '{bad' as unknown as Record<string, unknown> }, res);
    expect(res.statusCode).toBe(400);
  });

  it('a valid authenticated owner call reaches the real handler', async () => {
    const { putDoc, putUser, resetFake } = await import('./helpers/fakeFirebase');
    resetFake();
    putDoc('academies/acad_1/members/owner_1', {
      uid: 'owner_1', academyId: 'acad_1', name: 'مالك', email: 'o@x.com', role: 'owner', perms: [], status: 'active',
    });
    putUser('owner_1', 'o@x.com', { academyId: 'acad_1', role: 'owner', perms: [], status: 'active' });
    const res = await callApi(API_ROUTES['members/create'], 'owner_1', {
      name: 'معلم جديد', email: 'new@x.com', password: '12345678', role: 'teacher',
    });
    expect(res.statusCode).toBe(201);
    expect(res.body.member.role).toBe('teacher');
  });
});

describe('client URL and failure messages', () => {
  it('buildApiUrl keeps same-origin paths when no base is set', () => {
    expect(buildApiUrl('/api/members/create')).toBe('/api/members/create');
  });

  it('buildApiUrl prefixes VITE_API_BASE_URL and removes trailing slashes', () => {
    expect(buildApiUrl('/api/members/create', 'https://academy.example.com/')).toBe('https://academy.example.com/api/members/create');
  });

  it('buildApiUrl refuses paths outside /api', () => {
    expect(() => buildApiUrl('/members/create')).toThrow();
  });

  it('a 404 without JSON is explained as a missing API, with a fix hint', () => {
    const err = describeNonJsonFailure('/api/members/create', 404);
    expect(err.code).toBe('API_NOT_FOUND');
    expect(err.message).toContain('npm run dev');
  });

  it('a 502 from the dev proxy means the API process is not running', () => {
    const err = describeNonJsonFailure('/api/members/create', 502);
    expect(err.code).toBe('API_UNAVAILABLE');
  });

  it('a 2xx non-JSON body is reported as invalid, not as a server error', () => {
    expect(describeInvalidBody('/api/x').code).toBe('BAD_RESPONSE');
  });
});
