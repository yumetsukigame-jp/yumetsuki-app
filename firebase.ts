// app/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyDaoJLk44JYOQkij3XF_OUoui2cqjQLP_k",
  authDomain: "point-app-1f854.firebaseapp.com",
  projectId: "point-app-1f854",
  storageBucket: "point-app-1f854.firebasestorage.app",
  messagingSenderId: "892402029397",
  appId: "1:892402029397:web:d58294a612406c47ce95dc"
};

// ★ initializeApp は 1 回だけ
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Firestore
export const db = getFirestore(app);

// Auth（永続化設定）
export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence);

// ★ Gen2 Functions は region を必ず指定
export const functions = getFunctions(app, "us-central1");
