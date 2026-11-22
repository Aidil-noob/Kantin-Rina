(() => {
  const form = document.getElementById('login-form');
  const password = document.getElementById('password');
  const errorBox = document.getElementById('login-error');
  const button = document.getElementById('login-button');

  const params = new URLSearchParams(window.location.search);
  const requested = params.get('next') || '/';
  const next = requested.startsWith('/') && !requested.startsWith('//') ? requested : '/';

  function showError(message) {
    errorBox.textContent = message;
    errorBox.classList.add('show');
  }

  function hideError() {
    errorBox.textContent = '';
    errorBox.classList.remove('show');
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideError();

    const value = password.value;
    if (!value) {
      showError('Password wajib diisi.');
      password.focus();
      return;
    }

    button.disabled = true;
    button.textContent = 'Memeriksa…';
    try {
      await API.post('/api/auth/login', { password: value });
      window.location.replace(next);
    } catch (error) {
      showError(error.message);
      password.value = '';
      password.focus();
      button.disabled = false;
      button.textContent = 'Masuk';
    }
  });
})();
