// In-memory todo store
const todos = [];
let nextId = 1;

export function addTodo(title) {
  const todo = { id: nextId++, title, done: false, createdAt: new Date().toISOString() };
  todos.push(todo);
  return todo;
}

export function listTodos() {
  return [...todos];
}

export function getTodo(id) {
  return todos.find((t) => t.id === id) || null;
}

export function toggleTodo(id) {
  const todo = getTodo(id);
  if (todo) todo.done = !todo.done;
  return todo;
}

export function deleteTodo(id) {
  const idx = todos.findIndex((t) => t.id === id);
  if (idx === -1) return false;
  todos.splice(idx, 1);
  return true;
}

export function clearAll() {
  todos.length = 0;
  nextId = 1;
}
