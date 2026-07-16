const API = 'http://127.0.0.1:8000/api/v1';
const app = document.querySelector('#app');
const state = {
  session: JSON.parse(localStorage.getItem('vitalyn.session') || 'null'),
  mode: 'login',
  view: 'journal',
  events: [],
  summary: null,
  error: '',
};

const labels = {
  permanent: 'Permanent',
  long_term: 'Long-term',
  medical: 'Medical',
  conversation: 'Conversation',
};

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(state.session ? { Authorization: `Bearer ${state.session.accessToken}` } : {}),
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.detail || 'Request failed.');
  return body;
}

function saveSession(body) {
  state.session = {
    accessToken: body.access_token,
    user: {
      id: body.user.id,
      email: body.user.email,
      displayName: body.user.display_name,
      role: body.user.role,
    },
  };
  localStorage.setItem('vitalyn.session', JSON.stringify(state.session));
}

function render() {
  app.innerHTML = state.session ? dashboardHtml() : authHtml();
  bind();
}

function authHtml() {
  return `
    <section class="auth">
      <div>
        <div class="brand"><div class="mark">V</div><span>Vitalyn</span></div>
        <h1>Your lifelong health memory, organized for real care.</h1>
        <p>Capture health events, preserve a factual timeline, and generate doctor-ready summaries without turning AI into a doctor.</p>
        <div class="principles"><span>Private by default</span><span>Facts over guesses</span><span>Built for continuity</span></div>
      </div>
      <div class="panel">
        <div class="row">
          <div><p class="eyebrow">Account</p><h2>${state.mode === 'register' ? 'Create your space' : 'Welcome back'}</h2></div>
          <button class="theme" data-theme>◐</button>
        </div>
        <div class="tabs">
          <button data-mode="login" class="${state.mode === 'login' ? 'active' : ''}">Login</button>
          <button data-mode="register" class="${state.mode === 'register' ? 'active' : ''}">Register</button>
        </div>
        <form id="auth-form">
          ${state.mode === 'register' ? '<label>Display name<input name="displayName" required placeholder="Aarav Sharma"></label>' : ''}
          <label>Email<input name="email" type="email" required placeholder="you@example.com"></label>
          <label>Password<input name="password" type="password" required minlength="${state.mode === 'register' ? '12' : '1'}" placeholder="At least 12 characters"></label>
          ${state.error ? `<div class="error">${state.error}</div>` : ''}
          <button class="primary">${state.mode === 'register' ? 'Create account' : 'Login'}</button>
        </form>
      </div>
    </section>`;
}

function dashboardHtml() {
  const today = new Date().toDateString();
  const todayCount = state.events.filter((event) => new Date(event.occurred_at).toDateString() === today).length;
  return `
    <section class="dashboard">
      <aside class="sidebar">
        <div class="brand"><div class="mark">V</div><span>Vitalyn</span></div>
        <nav class="nav">
          ${navButton('journal', 'Journal')}
          ${navButton('timeline', 'Timeline')}
          ${navButton('doctor', 'Doctor Mode')}
        </nav>
        <div class="footer">
          <button class="ghost" data-theme>Toggle theme</button>
          <button class="ghost" data-signout>Sign out</button>
        </div>
      </aside>
      <section class="workspace">
        <header class="row">
          <div><p class="eyebrow">Health Memory</p><h1>Good to see you, ${escapeHtml(state.session.user.displayName)}</h1></div>
          <div class="metrics">
            <div class="metric"><span>Timeline events</span><strong>${state.events.length}</strong></div>
            <div class="metric"><span>Today</span><strong>${todayCount}</strong></div>
          </div>
        </header>
        ${state.error ? `<div class="error">${state.error}</div>` : ''}
        ${state.view === 'journal' ? journalHtml() : ''}
        ${state.view === 'timeline' ? timelineHtml() : ''}
        ${state.view === 'doctor' ? doctorHtml() : ''}
      </section>
    </section>`;
}

function navButton(view, label) {
  return `<button data-view="${view}" class="${state.view === view ? 'active' : ''}">${label}</button>`;
}

