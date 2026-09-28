export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch('/api' + url, {
    ...options,
    headers: { ...(options?.body ? { 'Content-Type': 'application/json' } : {}), ...options?.headers }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
  return data as T;
}

export function post<T>(url: string, value: unknown): Promise<T> {
  return api<T>(url, { method: 'POST', body: JSON.stringify(value) });
}
