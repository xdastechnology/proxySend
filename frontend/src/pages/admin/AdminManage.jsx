import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle, XCircle, Plus, ToggleLeft, ToggleRight, CreditCard, Tag, Clock } from 'lucide-react';
import { adminApi } from '../../lib/api';
import Card, { CardHeader, CardTitle } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Dialog from '../../components/ui/Dialog';
import Alert from '../../components/ui/Alert';
import Badge, { StatusBadge } from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';

export default function AdminManage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState(null);

  const [creditsForm, setCreditsForm] = useState({ email: '', amount: '', note: '' });
  const [creditsLoading, setCreditsLoading] = useState(false);
  const [creditsError, setCreditsError] = useState('');

  const [refCodeOpen, setRefCodeOpen] = useState(false);
  const [refCodeForm, setRefCodeForm] = useState({ code: '', inrPerMessage: '', marketingMessage: '' });
  const [refCodeLoading, setRefCodeLoading] = useState(false);
  const [refCodeError, setRefCodeError] = useState('');

  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolveRequest, setResolveRequest] = useState(null);
  const [resolveForm, setResolveForm] = useState({ action: 'approve', approvedCredits: '', adminNote: '' });
  const [resolveLoading, setResolveLoading] = useState(false);
  const [resolveError, setResolveError] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [dashRes, reqRes] = await Promise.all([
        adminApi.dashboard(),
        adminApi.creditRequests(),
      ]);
      setData({ ...dashRes.data, allRequests: reqRes.data.requests });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAddCredits = async (e) => {
    e.preventDefault();
    setCreditsError('');
    setCreditsLoading(true);
    try {
      const res = await adminApi.addCredits({
        email: creditsForm.email,
        amount: parseInt(creditsForm.amount, 10),
        note: creditsForm.note,
      });
      setAlert({ type: 'success', msg: `Added ${creditsForm.amount} credits to ${creditsForm.email}. New balance: ${res.data.newBalance}` });
      setCreditsForm({ email: '', amount: '', note: '' });
      fetchData();
    } catch (err) {
      setCreditsError(err.response?.data?.error || 'Failed to add credits');
    } finally {
      setCreditsLoading(false);
    }
  };

  const handleCreateRefCode = async (e) => {
    e.preventDefault();
    setRefCodeError('');
    setRefCodeLoading(true);
    try {
      await adminApi.createRefCode({
        code: refCodeForm.code,
        inrPerMessage: parseFloat(refCodeForm.inrPerMessage),
        marketingMessage: refCodeForm.marketingMessage,
      });
      setAlert({ type: 'success', msg: `Reference code "${refCodeForm.code}" created` });
      setRefCodeOpen(false);
      setRefCodeForm({ code: '', inrPerMessage: '', marketingMessage: '' });
      fetchData();
    } catch (err) {
      setRefCodeError(err.response?.data?.error || 'Failed to create reference code');
    } finally {
      setRefCodeLoading(false);
    }
  };

  const handleToggleRefCode = async (id) => {
    try {
      const res = await adminApi.toggleRefCode(id);
      setAlert({ type: 'success', msg: `Reference code ${res.data.isActive ? 'activated' : 'deactivated'}` });
      fetchData();
    } catch {
      setAlert({ type: 'error', msg: 'Failed to toggle reference code' });
    }
  };

  const openResolve = (request) => {
    setResolveRequest(request);
    setResolveForm({ action: 'approve', approvedCredits: String(request.requested_credits), adminNote: '' });
    setResolveError('');
    setResolveOpen(true);
  };

  const handleResolve = async (e) => {
    e.preventDefault();
    setResolveError('');
    setResolveLoading(true);
    try {
      await adminApi.resolveCreditRequest(resolveRequest.id, {
        action: resolveForm.action,
        approvedCredits: resolveForm.action === 'approve' && resolveForm.approvedCredits
          ? parseInt(resolveForm.approvedCredits, 10)
          : undefined,
        adminNote: resolveForm.adminNote || undefined,
      });
      setAlert({
        type: 'success',
        msg: `Request ${resolveForm.action === 'approve' ? 'approved' : 'rejected'} for ${resolveRequest.user_name}`,
      });
      setResolveOpen(false);
      fetchData();
    } catch (err) {
      setResolveError(err.response?.data?.error || 'Failed to resolve request');
    } finally {
      setResolveLoading(false);
    }
  };

  const pendingRequests = data?.allRequests?.filter(r => r.status === 'pending') || [];
  const resolvedRequests = data?.allRequests?.filter(r => r.status !== 'pending') || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-surface-900">Manage</h1>
        <p className="text-sm text-surface-500 mt-0.5">Credits, reference codes, and requests</p>
      </div>

      {alert && (
        <Alert type={alert.type} onDismiss={() => setAlert(null)}>{alert.msg}</Alert>
      )}

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Add Credits */}
        <Card>
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 bg-brand-100 rounded-xl flex items-center justify-center">
              <CreditCard className="w-4 h-4 text-brand-600" />
            </div>
            <CardTitle>Add Credits to User</CardTitle>
          </div>

          {creditsError && (
            <Alert type="error" className="mb-4" onDismiss={() => setCreditsError('')}>
              {creditsError}
            </Alert>
          )}

          <form onSubmit={handleAddCredits} className="space-y-4">
            <Input
              label="User email"
              type="email"
              required
              value={creditsForm.email}
              onChange={(e) => setCreditsForm({ ...creditsForm, email: e.target.value })}
              placeholder="user@example.com"
            />
            <Input
              label="Amount"
              type="number"
              min="1"
              max="1000000"
              required
              value={creditsForm.amount}
              onChange={(e) => setCreditsForm({ ...creditsForm, amount: e.target.value })}
              placeholder="e.g. 500"
            />
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1.5">Note (optional)</label>
              <textarea
                value={creditsForm.note}
                onChange={(e) => setCreditsForm({ ...creditsForm, note: e.target.value })}
                rows={2}
                className="w-full px-3 py-2.5 text-sm bg-white border border-surface-200 rounded-xl
                  focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 text-surface-800
                  placeholder:text-surface-400 resize-none"
                placeholder="Reason for adding credits..."
              />
            </div>
            <Button type="submit" fullWidth loading={creditsLoading}>
              Add Credits
            </Button>
          </form>
        </Card>

        {/* Reference Codes */}
        <Card>
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-purple-100 rounded-xl flex items-center justify-center">
                <Tag className="w-4 h-4 text-purple-600" />
              </div>
              <CardTitle>Reference Codes</CardTitle>
            </div>
            <Button
              size="sm"
              icon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => { setRefCodeOpen(true); setRefCodeError(''); setRefCodeForm({ code: '', inrPerMessage: '', marketingMessage: '' }); }}
            >
              New Code
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-8"><Spinner className="text-brand-500" /></div>
          ) : !data?.referenceCodes?.length ? (
            <EmptyState icon={<Tag className="w-6 h-6" />} title="No reference codes" />
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto scrollbar-thin">
              {data.referenceCodes.map((rc) => (
                <div
                  key={rc.id}
                  className="flex items-center gap-3 p-3 bg-surface-50 rounded-xl hover:bg-surface-100 transition-colors border border-surface-100"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-brand-700">{rc.code}</span>
                      <Badge variant={rc.is_active ? 'green' : 'default'} size="sm" dot>
                        {rc.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <p className="text-xs text-surface-500 mt-0.5">
                      ₹{rc.inr_per_message}/msg · {rc.user_count} user{rc.user_count !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => handleToggleRefCode(rc.id)}
                    className={`shrink-0 transition-colors ${rc.is_active ? 'text-green-500 hover:text-red-500' : 'text-surface-400 hover:text-green-500'}`}
                    title={rc.is_active ? 'Deactivate' : 'Activate'}
                  >
                    {rc.is_active
                      ? <ToggleRight className="w-6 h-6" />
                      : <ToggleLeft className="w-6 h-6" />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Pending Credit Requests */}
      <Card>
        <div className="flex items-center gap-2 mb-5">
          <div className="w-8 h-8 bg-yellow-100 rounded-xl flex items-center justify-center">
            <Clock className="w-4 h-4 text-yellow-600" />
          </div>
          <CardTitle>
            Pending Credit Requests
            {pendingRequests.length > 0 && (
              <span className="ml-2 text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
                {pendingRequests.length}
              </span>
            )}
          </CardTitle>
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Spinner className="text-brand-500" /></div>
        ) : pendingRequests.length === 0 ? (
          <EmptyState
            icon={<CheckCircle className="w-6 h-6" />}
            title="All caught up!"
            description="No pending credit requests at the moment."
          />
        ) : (
          <div className="space-y-3">
            {pendingRequests.map((r) => (
              <div
                key={r.id}
                className="flex items-start gap-4 p-4 bg-surface-50 rounded-2xl border border-surface-200"
              >
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
                      <p className="text-lg font-bold text-brand-700">
                        {r.requested_credits.toLocaleString()}
                      </p>
                      <p className="text-xs text-surface-500">credits requested</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    <p className="text-xs text-surface-500">
                      Balance: <span className="text-surface-700 font-medium">{(r.user_credits || 0).toLocaleString()}</span>
                    </p>
                    {r.inr_per_message && (
                      <p className="text-xs text-surface-500">
                        Rate: <span className="text-surface-700 font-medium">₹{r.inr_per_message}/msg</span>
                      </p>
                    )}
                    {r.inr_per_message && (
                      <p className="text-xs text-surface-500">
                        Est: <span className="text-green-600 font-medium">
                          ₹{(r.requested_credits * r.inr_per_message).toFixed(2)}
                        </span>
                      </p>
                    )}
                    <p className="text-xs text-surface-400">
                      {new Date(r.created_at).toLocaleString()}
                    </p>
                  </div>
                  {r.note && (
                    <p className="text-xs text-surface-500 mt-1.5 italic bg-surface-100 rounded-lg px-2 py-1">
                      "{r.note}"
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <Button
                    size="xs"
                    icon={<CheckCircle className="w-3.5 h-3.5" />}
                    onClick={() => openResolve(r)}
                    className="whitespace-nowrap"
                  >
                    Review
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Resolved Requests */}
      {resolvedRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Resolved Requests</CardTitle>
            <span className="text-xs text-surface-500">{resolvedRequests.length} resolved</span>
          </CardHeader>
          <div className="space-y-2 max-h-80 overflow-y-auto scrollbar-thin">
            {resolvedRequests.slice(0, 20).map((r) => (
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
                    {r.resolved_at && ` · ${new Date(r.resolved_at).toLocaleDateString()}`}
                  </p>
                  {r.admin_note && (
                    <p className="text-xs text-surface-400 italic mt-0.5">"{r.admin_note}"</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Create Ref Code Dialog */}
      <Dialog open={refCodeOpen} onClose={() => setRefCodeOpen(false)} title="Create Reference Code" size="md">
        {refCodeError && (
          <Alert type="error" className="mb-4" onDismiss={() => setRefCodeError('')}>
            {refCodeError}
          </Alert>
        )}
        <form onSubmit={handleCreateRefCode} className="space-y-4">
          <Input
            label="Code" required
            value={refCodeForm.code}
            onChange={(e) => setRefCodeForm({ ...refCodeForm, code: e.target.value.toUpperCase() })}
            placeholder="MYCODE2024"
            hint="Alphanumeric, 3–20 characters"
          />
          <Input
            label="INR per message" type="number" step="0.01" min="0" required
            value={refCodeForm.inrPerMessage}
            onChange={(e) => setRefCodeForm({ ...refCodeForm, inrPerMessage: e.target.value })}
            placeholder="0.50"
            hint="Cost in Indian Rupees per message sent"
          />
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">
              Marketing message (optional)
            </label>
            <textarea
              value={refCodeForm.marketingMessage}
              onChange={(e) => setRefCodeForm({ ...refCodeForm, marketingMessage: e.target.value })}
              rows={3}
              className="w-full px-3 py-2.5 text-sm bg-white border border-surface-200 rounded-xl
                focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 resize-none
                placeholder:text-surface-400"
              placeholder="Welcome message for users who sign up with this code..."
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" fullWidth onClick={() => setRefCodeOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" fullWidth loading={refCodeLoading}>
              Create Code
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Resolve Request Dialog */}
      <Dialog open={resolveOpen} onClose={() => setResolveOpen(false)} title="Review Credit Request" size="md">
        {resolveRequest && (
          <>
            {resolveError && (
              <Alert type="error" className="mb-4" onDismiss={() => setResolveError('')}>
                {resolveError}
              </Alert>
            )}

            <div className="bg-surface-50 rounded-xl p-4 mb-5 space-y-2 border border-surface-100">
              {[
                ['User', resolveRequest.user_name],
                ['Email', resolveRequest.user_email],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between text-sm">
                  <span className="text-surface-500">{label}</span>
                  <span className="font-medium text-surface-700">{value}</span>
                </div>
              ))}
              <div className="flex justify-between text-sm">
                <span className="text-surface-500">Requested</span>
                <span className="font-bold text-brand-700">
                  {resolveRequest.requested_credits.toLocaleString()} credits
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-surface-500">Current balance</span>
                <span className="font-medium text-surface-700">
                  {(resolveRequest.user_credits || 0).toLocaleString()}
                </span>
              </div>
              {resolveRequest.inr_per_message && (
                <div className="flex justify-between text-sm">
                  <span className="text-surface-500">Est. payment</span>
                  <span className="font-bold text-green-600">
                    ₹{(resolveRequest.requested_credits * resolveRequest.inr_per_message).toFixed(2)}
                  </span>
                </div>
              )}
              {resolveRequest.note && (
                <div className="pt-1 border-t border-surface-200">
                  <p className="text-xs text-surface-500">User note:</p>
                  <p className="text-sm text-surface-700 italic mt-0.5">"{resolveRequest.note}"</p>
                </div>
              )}
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
                  label="Credits to approve" type="number" min="1"
                  value={resolveForm.approvedCredits}
                  onChange={(e) => setResolveForm({ ...resolveForm, approvedCredits: e.target.value })}
                  hint={`Default: ${resolveRequest.requested_credits.toLocaleString()} (requested amount)`}
                />
              )}

              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1.5">
                  Admin note (optional)
                </label>
                <textarea
                  value={resolveForm.adminNote}
                  onChange={(e) => setResolveForm({ ...resolveForm, adminNote: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2.5 text-sm bg-white border border-surface-200 rounded-xl
                    focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 resize-none
                    placeholder:text-surface-400"
                  placeholder="Optional note to user..."
                />
              </div>

              <div className="flex gap-3 pt-2">
                <Button type="button" variant="secondary" fullWidth onClick={() => setResolveOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit" fullWidth loading={resolveLoading}
                  variant={resolveForm.action === 'approve' ? 'primary' : 'danger'}
                >
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
