// In-memory stand-in for the parts of firebase-admin the API handlers use.
// Only used by tests. Supports: collection/doc/get/set/create/update, where (==, array-contains),
// batch, dotted update paths, and auto ids.

type Data = Record<string, any>;

const store = new Map<string, Data>();
let idCounter = 0;

function nextId(): string {
  idCounter += 1;
  return `auto_${idCounter}`;
}

function clone<T>(v: T): T {
  return v === undefined ? v : JSON.parse(JSON.stringify(v));
}

function setPath(obj: Data, dotted: string, value: unknown): void {
  const parts = dotted.split('.');
  let cur: Data = obj;
  for (const part of parts.slice(0, -1)) {
    if (typeof cur[part] !== 'object' || cur[part] === null) cur[part] = {};
    cur = cur[part];
  }
  cur[parts[parts.length - 1]] = value;
}

function docRef(path: string) {
  const id = path.split('/').pop() as string;
  return {
    id,
    path,
    collection(name: string) {
      return colRef(`${path}/${name}`);
    },
    async get() {
      const d = store.get(path);
      return { exists: d !== undefined, id, data: () => (d ? clone(d) : undefined) };
    },
    async set(data: Data) {
      store.set(path, clone(data));
    },
    async create(data: Data) {
      if (store.has(path)) {
        const err = new Error('ALREADY_EXISTS') as Error & { code?: number };
        err.code = 6;
        throw err;
      }
      store.set(path, clone(data));
    },
    async update(patch: Data) {
      const cur = store.get(path);
      if (!cur) throw new Error('NOT_FOUND');
      for (const [k, v] of Object.entries(patch)) setPath(cur, k, v);
    },
  };
}

interface Condition {
  field: string;
  op: string;
  value: unknown;
}

function queryRef(colPath: string, conditions: Condition[]) {
  const matches = (d: Data) =>
    conditions.every((c) => {
      const v = d[c.field];
      if (c.op === 'array-contains') return Array.isArray(v) && v.includes(c.value);
      if (c.op === '==') return v === c.value;
      throw new Error(`unsupported op ${c.op}`);
    });
  return {
    where(field: string, op: string, value: unknown) {
      return queryRef(colPath, [...conditions, { field, op, value }]);
    },
    async get() {
      const prefix = `${colPath}/`;
      const docs = [...store.entries()]
        .filter(([p]) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/'))
        .filter(([, d]) => matches(d))
        .map(([p, d]) => ({ id: p.split('/').pop(), data: () => clone(d) }));
      return { docs, empty: docs.length === 0, size: docs.length };
    },
  };
}

function colRef(path: string) {
  return {
    doc(id?: string) {
      return docRef(`${path}/${id ?? nextId()}`);
    },
    ...queryRef(path, []),
  };
}

export const adminDb = {
  collection: (name: string) => colRef(name),
  batch() {
    const ops: Array<() => void> = [];
    return {
      set(ref: ReturnType<typeof docRef>, data: Data) {
        ops.push(() => store.set(ref.path, clone(data)));
      },
      update(ref: ReturnType<typeof docRef>, patch: Data) {
        ops.push(() => {
          const cur = store.get(ref.path);
          if (!cur) throw new Error('NOT_FOUND');
          for (const [k, v] of Object.entries(patch)) setPath(cur, k, v);
        });
      },
      async commit() {
        ops.forEach((op) => op());
      },
    };
  },
};

interface FakeUser {
  email: string;
  claims: Data;
  disabled: boolean;
}
const users = new Map<string, FakeUser>();

export const adminAuth = {
  async verifyIdToken(token: string) {
    const uid = token.replace(/^tok_/, '');
    const user = users.get(uid);
    if (!user) throw new Error('auth/invalid-id-token');
    return { uid, email: user.email, ...user.claims };
  },
  async createUser({ email }: { email: string }) {
    const uid = nextId();
    users.set(uid, { email, claims: {}, disabled: false });
    return { uid };
  },
  async setCustomUserClaims(uid: string, claims: Data) {
    const u = users.get(uid);
    if (u) u.claims = clone(claims);
  },
  async updateUser(uid: string, patch: { disabled?: boolean }) {
    const u = users.get(uid);
    if (u && patch.disabled !== undefined) u.disabled = patch.disabled;
  },
  async revokeRefreshTokens() {},
  async deleteUser(uid: string) {
    users.delete(uid);
  },
};

export const adminMessaging = {
  async sendEachForMulticast() {
    return { successCount: 0 };
  },
};

// ---- test utilities ----
export function resetFake(): void {
  store.clear();
  users.clear();
}

export function putDoc(path: string, data: Data): void {
  store.set(path, clone(data));
}

export function getDoc(path: string): Data | undefined {
  return clone(store.get(path));
}

export function putUser(uid: string, email: string, claims: Data): void {
  users.set(uid, { email, claims: clone(claims), disabled: false });
}

export function setUserDisabled(uid: string, disabled: boolean): void {
  const u = users.get(uid);
  if (u) u.disabled = disabled;
}
