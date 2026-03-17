import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { useAuth } from '../../context/AuthContext';
import { useSSE } from '../../hooks/useSSE';
import { waApi } from '../../lib/api';

const pageTitles = {
  '/dashboard': 'Dashboard',
  '/whatsapp': 'WhatsApp Connection',
  '/contacts': 'Contacts',
  '/templates': 'Templates',
  '/campaigns': 'Campaigns',
  '/credits': 'Credits & Billing',
  '/profile': 'Profile',
};

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, updateUser } = useAuth();
  const location = useLocation();

  const title = pageTitles[location.pathname] ||
    (location.pathname.startsWith('/campaigns/') ? 'Campaign Detail' : 'Proxy Send');

  useSSE('/api/sse/user', {
    events: {
      snapshot: (data) => {
        updateUser({ credits: data.credits, wa_status: data.wa_status });
      },
      credits_update: (data) => {
        updateUser({ credits: data.credits });
      },
      wa_status: (data) => {
        updateUser({ wa_status: data.status });
      },
    },
    onPoll: async () => {
      try {
        const res = await waApi.status();
        updateUser({ wa_status: res.data.status });
      } catch {}
    },
  }, { enabled: !!user });

  return (
    <div className="flex h-screen bg-surface-50 overflow-hidden">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Topbar onMenuClick={() => setSidebarOpen(true)} title={title} />
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="p-4 sm:p-6 max-w-6xl mx-auto animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
