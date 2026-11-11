import { APP_RETURN_URL, WRITING_TOOLS } from './tools.mjs';

const DOWNLOADS = [
  ['Apple silicon', 'https://github.com/shane-carlson/HuManuScript/releases/download/v0.1.52/HuManuScript-0.1.52-arm64.dmg'],
  ['Intel Mac', 'https://github.com/shane-carlson/HuManuScript/releases/download/v0.1.52/HuManuScript-0.1.52-x64.dmg'],
  ['Windows', 'https://github.com/shane-carlson/HuManuScript/releases/download/v0.1.52/HuManuScript-0.1.52-x64.exe'],
];

export function accountPage(pathname, searchParams) {
  const fromApp = searchParams.get('from') === 'app';
  if (pathname === '/') return html(landing(fromApp));
  if (pathname === '/sign-in') return html(authPage('sign-in', fromApp));
  if (pathname === '/sign-up') return html(authPage('sign-up', fromApp));
  if (pathname === '/account') return html(managePage(fromApp));
  return null;
}

function landing(fromApp) {
  const downloads = DOWNLOADS.map(([label, href]) => `<a class="button" href="${escapeHtml(href)}">${escapeHtml(label)}</a>`).join('');
  const later = WRITING_TOOLS.filter((tool) => tool.id !== 'humanuscript')
    .map((tool) => escapeHtml(tool.name))
    .join(', ');
  return `
    ${backBar(fromApp)}
    <header class="brand">
      <p class="mark">HuManuScript</p>
      <p class="tag">Proof of humanity in Prose.</p>
    </header>
    <main>
      <h1>A manuscript editor with a seal on every passage you type.</h1>
      <p>HuManuScript keeps your books on this computer. An account is only for sync, and it belongs to HuManuScript. ${escapeHtml(later)} can use the same sign-in later.</p>
      <div class="actions">
        <a class="button primary" href="/sign-up${fromApp ? '?from=app' : ''}">Create account</a>
        <a class="button" href="/sign-in${fromApp ? '?from=app' : ''}">Sign in</a>
      </div>
      <h2>Download HuManuScript 0.1.52</h2>
      <div class="actions">${downloads}</div>
    </main>`;
}

function authPage(kind, fromApp) {
  const title = kind === 'sign-up' ? 'Create a HuManuScript account' : 'Sign in to HuManuScript';
  const name = kind === 'sign-up'
    ? `<label>Display name<input name="displayName" maxlength="40" required></label>`
    : '';
  return `
    ${backBar(fromApp)}
    <main class="card">
      <p class="mark">HuManuScript</p>
      <h1>${title}</h1>
      <p>This account is for HuManuScript. Other writing tools can share it later.</p>
      <form id="account-form" data-kind="${kind}" data-from-app="${fromApp ? '1' : '0'}">
        ${name}
        <label>Email<input name="email" type="email" autocomplete="username" required></label>
        <label>Password<input name="password" type="password" autocomplete="${kind === 'sign-up' ? 'new-password' : 'current-password'}" required></label>
        <p class="hint">At least 12 characters, with uppercase, lowercase, a number, and a symbol.</p>
        <p class="error" role="alert" hidden></p>
        <div class="actions">
          <button class="primary" type="submit">${kind === 'sign-up' ? 'Create account' : 'Sign in'}</button>
          <a class="button" href="${fromApp ? APP_RETURN_URL : '/'}">${fromApp ? 'Back to HuManuScript' : 'HuManuScript home'}</a>
        </div>
      </form>
    </main>
    <script>${authScript}</script>`;
}

function managePage(fromApp) {
  return `
    ${backBar(fromApp)}
    <main class="card" id="manage">
      <p class="mark">HuManuScript</p>
      <h1>Account</h1>
      <p id="signed-out">Sign in to manage this account.</p>
      <div id="signed-in" hidden>
        <p id="who"></p>
        <form id="profile-form">
          <label>Display name<input name="displayName" maxlength="40" required></label>
          <button class="primary" type="submit">Save name</button>
        </form>
        <form id="password-form">
          <label>Current password<input name="currentPassword" type="password" autocomplete="current-password" required></label>
          <label>New password<input name="password" type="password" autocomplete="new-password" required></label>
          <button type="submit">Change password</button>
        </form>
        <h2>Writing tools</h2>
        <ul id="tools"></ul>
        <div class="actions">
          <button type="button" id="sign-out">Sign out</button>
          <a class="button" href="${fromApp ? APP_RETURN_URL : '/'}">${fromApp ? 'Back to HuManuScript' : 'HuManuScript home'}</a>
        </div>
        <p class="error" role="alert" hidden></p>
      </div>
    </main>
    <script>${manageScript}</script>`;
}

