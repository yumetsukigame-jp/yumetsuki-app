import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

export function getNanikaImageDb() {
  const appName = "nanika-gacha-images";
  let imageApp = getApps().find(app => app.name === appName);
  if (!imageApp) {
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;
    imageApp = initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID ?? process.env.GCLOUD_PROJECT,
      credential: clientEmail || privateKey ? cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail,
        privateKey: privateKey?.replace(/\\n/g, "\n"),
      }) : applicationDefault(),
    }, appName);
  }
  return getFirestore(imageApp);
}
