// app/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, browserLocalPersistence, setPersistence } from "firebase/auth";
import { getFunctions } from "firebase/functions";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyDaoJLk44JYOQkij3XF_OUoui2cqjQLP_k",
  authDomain: "point-app-1f854.firebaseapp.com",
  projectId: "point-app-1f854",
  storageBucket: "point-app-1f854.appspot.com",   // ← 修正（.appspot.com）
  messagingSenderId: "892402029397",
  appId: "1:892402029397:web:d58294a612406c47ce95dc"
};

// ★ initializeApp（複数回初期化を防ぐ）
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// ★ Firestore
export const db = getFirestore(app);

// ★ Auth（SSR対策）
export const auth = getAuth(app);
if (typeof window !== "undefined") {
  setPersistence(auth, browserLocalPersistence);
}

// ★ Storage（Web SDK は getStorage(app) だけで OK）
export const storage = getStorage(app);  // ← 修正

// ★ Functions（リージョンは us-east1）
export const functions = getFunctions(app, "us-east1");
