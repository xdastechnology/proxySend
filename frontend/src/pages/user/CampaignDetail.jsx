import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Play, RefreshCw, CheckCircle, XCircle, Clock, Zap } from 'lucide-react';
import { campaignsApi } from '../../lib/api';
import { useSSE } from '../../hooks/useSSE';
import Card, { CardHeader, CardTitle } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge, { StatusBadge } from '../../components/ui/Badge';
import Alert from '../../components/ui/Alert';
import Spinner from '../../components/ui/Spinner';

export default function CampaignDetail() {
  const { id } = useParams();
  const [campaign, setCampaign] = useState(null);
  const [template, setTemplate] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [alert, setAlert] = useState(null);

  const fetchDetail = useCallback(async () => {
    try {
      const res = await campaignsApi.get(id);
      setCampaign(res.data.campaign);
      setTemplate(res.data.template);
      setContacts(res.data.contacts);
    } catch {
      setAlert({ type: 'error', msg: 'Failed to load campaign details' });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  useSSE(`/api/sse/campaign/${id}`, {
    events: {
      campaign_update: (data) => {
        setCampaign(data);
      },
    },
    onPoll: fetchDetail,
  }, { enabled: campaign?.status === 'running' || campaign?.status === 'pending' });

  useSSE('/api/sse/user', {
    events: {
      campaign_warning: (data) => {
        if (String(data?.campaignId) !== String(id)) return;
        if (data?.code === 'whatsapp_not_connected') {
          setAlert({ type: 'warning', msg: data.message || 'WhatsApp is not connected.' });
        }
      },
    },
  });

  // Also refresh contact statuses periodically when running
  useEffect(() => {
    if (campaign?.status !== 'running') return;
    const interval = setInterval(fetchDetail, 5000);
    return () => clearInterval(interval);
  }, [campaign?.status, fetchDetail]);

  const handleStart = async () => {
    setStarting(true);
    try {
      await campaignsApi.start(id);
      setAlert({ type: 'success', msg: 'Campaign started!' });
      fetchDetail();
    } catch (err) {
      setAlert({ type: 'error', msg: err.response?.data?.error || 'Failed to start' });
    } finally {
      setStarting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" className="text-brand-500" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="text-center py-20">
        <p className="text-surface-500">Campaign not found</p>
        <Link to="/campaigns">
          <Button variant="secondary" className="mt-4" icon={<ArrowLeft className="w-4 h-4" />}>
            Back to Campaigns
          </Button>
        </Link>
      </div>
    );
  }

  const progressPct = campaign.total_contacts
    ? Math.round(((campaign.sent_count + campaign.failed_count) / campaign.total_contacts) * 100)
    : 0;

  const statusIcon = {
    sent: <CheckCircle className="w-3.5 h-3.5 text-green-500" />,
    failed: <XCircle className="w-3.5 h-3.5 text-red-500" />,
    pending: <Clock className="w-3.5 h-3.5 text-surface-400" />,
  };

  return (
    <div className="space-y-5">
      {alert && <Alert type={alert.type} onDismiss={() => setAlert(null)}>{alert.msg}</Alert>}

      {/* Header */}
      <div className="flex items-start gap-3">
        <Link to="/campaigns">
          <button className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-surface-100 text-surface-500 shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-surface-900 truncate">{campaign.campaign_name}</h1>
            <StatusBadge status={campaign.status} />
            {campaign.status === 'running' && (
              <span className="flex items-center gap-1 text-xs text-brand-600 font-medium bg-brand-50 px-2 py-0.5 rounded-full">
                <Zap className="w-3 h-3" />
                Live
              </span>
            )}
          </div>
          <p className="text-sm text-surface-500 mt-0.5">
            {campaign.started_at
              ? `Started ${new Date(campaign.started_at).toLocaleString()}`
              : `Created ${new Date(campaign.created_at).toLocaleString()}`}
            {campaign.completed_at && ` · Completed ${new Date(campaign.completed_at).toLocaleString()}`}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            size="sm" variant="secondary"
            icon={<RefreshCw className="w-3.5 h-3.5" />}
            onClick={fetchDetail}
          >
            Refresh
          </Button>
          {campaign.status === 'pending' && (
            <Button
              size="sm"
              icon={<Play className="w-3.5 h-3.5" />}
              onClick={handleStart}
              loading={starting}
            >
              Start
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total', value: campaign.total_contacts, color: 'text-surface-700', bg: 'bg-surface-50' },
          { label: 'Sent', value: campaign.sent_count, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'Failed', value: campaign.failed_count, color: 'text-red-600', bg: 'bg-red-50' },
          {
            label: 'Pending',
            value: campaign.total_contacts - campaign.sent_count - campaign.failed_count,
            color: 'text-yellow-600',
            bg: 'bg-yellow-50',
          },
        ].map((s) => (
          <Card key={s.label} className={s.bg}>
            <p className="text-xs text-surface-500 font-medium">{s.label}</p>
            <p className={`text-2xl font-bold mt-0.5 ${s.color}`}>{s.value}</p>
          </Card>
        ))}
      </div>

      {/* Progress */}
      <Card>
        <div className="flex justify-between text-sm mb-2">
          <span className="font-medium text-surface-700">Overall Progress</span>
          <span className="text-surface-500">{progressPct}%</span>
        </div>
        <div className="h-3 bg-surface-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              campaign.status === 'completed'
                ? 'bg-gradient-to-r from-green-400 to-green-500'
                : campaign.status === 'running'
                ? 'bg-gradient-to-r from-brand-400 to-brand-500'
                : 'bg-surface-300'
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-surface-400 mt-1.5">
          <span>{campaign.sent_count + campaign.failed_count} processed</span>
          <span>{campaign.total_contacts} total</span>
        </div>
      </Card>

      {/* Template info */}
      {template && (
        <Card>
          <CardTitle className="mb-3">Template Used</CardTitle>
          <div className="flex items-center gap-3 p-3 bg-surface-50 rounded-xl">
            <div className="w-9 h-9 bg-purple-100 rounded-xl flex items-center justify-center">
              <span className="text-purple-600 font-bold text-xs">T</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-surface-700">{template.template_name}</p>
              {template.message && (
                <p className="text-xs text-surface-500 truncate mt-0.5">{template.message}</p>
              )}
            </div>
            {template.buttons?.length > 0 && (
              <Badge variant="purple">{template.buttons.length} btn{template.buttons.length > 1 ? 's' : ''}</Badge>
            )}
          </div>
        </Card>
      )}

      {/* Contacts Table */}
      <Card>
        <CardHeader>
          <CardTitle>Contact Status</CardTitle>
          <div className="flex items-center gap-3 text-xs text-surface-500">
            <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-green-500" /> Sent</span>
            <span className="flex items-center gap-1"><XCircle className="w-3 h-3 text-red-500" /> Failed</span>
            <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-surface-400" /> Pending</span>
          </div>
        </CardHeader>

        <div className="overflow-x-auto scrollbar-thin -mx-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-100">
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-surface-500 uppercase tracking-wide">Contact</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-surface-500 uppercase tracking-wide">Phone</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-surface-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-surface-500 uppercase tracking-wide">Note</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-surface-500 uppercase tracking-wide">Sent at</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-50">
              {contacts.map((c) => (
                <tr key={c.id} className="hover:bg-surface-50/50">
                  <td className="px-3 py-2.5 font-medium text-surface-700 whitespace-nowrap">{c.name}</td>
                  <td className="px-3 py-2.5 text-surface-500 whitespace-nowrap">+{c.phone}</td>
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-1.5">
                      {statusIcon[c.status]}
                      <StatusBadge status={c.status} />
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-surface-500 max-w-[200px] truncate">
                    {c.error_note || '—'}
                  </td>
                  <td className="px-3 py-2.5 text-surface-500 whitespace-nowrap">
                    {c.sent_at ? new Date(c.sent_at).toLocaleTimeString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
