import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Outlet, useRoutes, type RouteObject } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { ScrollToTop } from './components/ScrollToTop';

// Public shell loaded eagerly (small, no Firestore). The admin shell is lazy:
// it pulls the full realtime Firestore SDK (notifications), which must stay out
// of the public/landing bundle.
import { ClientLayout } from './components/ClientLayout';
const Layout = lazy(() => import('./components/Layout').then(m => ({ default: m.Layout })));

// ── Guest / Public pages ──
const Sanctuary = lazy(() => import('./components/Sanctuary').then(m => ({ default: m.Sanctuary })));
const Booking = lazy(() => import('./components/Booking').then(m => ({ default: m.Booking })));
const Confirmation = lazy(() => import('./components/Confirmation').then(m => ({ default: m.Confirmation })));
const Testimonials = lazy(() => import('./components/Testimonials').then(m => ({ default: m.Testimonials })));
const Terms = lazy(() => import('./components/Terms').then(m => ({ default: m.Terms })));
const About = lazy(() => import('./components/About').then(m => ({ default: m.About })));
const Login = lazy(() => import('./components/Login').then(m => ({ default: m.Login })));

// ── Admin pages (completely separate chunk) ──
const Dashboard = lazy(() => import('./components/Dashboard').then(m => ({ default: m.Dashboard })));
const Calendar = lazy(() => import('./components/Calendar').then(m => ({ default: m.Calendar })));
const Guests = lazy(() => import('./components/Guests').then(m => ({ default: m.Guests })));
const Invoices = lazy(() => import('./components/Invoices').then(m => ({ default: m.Invoices })));
const Reports = lazy(() => import('./components/Reports').then(m => ({ default: m.Reports })));
const PropertyEditor = lazy(() => import('./components/PropertyEditor').then(m => ({ default: m.PropertyEditor })));

export function LoadingScreen() {
  return (
    <div className="min-h-screen bg-pearl-white flex items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-bold font-headline text-primary-navy">Reef Villa</h1>
        <div className="w-8 h-8 border-2 border-primary-navy/20 border-t-secondary-gold rounded-full animate-spin mx-auto" />
      </div>
    </div>
  );
}

// Root layout for every route: app-wide providers + scroll reset + a Suspense
// boundary for the lazy route components. Rendered inside the router so router
// hooks (useLocation in ScrollToTop) work. Public routes deliberately do NOT
// wait on auth — only AdminRoute does — so the landing paints immediately
// (and prerenders without an auth round-trip).
function RootLayout() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <ScrollToTop />
        <Suspense fallback={<LoadingScreen />}>
          <Outlet />
        </Suspense>
      </AuthProvider>
    </LanguageProvider>
  );
}

function AdminRoute({ children }: { children: ReactNode }) {
  const { user, isAdmin, isLoading } = useAuth();
  if (isLoading) return <LoadingScreen />;
  if (!user || !isAdmin) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function LoginRoute() {
  const { user, isAdmin } = useAuth();
  if (user) return <Navigate to={isAdmin ? '/admin' : '/'} replace />;
  return <Login />;
}

export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    children: [
      // Public / Client routes
      {
        path: '/',
        element: <ClientLayout />,
        children: [
          { index: true, Component: Sanctuary },
          { path: 'booking', Component: Booking },
          { path: 'testimonials', Component: Testimonials },
          { path: 'terms', Component: Terms },
          { path: 'about', Component: About },
          { path: 'confirmation', Component: Confirmation },
        ],
      },

      // Auth
      { path: '/login', element: <LoginRoute /> },

      // Admin routes
      {
        path: '/admin',
        element: <AdminRoute><Layout /></AdminRoute>,
        children: [
          { index: true, Component: Dashboard },
          { path: 'calendar', Component: Calendar },
          { path: 'guests', Component: Guests },
          { path: 'invoices', Component: Invoices },
          { path: 'reports', Component: Reports },
          { path: 'edit-property', Component: PropertyEditor },
        ],
      },

      // Fallback
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
];

/** Renders the route tree. Used by both the client and the prerender server. */
export function AppRoutes() {
  return useRoutes(routes);
}

export default routes;
