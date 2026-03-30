import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { addTodo, listTodos, getTodo, toggleTodo, deleteTodo, clearAll } from './todo.js';

describe('todo store', () => {
  beforeEach(() => clearAll());

  it('adds a todo', () => {
    const todo = addTodo('Buy milk');
    assert.strictEqual(todo.title, 'Buy milk');
    assert.strictEqual(todo.done, false);
    assert.ok(todo.id);
  });

  it('lists todos', () => {
    addTodo('First');
    addTodo('Second');
    assert.strictEqual(listTodos().length, 2);
  });

  it('gets a todo by id', () => {
    const todo = addTodo('Find me');
    assert.deepStrictEqual(getTodo(todo.id), todo);
  });

  it('returns null for missing todo', () => {
    assert.strictEqual(getTodo(999), null);
  });

  it('toggles done status', () => {
    const todo = addTodo('Toggle me');
    assert.strictEqual(todo.done, false);
    toggleTodo(todo.id);
    assert.strictEqual(todo.done, true);
    toggleTodo(todo.id);
    assert.strictEqual(todo.done, false);
  });

  it('deletes a todo', () => {
    const todo = addTodo('Delete me');
    assert.strictEqual(deleteTodo(todo.id), true);
    assert.strictEqual(listTodos().length, 0);
  });

  it('returns false when deleting nonexistent', () => {
    assert.strictEqual(deleteTodo(999), false);
  });
});
