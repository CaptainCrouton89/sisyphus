import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';

/**
 * Helper: make an HTTP request and return { status, headers, body (parsed JSON or null) }.
 */
function api(baseUrl, method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const opts = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      headers: { 'Content-Type': 'application/json' },
    };
    const req = request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(data); } catch {}
        resolve({ status: res.statusCode, headers: res.headers, body: parsed });
      });
    });
    req.on('error', reject);
    if (body !== undefined) req.write(JSON.stringify(body));
    req.end();
  });
}

/**
 * Import startServer with cache-busting so each suite gets a fresh DB.
 */
async function freshServer() {
  const mod = await import(`../server.js?bust=${Date.now()}-${Math.random()}`);
  const { server, app } = mod.startServer ? mod.startServer() : mod.default();
  await new Promise((resolve) => {
    if (server.listening) return resolve();
    server.listen(0, resolve);
  });
  const addr = server.address();
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  return { server, app, baseUrl };
}

// ---------------------------------------------------------------------------
// 1. GET /api/todos
// ---------------------------------------------------------------------------
describe('GET /api/todos', () => {
  let server, baseUrl;

  before(async () => {
    ({ server, baseUrl } = await freshServer());
  });

  after(async () => {
    server.close();
  });

  it('returns an empty array initially', async () => {
    const res = await api(baseUrl, 'GET', '/api/todos');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.equal(res.body.length, 0);
  });

  it('returns todos after creating one', async () => {
    await api(baseUrl, 'POST', '/api/todos', { title: 'Buy milk' });
    const res = await api(baseUrl, 'GET', '/api/todos');
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].title, 'Buy milk');
    assert.equal(res.body[0].completed, false);
  });
});

// ---------------------------------------------------------------------------
// 2. POST /api/todos
// ---------------------------------------------------------------------------
describe('POST /api/todos', () => {
  let server, baseUrl;

  before(async () => {
    ({ server, baseUrl } = await freshServer());
  });

  after(async () => {
    server.close();
  });

  it('creates a todo and returns 201', async () => {
    const res = await api(baseUrl, 'POST', '/api/todos', { title: 'Walk the dog' });
    assert.equal(res.status, 201);
    assert.ok(res.body.id !== undefined);
    assert.equal(res.body.title, 'Walk the dog');
    assert.equal(res.body.completed, false);
  });

  it('returns 400 when title is missing', async () => {
    const res = await api(baseUrl, 'POST', '/api/todos', {});
    assert.equal(res.status, 400);
  });

  it('returns 400 when title is empty string', async () => {
    const res = await api(baseUrl, 'POST', '/api/todos', { title: '' });
    assert.equal(res.status, 400);
  });
});

// ---------------------------------------------------------------------------
// 3. PUT /api/todos/:id
// ---------------------------------------------------------------------------
describe('PUT /api/todos/:id', () => {
  let server, baseUrl;

  before(async () => {
    ({ server, baseUrl } = await freshServer());
  });

  after(async () => {
    server.close();
  });

  it('updates the title of a todo', async () => {
    const created = await api(baseUrl, 'POST', '/api/todos', { title: 'Original' });
    const res = await api(baseUrl, 'PUT', `/api/todos/${created.body.id}`, { title: 'Updated' });
    assert.equal(res.status, 200);
    assert.equal(res.body.title, 'Updated');
  });

  it('toggles completed status', async () => {
    const created = await api(baseUrl, 'POST', '/api/todos', { title: 'Toggle me' });
    assert.equal(created.body.completed, false);

    const toggled = await api(baseUrl, 'PUT', `/api/todos/${created.body.id}`, { completed: true });
    assert.equal(toggled.status, 200);
    assert.equal(toggled.body.completed, true);
  });

  it('returns 404 for a non-existent id', async () => {
    const res = await api(baseUrl, 'PUT', '/api/todos/999999', { title: 'Ghost' });
    assert.equal(res.status, 404);
  });

  it('returns 400 for a non-numeric id', async () => {
    const res = await api(baseUrl, 'PUT', '/api/todos/abc', { title: 'Bad id' });
    assert.equal(res.status, 400);
  });
});

// ---------------------------------------------------------------------------
// 4. DELETE /api/todos/:id
// ---------------------------------------------------------------------------
describe('DELETE /api/todos/:id', () => {
  let server, baseUrl;

  before(async () => {
    ({ server, baseUrl } = await freshServer());
  });

  after(async () => {
    server.close();
  });

  it('deletes an existing todo', async () => {
    const created = await api(baseUrl, 'POST', '/api/todos', { title: 'Delete me' });
    const res = await api(baseUrl, 'DELETE', `/api/todos/${created.body.id}`);
    assert.ok(res.status === 200 || res.status === 204);
  });

  it('returns 404 for a non-existent id', async () => {
    const res = await api(baseUrl, 'DELETE', '/api/todos/999999');
    assert.equal(res.status, 404);
  });

  it('confirms the deleted todo is gone from GET', async () => {
    const created = await api(baseUrl, 'POST', '/api/todos', { title: 'Vanish' });
    await api(baseUrl, 'DELETE', `/api/todos/${created.body.id}`);

    const list = await api(baseUrl, 'GET', '/api/todos');
    const found = list.body.find((t) => t.id === created.body.id);
    assert.equal(found, undefined);
  });
});

// ---------------------------------------------------------------------------
// 5. Integration flow
// ---------------------------------------------------------------------------
describe('Integration flow', () => {
  let server, baseUrl;

  before(async () => {
    ({ server, baseUrl } = await freshServer());
  });

  after(async () => {
    server.close();
  });

  it('create 3, toggle 1, delete 1, verify final state', async () => {
    // Create 3 todos
    const t1 = await api(baseUrl, 'POST', '/api/todos', { title: 'Task A' });
    const t2 = await api(baseUrl, 'POST', '/api/todos', { title: 'Task B' });
    const t3 = await api(baseUrl, 'POST', '/api/todos', { title: 'Task C' });

    assert.equal(t1.status, 201);
    assert.equal(t2.status, 201);
    assert.equal(t3.status, 201);

    // Toggle the second todo
    const toggled = await api(baseUrl, 'PUT', `/api/todos/${t2.body.id}`, { completed: true });
    assert.equal(toggled.status, 200);
    assert.equal(toggled.body.completed, true);

    // Delete the third todo
    const deleted = await api(baseUrl, 'DELETE', `/api/todos/${t3.body.id}`);
    assert.ok(deleted.status === 200 || deleted.status === 204);

    // Verify final state: 2 todos remain
    const list = await api(baseUrl, 'GET', '/api/todos');
    assert.equal(list.status, 200);
    assert.equal(list.body.length, 2);

    // Task A: not completed
    const taskA = list.body.find((t) => t.title === 'Task A');
    assert.ok(taskA);
    assert.equal(taskA.completed, false);

    // Task B: completed
    const taskB = list.body.find((t) => t.title === 'Task B');
    assert.ok(taskB);
    assert.equal(taskB.completed, true);

    // Task C: gone
    const taskC = list.body.find((t) => t.title === 'Task C');
    assert.equal(taskC, undefined);
  });
});
