(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  function setError(id, message) {
    const el = $(id);
    if (!el) return;
    el.textContent = message || '';
    el.style.display = message ? 'block' : 'none';
  }

  function setBusy(button, busy, busyText) {
    if (!button) return;
    if (busy) {
      button.disabled = true;
      button.dataset.originalText = button.textContent;
      button.textContent = busyText;
    } else {
      button.disabled = false;
      button.textContent = button.dataset.originalText || button.textContent;
    }
  }

  function showLogin() {
    $('register-form').style.display = 'none';
    $('login-form').style.display = 'grid';
    setError('register-error', '');
  }

  function showRegister() {
    $('login-form').style.display = 'none';
    $('register-form').style.display = 'grid';
    setError('login-error', '');
    $('register-name')?.focus();
  }

  async function requestAuth(path, payload) {
    const response = await fetch('/api/auth/' + path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload)
    });

    const raw = await response.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch {
      throw new Error('O servidor retornou uma resposta inválida.');
    }

    if (!response.ok) {
      const message = data.error || `Não foi possível concluir a operação (${response.status}).`;
      throw new Error(message);
    }

    if (!data?.user) throw new Error('O servidor não retornou os dados da sessão.');
    return data;
  }

  function finishLogin(data) {
    try {
      if (window.API) window.API.csrfToken = data.csrfToken || null;
      localStorage.setItem('g3d_user', JSON.stringify(data.user));
    } catch {}

    if (typeof window.startApp === 'function') {
      window.startApp(data.user);
      return;
    }

    // app.js should normally already be loaded because this script appears first,
    // but keep a safe fallback instead of failing silently.
    window.setTimeout(() => {
      if (typeof window.startApp === 'function') window.startApp(data.user);
      else window.location.reload();
    }, 0);
  }

  async function doLogin() {
    const email = String($('login-email')?.value || '').trim();
    const password = String($('login-pass')?.value || '');
    const button = document.querySelector('#login-form button.btn-primary');
    setError('login-error', '');

    if (!email || !password) {
      setError('login-error', 'Informe o e-mail e a senha.');
      return;
    }

    setBusy(button, true, 'Entrando...');
    try {
      const data = await requestAuth('login', { email, password });
      finishLogin(data);
    } catch (error) {
      setError('login-error', error?.message || 'Não foi possível entrar.');
    } finally {
      setBusy(button, false);
    }
  }

  async function doRegister() {
    const name = String($('register-name')?.value || '').trim();
    const email = String($('register-email')?.value || '').trim();
    const password = String($('register-pass')?.value || '');
    const confirmPassword = String($('register-pass-confirm')?.value || '');
    const invite = String($('register-invite')?.value || '').trim();
    const button = document.querySelector('#register-form button.btn-primary');
    setError('register-error', '');

    if (!name || !email || !password) {
      setError('register-error', 'Preencha nome, e-mail e senha.');
      return;
    }
    if (password.length < 8) {
      setError('register-error', 'A senha deve ter pelo menos 8 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError('register-error', 'As senhas não são iguais.');
      return;
    }

    setBusy(button, true, 'Criando conta...');
    try {
      const data = await requestAuth('register', { name, email, password, invite });
      finishLogin(data);
    } catch (error) {
      setError('register-error', error?.message || 'Não foi possível criar a conta.');
    } finally {
      setBusy(button, false);
    }
  }

  window.showLogin = showLogin;
  window.showRegister = showRegister;
  window.doLogin = doLogin;
  window.doRegister = doRegister;

  document.addEventListener('DOMContentLoaded', () => {
    $('login-pass')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') doLogin();
    });
    $('register-pass-confirm')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') doRegister();
    });

    // Replace fragile inline handlers with real event listeners.
    const loginButton = document.querySelector('#login-form button.btn-primary');
    const registerLink = document.querySelector('#login-form .auth-link');
    const registerButton = document.querySelector('#register-form button.btn-primary');
    const backLink = document.querySelector('#register-form .auth-link');

    loginButton?.addEventListener('click', doLogin);
    registerLink?.addEventListener('click', showRegister);
    registerButton?.addEventListener('click', doRegister);
    backLink?.addEventListener('click', showLogin);
  });
})();
