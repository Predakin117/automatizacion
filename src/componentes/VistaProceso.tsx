"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { calcularTasas } from "@/lib/procesamiento/metricas";
import { terminados, type ResumenProceso } from "@/lib/modelo/vista";
import { EVENTO_LOTE_TERMINADO, api, apiJson, postJson } from "./api";
import { duracion, fechaHora, pesos, porcentaje } from "./formato";
import { ResumenEnVivo } from "./ResumenEnVivo";
import { Aviso, Barra, Cifra, EstadoLote, Insignia, Tarjeta } from "./ui";

interface FilaFactura {
  hash: string;
  archivo: string;
  numero: string | null;
  fecha: string | null;
  proveedor: string | null;
  clienteNombre: string | null;
  subtotal: number | null;
  iva: number | null;
  impoconsumo: number | null;
  total: number | null;
  estado: "aceptada" | "revision";
  motivos: string[];
  corregidaManualmente: boolean;
  rotacionAplicada: number;
  esDeEsteLote: boolean;
}

type Filtro = "todas" | "aceptada" | "revision";

/** Detalle de un lote: avance en vivo (leyendo su propio documento) y, al terminar, la tabla. */
export function VistaProceso({ id }: { id: string }) {
  const [p, setP] = useState<ResumenProceso | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [facturas, setFacturas] = useState<FilaFactura[] | null>(null);
  const [errores, setErrores] = useState<{ archivo: string; error: string }[]>([]);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [regenerando, setRegenerando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const r = await api(`/api/procesos/${id}`);
    if (r.status === 404) return setError("Este lote no existe (o se borró).");
    if (!r.ok) return setError(`Error ${r.status}`);
    setP((await r.json()) as ResumenProceso);
  }, [id]);

  // 1 lectura cada 4 s, solo mientras procesa y la pestaña está visible.
  useEffect(() => {
    const primera = setTimeout(() => void cargar(), 0);
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void cargar();
    }, 4000);
    const alTerminar = (e: Event) => (e as CustomEvent<string>).detail === id && void cargar();
    window.addEventListener(EVENTO_LOTE_TERMINADO, alTerminar);
    return () => {
      clearTimeout(primera);
      clearInterval(t);
      window.removeEventListener(EVENTO_LOTE_TERMINADO, alTerminar);
    };
  }, [cargar, id]);

  const terminado = p?.estado === "terminado";
  // La lista de facturas cuesta ~2 lecturas por factura: se pide UNA vez, al terminar.
  useEffect(() => {
    if (!terminado || facturas) return;
    let vivo = true;
    apiJson<{ facturas: FilaFactura[]; errores: { archivo: string; error: string }[] }>(`/api/procesos/${id}/facturas`)
      .then((d) => {
        if (!vivo) return;
        setFacturas(d.facturas);
        setErrores(d.errores);
      })
      .catch((e: unknown) => vivo && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      vivo = false;
    };
  }, [terminado, facturas, id]);

  async function regenerar() {
    setRegenerando(true);
    setMensaje(null);
    try {
      const r = await postJson(`/api/procesos/${id}/regenerar-excel`);
      setMensaje(r.ok ? "Excel regenerado con las correcciones a mano." : `No se pudo regenerar (error ${r.status}).`);
      await cargar();
    } finally {
      setRegenerando(false);
    }
  }

  if (error) return <Aviso>{error}</Aviso>;
  if (!p) return <p className="text-muted">Cargando…</p>;
  const t = calcularTasas(p.metricas);
  const hechos = terminados(p);
  const visibles = (facturas ?? []).filter((f) => filtro === "todas" || f.estado === filtro);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{p.carpeta}</h1>
        <EstadoLote estado={p.estado} />
      </div>
      <p className="text-sm text-muted">
        Inicio {fechaHora(p.inicio)}
        {p.fin && p.inicio ? ` · terminó en ${duracion(p.fin - p.inicio)}` : ""}
      </p>

      <Tarjeta titulo="Avance">
        <div className="mb-2 flex justify-between text-sm">
          <span>
            <span className="cifra">{hechos}</span> de <span className="cifra">{p.totalArchivos}</span> archivos
          </span>
          <span className="text-muted">
            ✓ {t.correctas} · ✕ {t.malLeidas} · duplicadas {p.metricas.duplicadas}
          </span>
        </div>
        <Barra valor={hechos} total={p.totalArchivos} tono="bueno" alto="h-3" />
      </Tarjeta>

      <ResumenEnVivo metricas={[p.metricas]} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Cifra etiqueta="Leídas correctamente" valor={porcentaje(t.pctCorrectas)} nota={`${t.correctas} de ${t.procesadas}`} />
        <Cifra etiqueta="Mal leídas" valor={porcentaje(t.pctMalLeidas)} nota={`${t.malLeidas} (${t.revisadasAMano} revisadas a mano)`} />
        <Cifra etiqueta="Clientes nuevos" valor={p.metricas.clientesNuevos} />
        <Cifra etiqueta="Duplicadas" valor={p.metricas.duplicadas} />
      </div>

      {terminado && (
        <div className="flex flex-wrap items-center gap-3">
          {p.rutaExcel && (
            <a href={`/api/procesos/${id}/excel`} className="boton-primario">
              ⭳ Descargar Excel
            </a>
          )}
          {p.metricas.manuales.n > 0 && (
            <button type="button" className="boton" disabled={regenerando} onClick={() => void regenerar()}>
              {regenerando ? "Regenerando…" : "Regenerar el Excel con las correcciones a mano"}
            </button>
          )}
          {mensaje && <span className="text-sm text-muted">{mensaje}</span>}
        </div>
      )}

      {terminado && facturas && (
        <Tarjeta titulo={`Facturas (${facturas.length})`}>
          <div className="mb-3 flex gap-2 text-sm" role="group" aria-label="Filtrar por estado">
            {(["todas", "aceptada", "revision"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFiltro(f)}
                aria-pressed={filtro === f}
                className={`rounded-md px-3 py-1 ${filtro === f ? "bg-acento text-acento-texto" : "border border-borde"}`}
              >
                {f === "todas" ? "Todas" : f === "aceptada" ? "Aceptadas" : "En revisión"}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm" data-prueba="tabla-facturas">
              <thead className="text-left text-xs uppercase text-muted">
                <tr>
                  <th className="py-2 pr-3">Archivo</th>
                  <th className="py-2 pr-3">Número</th>
                  <th className="py-2 pr-3">Proveedor</th>
                  <th className="py-2 pr-3">Cliente</th>
                  <th className="py-2 pr-3 text-right">Antes de IVA</th>
                  <th className="py-2 pr-3 text-right">IVA</th>
                  <th className="py-2 pr-3 text-right">Impoconsumo</th>
                  <th className="py-2 pr-3 text-right">Total</th>
                  <th className="py-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((f) => (
                  <tr key={f.hash} className="border-t border-borde align-top">
                    <td className="py-2 pr-3">
                      <a
                        href={`/api/facturas/${f.hash}/imagen${f.rotacionAplicada ? `?rotar=${f.rotacionAplicada}` : ""}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-acento hover:underline"
                      >
                        {f.archivo}
                      </a>
                      {f.rotacionAplicada > 0 && <div className="text-xs text-muted">↻ enderezada automáticamente ({f.rotacionAplicada}°)</div>}
                      {!f.esDeEsteLote && <div className="text-xs text-muted">ya estaba (duplicada)</div>}
                    </td>
                    <td className="cifra py-2 pr-3">{f.numero ?? "—"}</td>
                    <td className="py-2 pr-3">{f.proveedor ?? "—"}</td>
                    <td className="py-2 pr-3">{f.clienteNombre ?? "—"}</td>
                    <td className="cifra py-2 pr-3 text-right">{pesos(f.subtotal)}</td>
                    <td className="cifra py-2 pr-3 text-right">{pesos(f.iva)}</td>
                    <td className="cifra py-2 pr-3 text-right">{pesos(f.impoconsumo)}</td>
                    <td className="cifra py-2 pr-3 text-right">{pesos(f.total)}</td>
                    <td className="py-2">
                      {f.estado === "aceptada" ? (
                        <Insignia tono="bueno">{f.corregidaManualmente ? "Aceptada a mano" : "Aceptada"}</Insignia>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <Link href={`/revision/${f.hash}`} className="w-fit">
                            <Insignia tono="malo">En revisión</Insignia>
                          </Link>
                          <span className="text-xs text-muted">{f.motivos.join("; ")}</span>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {errores.length > 0 && (
            <div className="mt-3">
              <Aviso>
                {errores.length} archivo(s) no se pudieron leer: {errores.map((e) => `${e.archivo} (${e.error})`).join("; ")}
              </Aviso>
            </div>
          )}
        </Tarjeta>
      )}
    </div>
  );
}
