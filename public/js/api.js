window.API = (() => {
  async function request(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    let body = options.body;
    if (body !== undefined && typeof body !== 'string') {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }

    let response;
    try {
      response = await fetch(path, { ...options, headers, body });
    } catch (error) {
      throw new Error('Tidak dapat terhubung ke server. Pastikan aplikasi berjalan.');
    }

    if (response.status === 401 && !path.startsWith('/api/auth/login')) {
      if (!window.location.pathname.startsWith('/login')) {
        const next = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.assign(`/login?next=${next}`);
      }
    }

    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json')
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      const message =
        (data && typeof data === 'object' && data.error) ||
        `Terjadi kesalahan (${response.status})`;
      throw new Error(message);
    }
    return data;
  }

  return {
    get: (path) => request(path),
    post: (path, body) => request(path, { method: 'POST', body }),
    put: (path, body) => request(path, { method: 'PUT', body }),
    remove: (path) => request(path, { method: 'DELETE' }),
  };
})();
