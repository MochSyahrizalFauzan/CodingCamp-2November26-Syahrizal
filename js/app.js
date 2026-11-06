(function () {
  'use strict';

  function getGreeting(date) {
    var hour = date.getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }

  function formatTime(date) {
    function pad(value) {
      return value < 10 ? '0' + value : String(value);
    }
    return pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds());
  }

  function formatDate(date) {
    return date.toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  function computeRemaining(endTimeMs, nowMs) {
    return Math.max(0, endTimeMs - nowMs);
  }

  function formatRemaining(ms) {
    var totalSeconds = Math.floor(Math.max(0, ms) / 1000);
    var minutes = Math.floor(totalSeconds / 60);
    var seconds = totalSeconds % 60;
    function pad(value) {
      return value < 10 ? '0' + value : String(value);
    }
    return pad(minutes) + ':' + pad(seconds);
  }

  function validateTaskText(text) {
    var trimmed = text.trim();
    if (!trimmed) return { valid: false, error: 'Task text is required.' };
    if (trimmed.length > 255) {
      return { valid: false, error: 'Maximum task length is 255 characters.' };
    }
    return { valid: true, error: null };
  }

  function validateQuickLink(name, url) {
    var trimmedName = name.trim();
    var trimmedUrl = url.trim();
    if (!trimmedUrl) return { valid: false, error: 'URL is required.' };
    if (!trimmedName) return { valid: false, error: 'Link name is required.' };
    if (trimmedName.length > 50) {
      return { valid: false, error: 'Maximum link name length is 50 characters.' };
    }
    if (trimmedUrl.length > 2048) {
      return { valid: false, error: 'Maximum URL length is 2048 characters.' };
    }
    return { valid: true, error: null };
  }

  function serialize(value) {
    return JSON.stringify(value);
  }

  function deserialize(raw) {
    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return [];
    }
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(function (entry) {
      if (!entry || typeof entry !== 'object' || typeof entry.id !== 'string') return false;
      if (typeof entry.text === 'string' && typeof entry.completed === 'boolean' &&
          Object.prototype.hasOwnProperty.call(entry, 'name') === false) return true;
      if (typeof entry.name === 'string' && typeof entry.url === 'string' &&
          Object.prototype.hasOwnProperty.call(entry, 'completed') === false) return true;
      return false;
    });
  }

  function showStorageError(message) {
    var element = document.getElementById('storage-error');
    if (element) {
      element.textContent = message || 'Data could not be saved.';
      element.hidden = false;
    }
  }

  function clearError(id) {
    var element = document.getElementById(id);
    if (element) element.textContent = '';
  }

  var Storage = {
    KEYS: {
      TASKS: 'lifedashboard.tasks',
      LINKS: 'lifedashboard.links',
      NAME: 'lifedashboard.name',
      THEME: 'lifedashboard.theme'
    },
    available: false,

    probe: function () {
      try {
        var storage = window.localStorage;
        var key = 'lifedashboard.probe';
        storage.setItem(key, '1');
        storage.removeItem(key);
        this.available = true;
      } catch (error) {
        this.available = false;
        showStorageError('Data could not be saved because local storage is unavailable.');
      }
      return this.available;
    },

    isQuotaExceededError: function (error) {
      return Boolean(error && (
        error.code === 22 ||
        error.code === 1014 ||
        error.name === 'QuotaExceededError' ||
        error.name === 'NS_ERROR_DOM_QUOTA_REACHED'
      ));
    },

    save: function (key, value) {
      if (!this.available) {
        showStorageError('Data could not be saved because local storage is unavailable.');
        return { ok: false, error: 'Local storage is unavailable.' };
      }
      try {
        window.localStorage.setItem(key, serialize(value));
        return { ok: true, error: null };
      } catch (error) {
        showStorageError(this.isQuotaExceededError(error)
          ? 'Data could not be saved because local storage is full.'
          : 'Data could not be saved.');
        return { ok: false, error: error && error.message ? error.message : 'Storage save failed.' };
      }
    },

    load: function (key, fallback) {
      if (!this.available) return fallback;
      try {
        var raw = window.localStorage.getItem(key);
        return raw === null ? fallback : deserialize(raw);
      } catch (error) {
        return fallback;
      }
    },

    loadValue: function (key, fallback) {
      if (!this.available) return fallback;
      try {
        var raw = window.localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (error) {
        return fallback;
      }
    },

    remove: function (key) {
      if (!this.available) return;
      try {
        window.localStorage.removeItem(key);
      } catch (error) {
        showStorageError('Data could not be saved.');
      }
    }
  };

  var Clock = {
    intervalId: null,

    tick: function () {
      var now = new Date();
      var greeting = document.getElementById('greeting');
      var clock = document.getElementById('clock');
      var date = document.getElementById('date');
      var name = App.name;
      if (greeting) greeting.textContent = getGreeting(now) + (name ? ', ' + name : '');
      if (clock) clock.textContent = formatTime(now);
      if (date) date.textContent = formatDate(now);
    },

    start: function () {
      this.stop();
      this.tick();
      this.intervalId = window.setInterval(this.tick.bind(this), 1000);
    },

    stop: function () {
      if (this.intervalId !== null) {
        window.clearInterval(this.intervalId);
        this.intervalId = null;
      }
    }
  };

  var TIMER_DURATION_MS = 1500000;
  var Timer = {
    DURATION_MS: TIMER_DURATION_MS,
    state: 'idle',
    remainingMs: TIMER_DURATION_MS,
    endTime: null,
    intervalId: null,

    updateDisplay: function () {
      var display = document.getElementById('timer-display');
      if (display) display.textContent = formatRemaining(this.remainingMs);
    },

    start: function () {
      if (this.state === 'running') return;
      if (this.state === 'idle' || this.state === 'finished') {
        this.remainingMs = this.DURATION_MS;
      }
      this.endTime = Date.now() + this.remainingMs;
      this.state = 'running';
      clearError('timer-notification');
      this.updateDisplay();
      this.intervalId = window.setInterval(this.tick.bind(this), 1000);
    },

    stop: function () {
      if (this.state !== 'running') return;
      this.remainingMs = computeRemaining(this.endTime, Date.now());
      this.endTime = null;
      this.state = 'paused';
      if (this.intervalId !== null) window.clearInterval(this.intervalId);
      this.intervalId = null;
      this.updateDisplay();
    },

    reset: function () {
      if (this.intervalId !== null) window.clearInterval(this.intervalId);
      this.intervalId = null;
      this.state = 'idle';
      this.remainingMs = this.DURATION_MS;
      this.endTime = null;
      this.updateDisplay();
      var notification = document.getElementById('timer-notification');
      if (notification) notification.textContent = '';
    },

    tick: function () {
      if (this.state !== 'running') return;
      this.remainingMs = computeRemaining(this.endTime, Date.now());
      this.updateDisplay();
      if (this.remainingMs <= 0) {
        this.state = 'finished';
        this.endTime = null;
        if (this.intervalId !== null) window.clearInterval(this.intervalId);
        this.intervalId = null;
        var notification = document.getElementById('timer-notification');
        if (notification) notification.textContent = 'Focus session finished.';
      }
    }
  };

  function createId(prefix) {
    return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  }

  var Todo = {
    tasks: [],

    hasDuplicate: function (text, excludedId) {
      var normalized = text.trim().toLocaleLowerCase();
      return this.tasks.some(function (task) {
        return task.id !== excludedId && task.text.trim().toLocaleLowerCase() === normalized;
      });
    },

    add: function (text) {
      var result = validateTaskText(text);
      if (!result.valid) {
        var error = document.getElementById('todo-error');
        if (error) error.textContent = result.error;
        return { ok: false, error: result.error };
      }
      if (this.hasDuplicate(text, null)) {
        var duplicateError = document.getElementById('todo-error');
        if (duplicateError) duplicateError.textContent = 'This task already exists.';
        return { ok: false, error: 'This task already exists.' };
      }
      var task = { id: createId('task'), text: text.trim(), completed: false };
      this.tasks.push(task);
      this.append(task);
      this.save();
      clearError('todo-error');
      return { ok: true, error: null };
    },

    edit: function (id, text) {
      var result = validateTaskText(text);
      var task = this.tasks.find(function (item) { return item.id === id; });
      if (!task) return { ok: false, error: 'Task not found.' };
      if (!result.valid) {
        var error = document.getElementById('todo-error');
        if (error) error.textContent = result.error;
        return { ok: false, error: result.error };
      }
      if (this.hasDuplicate(text, id)) {
        var duplicateError = document.getElementById('todo-error');
        if (duplicateError) duplicateError.textContent = 'This task already exists.';
        return { ok: false, error: 'This task already exists.' };
      }
      task.text = text.trim();
      var item = document.querySelector('[data-task-id="' + id + '"]');
      if (item) {
        var updatedText = document.createElement('span');
        updatedText.className = 'todo-text';
        updatedText.textContent = task.text;
        var editInput = item.querySelector('.todo-edit');
        if (editInput) editInput.replaceWith(updatedText);
        else this.updateItemText(item, task);
      }
      this.save();
      clearError('todo-error');
      return { ok: true, error: null };
    },

    toggleComplete: function (id) {
      var task = this.tasks.find(function (item) { return item.id === id; });
      if (!task) return;
      task.completed = !task.completed;
      var item = document.querySelector('[data-task-id="' + id + '"]');
      if (item) {
        item.classList.toggle('completed', task.completed);
        var checkbox = item.querySelector('.todo-checkbox');
        if (checkbox) checkbox.checked = task.completed;
      }
      this.save();
    },

    remove: function (id) {
      this.tasks = this.tasks.filter(function (task) { return task.id !== id; });
      var item = document.querySelector('[data-task-id="' + id + '"]');
      if (item) item.remove();
      this.save();
    },

    updateItemText: function (item, task) {
      var text = item.querySelector('.todo-text');
      if (text) text.textContent = task.text;
    },

    append: function (task) {
      var list = document.getElementById('todo-list');
      if (!list) return;
      var item = document.createElement('li');
      item.className = 'todo-item' + (task.completed ? ' completed' : '');
      item.dataset.taskId = task.id;
      var checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'todo-checkbox';
      checkbox.checked = task.completed;
      checkbox.dataset.action = 'complete';
      checkbox.setAttribute('aria-label', 'Complete task');
      var text = document.createElement('span');
      text.className = 'todo-text';
      text.textContent = task.text;
      var edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'btn btn-edit';
      edit.dataset.action = 'edit';
      edit.textContent = 'Edit';
      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn-delete';
      remove.dataset.action = 'delete';
      remove.textContent = 'Delete';
      item.appendChild(checkbox);
      item.appendChild(text);
      item.appendChild(edit);
      item.appendChild(remove);
      list.appendChild(item);
    },

    beginEdit: function (item) {
      var task = this.tasks.find(function (entry) { return entry.id === item.dataset.taskId; });
      if (!task || item.querySelector('.todo-edit')) return;
      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'todo-edit';
      input.maxLength = 255;
      input.value = task.text;
      var text = item.querySelector('.todo-text');
      if (!text) return;
      text.replaceWith(input);
      input.focus();
      input.select();
      var finished = false;
      var commit = function () {
        if (finished) return;
        finished = true;
        var result = Todo.edit(task.id, input.value);
        if (!result.ok) {
          input.replaceWith(text);
        }
      };
      input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
        } else if (event.key === 'Escape') {
          finished = true;
          input.replaceWith(text);
        }
      });
      input.addEventListener('blur', commit);
    },

    renderAll: function () {
      var list = document.getElementById('todo-list');
      if (!list) return;
      list.textContent = '';
      this.tasks.forEach(this.append.bind(this));
    },

    loadFromStorage: function () {
      var loaded = Storage.load(Storage.KEYS.TASKS, []);
      this.tasks = Array.isArray(loaded) ? loaded.filter(function (task) {
        return task && typeof task.id === 'string' && typeof task.text === 'string' &&
          typeof task.completed === 'boolean';
      }) : [];
      this.renderAll();
    },

    save: function () {
      return Storage.save(Storage.KEYS.TASKS, this.tasks);
    }
  };

  var Links = {
    links: [],

    add: function (name, url) {
      var result = validateQuickLink(name, url);
      if (!result.valid) {
        var error = document.getElementById('links-error');
        if (error) error.textContent = result.error;
        return { ok: false, error: result.error };
      }
      var link = { id: createId('link'), name: name.trim(), url: url.trim() };
      this.links.push(link);
      this.append(link);
      this.save();
      clearError('links-error');
      return { ok: true, error: null };
    },

    remove: function (id) {
      this.links = this.links.filter(function (link) { return link.id !== id; });
      var item = document.querySelector('[data-link-id="' + id + '"]');
      if (item) item.remove();
      this.save();
    },

    open: function (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    },

    append: function (link) {
      var list = document.getElementById('links-list');
      if (!list) return;
      var item = document.createElement('div');
      item.className = 'link-item';
      item.dataset.linkId = link.id;
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'link-button';
      button.dataset.action = 'open';
      button.dataset.url = link.url;
      button.textContent = link.name;
      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn-delete-link';
      remove.dataset.action = 'delete';
      remove.textContent = 'Delete';
      item.appendChild(button);
      item.appendChild(remove);
      list.appendChild(item);
    },

    renderAll: function () {
      var list = document.getElementById('links-list');
      if (!list) return;
      list.textContent = '';
      this.links.forEach(this.append.bind(this));
    },

    loadFromStorage: function () {
      var loaded = Storage.load(Storage.KEYS.LINKS, []);
      this.links = Array.isArray(loaded) ? loaded.filter(function (link) {
        return link && typeof link.id === 'string' && typeof link.name === 'string' &&
          typeof link.url === 'string';
      }) : [];
      this.renderAll();
    },

    save: function () {
      return Storage.save(Storage.KEYS.LINKS, this.links);
    }
  };

  var App = {
    initialized: false,
    name: '',

    init: function () {
      if (this.initialized) return;
      this.initialized = true;
      Storage.probe();
      this.loadPreferences();
      Todo.loadFromStorage();
      Links.loadFromStorage();
      Clock.start();

      document.getElementById('preferences-form').addEventListener('submit', function (event) {
        event.preventDefault();
        var input = document.getElementById('name-input');
        App.name = input.value.trim().slice(0, 50);
        Storage.save(Storage.KEYS.NAME, App.name);
        Clock.tick();
        input.value = App.name;
      });
      document.getElementById('theme-toggle').addEventListener('click', this.toggleTheme.bind(this));
      document.getElementById('timer-start').addEventListener('click', Timer.start.bind(Timer));
      document.getElementById('timer-stop').addEventListener('click', Timer.stop.bind(Timer));
      document.getElementById('timer-reset').addEventListener('click', Timer.reset.bind(Timer));
      document.getElementById('todo-form').addEventListener('submit', function (event) {
        event.preventDefault();
        var input = document.getElementById('todo-input');
        if (Todo.add(input.value).ok) {
          input.value = '';
          input.focus();
        }
      });
      document.getElementById('todo-list').addEventListener('click', function (event) {
        var action = event.target.dataset.action;
        var item = event.target.closest('[data-task-id]');
        if (!action || !item) return;
        if (action === 'edit') Todo.beginEdit(item);
        if (action === 'delete') Todo.remove(item.dataset.taskId);
      });
      document.getElementById('todo-list').addEventListener('change', function (event) {
        if (event.target.dataset.action !== 'complete') return;
        var item = event.target.closest('[data-task-id]');
        if (item) Todo.toggleComplete(item.dataset.taskId);
      });
      document.getElementById('links-form').addEventListener('submit', function (event) {
        event.preventDefault();
        var name = document.getElementById('link-name');
        var url = document.getElementById('link-url');
        if (Links.add(name.value, url.value).ok) {
          name.value = '';
          url.value = '';
          name.focus();
        }
      });
      document.getElementById('links-list').addEventListener('click', function (event) {
        var action = event.target.dataset.action;
        var item = event.target.closest('[data-link-id]');
        if (!action || !item) return;
        if (action === 'open') Links.open(event.target.dataset.url);
        if (action === 'delete') Links.remove(item.dataset.linkId);
      });
    },

    loadPreferences: function () {
      var savedName = Storage.loadValue(Storage.KEYS.NAME, '');
      this.name = typeof savedName === 'string' ? savedName : '';
      var nameInput = document.getElementById('name-input');
      if (nameInput) nameInput.value = this.name;
      var savedTheme = Storage.loadValue(Storage.KEYS.THEME, 'light');
      this.applyTheme(savedTheme === 'dark' ? 'dark' : 'light');
    },

    applyTheme: function (theme) {
      var isDark = theme === 'dark';
      document.body.classList.toggle('dark-theme', isDark);
      var toggle = document.getElementById('theme-toggle');
      if (toggle) {
        toggle.textContent = isDark ? 'Light mode' : 'Dark mode';
        toggle.setAttribute('aria-pressed', String(isDark));
      }
    },

    toggleTheme: function () {
      var isDark = document.body.classList.toggle('dark-theme');
      var theme = isDark ? 'dark' : 'light';
      this.applyTheme(theme);
      Storage.save(Storage.KEYS.THEME, theme);
    }
  };

  Object.defineProperty(window, 'LifeDashboardPure', {
    value: Object.freeze({
      getGreeting: getGreeting,
      formatTime: formatTime,
      formatDate: formatDate,
      formatRemaining: formatRemaining,
      computeRemaining: computeRemaining,
      validateTaskText: validateTaskText,
      validateQuickLink: validateQuickLink,
      serialize: serialize,
      deserialize: deserialize
    }),
    writable: false,
    configurable: false
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', App.init.bind(App));
  } else {
    App.init();
  }
})();