function backBar(fromApp) {
  if (!fromApp) return '';
  return `<p class="return"><a href="${APP_RETURN_URL}">Back to HuManuScript</a></p>`;
}

function html(body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>HuManuScript</title>
  <style>
    :root { color-scheme: light; }
    body { margin: 0; background: #f3efe6; color: #1c1915; font: 16px/1.5 "Segoe UI", system-ui, sans-serif; }
    main { max-width: 40rem; margin: 0 auto; padding: 32px 20px 64px; }
    .mark { margin: 0; font-family: Palatino, Georgia, serif; font-size: 1.8rem; }
    .tag, .hint { color: #5c564c; }
    h1 { font-family: Palatino, Georgia, serif; font-size: 2rem; line-height: 1.2; }
    a { color: #6f5310; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0; }
    .button, button { display: inline-block; border: 1px solid #c9bead; background: #fff; color: inherit; border-radius: 999px; padding: 8px 14px; text-decoration: none; font: inherit; cursor: pointer; }
    .primary, button.primary { background: #1c1915; color: #f3efe6; border-color: #1c1915; }
    .card { background: #fffcf7; border: 1px solid #ddd4c6; border-radius: 16px; margin-top: 24px; }
    label { display: block; margin: 12px 0; }
    input { display: block; width: 100%; box-sizing: border-box; margin-top: 4px; padding: 8px 10px; border: 1px solid #c9bead; border-radius: 8px; font: inherit; }
    .error { color: #8a2a1a; }
    .return { margin: 0; padding: 10px 20px; background: #1c1915; }
    .return a { color: #f3efe6; }
  </style>
</head>
<body>${body}</body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

const authScript = `
const form = document.querySelector('#account-form');
const error = form.querySelector('.error');
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  error.hidden = true;
  const data = Object.fromEntries(new FormData(form));
  const kind = form.dataset.kind;
  const path = kind === 'sign-up' ? '/api/account/signup' : '/api/account/login';
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ ...data, tool: 'humanuscript' }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.token) {
    error.textContent = body.message || body.error || 'That did not work.';
    error.hidden = false;
    return;
  }
  localStorage.setItem('humanuscript.account.token', body.token);
  const fromApp = form.dataset.fromApp === '1';
  location.href = fromApp ? 'humanuscript://open' : '/account';
});
`;

const manageScript = `
const token = localStorage.getItem('humanuscript.account.token');
const signedOut = document.querySelector('#signed-out');
const signedIn = document.querySelector('#signed-in');
const error = document.querySelector('.error');
function showError(message) {
  error.textContent = message;
  error.hidden = false;
}
async function api(path, options = {}) {
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = 'Bearer ' + token;
  const response = await fetch(path, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (response.status === 401) {
    localStorage.removeItem('humanuscript.account.token');
    location.href = '/sign-in' + location.search;
    throw new Error('Sign in again.');
  }
  if (!response.ok) throw new Error(body.message || body.error || 'That did not work.');
  return body;
}
if (!token) {
  signedOut.innerHTML = '<a href="/sign-in' + location.search + '">Sign in</a> to manage this account.';
} else {
  signedOut.hidden = true;
  signedIn.hidden = false;
  api('/api/account/me').then((body) => {
    document.querySelector('#who').textContent = body.user.email;
    document.querySelector('[name=displayName]').value = body.user.displayName || '';
  }).catch((err) => showError(err.message));
  api('/api/account/tools').then((body) => {
    document.querySelector('#tools').innerHTML = body.tools.map((tool) =>
      '<li>' + tool.name + (tool.connected ? ' · connected' : ' · available later') + '</li>'
    ).join('');
  }).catch((err) => showError(err.message));
  document.querySelector('#profile-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const displayName = new FormData(event.currentTarget).get('displayName');
    try {
      await api('/api/account/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ displayName }) });
    } catch (err) { showError(err.message); }
  });
  document.querySelector('#password-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await api('/api/account/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      event.currentTarget.reset();
    } catch (err) { showError(err.message); }
  });
  document.querySelector('#sign-out').addEventListener('click', async () => {
    await fetch('/api/account/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + token } });
    localStorage.removeItem('humanuscript.account.token');
    location.href = '/';
  });
}
`;
