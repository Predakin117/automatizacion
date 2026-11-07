"use client";

/** fetch a nuestra API. Un 401 significa que la sesión caducó: se vuelve a /login. */
export async function api(ruta: string, init?: RequestInit): Promise<Response> {
  const r = await fetch(ruta, init);
  if (r.status === 401 && typeof window !== "undefined" && window.location.pathname !== "/login") {
    // Recarga completa a propósito: la sesión caducó y hay que reiniciar el Motor.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/login?siguiente=${encodeURIComponent(window.location.pathname)}`);
  }
  return r;
}

export async function apiJson<T>(ruta: string, init?: RequestInit): Promise<T> {
  const r = await api(ruta, init);
  if (!r.ok) {
    const cuerpo = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(cuerpo.error ?? `Error ${r.status}`);
  }
  return (await r.json()) as T;
}

export function postJson(ruta: string, cuerpo?: unknown): Promise<Response> {
  return api(ruta, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
}

/** Eventos entre componentes (el Motor vive en el layout; las páginas escuchan). */
export const EVENTO_LOTE_INICIADO = "lote-iniciado";
export const EVENTO_LOTE_TERMINADO = "lote-terminado";

export function emitir(evento: string, id: string): void {
  window.dispatchEvent(new CustomEvent(evento, { detail: id }));
}
