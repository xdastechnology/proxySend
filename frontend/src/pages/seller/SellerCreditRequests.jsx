import React, { useEffect, useState, useCallback } from 'react';
import { CheckCircle, XCircle, Clock3 } from 'lucide-react';
import { sellerApi } from '../../lib/api';
import Card, { CardHeader, CardTitle } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Dialog from '../../components/ui/Dialog';
import Input from '../../components/ui/Input';
import Alert from '../../components/ui/Alert';
import Badge, { StatusBadge } from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';

export default function SellerCreditRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState(null);

  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolveRequest, setResolveRequest] = useState(null);
  const [resolveForm, setResolveForm] = useState({ action: 'approve', approvedCredits: '', sellerNote: '' });
  const [resolveLoading, setResolveLoading] = useState(false);
  const [resolveError, setResolveError] = useState('');

  const fetchRequests = useCallback(async () => {
    try {
      const res = await sellerApi.creditRequests();
      setRequests(res.data.requests || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const openResolve = (request) => {
    setResolveRequest(request);
    setResolveForm({ action: 'approve', approvedCredits: String(request.requested_credits), sellerNote: '' });
    setResolveError('');
    setResolveOpen(true);
  };

  const handleResolve = async (e) => {
    e.preventDefault();
    setResolveError('');
    setResolveLoading(true);
    try {
      await sellerApi.resolveCreditRequest(resolveRequest.id, {
        action: resolveForm.action,
        approvedCredits: resolveForm.action === 'approve' && resolveForm.approvedCredits
          ? parseInt(resolveForm.approvedCredits, 10)
          : undefined,
        sellerNote: resolveForm.sellerNote || undefined,
      });
      setAlert({ type: 'success', msg: `Request ${resolveForm.action === 'approve' ? 'approved' : 'rejected'}` });
      setResolveOpen(false);
      fetchRequests();
    } catch (err) {
      setResolveError(err.response?.data?.error || 'Failed to resolve request');
    } finally {
      setResolveLoading(false);
    }
  };

  const pending = requests.filter((r) => r.status === 'pending');
  const resolved = requests.filter((r) => r.status !== 'pending');

  return (
    <div className="space-y-5">
      {alert && <Alert type={alert.type} onDismiss={() => setAlert(null)}>{alert.msg}</Alert>}

      <Card>
        <CardHeader>
          <CardTitle>
            Pending Credit Requests
            {pending.length > 0 && (
              <span className="ml-2 text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">{pending.length}</span>
            )}
          </CardTitle>
        </CardHeader>

        {loading ? (
          <div className="flex justify-center py-10"><Spinner className="text-brand-500" /></div>
        ) : pending.length === 0 ? (
          <EmptyState icon={<Clock3 className="w-6 h-6" />} title="No pending requests" />
        ) : (
          <div className="space-y-3">
            {pending.map((r) => (
              <div key={r.id} className="flex items-start gap-4 p-4 bg-surface-50 rounded-2xl border border-surface-200">
                <div className="w-10 h-10 bg-brand-100 rounded-xl flex items-center justify-center shrink-0">
                  <span className="text-brand-700 font-bold text-sm">{r.user_name?.[0]?.toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div>
                      <p className="text-sm font-semibold text-surface-800">{r.user_name}</p>
                      <p className="text-xs text-surface-500">{r.user_email}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-bold text-brand-700">{r.requested_credits.toLocaleString()}</p>
                      <p className="text-xs text-surface-500">credits requested</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-2 flex-wrap text-xs text-surface-500">
                    <span>Balance: <span className="font-medium text-surface-700">{(r.user_credits || 0).toLocaleString()}</span></span>
                    {r.inr_per_message && (
                      <span>Rate: <span className="font-medium text-surface-700">₹{r.inr_per_message}/msg</span></span>
                    )}
                    <span>{new Date(r.created_at).toLocaleString()}</span>
                  </div>
                </div>
                <Button size="xs" icon={<CheckCircle className="w-3.5 h-3.5" />} onClick={() => openResolve(r)}>
                  Review
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {resolved.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Resolved Requests</CardTitle>
            <span className="text-xs text-surface-500">{resolved.length} resolved</span>
          </CardHeader>
          <div className="space-y-2 max-h-80 overflow-y-auto scrollbar-thin">
            {resolved.slice(0, 25).map((r) => (
              <div key={r.id} className="flex items-center gap-3 p-3 bg-surface-50 rounded-xl border border-surface-100">
                <div className="shrink-0">
                  {r.status === 'approved'
                    ? <CheckCircle className="w-4 h-4 text-green-500" />
                    : <XCircle className="w-4 h-4 text-red-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-surface-700 truncate">{r.user_name}</p>
                    <StatusBadge status={r.status} />
                  </div>
                  <p className="text-xs text-surface-500 mt-0.5">
                    {r.requested_credits.toLocaleString()} requested
                    {r.approved_credits && ` · ${r.approved_credits.toLocaleString()} approved`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Dialog open={resolveOpen} onClose={() => setResolveOpen(false)} title="Review Credit Request" size="md">
        {resolveRequest && (
          <>
            {resolveError && <Alert type="error" className="mb-4">{resolveError}</Alert>}

            <div className="bg-surface-50 rounded-xl p-4 mb-5 space-y-2 border border-surface-100 text-sm">
              <div className="flex justify-between">
                <span className="text-surface-500">User</span>
                <span className="font-medium text-surface-700">{resolveRequest.user_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-surface-500">Requested</span>
                <span className="font-bold text-brand-700">{resolveRequest.requested_credits.toLocaleString()} credits</span>
              </div>
              <div className="flex justify-between">
                <span className="text-surface-500">Current balance</span>
                <span className="font-medium text-surface-700">{(resolveRequest.user_credits || 0).toLocaleString()}</span>
              </div>
            </div>

            <form onSubmit={handleResolve} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setResolveForm({ ...resolveForm, action: 'approve' })}
                  className={`p-3 rounded-xl border-2 text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                    resolveForm.action === 'approve'
                      ? 'border-green-500 bg-green-50 text-green-700'
                      : 'border-surface-200 text-surface-500 hover:border-surface-300'
                  }`}
                >
                  <CheckCircle className="w-4 h-4" /> Approve
                </button>
                <button
                  type="button"
                  onClick={() => setResolveForm({ ...resolveForm, action: 'reject' })}
                  className={`p-3 rounded-xl border-2 text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                    resolveForm.action === 'reject'
                      ? 'border-red-500 bg-red-50 text-red-700'
                      : 'border-surface-200 text-surface-500 hover:border-surface-300'
                  }`}
                >
                  <XCircle className="w-4 h-4" /> Reject
                </button>
              </div>

              {resolveForm.action === 'approve' && (
                <Input
                  label="Credits to approve"
                  type="number"
                  min="1"
                  value={resolveForm.approvedCredits}
                  onChange={(e) => setResolveForm({ ...resolveForm, approvedCredits: e.target.value })}
                />
              )}

              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1.5">Note (optional)</label>
                <textarea
                  value={resolveForm.sellerNote}
                  onChange={(e) => setResolveForm({ ...resolveForm, sellerNote: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2.5 text-sm bg-white border border-surface-200 rounded-xl focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 resize-none placeholder:text-surface-400"
                  placeholder="Optional note..."
                />
              </div>

              <div className="flex gap-3 pt-2">
                <Button type="button" variant="secondary" fullWidth onClick={() => setResolveOpen(false)}>Cancel</Button>
                <Button type="submit" fullWidth loading={resolveLoading} variant={resolveForm.action === 'approve' ? 'primary' : 'danger'}>
                  {resolveForm.action === 'approve' ? 'Approve Request' : 'Reject Request'}
                </Button>
              </div>
            </form>
          </>
        )}
      </Dialog>
    </div>
  );
}
