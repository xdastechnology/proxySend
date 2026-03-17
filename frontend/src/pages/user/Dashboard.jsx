import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, FileText, Megaphone, CreditCard, Wifi, ArrowRight, TrendingUp, CheckCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { contactsApi, templatesApi, campaignsApi, creditsApi } from '../../lib/api';
import Card, { CardHeader, CardTitle } from '../../components/ui/Card';
import { StatusBadge } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';

function StatCard({ icon: Icon, label, value, color, to, loading }) {
  const content = (
    <div className="flex items-center gap-4">
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-surface-500 font-medium uppercase tracking-wide">{label}</p>
        {loading ? (
          <div className="h-6 w-16 bg-surface-100 rounded animate-pulse mt-1" />
        ) : (
          <p className="text-2xl font-bold text-surface-900 mt-0.5">{value}</p>
        )}
      </div>
    </div>
  );

  if (to) {
    return (
      <Link to={to}>
        <Card hover className="group">
          {content}
          <div className="mt-3 flex items-center gap-1 text-xs text-surface-400 group-hover:text-brand-600 transition-colors">
            <span>View all</span>
            <ArrowRight className="w-3 h-3" />
          </div>
        </Card>
      </Link>
    );
  }

  return <Card>{content}</Card>;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [recentCampaigns, setRecentCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [contactsRes, templatesRes, campaignsRes, creditsRes] = await Promise.allSettled([
          contactsApi.list({ limit: 1 }),
          templatesApi.list(),
          campaignsApi.list({ limit: 5 }),
          creditsApi.overview(),
        ]);

        setStats({
          contacts: contactsRes.status === 'fulfilled' ? contactsRes.value.data.pagination?.total || 0 : 0,
          templates: templatesRes.status === 'fulfilled' ? templatesRes.value.data.templates?.length || 0 : 0,
          campaigns: campaignsRes.status === 'fulfilled' ? campaignsRes.value.data.pagination?.total || 0 : 0,
          messagesSent: creditsRes.status === 'fulfilled'
            ? creditsRes.value.data.transactions?.filter(t => t.type === 'campaign_send').length || 0
            : 0,
        });

        if (campaignsRes.status === 'fulfilled') {
          setRecentCampaigns(campaignsRes.value.data.campaigns?.slice(0, 5) || []);
        }
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const waStatusConfig = {
    connected: { color: 'text-green-600', bg: 'bg-green-50 border-green-200', label: 'Connected & Ready' },
    disconnected: { color: 'text-surface-500', bg: 'bg-surface-50 border-surface-200', label: 'Not Connected' },
    connecting: { color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200', label: 'Connecting...' },
    qr_ready: { color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200', label: 'QR Ready to Scan' },
  };

  const waConfig = waStatusConfig[user?.wa_status] || waStatusConfig.disconnected;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-surface-900">
          Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'},{' '}
          {user?.name?.split(' ')[0]} 👋
        </h1>
        <p className="text-sm text-surface-500 mt-1">Here's your Proxy Send overview</p>
      </div>

      {/* WhatsApp Status Banner */}
      {user?.wa_status !== 'connected' && (
        <div className={`flex items-center justify-between p-4 rounded-2xl border ${waConfig.bg}`}>
          <div className="flex items-center gap-3">
            <Wifi className={`w-5 h-5 ${waConfig.color}`} />
            <div>
              <p className={`text-sm font-semibold ${waConfig.color}`}>WhatsApp: {waConfig.label}</p>
              <p className="text-xs text-surface-500 mt-0.5">Connect WhatsApp to start sending campaigns</p>
            </div>
          </div>
          <Link to="/whatsapp">
            <Button size="sm" variant="outline">Connect</Button>
          </Link>
        </div>
      )}

      {/* Credits Banner */}
      <Card className="bg-gradient-to-r from-brand-600 to-brand-700 border-0 text-white" padding>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-brand-100 font-medium">Available Credits</p>
            <p className="text-4xl font-bold mt-1">{(user?.credits || 0).toLocaleString()}</p>
            <p className="text-xs text-brand-200 mt-1">1 credit = 1 message sent</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <CreditCard className="w-10 h-10 text-brand-300" />
            <Link to="/credits">
              <Button size="sm" className="bg-white/20 hover:bg-white/30 text-white border-0">
                Get Credits
              </Button>
            </Link>
          </div>
        </div>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Users} label="Contacts"
          value={(stats?.contacts || 0).toLocaleString()}
          color="bg-blue-100 text-blue-600"
          to="/contacts" loading={loading}
        />
        <StatCard
          icon={FileText} label="Templates"
          value={(stats?.templates || 0).toLocaleString()}
          color="bg-purple-100 text-purple-600"
          to="/templates" loading={loading}
        />
        <StatCard
          icon={Megaphone} label="Campaigns"
          value={(stats?.campaigns || 0).toLocaleString()}
          color="bg-orange-100 text-orange-600"
          to="/campaigns" loading={loading}
        />
        <StatCard
          icon={TrendingUp} label="Msgs Sent"
          value={(stats?.messagesSent || 0).toLocaleString()}
          color="bg-green-100 text-green-600"
          loading={loading}
        />
      </div>

      {/* Recent Campaigns */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Campaigns</CardTitle>
          <Link to="/campaigns" className="text-sm text-brand-600 hover:underline font-medium">
            View all
          </Link>
        </CardHeader>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-14 bg-surface-50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : recentCampaigns.length === 0 ? (
          <div className="text-center py-10">
            <Megaphone className="w-10 h-10 text-surface-300 mx-auto mb-3" />
            <p className="text-sm text-surface-500 font-medium">No campaigns yet</p>
            <p className="text-xs text-surface-400 mt-1 mb-4">Create your first campaign to get started</p>
            <Link to="/campaigns">
              <Button size="sm" variant="outline">Create Campaign</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {recentCampaigns.map((c) => (
              <Link key={c.id} to={`/campaigns/${c.id}`}>
                <div className="flex items-center justify-between p-3 rounded-xl hover:bg-surface-50 transition-colors group">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-surface-800 truncate">{c.campaign_name}</p>
                    <p className="text-xs text-surface-500 mt-0.5">
                      {c.sent_count}/{c.total_contacts} sent
                      {c.failed_count > 0 && ` · ${c.failed_count} failed`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <StatusBadge status={c.status} />
                    <ArrowRight className="w-3.5 h-3.5 text-surface-300 group-hover:text-surface-500" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { to: '/contacts', icon: Users, label: 'Add Contacts', color: 'text-blue-600 bg-blue-50' },
          { to: '/templates', icon: FileText, label: 'New Template', color: 'text-purple-600 bg-purple-50' },
          { to: '/campaigns', icon: Megaphone, label: 'New Campaign', color: 'text-orange-600 bg-orange-50' },
          { to: '/credits', icon: CreditCard, label: 'Get Credits', color: 'text-brand-600 bg-brand-50' },
        ].map((action) => (
          <Link key={action.to} to={action.to}>
            <Card hover padding className="text-center py-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-2.5 ${action.color}`}>
                <action.icon className="w-5 h-5" />
              </div>
              <p className="text-xs font-semibold text-surface-700">{action.label}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
