"use client";
import { usePathname } from "next/navigation";
import { MenuSuperior } from "./MenuSuperior";

/** Pone el menú (y con él el Motor) en todas las páginas menos /login. */
export function Cascaron() {
  const ruta = usePathname();
  if (ruta === "/login") return null;
  return <MenuSuperior />;
}
