"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ResumenProceso } from "@/lib/modelo/vista";
import { EVENTO_LOTE_INICIADO, EVENTO_LOTE_TERMINADO, apiJson } from "./api";

export interface DatosMetricas {
  procesos: ResumenProceso[];
  clientes: number;
}

/**
 * Carga /api/metricas (1 lectura por lote + 1). Se refresca sola cada 8 s SOLO mientras haya
 * lotes procesándose y la pestaña esté visible, y al instante con los eventos del Motor.
 */
export function useMetricas() {
  const [datos, setDatos] = useState<DatosMetricas | null>(null);
  const [error, setError] = useState<string | null>(null);
  const procesando = useRef(false);

  const cargar = useCallback(async () => {
    try {
      const d = await apiJson<DatosMetricas>("/api/metricas");
      procesando.current = d.procesos.some((p) => p.estado !== "terminado");
      setDatos(d);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    const primera = setTimeout(() => void cargar(), 0);
    const t = setInterval(() => {
      if (procesando.current && document.visibilityState === "visible") void cargar();
    }, 8000);
    const alEvento = () => void cargar();
    window.addEventListener(EVENTO_LOTE_INICIADO, alEvento);
    window.addEventListener(EVENTO_LOTE_TERMINADO, alEvento);
    return () => {
      clearTimeout(primera);
      clearInterval(t);
      window.removeEventListener(EVENTO_LOTE_INICIADO, alEvento);
      window.removeEventListener(EVENTO_LOTE_TERMINADO, alEvento);
    };
  }, [cargar]);

  return { datos, error, recargar: cargar };
}
