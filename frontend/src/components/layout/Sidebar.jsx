import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, MessageSquare, Users, FileText,
  Megaphone, CreditCard, User, LogOut, X, Wifi
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import Badge from '../ui/Badge';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/whatsapp', icon: Wifi, label: 'WhatsApp' },
  { to: '/contacts', icon: Users, label: 'Contacts' },
  { to: '/templates', icon: FileText, label: 'Templates' },
  { to: '/campaigns', icon: Megaphone, label: 'Campaigns' },
  { to: '/credits', icon: CreditCard, label: 'Credits' },
  { to: '/profile', icon: User, label: 'Profile' },
];

export default function Sidebar({ open, onClose }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const waStatusColor = {
    connected: 'green',
    disconnected: 'default',
    connecting: 'yellow',
    qr_ready: 'blue',
  }[user?.wa_status] || 'default';

  return (
    <>
      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/30 z-30 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 h-full w-64 bg-white border-r border-surface-100
          z-40 flex flex-col transition-transform duration-300 ease-out
          lg:translate-x-0 lg:static lg:z-auto
          ${open ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-brand-600 rounded-xl flex items-center justify-center shrink-0">
              <MessageSquare className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-surface-900 text-base tracking-tight">Proxy Send</span>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden w-7 h-7 flex items-center justify-center rounded-lg hover:bg-surface-100 text-surface-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* User info */}
        <div className="px-4 py-3 border-b border-surface-50">
          <div className="flex items-center gap-2.5 bg-surface-50 rounded-xl px-3 py-2.5">
            <div className="w-8 h-8 bg-brand-100 rounded-lg flex items-center justify-center shrink-0">
              <span className="text-brand-700 font-semibold text-sm">
                {user?.name?.[0]?.toUpperCase() || 'U'}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-surface-800 truncate">{user?.name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Badge variant={waStatusColor} size="sm" dot>
                  {user?.wa_status === 'connected' ? 'Connected' :
                   user?.wa_status === 'qr_ready' ? 'Scan QR' :
                   user?.wa_status === 'connecting' ? 'Connecting' : 'Offline'}
                </Badge>
              </div>
            </div>
          </div>
        </div>

        {/* Credits */}
        <div className="px-4 py-2.5 border-b border-surface-50">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-xs text-surface-500 font-medium">Credits</span>
            <span className="text-sm font-bold text-brand-600">{(user?.credits || 0).toLocaleString()}</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-3 overflow-y-auto scrollbar-thin">
          <ul className="space-y-0.5">
            {navItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  onClick={onClose}
                  className={({ isActive }) => `
                    flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                    transition-all duration-150
                    ${isActive
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-surface-600 hover:bg-surface-50 hover:text-surface-800'
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

        {/* Logout */}
        <div className="p-3 border-t border-surface-100">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-surface-500 hover:bg-red-50 hover:text-red-600 transition-all w-full"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
