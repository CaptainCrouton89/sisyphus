import { createServer } from 'node:http';
import { addTodo, listTodos, getTodo, toggleTodo, deleteTodo } from './todo.js';

const PORT = 3456;

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch { resolve({}); }
    });
  });
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data, null, 2));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  // GET /todos
  if (req.method === 'GET' && path === '/todos') {
    return json(res, 200, listTodos());
  }

  // POST /todos
  if (req.method === 'POST' && path === '/todos') {
    const { title } = await parseBody(req);
    if (!title) return json(res, 400, { error: 'title is required' });
    return json(res, 201, addTodo(title));
  }

  // GET /todos/:id
  const match = path.match(/^\/todos\/(\d+)$/);
  if (match) {
    const id = parseInt(match[1]);
    if (req.method === 'GET') {
      const todo = getTodo(id);
      return todo ? json(res, 200, todo) : json(res, 404, { error: 'not found' });
    }
    // PATCH /todos/:id/toggle
    if (req.method === 'PATCH' && path.endsWith('/toggle')) {
      // BUG: this never matches because the regex above doesn't include /toggle
    }
    // DELETE /todos/:id
    if (req.method === 'DELETE') {
      return deleteTodo(id) ? json(res, 200, { deleted: true }) : json(res, 404, { error: 'not found' });
    }
  }

  // PATCH /todos/:id/toggle
  const toggleMatch = path.match(/^\/todos\/(\d+)\/toggle$/);
  if (req.method === 'PATCH' && toggleMatch) {
    const id = parseInt(toggleMatch[1]);
    const todo = toggleTodo(id);
    return todo ? json(res, 200, todo) : json(res, 404, { error: 'not found' });
  }

  json(res, 404, { error: 'not found' });
});

server.listen(PORT, () => {
  console.log(`Todo API running at http://localhost:${PORT}`);
  console.log('');
  console.log('Endpoints:');
  console.log('  GET    /todos          List all todos');
  console.log('  POST   /todos          Create a todo (body: {"title": "..."})');
  console.log('  GET    /todos/:id      Get a todo');
  console.log('  PATCH  /todos/:id/toggle  Toggle done');
  console.log('  DELETE /todos/:id      Delete a todo');
});
