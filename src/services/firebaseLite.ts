import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore/lite';
import { firebaseConfig } from './firebaseConfig';

// Lightweight one-shot Firestore (firebase/firestore/lite) for the PUBLIC
// read-only pages. The lite SDK has no realtime listeners and no local cache,
// so it is a fraction of the size of the full SDK in firebase.ts.
//
// It runs on a SEPARATE, named Firebase app instance ('lite') on purpose: the
// full SDK (admin) calls initializeFirestore() on the default app, and the two
// Firestore entrypoints cannot both initialize Firestore on the same app
// instance. Using a distinct app keeps public→admin SPA navigation from
// tripping an "already initialized" error.
const liteApp = initializeApp(firebaseConfig, 'lite');
export const liteDb = getFirestore(liteApp);

export default liteApp;
