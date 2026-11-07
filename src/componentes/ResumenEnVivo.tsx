"use client";
import type { MetricasLote } from "@/lib/modelo/tipos";
import { calcularTasas, sumarMetricas } from "@/lib/procesamiento/metricas";
import { pesos } from "./formato";
import { Cifra } from "./ui";

/** Cifras acumuladas en vivo (aceptadas por la máquina + revisadas a mano). */
export function ResumenEnVivo({ metricas }: { metricas: MetricasLote[] }) {
  const m = sumarMetricas(metricas);
  const t = calcularTasas(m);
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Cifra etiqueta="Antes de IVA" valor={pesos(t.procesado.subtotal)} nota={`${t.procesado.n} facturas aceptadas`} />
      <Cifra etiqueta="IVA" valor={pesos(t.procesado.iva)} />
      <Cifra etiqueta="Impoconsumo" valor={pesos(t.procesado.impoconsumo)} />
      <Cifra etiqueta="Total" valor={pesos(t.procesado.total)} nota={t.malLeidas ? `${t.malLeidas} en revisión (no incluidas)` : undefined} />
    </div>
  );
}
