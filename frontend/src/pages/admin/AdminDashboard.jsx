import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Users, MessageSquare, CreditCard, Clock, Wifi, WifiOff, RefreshCw, ArrowRight, TrendingUp } from 'lucide-react';
import { adminApi } from '../../lib/api';
import { useSSE } from '../../hooks/useSSE';
import Card, { CardHeader, CardTitle } from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';

function StatCard({ icon: Icon, label, value, iconBg, iconColor, loading }) {
  return (
    <Card>
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${iconBg}`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
        <div>
          <p className="text-xs text-surface-500 font-semibold uppercase tracking-wide">{label}</p>
          {loading ? (
            <div className="h-7 w-14 bg-surface-100 rounded-lg animate-pulse mt-1" />
          ) : (
            <p className="text-2xl font-bold text-surface-900 mt-0.5">
              {(value ?? 0).toLocaleString()}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await adminApi.dashboard();
      setData(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useSSE('/api/sse/admin', {
    events: {
      admin_snapshot: (d) => {
        setData(prev => prev ? { ...prev, stats: { ...prev.stats, ...d } } : prev);
      },
      stats_update: () => fetchData(),
      users_update: () => fetchData(),
    },
    onPoll: fetchData,
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-surface-900">Dashboard</h1>
          <p className="text-sm text-surface-500 mt-0.5">Platform overview</p>
        </div>
        <Button
          size="sm" variant="secondary"
          icon={<RefreshCw className="w-3.5 h-3.5" />}
          onClick={fetchData}
        >
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users}        label="Total Users"      value={data?.stats?.totalUsers}       iconBg="bg-blue-100"   iconColor="text-blue-600"   loading={loading} />
        <StatCard icon={MessageSquare} label="Messages Sent"   value={data?.stats?.totalMessages}    iconBg="bg-green-100"  iconColor="text-green-600"  loading={loading} />
        <StatCard icon={CreditCard}   label="Transactions"     value={data?.stats?.totalTransactions} iconBg="bg-purple-100" iconColor="text-purple-600" loading={loading} />
        <StatCard icon={Clock}        label="Pending Requests" value={data?.stats?.pendingRequests}  iconBg="bg-yellow-100" iconColor="text-yellow-600" loading={loading} />
      </div>

      {/* Pending Requests Alert */}
      {data?.stats?.pendingRequests > 0 && (
        <div className="flex items-center justify-between p-4 bg-yellow-50 border border-yellow-200 rounded-2xl">
          <div className="flex items-center gap-2 text-yellow-700">
            <Clock className="w-4 h-4" />
            <span className="text-sm font-medium">
              {data.stats.pendingRequests} credit request{data.stats.pendingRequests > 1 ? 's' : ''} pending review
            </span>
          </div>
          <Link to="/admin/manage">
            <Button size="sm" variant="outline" className="border-yellow-400 text-yellow-700 hover:bg-yellow-100">
              Review
            </Button>
          </Link>
        </div>
      )}

      {/* Users + Transactions grid */}
      <div className="grid lg:grid-cols-2 gap-5">
        {/* Users */}
        <Card>
          <CardHeader>
            <CardTitle>Users</CardTitle>
            <span className="text-xs text-surface-500 font-medium">{data?.users?.length || 0} users</span>
          </CardHeader>
          {loading ? (
            <div className="flex justify-center py-8"><Spinner className="text-brand-500" /></div>
          ) : !data?.users?.length ? (
            <EmptyState icon={<Users className="w-6 h-6" />} title="No users yet" />
          ) : (
            <div className="space-y-1 max-h-80 overflow-y-auto scrollbar-thin -mx-1">
              {data.users.slice(0, 20).map((u) => (
                <div key={u.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-50 transition-colors">
                  <div className="w-8 h-8 bg-brand-100 rounded-xl flex items-center justify-center shrink-0">
                    <span className="text-brand-700 font-semibold text-xs">{u.name?.[0]?.toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-surface-800 truncate">{u.name}</p>
                    <p className="text-xs text-surface-500 truncate">{u.email}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-semibold text-brand-700 bg-brand-50 px-2 py-0.5 rounded-full">
                      {(u.credits || 0).toLocaleString()}
                    </span>
                    {u.wa_status === 'connected'
                      ? <Wifi className="w-3.5 h-3.5 text-green-500" />
                      : <WifiOff className="w-3.5 h-3.5 text-surface-300" />}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Transactions */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Transactions</CardTitle>
          </CardHeader>
          {loading ? (
            <div className="flex justify-center py-8"><Spinner className="text-brand-500" /></div>
          ) : !data?.recentTransactions?.length ? (
            <EmptyState icon={<CreditCard className="w-6 h-6" />} title="No transactions" />
          ) : (
            <div className="space-y-1 max-h-80 overflow-y-auto scrollbar-thin -mx-1">
              {data.recentTransactions.map((tx) => (
                <div key={tx.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-50 transition-colors">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${tx.amount > 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                    <TrendingUp className={`w-3.5 h-3.5 ${tx.amount > 0 ? 'text-green-600' : 'text-red-600'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-surface-800 truncate">{tx.user_name}</p>
                    <p className="text-xs text-surface-500 truncate">{tx.note || tx.type}</p>
                  </div>
                  <span className={`text-sm font-bold shrink-0 ${tx.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {tx.amount > 0 ? '+' : ''}{tx.amount}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Reference Codes */}
      <Card>
        <CardHeader>
          <CardTitle>Reference Codes</CardTitle>
          <Link to="/admin/manage">
            <Button size="xs" variant="ghost" iconRight={<ArrowRight className="w-3 h-3" />}>
              Manage
            </Button>
          </Link>
        </CardHeader>
        {loading ? (
          <div className="flex justify-center py-8"><Spinner className="text-brand-500" /></div>
        ) : !data?.referenceCodes?.length ? (
          <EmptyState icon={<CreditCard className="w-6 h-6" />} title="No reference codes" />
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-100">
                  {['Code', '₹/Message', 'Users', 'Status'].map(h => (
                    <th key={h} className="text-left px-3 py-2.5 text-xs font-semibold text-surface-500 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-50">
                {data.referenceCodes.map(rc => (
                  <tr key={rc.id} className="hover:bg-surface-50 transition-colors">
                    <td className="px-3 py-3 font-mono font-bold text-brand-700">{rc.code}</td>
                    <td className="px-3 py-3 text-surface-700">₹{rc.inr_per_message}</td>
                    <td className="px-3 py-3 text-surface-700">{rc.user_count}</td>
                    <td className="px-3 py-3">
                      <Badge variant={rc.is_active ? 'green' : 'default'} dot>
                        {rc.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Pending Credit Requests */}
      {data?.pendingCreditRequests?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending Credit Requests</CardTitle>
            <Link to="/admin/manage">
              <Button size="xs" variant="ghost" iconRight={<ArrowRight className="w-3 h-3" />}>
                View all
              </Button>
            </Link>
          </CardHeader>
          <div className="space-y-2">
            {data.pendingCreditRequests.slice(0, 5).map(r => (
              <div key={r.id} className="flex items-center gap-3 p-3 bg-yellow-50 border border-yellow-100 rounded-xl">
                <div className="w-8 h-8 bg-yellow-100 rounded-xl flex items-center justify-center shrink-0">
                  <span className="text-yellow-700 font-bold text-xs">{r.user_name?.[0]?.toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-surface-800">{r.user_name}</p>
                  <p className="text-xs text-surface-500">
                    {r.requested_credits.toLocaleString()} credits · {new Date(r.created_at).toLocaleDateString()}
                  </p>
                </div>
                <Badge variant="yellow">Pending</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
