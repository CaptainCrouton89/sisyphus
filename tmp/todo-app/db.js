import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new Database(join(__dirname, 'todos.db'));

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    completed INTEGER DEFAULT 0
  )
`);

const stmts = {
  getAll: db.prepare('SELECT * FROM todos'),
  getById: db.prepare('SELECT * FROM todos WHERE id = ?'),
  create: db.prepare('INSERT INTO todos (title) VALUES (?)'),
  delete: db.prepare('DELETE FROM todos WHERE id = ?'),
};

export function getAllTodos() {
  return stmts.getAll.all();
}

export function getTodoById(id) {
  return stmts.getById.get(id);
}

export function createTodo(title) {
  const info = stmts.create.run(title);
  return getTodoById(info.lastInsertRowid);
}

export function updateTodo(id, fields) {
  const existing = getTodoById(id);
  if (!existing) return undefined;

  const sets = [];
  const values = [];

  if (fields.title !== undefined) {
    sets.push('title = ?');
    values.push(fields.title);
  }
  if (fields.completed !== undefined) {
    sets.push('completed = ?');
    values.push(fields.completed ? 1 : 0);
  }

  if (sets.length === 0) return existing;

  values.push(id);
  db.prepare(`UPDATE todos SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return getTodoById(id);
}

export function deleteTodo(id) {
  const existing = getTodoById(id);
  if (!existing) return undefined;
  stmts.delete.run(id);
  return existing;
}

export default db;
