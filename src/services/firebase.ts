import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import app, { auth, sendPasswordResetEmail } from './firebaseApp';

// FULL realtime Firestore SDK (onSnapshot + persistent multi-tab cache).
// Only the ADMIN portal needs live updates, so this module must only be
// imported from admin chunks. Public read-only pages use firebaseLite.ts.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

// Re-exported for back-compat so admin components that did
// `import { auth } from './firebase'` keep working. Auth itself lives in
// firebaseApp.ts and carries no Firestore dependency.
export { auth, sendPasswordResetEmail };

export default app;
