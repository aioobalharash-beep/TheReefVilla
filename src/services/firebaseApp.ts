import { initializeApp } from 'firebase/app';
import { getAuth, sendPasswordResetEmail as firebaseSendReset } from 'firebase/auth';
import { firebaseConfig } from './firebaseConfig';

// App + Auth init ONLY — deliberately free of any firebase/firestore import so
// that importing `auth` (e.g. from AuthContext, mounted at the app root) does
// NOT drag the heavy realtime Firestore SDK into the shared/public bundle.
// The full Firestore SDK lives in firebase.ts (admin); the lite SDK in
// firebaseLite.ts (public read-only pages).
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

export async function sendPasswordResetEmail(email: string) {
  await firebaseSendReset(auth, email);
}

export default app;
