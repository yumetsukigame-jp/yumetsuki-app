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
  storageBucket: "point-app-1f854.firebasestorage.app", // ← ★ここが最重要（修正済み）
  messagingSenderId: "892402029397",
  appId: "1:892402029397:web:d58294a612406c47ce95dc",
};

// initializeApp（複数回初期化を防ぐ）
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Firestore
export const db = getFirestore(app);

// Auth
export const auth = getAuth(app);

// Storage（第二引数は絶対に付けない）
export const storage = getStorage(app);

// Functions（リージョン us-east1）
export const functions = getFunctions(app, "us-east1");
