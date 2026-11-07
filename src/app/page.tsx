import { NuevoProceso } from "@/componentes/NuevoProceso";

export default function Inicio() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Procesar facturas</h1>
        <p className="text-sm text-muted">
          Elige la carpeta con las imágenes. Se divide en lotes y se procesa en segundo plano: puedes subir el
          siguiente o cambiar de página mientras tanto.
        </p>
      </div>
      <NuevoProceso />
    </main>
  );
}
