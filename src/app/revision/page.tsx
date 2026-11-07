import { ListaRevision } from "@/componentes/ListaRevision";

export default function Revision() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Revisión manual</h1>
        <p className="text-sm text-muted">
          Facturas que la máquina no pudo aceptar. Ábrelas, compáralas con la imagen y corrígelas: quedan aceptadas con
          constancia de quién las revisó. No cambian el porcentaje de «leídas correctamente», que mide a la máquina.
        </p>
      </div>
      <ListaRevision />
    </main>
  );
}
