/**
 * Subida desde el NAVEGADOR: una petición por imagen a nuestra API (que valida y es la única
 * que escribe en el almacén). Seis en paralelo; hasta 3 intentos con espera creciente para
 * fallas de red o 5xx. Un rechazo 4xx NO se reintenta: el problema es el archivo.
 * Un archivo que falla no detiene el resto: queda en la lista de fallidos con su motivo.
 */

export const SUBIDAS_EN_PARALELO = 6;
const INTENTOS = 3;

export interface ArchivoASubir {
  archivo: File;
  indice: number;
}

export interface Fallido {
  archivo: File;
  motivo: string;
}

export async function subirArchivos(
  idLote: string,
  lista: ArchivoASubir[],
  alAvanzar: (subidos: number, fallidos: number) => void,
): Promise<{ subidos: number; fallidos: Fallido[] }> {
  let siguiente = 0;
  let subidos = 0;
  const fallidos: Fallido[] = [];

  async function subirUno({ archivo, indice }: ArchivoASubir): Promise<void> {
    const url = `/api/procesos/${idLote}/imagenes?indice=${indice}&nombre=${encodeURIComponent(archivo.name)}`;
    let ultimo = "";
    for (let intento = 1; intento <= INTENTOS; intento++) {
      try {
        // El cuerpo es el propio File: el navegador envía los bytes, sin multipart.
        const r = await fetch(url, {
          method: "POST",
          headers: { "content-type": archivo.type || "application/octet-stream" },
          body: archivo,
        });
        if (r.ok) {
          subidos++;
          return;
        }
        const cuerpo = (await r.json().catch(() => ({}))) as { error?: string };
        ultimo = cuerpo.error ?? `Error ${r.status}`;
        if (r.status === 401) throw new Error("La sesión caducó");
        if (r.status >= 400 && r.status < 500) break; // rechazo del servidor: no reintentar
      } catch (e) {
        ultimo = e instanceof Error ? e.message : String(e);
        if (ultimo === "La sesión caducó") break;
      }
      if (intento < INTENTOS) await new Promise((res) => setTimeout(res, 500 * 2 ** intento));
    }
    fallidos.push({ archivo, motivo: ultimo });
  }

  async function trabajador() {
    while (siguiente < lista.length) {
      const item = lista[siguiente++];
      await subirUno(item);
      alAvanzar(subidos, fallidos.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(SUBIDAS_EN_PARALELO, lista.length) }, trabajador));
  return { subidos, fallidos };
}

/** Divide la selección en lotes. 0 = todo en un lote. */
export function dividirEnLotes<T>(elementos: T[], porLote: number): T[][] {
  if (porLote <= 0 || porLote >= elementos.length) return elementos.length ? [elementos] : [];
  const r: T[][] = [];
  for (let i = 0; i < elementos.length; i += porLote) r.push(elementos.slice(i, i + porLote));
  return r;
}

/** ~5 lecturas de Firestore por factura (reclamo, atajo por hash, factura, índice, cliente). */
export const LECTURAS_POR_FACTURA = 5;
