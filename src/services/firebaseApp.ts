import { initializeApp } from 'firebase/app';
import { getAuth, sendPasswordResetEmail as firebaseSendReset, type Auth } from 'firebase/auth';
import { firebaseConfig } from './firebaseConfig';

// App + Auth init ONLY — deliberately free of any firebase/firestore import so
// that importing `auth` (e.g. from AuthContext, mounted at the app root) does
// NOT drag the heavy realtime Firestore SDK into the shared/public bundle.
// The full Firestore SDK lives in firebase.ts (admin); the lite SDK in
// firebaseLite.ts (public read-only pages).
const app = initializeApp(firebaseConfig);

// getAuth validates the API key and touches browser-only APIs, so only
// initialize it in the browser. During build-time prerender (Node) `auth` is
// never used — onAuthStateChanged and all sign-in calls run in client effects —
// so a non-browser placeholder is safe and keeps the SSG build from crashing.
export const auth: Auth =
  typeof window !== 'undefined' ? getAuth(app) : (undefined as unknown as Auth);

export async function sendPasswordResetEmail(email: string) {
  await firebaseSendReset(auth, email);
}

export default app;
