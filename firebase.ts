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
  storageBucket: "point-app-1f854.firebasestorage.app",
  messagingSenderId: "892402029397",
  appId: "1:892402029397:web:d58294a612406c47ce95dc"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const db = getFirestore(app);

// ★ Auth はクライアント側でのみ永続化を設定する
export const auth = getAuth(app);

if (typeof window !== "undefined") {
  setPersistence(auth, browserLocalPersistence);
}

// ★ Storage
export const storage = getStorage(app, "gs://point-app-1f854.firebasestorage.app");

// ★ Functions
export const functions = getFunctions(app, "us-central1");
