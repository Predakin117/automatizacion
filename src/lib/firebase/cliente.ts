"use client";
import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { initializeAuth, inMemoryPersistence, type Auth } from "firebase/auth";

/**
 * Firebase en el NAVEGADOR: solo Authentication (el navegador nunca habla con Firestore).
 * Estas variables son públicas por diseño; la seguridad está en el servidor.
 * Se escriben una por una (process.env.NEXT_PUBLIC_…) para que Next las inserte al compilar.
 */
const configuracion = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let authNavegador: Auth | undefined;

export function authCliente(): Auth {
  if (authNavegador) return authNavegador;
  const app: FirebaseApp = getApps()[0] ?? initializeApp(configuracion);
  // Persistencia en memoria: el navegador no guarda la sesión de Firebase. La sesión real
  // es la cookie httpOnly que crea el servidor (el JavaScript de la página no puede leerla).
  authNavegador = initializeAuth(app, { persistence: inMemoryPersistence });
  return authNavegador;
}
