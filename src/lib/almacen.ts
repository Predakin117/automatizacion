import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Almacén de archivos: Supabase Storage (reemplaza a Vercel Blob por decisión del profesor:
 * Blob Hobby da solo 2 000 operaciones al mes). Bucket PRIVADO: las facturas tienen datos
 * de clientes. SOLO servidor: la clave secreta da acceso total y jamás llega al navegador.
 * El navegador nunca habla con el almacén: sube a nuestra API y descarga a través de ella.
 */

let cliente: SupabaseClient | undefined;

function requerir(nombre: string): string {
  const valor = process.env[nombre]?.trim();
  if (!valor) throw new Error(`Falta la variable de entorno ${nombre}`);
  return valor;
}

function bucket() {
  if (!cliente) {
    cliente = createClient(requerir("SUPABASE_URL"), requerir("SUPABASE_SECRET_KEY"), {
      // Cliente de servidor: no hay sesión de usuario que guardar ni refrescar.
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cliente.storage.from(requerir("SUPABASE_BUCKET"));
}

export async function subirArchivo(
  ruta: string,
  contenido: Buffer,
  tipo: string,
  { sobrescribir = false }: { sobrescribir?: boolean } = {},
): Promise<string> {
  const { data, error } = await bucket().upload(ruta, contenido, { contentType: tipo, upsert: sobrescribir });
  if (error) throw new Error(`No se pudo guardar ${ruta}: ${error.message}`);
  return data.path;
}

export async function descargarArchivo(ruta: string): Promise<Buffer> {
  const { data, error } = await bucket().download(ruta);
  if (error) throw new Error(`No se pudo descargar ${ruta}: ${error.message}`);
  return Buffer.from(await data.arrayBuffer());
}

/** Rutas de los ARCHIVOS directamente bajo una carpeta (paginando de a 1000). */
export async function listarCarpeta(carpeta: string): Promise<string[]> {
  const prefijo = carpeta.replace(/\/$/, "");
  const rutas: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await bucket().list(prefijo, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`No se pudo listar ${prefijo}: ${error.message}`);
    // Las carpetas vienen con id null; solo interesan los archivos.
    for (const o of data) if (o.id) rutas.push(`${prefijo}/${o.name}`);
    if (data.length < 1000) break;
  }
  return rutas;
}

/** Subcarpetas directas (para «Borrar todo»). */
export async function listarSubcarpetas(carpeta: string): Promise<string[]> {
  const prefijo = carpeta.replace(/\/$/, "");
  const r: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await bucket().list(prefijo, { limit: 1000, offset });
    if (error) throw new Error(`No se pudo listar ${prefijo}: ${error.message}`);
    for (const o of data) if (!o.id) r.push(`${prefijo}/${o.name}`);
    if (data.length < 1000) break;
  }
  return r;
}

export async function borrarArchivos(rutas: string[]): Promise<number> {
  let borrados = 0;
  for (let i = 0; i < rutas.length; i += 1000) {
    const trozo = rutas.slice(i, i + 1000);
    const { data, error } = await bucket().remove(trozo);
    if (error) throw new Error(`No se pudieron borrar archivos: ${error.message}`);
    borrados += data.length;
  }
  return borrados;
}
