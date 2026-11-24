import { Suspense, lazy } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import Navbar from './components/Navbar.jsx';
import { PageLoader } from './components/Spinner.jsx';
import { useAuth } from './context/AuthContext.jsx';
import HubPage from './pages/HubPage.jsx';

// Heavier pages (and every game) are code-split.
const GamePage = lazy(() => import('./pages/GamePage.jsx'));
const LeaderboardPage = lazy(() => import('./pages/LeaderboardPage.jsx'));
const ProfilePage = lazy(() => import('./pages/ProfilePage.jsx'));
const LoginPage = lazy(() => import('./pages/LoginPage.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));

export default function App() {
  const { status } = useAuth();
  const location = useLocation();

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-16 pt-6 sm:px-6">
        {status === 'loading' ? (
          <PageLoader label="Restoring your session…" />
        ) : (
          <ErrorBoundary key={location.pathname}>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/" element={<HubPage />} />
                <Route path="/play/:slug" element={<GamePage />} />
                <Route path="/leaderboard" element={<LeaderboardPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        )}
      </main>
      <footer className="border-t border-ink-700/60 py-6 text-center text-xs text-ink-400">
        Game Hub · built with React, Express, Socket.io &amp; PostgreSQL
      </footer>
    </div>
  );
}
