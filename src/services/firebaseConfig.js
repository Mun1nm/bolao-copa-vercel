// src/services/firebaseConfig.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const configuredAuthDomain = import.meta.env.VITE_AUTH_DOMAIN;
const currentHost = typeof window !== "undefined" ? window.location.hostname : "";
const isLocalHost = currentHost === "localhost" || currentHost === "127.0.0.1";
const shouldUseSameOriginAuth =
  currentHost &&
  !isLocalHost &&
  !currentHost.endsWith(".firebaseapp.com") &&
  !currentHost.endsWith(".web.app");

// Configuração do Firebase usando variáveis de ambiente (Vite)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_API_KEY,
  authDomain: shouldUseSameOriginAuth ? currentHost : configuredAuthDomain,
  projectId: import.meta.env.VITE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_APP_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Exportações
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
