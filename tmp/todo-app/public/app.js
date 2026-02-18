const API = "/api/todos";

const form = document.getElementById("todo-form");
const input = document.getElementById("todo-input");
const list = document.getElementById("todo-list");
const footer = document.getElementById("todo-footer");
const countEl = document.getElementById("todo-count");
const errorBanner = document.getElementById("error-banner");
const filterBtns = document.querySelectorAll(".filter-btn");

let todos = [];
let currentFilter = "all";
let errorTimeout = null;

// --- Error display ---

function showError(message) {
  errorBanner.textContent = message;
  errorBanner.hidden = false;
  clearTimeout(errorTimeout);
  errorTimeout = setTimeout(() => {
    errorBanner.hidden = true;
  }, 4000);
}

// --- API helpers ---

async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}

async function loadTodos() {
  try {
    todos = await apiFetch(API);
    render();
  } catch (err) {
    showError(`Failed to load todos: ${err.message}`);
  }
}

async function addTodo(title) {
  try {
    const todo = await apiFetch(API, {
      method: "POST",
      body: JSON.stringify({ title }),
    });
    todos.push(todo);
    render();
  } catch (err) {
    showError(`Failed to add todo: ${err.message}`);
  }
}

async function toggleTodo(id, completed) {
  try {
    const updated = await apiFetch(`${API}/${id}`, {
      method: "PUT",
      body: JSON.stringify({ completed }),
    });
    todos = todos.map((t) => (t.id === id ? updated : t));
    render();
  } catch (err) {
    showError(`Failed to update todo: ${err.message}`);
  }
}

async function updateTitle(id, title) {
  try {
    const updated = await apiFetch(`${API}/${id}`, {
      method: "PUT",
      body: JSON.stringify({ title }),
    });
    todos = todos.map((t) => (t.id === id ? updated : t));
    render();
  } catch (err) {
    showError(`Failed to update todo: ${err.message}`);
  }
}

async function deleteTodo(id) {
  try {
    await apiFetch(`${API}/${id}`, { method: "DELETE" });
    todos = todos.filter((t) => t.id !== id);
    render();
  } catch (err) {
    showError(`Failed to delete todo: ${err.message}`);
  }
}

// --- Rendering ---

function filteredTodos() {
  switch (currentFilter) {
    case "active":
      return todos.filter((t) => !t.completed);
    case "completed":
      return todos.filter((t) => t.completed);
    default:
      return todos;
  }
}

function createTodoElement(todo) {
  const li = document.createElement("li");
  li.className = `todo-item${todo.completed ? " completed" : ""}`;
  li.dataset.id = todo.id;

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "todo-checkbox";
  checkbox.checked = todo.completed;
  checkbox.setAttribute("aria-label", `Mark "${todo.title}" as ${todo.completed ? "active" : "completed"}`);
  checkbox.addEventListener("change", () => toggleTodo(todo.id, !todo.completed));

  const text = document.createElement("span");
  text.className = "todo-text";
  text.textContent = todo.title;
  text.addEventListener("dblclick", () => startEditing(li, todo));

  const actions = document.createElement("span");
  actions.className = "todo-actions";

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "delete-btn";
  deleteBtn.textContent = "Delete";
  deleteBtn.setAttribute("aria-label", `Delete "${todo.title}"`);
  deleteBtn.addEventListener("click", () => deleteTodo(todo.id));

  actions.appendChild(deleteBtn);
  li.append(checkbox, text, actions);
  return li;
}

function startEditing(li, todo) {
  const text = li.querySelector(".todo-text");
  const editInput = document.createElement("input");
  editInput.type = "text";
  editInput.className = "todo-edit";
  editInput.value = todo.title;

  text.replaceWith(editInput);
  editInput.focus();
  editInput.select();

  function commit() {
    const newTitle = editInput.value.trim();
    if (newTitle && newTitle !== todo.title) {
      updateTitle(todo.id, newTitle);
    } else {
      render();
    }
  }

  editInput.addEventListener("blur", commit);
  editInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      editInput.blur();
    } else if (e.key === "Escape") {
      editInput.removeEventListener("blur", commit);
      render();
    }
  });
}

function render() {
  const visible = filteredTodos();
  list.innerHTML = "";
  for (const todo of visible) {
    list.appendChild(createTodoElement(todo));
  }

  const activeCount = todos.filter((t) => !t.completed).length;
  countEl.textContent = `${activeCount} item${activeCount === 1 ? "" : "s"} left`;
  footer.hidden = todos.length === 0;
}

// --- Event listeners ---

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const title = input.value.trim();
  if (!title) return;
  input.value = "";
  addTodo(title);
});

for (const btn of filterBtns) {
  btn.addEventListener("click", () => {
    for (const b of filterBtns) b.classList.remove("active");
    btn.classList.add("active");
    currentFilter = btn.dataset.filter;
    render();
  });
}

// --- Init ---

loadTodos();
