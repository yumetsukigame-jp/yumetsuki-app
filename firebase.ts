// app/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getFunctions } from "firebase/functions";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyDaoJLk44JYOQkij3XF_OUoui2cqjQLP_k",
  authDomain: "point-app-1f854.firebaseapp.com",
  projectId: "point-app-1f854",
  storageBucket: "point-app-1f854.appspot.com", // ← Functions 用なので触らない
  messagingSenderId: "892402029397",
  appId: "1:892402029397:web:d58294a612406c47ce95dc",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const db = getFirestore(app);
export const auth = getAuth(app);

// ★ これが正しい（gs:// は絶対に使わない）
export const storage = getStorage(app, "https://point-app-1f854.firebasestorage.app");

export const functions = getFunctions(app, "us-east1");
