import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Settings, LogOut, Shield, Menu, X } from 'lucide-react';
import { authApi } from '../../lib/api';
import Spinner from '../ui/Spinner';

export default function AdminLayout() {
  const [isAdmin, setIsAdmin] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    authApi.adminMe()
      .then(() => setIsAdmin(true))
      .catch(() => {
        setIsAdmin(false);
        navigate('/admin/login');
      });
  }, [navigate]);

  if (isAdmin === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-50">
        <Spinner className="text-brand-500" size="lg" />
      </div>
    );
  }

  if (!isAdmin) return null;

  const handleLogout = async () => {
    await authApi.logout();
    navigate('/admin/login');
  };

  return (
    <div className="flex h-screen bg-surface-50 overflow-hidden">
      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed top-0 left-0 h-full w-60 bg-white border-r border-surface-200
        z-40 flex flex-col transition-transform duration-300
        lg:translate-x-0 lg:static lg:z-auto
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-brand-600 rounded-xl flex items-center justify-center">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <div>
              <span className="font-bold text-surface-900 text-sm">Proxy Send</span>
              <p className="text-xs text-surface-400">Admin Panel</p>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-surface-400 hover:text-surface-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4">
          <ul className="space-y-0.5">
            {[
              { to: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
              { to: '/admin/manage', icon: Settings, label: 'Manage' },
            ].map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  onClick={() => setSidebarOpen(false)}
                  className={({ isActive }) => `
                    flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                    transition-all
                    ${isActive
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-surface-500 hover:bg-surface-100 hover:text-surface-800'
                    }
                  `}
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="p-3 border-t border-surface-100">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-surface-500 hover:bg-red-50 hover:text-red-600 transition-all w-full"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="bg-white border-b border-surface-200 px-4 sm:px-6 py-3 flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg text-surface-400 hover:text-surface-700 hover:bg-surface-100"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-sm font-semibold text-surface-700">Admin Panel</span>
          <div className="ml-auto">
            <span className="text-xs bg-brand-50 text-brand-700 border border-brand-200 px-2.5 py-1 rounded-full font-medium">
              Administrator
            </span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto scrollbar-thin bg-surface-50">
          <div className="p-4 sm:p-6 max-w-7xl mx-auto animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}