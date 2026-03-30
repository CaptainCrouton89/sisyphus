# Todo App

A minimal Node.js todo API. No dependencies — just `node:http` and `node:test`.

## Commands
```bash
node server.js       # Start the API on port 3456
node --test test.js  # Run tests
```

## Structure
- `todo.js` — In-memory todo store (add, list, get, toggle, delete)
- `server.js` — HTTP API server
- `test.js` — Unit tests for the store
