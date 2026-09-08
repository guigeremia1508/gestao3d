// ─── API HELPER ───────────────────────────────────────────────────────────────
const API = {
  token: localStorage.getItem('g3d_token'),
  base: '/api',

  headers() {
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` };
  },

  async request(method, path, body) {
    const res = await fetch(this.base + path, {
      method,
      headers: this.headers(),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) { doLogout(); return; }
    const raw = await res.text();
    let data;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      const preview = raw.replace(/\s+/g, ' ').slice(0, 180);
      throw new Error(`Resposta inválida do servidor${preview ? `: ${preview}` : ''}`);
    }
    if (!res.ok) throw new Error(data.error || 'Erro desconhecido');
    return data;
  },

  get: (p) => API.request('GET', p),
  post: (p, b) => API.request('POST', p, b),
  put: (p, b) => API.request('PUT', p, b),
  del: (p) => API.request('DELETE', p),
};
