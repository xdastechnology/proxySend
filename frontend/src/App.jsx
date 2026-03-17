import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import AppLayout from './components/layout/AppLayout';
import AdminLayout from './components/admin/AdminLayout';
import Spinner from './components/ui/Spinner';

const Login = lazy(() => import('./pages/auth/Login'));
const Register = lazy(() => import('./pages/auth/Register'));
const Dashboard = lazy(() => import('./pages/user/Dashboard'));
const WhatsApp = lazy(() => import('./pages/user/WhatsApp'));
const Contacts = lazy(() => import('./pages/user/Contacts'));
const Templates = lazy(() => import('./pages/user/Templates'));
const Campaigns = lazy(() => import('./pages/user/Campaigns'));
const CampaignDetail = lazy(() => import('./pages/user/CampaignDetail'));
const Credits = lazy(() => import('./pages/user/Credits'));
const Profile = lazy(() => import('./pages/user/Profile'));
const AdminLogin = lazy(() => import('./pages/admin/AdminLogin'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminManage = lazy(() => import('./pages/admin/AdminManage'));

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

function FullPageSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-50">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-brand-500 flex items-center justify-center">
          <span className="text-white font-bold text-lg">P</span>
        </div>
        <Spinner size="md" className="text-brand-500" />
      </div>
    </div>
  );
}

function ErrorBoundary({ children }) {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Spinner size="lg" className="text-brand-500" />
        </div>
      }
    >
      {children}
    </React.Suspense>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ErrorBoundary>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
          <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />

          {/* Admin */}
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="manage" element={<AdminManage />} />
          </Route>

          {/* User */}
          <Route
            path="/"
            element={
              <PrivateRoute>
                <AppLayout />
              </PrivateRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="whatsapp" element={<WhatsApp />} />
            <Route path="contacts" element={<Contacts />} />
            <Route path="templates" element={<Templates />} />
            <Route path="campaigns" element={<Campaigns />} />
            <Route path="campaigns/:id" element={<CampaignDetail />} />
            <Route path="credits" element={<Credits />} />
            <Route path="profile" element={<Profile />} />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </ErrorBoundary>
    </AuthProvider>
  );
}
