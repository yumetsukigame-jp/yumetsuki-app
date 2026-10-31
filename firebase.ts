// app/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  connectFirestoreEmulator,
} from "firebase/firestore";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import { getStorage, connectStorageEmulator } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyDaoJLk44JYOQkij3XF_OUoui2cqjQLP_k",
  authDomain: "point-app-1f854.firebaseapp.com",
  projectId: "point-app-1f854",
  storageBucket: "point-app-1f854.firebasestorage.app", // ← ★ここが最重要（修正済み）
  messagingSenderId: "892402029397",
  appId: "1:892402029397:web:d58294a612406c47ce95dc",
};

// initializeApp（複数回初期化を防ぐ）
const useEmulators = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true";
const app = getApps().length === 0 ? initializeApp(useEmulators ? {
  ...firebaseConfig,
  projectId: "demo-yumetsuki",
  authDomain: "demo-yumetsuki.firebaseapp.com",
  apiKey: "demo-key",
  appId: "demo-app",
} : firebaseConfig) : getApp();

// Firestore
export const db = (() => {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache(),
    });
  } catch {
    return getFirestore(app);
  }
})();

// Auth
export const auth = getAuth(app);

// Storage（第二引数は絶対に付けない）
export const storage = getStorage(app);

// Functions（リージョン us-east1）
export const functions = getFunctions(app, "us-east1");

if (useEmulators && !auth.emulatorConfig) {
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  connectStorageEmulator(storage, "127.0.0.1", 9199);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
}