function journalHtml() {
  return `
    <div class="content">
      <div class="panel">
        <p class="eyebrow">Daily capture</p><h2>Add a health memory</h2>
        <form id="event-form">
          <div class="grid2">
            <label>Category<select name="category">
              <option value="conversation">Conversation</option><option value="medical">Medical</option><option value="long_term">Long-term</option><option value="permanent">Permanent</option>
            </select></label>
            <label>Source<select name="source">
              <option value="manual">manual</option><option value="voice_journal">voice journal</option><option value="doctor_visit">doctor visit</option><option value="report_upload">report upload</option><option value="wearable">wearable</option>
            </select></label>
          </div>
          <label>Title<input name="title" required></label>
          <label>Details<textarea name="details" rows="6" required></textarea></label>
          <label>Linked entities<input name="entities" placeholder="penicillin, knee pain, CBC"></label>
          <button class="primary">Save memory</button>
        </form>
      </div>
      <div class="panel quiet"><p class="eyebrow">Safety boundary</p><h2>Vitalyn stores facts</h2><p>Notes are preserved as user health memory. Doctor summaries stay factual and avoid speculative medical conclusions.</p></div>
    </div>`;
}

function timelineHtml() {
  return `<div class="panel"><p class="eyebrow">Chronological memory</p><h2>Timeline</h2>${state.events.length ? state.events.map(eventHtml).join('') : '<p>No health memories yet.</p>'}</div>`;
}

function doctorHtml() {
  if (!state.summary || !state.summary.event_count) {
    return '<div class="panel"><p class="eyebrow">Doctor Mode</p><h2>Facts-only summary</h2><p>Add health memories to generate a summary.</p></div>';
  }
  return `
    <div class="panel">
      <p class="eyebrow">Doctor Mode</p><h2>Facts-only summary</h2>
      <div class="notice">${escapeHtml(state.summary.disclaimer)}</div>
      ${state.summary.sections.map((section) => `
        <section>
          <h3>${labels[section.category]}</h3>
          ${section.events.map((event) => `<p><strong>${escapeHtml(event.title)}:</strong> ${escapeHtml(event.details)}</p>`).join('')}
        </section>`).join('')}
    </div>`;
}

function eventHtml(event) {
  const entities = event.linked_entities || [];
  return `
    <article class="event">
      <div>
        <span class="pill">${labels[event.category]}</span>
        <h3>${escapeHtml(event.title)}</h3>
        <p>${escapeHtml(event.details)}</p>
        ${entities.length ? `<div class="entities">${entities.map((entity) => `<span class="entity">${escapeHtml(entity)}</span>`).join('')}</div>` : ''}
      </div>
      <time>${new Date(event.occurred_at).toLocaleString()}</time>
    </article>`;
}

function bind() {
  document.querySelectorAll('[data-theme]').forEach((button) => {
    button.addEventListener('click', () => document.documentElement.classList.toggle('dark'));
  });
  document.querySelectorAll('[data-mode]').forEach((button) => {
    button.addEventListener('click', () => { state.mode = button.dataset.mode; state.error = ''; render(); });
  });
  document.querySelectorAll('[data-view]').forEach((button) => {
    button.addEventListener('click', () => { state.view = button.dataset.view; render(); });
  });
  document.querySelector('[data-signout]')?.addEventListener('click', () => {
    localStorage.removeItem('vitalyn.session');
    state.session = null;
    state.events = [];
    state.summary = null;
    render();
  });
  document.querySelector('#auth-form')?.addEventListener('submit', submitAuth);
  document.querySelector('#event-form')?.addEventListener('submit', submitEvent);
}

async function submitAuth(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  state.error = '';
  try {
    const path = state.mode === 'register' ? '/auth/register' : '/auth/login';
    const body = state.mode === 'register'
      ? { email: form.get('email'), password: form.get('password'), display_name: form.get('displayName') }
      : { email: form.get('email'), password: form.get('password') };
    saveSession(await api(path, { method: 'POST', body: JSON.stringify(body) }));
    await refresh();
  } catch (error) {
    state.error = error.message;
    render();
  }
}

async function submitEvent(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  state.error = '';
  try {
    await api('/timeline-events', {
      method: 'POST',
      body: JSON.stringify({
        category: form.get('category'),
        source: form.get('source'),
        title: form.get('title'),
        details: form.get('details'),
        occurred_at: new Date().toISOString(),
        linked_entities: String(form.get('entities') || '').split(',').map((item) => item.trim()).filter(Boolean),
      }),
    });
    await refresh();
  } catch (error) {
    state.error = error.message;
    render();
  }
}

async function refresh() {
  try {
    const [events, summary] = await Promise.all([api('/timeline-events'), api('/doctor-summary')]);
    state.events = events;
    state.summary = summary;
    state.error = '';
  } catch (error) {
    state.error = error.message;
  }
  render();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);
}

if (state.session) refresh();
else render();

