import React, { useState, useEffect } from 'react';
import { CreditCard, TrendingUp, TrendingDown, Clock, CheckCircle, XCircle, Plus } from 'lucide-react';
import { creditsApi } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useSSE } from '../../hooks/useSSE';
import Card, { CardHeader, CardTitle } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Badge, { StatusBadge } from '../../components/ui/Badge';
import Alert from '../../components/ui/Alert';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';

export default function Credits() {
  const { user, updateUser } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [requestForm, setRequestForm] = useState({ requestedCredits: '', note: '' });
  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState('');
  const [requestSuccess, setRequestSuccess] = useState('');

  const fetchOverview = async () => {
    try {
      const res = await creditsApi.overview();
      setData(res.data);
      updateUser({ credits: res.data.credits });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchOverview(); }, []);

  useSSE('/api/sse/user', {
    events: {
      credits_update: (d) => {
        updateUser({ credits: d.credits });
        setData(prev => prev ? { ...prev, credits: d.credits } : prev);
      },
      request_resolved: () => fetchOverview(),
    },
  });

  const handleRequest = async (e) => {
    e.preventDefault();
    setRequestError('');
    setRequestSuccess('');
    setRequesting(true);
    try {
      const amount = parseInt(requestForm.requestedCredits, 10);
      if (!amount || amount < 1) return setRequestError('Enter a valid credit amount');
      await creditsApi.request({ requestedCredits: amount, note: requestForm.note });
      setRequestSuccess('Credit request submitted! An admin will review it shortly.');
      setRequestForm({ requestedCredits: '', note: '' });
      fetchOverview();
    } catch (err) {
      setRequestError(err.response?.data?.error || 'Failed to submit request');
    } finally {
      setRequesting(false);
    }
  };

  const txIcon = (type) => {
    if (type === 'campaign_send') return <TrendingDown className="w-4 h-4 text-red-500" />;
    return <TrendingUp className="w-4 h-4 text-green-500" />;
  };

  const txColor = (amount) => amount > 0 ? 'text-green-600' : 'text-red-600';

  if (loading) {
    return <div className="flex justify-center py-20"><Spinner size="lg" className="text-brand-500" /></div>;
  }

  return (
    <div className="space-y-5">
      {/* Balance Card */}
      <Card className="bg-gradient-to-r from-brand-600 to-brand-700 border-0 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-brand-100 font-medium">Current Balance</p>
            <p className="text-4xl font-bold mt-1">{(data?.credits || 0).toLocaleString()}</p>
            <p className="text-xs text-brand-200 mt-1">Available credits</p>
          </div>
          <CreditCard className="w-12 h-12 text-brand-300 opacity-80" />
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Request Credits */}
        <Card>
          <CardTitle className="mb-4">Request Credits</CardTitle>
          {requestSuccess && (
            <Alert type="success" className="mb-4" onDismiss={() => setRequestSuccess('')}>
              {requestSuccess}
            </Alert>
          )}
          {requestError && (
            <Alert type="error" className="mb-4" onDismiss={() => setRequestError('')}>
              {requestError}
            </Alert>
          )}

          {/* Check for pending request */}
          {data?.requests?.some(r => r.status === 'pending') ? (
            <Alert type="warning">
              You have a pending credit request. Please wait for it to be resolved before submitting another.
            </Alert>
          ) : (
            <form onSubmit={handleRequest} className="space-y-4">
              <Input
                label="Number of credits"
                type="number"
                min="1"
                max="100000"
                value={requestForm.requestedCredits}
                onChange={(e) => setRequestForm({ ...requestForm, requestedCredits: e.target.value })}
                placeholder="e.g. 500"
                hint="Max 100,000 per request"
                required
              />
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1.5">Note (optional)</label>
                <textarea
                  value={requestForm.note}
                  onChange={(e) => setRequestForm({ ...requestForm, note: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2.5 text-sm bg-white border border-surface-200 rounded-xl
                    focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 resize-none placeholder:text-surface-400"
                  placeholder="Optional note for admin..."
                />
              </div>
              <Button type="submit" fullWidth loading={requesting} icon={<Plus className="w-4 h-4" />}>
                Submit Request
              </Button>
            </form>
          )}
        </Card>

        {/* Request History */}
        <Card>
          <CardTitle className="mb-4">Request History</CardTitle>
          {!data?.requests?.length ? (
            <EmptyState
              icon={<Clock className="w-6 h-6" />}
              title="No requests yet"
              description="Your credit requests will appear here"
            />
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto scrollbar-thin">
              {data.requests.map((r) => (
                <div key={r.id} className="flex items-start gap-3 p-3 bg-surface-50 rounded-xl">
                  <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shrink-0 border border-surface-100">
                    {r.status === 'approved' ? <CheckCircle className="w-4 h-4 text-green-500" /> :
                     r.status === 'rejected' ? <XCircle className="w-4 h-4 text-red-500" /> :
                     <Clock className="w-4 h-4 text-yellow-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-surface-700">
                        {r.requested_credits.toLocaleString()} credits
                      </p>
                      <StatusBadge status={r.status} />
                    </div>
                    {r.status === 'approved' && r.approved_credits && (
                      <p className="text-xs text-green-600 mt-0.5">
                        Approved: {r.approved_credits.toLocaleString()} credits
                      </p>
                    )}
                    {r.admin_note && (
                      <p className="text-xs text-surface-500 mt-0.5 italic">"{r.admin_note}"</p>
                    )}
                    <p className="text-xs text-surface-400 mt-0.5">
                      {new Date(r.created_at).toLocaleDateString()}
                      {r.inr_per_message && ` · ₹${r.inr_per_message}/msg`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Transaction History */}
      <Card>
        <CardTitle className="mb-4">Transaction History</CardTitle>
        {!data?.transactions?.length ? (
          <EmptyState
            icon={<CreditCard className="w-6 h-6" />}
            title="No transactions yet"
            description="Credit transactions will appear here"
          />
        ) : (
          <div className="space-y-1 -mx-1 max-h-80 overflow-y-auto scrollbar-thin">
            {data.transactions.map((tx) => (
              <div key={tx.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-50">
                <div className="w-8 h-8 bg-surface-50 rounded-lg flex items-center justify-center shrink-0 border border-surface-100">
                  {txIcon(tx.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-surface-700 truncate">
                    {tx.note || tx.type.replace(/_/g, ' ')}
                  </p>
                  <p className="text-xs text-surface-400">{new Date(tx.created_at).toLocaleString()}</p>
                </div>
                <span className={`text-sm font-bold shrink-0 ${txColor(tx.amount)}`}>
                  {tx.amount > 0 ? '+' : ''}{tx.amount.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Campaign Usage */}
      {data?.campaignUsage?.length > 0 && (
        <Card>
          <CardTitle className="mb-4">Credits Used by Campaign</CardTitle>
          <div className="space-y-2">
            {data.campaignUsage.map((cu, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-surface-50 rounded-xl">
                <p className="text-sm text-surface-700 truncate flex-1">{cu.campaign_name}</p>
                <span className="text-sm font-bold text-red-600 shrink-0 ml-3">
                  -{cu.credits_used.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
