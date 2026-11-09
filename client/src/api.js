let token = null;
try { token = localStorage.getItem('sf_token'); } catch {}

export const getToken = () => token;
export function setToken(t) {
  token = t;
  try { t ? localStorage.setItem('sf_token', t) : localStorage.removeItem('sf_token'); } catch {}
}

export async function api(method, path, body) {
  const res = await fetch('/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) { setToken(null); window.dispatchEvent(new Event('sf-unauth')); }
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}
