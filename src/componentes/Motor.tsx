"use client";
import { useEffect, useSyncExternalStore } from "react";
import { EVENTO_LOTE_INICIADO, EVENTO_LOTE_TERMINADO, apiJson, emitir, postJson } from "./api";

/**
 * MOTOR: procesa los lotes en segundo plano desde el navegador. Vercel no tiene procesos de
 * larga vida, así que el navegador va pidiendo trabajo: 3 trabajadores llaman a /lote en
 * paralelo (cada llamada es otra instancia de la función → paralelismo real con 1 vCPU).
 * Vive en el layout: no se desmonta al cambiar de página. Al montarse retoma los lotes que
 * quedaron "ejecutando" (por ejemplo, si se cerró la pestaña): todo es idempotente.
 */

const TRABAJADORES = 3;
const REVISAR_FINALIZAR_MS = 5_000;

interface EstadoLote {
  esperarHasta: number; // agotado: no hay archivos disponibles; se vuelve a mirar después
  errores: number;
}

class MotorLotes {
  private lotes = new Map<string, EstadoLote>();
  private arrancado = false;
  private oyentes = new Set<() => void>();
  private instantanea: string[] = [];
  private turno = 0;
  sesionCaducada = false;

  suscribir = (oyente: () => void) => {
    this.oyentes.add(oyente);
    return () => this.oyentes.delete(oyente);
  };
  activos = () => this.instantanea;

  private avisar() {
    this.instantanea = [...this.lotes.keys()];
    for (const o of this.oyentes) o();
  }

  agregar(id: string) {
    if (!this.lotes.has(id)) {
      this.lotes.set(id, { esperarHasta: 0, errores: 0 });
      this.avisar();
    }
  }

  private quitar(id: string) {
    if (this.lotes.delete(id)) this.avisar();
  }

  arrancar() {
    if (this.arrancado) return; // un solo Motor aunque el componente se monte dos veces
    this.arrancado = true;
    window.addEventListener(EVENTO_LOTE_INICIADO, (e) => this.agregar((e as CustomEvent<string>).detail));
    apiJson<{ procesos: { id: string }[] }>("/api/procesos?estado=ejecutando")
      .then(({ procesos }) => procesos.forEach((p) => this.agregar(p.id)))
      .catch(() => undefined);
    for (let i = 0; i < TRABAJADORES; i++) void this.trabajador();
  }

  /** Elige por turnos un lote que no esté esperando. */
  private elegir(): string | null {
    const ids = [...this.lotes.keys()];
    const ahora = Date.now();
    for (let k = 0; k < ids.length; k++) {
      const id = ids[(this.turno + k) % ids.length];
      if (this.lotes.get(id)!.esperarHasta <= ahora) {
        this.turno = (this.turno + k + 1) % Math.max(1, ids.length);
        return id;
      }
    }
    return null;
  }

  private async trabajador(): Promise<void> {
    while (!this.sesionCaducada) {
      const id = this.elegir();
      if (!id) {
        await dormir(1000);
        continue;
      }
      const estado = this.lotes.get(id)!;
      try {
        const r = await postJson(`/api/procesos/${id}/lote`);
        if (r.status === 404) {
          this.quitar(id); // el lote se borró
          continue;
        }
        if (r.status === 401) {
          this.sesionCaducada = true;
          return;
        }
        if (!r.ok) throw new Error(`lote ${r.status}`);
        const res = (await r.json()) as { reclamados: number };
        estado.errores = 0;
        if (res.reclamados > 0) continue;

        // No quedan archivos disponibles: intentar cerrar el lote. Si otra llamada aún tiene
        // archivos en proceso, finalizar responde listo: false y se reintenta cada 5 s (y
        // también se vuelve a pedir /lote por si caducó el arrendamiento de una función caída).
        estado.esperarHasta = Date.now() + REVISAR_FINALIZAR_MS;
        const f = await postJson(`/api/procesos/${id}/finalizar`);
        if (f.status === 404) {
          this.quitar(id);
          continue;
        }
        if (!f.ok) throw new Error(`finalizar ${f.status}`);
        const fin = (await f.json()) as { listo: boolean };
        if (fin.listo) {
          this.quitar(id);
          emitir(EVENTO_LOTE_TERMINADO, id);
        }
      } catch {
        // Error de red o del servidor: esperar cada vez más (hasta 30 s) y reintentar.
        estado.errores++;
        estado.esperarHasta = Date.now() + Math.min(30_000, 1000 * 2 ** estado.errores);
      }
    }
  }
}

function dormir(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const motor = typeof window !== "undefined" ? new MotorLotes() : null;

// useSyncExternalStore compara las instantáneas por IDENTIDAD: devolver `[]` nuevo en cada
// llamada le hace creer que el estado cambió siempre (aviso de bucle infinito en desarrollo).
// Por eso el arreglo vacío y las funciones son constantes, definidas una sola vez.
const NINGUNO: string[] = [];
const sinSuscripcion = () => () => undefined;
const instantaneaVacia = () => NINGUNO;
const suscribirMotor = motor ? motor.suscribir : sinSuscripcion;
const instantaneaMotor = motor ? motor.activos : instantaneaVacia;

/** Lotes que el Motor está procesando (para indicadores). */
export function useLotesActivos(): string[] {
  return useSyncExternalStore(suscribirMotor, instantaneaMotor, instantaneaVacia);
}

/** Se monta UNA vez en el layout (Cascaron). Muestra «Procesando N lotes…». */
export function Motor() {
  const activos = useLotesActivos();
  useEffect(() => {
    motor?.arrancar();
  }, []);
  if (activos.length === 0) return null;
  return (
    <span className="inline-flex items-center gap-2 text-sm text-aviso" aria-live="polite">
      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-aviso" aria-hidden />
      Procesando {activos.length} {activos.length === 1 ? "lote" : "lotes"}…
    </span>
  );
}
