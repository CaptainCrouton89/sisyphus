import express from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import todoRoutes from './routes/todos.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();

app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

app.use(todoRoutes);

app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

export function startServer(port = 3001) {
  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      console.log(`Todo app listening on port ${port}`);
      resolve({ server, app });
    });
  });
}

export { app };

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  startServer();
}
