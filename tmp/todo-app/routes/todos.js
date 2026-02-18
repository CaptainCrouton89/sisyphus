import { Router } from 'express';
import { getAllTodos, getTodoById, createTodo, updateTodo, deleteTodo } from '../db.js';

const router = Router();

router.get('/api/todos', (_req, res) => {
  res.json(getAllTodos());
});

router.get('/api/todos/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'id must be an integer' });
  }
  const todo = getTodoById(id);
  if (!todo) {
    return res.status(404).json({ error: 'Todo not found' });
  }
  res.json(todo);
});

router.post('/api/todos', (req, res) => {
  const { title } = req.body;
  if (!title || typeof title !== 'string' || title.trim() === '') {
    return res.status(400).json({ error: 'title is required and must be a non-empty string' });
  }
  const todo = createTodo(title.trim());
  res.status(201).json(todo);
});

router.put('/api/todos/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'id must be an integer' });
  }
  const todo = updateTodo(id, req.body);
  if (!todo) {
    return res.status(404).json({ error: 'Todo not found' });
  }
  res.json(todo);
});

router.delete('/api/todos/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'id must be an integer' });
  }
  const todo = deleteTodo(id);
  if (!todo) {
    return res.status(404).json({ error: 'Todo not found' });
  }
  res.json(todo);
});

export default router;
