"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { terminados, type ResumenProceso } from "@/lib/modelo/vista";
import { esImagen } from "@/lib/rutas";
import { LECTURAS_POR_FACTURA, dividirEnLotes, subirArchivos, type Fallido } from "@/lib/procesamiento/subidas";
import { EVENTO_LOTE_INICIADO, EVENTO_LOTE_TERMINADO, api, apiJson, emitir } from "./api";
import { entero, megas } from "./formato";
import { ResumenEnVivo } from "./ResumenEnVivo";
import { Aviso, Barra, EstadoLote, Tarjeta } from "./ui";

interface LoteEnPantalla {
  id: string;
  nombre: string;
  archivos: number;
  subidos: number;
  fallidos: number;
  resumen: ResumenProceso | null;
}

const MAX_TAMANO = 4 * 1024 * 1024;

/** «Procesar facturas»: elegir carpeta → dividir en lotes → subir cada uno → el Motor procesa. */
export function NuevoProceso() {
  const [archivos, setArchivos] = useState<File[]>([]);
  const [carpeta, setCarpeta] = useState("");
  const [porLote, setPorLote] = useState(100);
  const [lotes, setLotes] = useState<LoteEnPantalla[]>([]);
  const [fallidos, setFallidos] = useState<Fallido[]>([]);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // El intervalo de refresco lee la lista más reciente sin reiniciarse en cada cambio.
  const lotesRef = useRef(lotes);
  useEffect(() => {
    lotesRef.current = lotes;
  }, [lotes]);

  function elegir(e: ChangeEvent<HTMLInputElement>) {
    const lista = Array.from(e.target.files ?? []);
    const imagenes = lista.filter((f) => esImagen(f.name)).sort((a, b) => a.name.localeCompare(b.name));
    const ruta = (lista[0] as File & { webkitRelativePath?: string })?.webkitRelativePath ?? "";
    setCarpeta(ruta.includes("/") ? ruta.split("/")[0] : imagenes.length ? "archivos sueltos" : "");
    setArchivos(imagenes);
    setFallidos([]);
    setError(lista.length > 0 && imagenes.length === 0 ? "La selección no tiene imágenes .png o .jpg." : null);
    e.target.value = "";
  }

  const trozos = dividirEnLotes(archivos, porLote);
  const grandes = archivos.filter((f) => f.size > MAX_TAMANO).length;
  const tamano = archivos.reduce((a, f) => a + f.size, 0);

  const actualizar = useCallback((id: string, cambio: Partial<LoteEnPantalla>) => {
    setLotes((ls) => ls.map((l) => (l.id === id ? { ...l, ...cambio } : l)));
  }, []);

  async function subirTodo(seleccion: File[], nombreCarpeta: string) {
    setSubiendo(true);
    setError(null);
    const nuevosFallidos: Fallido[] = [];
    const grupos = dividirEnLotes(seleccion, porLote);
    try {
      for (const [n, grupo] of grupos.entries()) {
        const nombre = grupos.length > 1 ? `${nombreCarpeta} (lote ${n + 1} de ${grupos.length})` : nombreCarpeta;
        const { id } = await apiJson<{ id: string }>("/api/procesos", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ carpeta: nombre, totalArchivos: grupo.length }),
        });
        setLotes((ls) => [{ id, nombre, archivos: grupo.length, subidos: 0, fallidos: 0, resumen: null }, ...ls]);
        const r = await subirArchivos(
          id,
          grupo.map((archivo, indice) => ({ archivo, indice })),
          (subidos, f) => actualizar(id, { subidos, fallidos: f }),
        );
        nuevosFallidos.push(...r.fallidos);
        if (r.subidos > 0) {
          await apiJson(`/api/procesos/${id}/iniciar`, { method: "POST" });
          emitir(EVENTO_LOTE_INICIADO, id); // el Motor lo toma; pasamos al siguiente sin esperar
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setFallidos(nuevosFallidos);
      setSubiendo(false);
      setArchivos([]);
    }
  }

  // Avance de los lotes de esta pantalla: 1 lectura por lote cada 4 s, solo mientras procesan
  // y la pestaña está visible.
  useEffect(() => {
    const refrescar = async () => {
      if (document.visibilityState !== "visible") return;
      const vivos = lotesRef.current.filter((l) => l.resumen?.estado !== "terminado" && l.subidos > 0);
      for (const l of vivos) {
        const r = await api(`/api/procesos/${l.id}`);
        if (r.ok) actualizar(l.id, { resumen: (await r.json()) as ResumenProceso });
      }
    };
    const t = setInterval(refrescar, 4000);
    const alTerminar = () => void refrescar();
    window.addEventListener(EVENTO_LOTE_TERMINADO, alTerminar);
    return () => {
      clearInterval(t);
      window.removeEventListener(EVENTO_LOTE_TERMINADO, alTerminar);
    };
  }, [actualizar]);

  return (
    <div className="flex flex-col gap-6">
      <Tarjeta titulo="1. Elige las facturas">
        <div className="flex flex-wrap items-center gap-3">
          {/* Un <input type="file"> sin estilo es solo texto: se envuelve en una <label> con forma de botón. */}
          <label className={`boton-primario ${subiendo ? "pointer-events-none opacity-50" : ""}`}>
            Elegir carpeta…
            <input
              type="file"
              className="sr-only"
              multiple
              onChange={elegir}
              disabled={subiendo}
              data-prueba="carpeta"
              // @ts-expect-error webkitdirectory no está en los tipos de React, pero los navegadores lo soportan.
              webkitdirectory=""
            />
          </label>
          {/* Algunos navegadores móviles no permiten elegir carpetas. */}
          <label className={`boton ${subiendo ? "pointer-events-none opacity-50" : ""}`}>
            Elegir archivos…
            <input type="file" className="sr-only" multiple accept=".png,.jpg,.jpeg,image/png,image/jpeg" onChange={elegir} disabled={subiendo} />
          </label>
          {archivos.length > 0 && (
            <span className="text-sm">
              <strong className="cifra">{entero(archivos.length)}</strong> imágenes en «{carpeta}» · {megas(tamano)}
            </span>
          )}
        </div>
        {grandes > 0 && <div className="mt-3"><Aviso tono="aviso">{grandes} imagen(es) pasan de 4 MB: el servidor las rechazará.</Aviso></div>}
      </Tarjeta>

      {archivos.length > 0 && (
        <Tarjeta titulo="2. Divide en lotes y procesa">
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1 text-sm">
              Facturas por lote
              <input
                type="number"
                min={0}
                max={1000}
                value={porLote}
                onChange={(e) => setPorLote(Math.max(0, Number(e.target.value) || 0))}
                className="campo w-32"
                data-prueba="por-lote"
              />
            </label>
            <p className="text-sm text-muted">
              {trozos.length} {trozos.length === 1 ? "lote" : "lotes"} (0 = todo en uno). Cada lote tiene su Excel y sus métricas.
              <br />
              Estimado: ~{entero(archivos.length * LECTURAS_POR_FACTURA)} lecturas de Firestore (~{LECTURAS_POR_FACTURA} por factura; el plan gratuito da 50 000 al día).
            </p>
            <button type="button" className="boton-primario ml-auto" disabled={subiendo} onClick={() => void subirTodo(archivos, carpeta)}>
              Subir y procesar
            </button>
          </div>
        </Tarjeta>
      )}

      {error && <Aviso>{error}</Aviso>}

      {fallidos.length > 0 && !subiendo && (
        <Tarjeta titulo={`${fallidos.length} archivo(s) no se pudieron subir`}>
          <ul className="mb-3 max-h-40 overflow-auto text-sm">
            {fallidos.map((f) => (
              <li key={f.archivo.name + f.archivo.size}>
                <span className="text-malo">✕</span> {f.archivo.name}: {f.motivo}
              </li>
            ))}
          </ul>
          <button type="button" className="boton" onClick={() => void subirTodo(fallidos.map((f) => f.archivo), `${carpeta || "reintento"} (reintento)`)}>
            Reintentar esos archivos
          </button>
        </Tarjeta>
      )}

      {lotes.length > 0 && (
        <Tarjeta titulo="Lotes de esta sesión">
          <ul className="flex flex-col gap-4" data-prueba="lotes-sesion">
            {lotes.map((l) => {
              const hechos = l.resumen ? terminados(l.resumen) : 0;
              return (
                <li key={l.id} className="flex flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Link href={`/procesos/${l.id}`} className="font-medium text-acento hover:underline">{l.nombre}</Link>
                    {l.resumen ? <EstadoLote estado={l.resumen.estado} /> : <EstadoLote estado="subiendo" />}
                  </div>
                  <div className="grid gap-1 text-xs text-muted sm:grid-cols-2 sm:gap-4">
                    <div>
                      Subida: <span className="cifra">{l.subidos}/{l.archivos}</span>
                      {l.fallidos > 0 && <span className="text-malo"> · {l.fallidos} fallidos</span>}
                      <Barra valor={l.subidos} total={l.archivos} />
                    </div>
                    <div>
                      Procesamiento: <span className="cifra">{hechos}/{l.resumen?.totalArchivos ?? l.archivos}</span>
                      <Barra valor={hechos} total={l.resumen?.totalArchivos ?? l.archivos} tono="bueno" />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-4">
            <ResumenEnVivo metricas={lotes.filter((l) => l.resumen).map((l) => l.resumen!.metricas)} />
          </div>
        </Tarjeta>
      )}
    </div>
  );
}
