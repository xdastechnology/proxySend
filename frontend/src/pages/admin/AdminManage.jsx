import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle, XCircle, Plus, CreditCard, Clock } from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState('requests');

  const [creditsForm, setCreditsForm] = useState({ email: '', amount: '', note: '' });
  const [creditsLoading, setCreditsLoading] = useState(false);
  const [creditsError, setCreditsError] = useState('');

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

  const handleResolveRequest = async (e) => {
    e.preventDefault();
    setResolveError('');
    setResolveLoading(true);
    try {
      await adminApi.resolveCreditRequest(resolveRequest.id, {
        action: resolveForm.action,
        approvedCredits: resolveForm.action === 'approve' ? parseInt(resolveForm.approvedCredits || resolveRequest.requested_credits, 10) : undefined,
        adminNote: resolveForm.adminNote,
      });
      setAlert({ type: 'success', msg: `Request #${resolveRequest.id} has been ${resolveForm.action}d` });
      setResolveOpen(false);
      setResolveRequest(null);
      setResolveForm({ action: 'approve', approvedCredits: '', adminNote: '' });
      fetchData();
    } catch (err) {
      setResolveError(err.response?.data?.error || 'Failed to resolve request');
    } finally {
      setResolveLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" className="text-brand-500" />
      </div>
    );
  }

  const pendingRequests = data?.allRequests?.filter(r => r.status === 'pending') || [];
  const resolvedRequests = data?.allRequests?.filter(r => r.status !== 'pending') || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-surface-900">Manage Platform</h1>
        <p className="text-sm text-surface-500 mt-0.5">Control credits, requests, and users</p>
      </div>

      {alert && (
        <Alert
          type={alert.type}
          className="shadow-sm"
          onDismiss={() => setAlert(null)}
        >
          {alert.msg}
        </Alert>
      )}

      {/* Tabs */}
      <div className="flex border-b border-surface-200">
        <button
          onClick={() => setActiveTab('requests')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px flex items-center gap-2 ${
            activeTab === 'requests'
              ? 'border-brand-500 text-brand-600'
              : 'border-transparent text-surface-500 hover:text-surface-800'
          }`}
        >
          <Clock className="w-4 h-4" />
          Credit Requests
          {pendingRequests.length > 0 && (
            <span className="bg-brand-100 text-brand-700 text-xs px-1.5 py-0.5 rounded-full font-bold">
              {pendingRequests.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('credits')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px flex items-center gap-2 ${
            activeTab === 'credits'
              ? 'border-brand-500 text-brand-600'
              : 'border-transparent text-surface-500 hover:text-surface-800'
          }`}
        >
          <Plus className="w-4 h-4" />
          Add Manual Credits
        </button>
      </div>

      {/* Requests Tab */}
      {activeTab === 'requests' && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Pending requests */}
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Pending Credit Requests</CardTitle>
                <span className="text-xs font-semibold bg-yellow-50 text-yellow-700 px-2 py-0.5 rounded-full">
                  {pendingRequests.length} pending
                </span>
              </CardHeader>

              {!pendingRequests.length ? (
                <EmptyState
                  icon={<Clock className="w-8 h-8 text-surface-300" />}
                  title="No pending requests"
                  description="Users credit requests will show up here."
                />
              ) : (
                <div className="divide-y divide-surface-100 -mx-6">
                  {pendingRequests.map((r) => (
                    <div key={r.id} className="p-6 hover:bg-surface-50 transition-colors flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-surface-800 text-sm">{r.user_name}</span>
                          <span className="text-xs text-surface-400 font-mono">({r.user_email})</span>
                        </div>
                        <p className="text-xs text-surface-500">
                          Requested: <strong className="text-surface-700">{r.requested_credits.toLocaleString()}</strong> credits
                        </p>
                        {r.note && (
                          <div className="text-xs bg-surface-100 text-surface-600 px-2.5 py-1.5 rounded-lg border border-surface-200 mt-2">
                            "{r.note}"
                          </div>
                        )}
                        <p className="text-[10px] text-surface-400 mt-1">
                          Requested on {new Date(r.created_at).toLocaleString()}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => {
                          setResolveRequest(r);
                          setResolveForm({ action: 'approve', approvedCredits: r.requested_credits.toString(), adminNote: '' });
                          setResolveOpen(true);
                        }}
                      >
                        Resolve
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Resolved Requests */}
            <Card>
              <CardHeader>
                <CardTitle>History</CardTitle>
              </CardHeader>
              {!resolvedRequests.length ? (
                <EmptyState
                  icon={<Clock className="w-8 h-8 text-surface-300" />}
                  title="No request history"
                />
              ) : (
                <div className="overflow-x-auto -mx-6">
                  <table className="w-full text-sm text-left">
                    <thead>
                      <tr className="border-b border-surface-100 bg-surface-50 px-6 py-3">
                        <th className="px-6 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wide">User</th>
                        <th className="px-6 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wide">Credits</th>
                        <th className="px-6 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wide">Status</th>
                        <th className="px-6 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wide">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-100">
                      {resolvedRequests.slice(0, 20).map((r) => (
                        <tr key={r.id} className="hover:bg-surface-50 transition-colors">
                          <td className="px-6 py-4">
                            <p className="font-semibold text-surface-800 text-xs">{r.user_name}</p>
                            <p className="text-[10px] text-surface-400">{r.user_email}</p>
                          </td>
                          <td className="px-6 py-4 text-xs font-medium text-surface-700">
                            {r.status === 'approved' ? r.approved_credits?.toLocaleString() : r.requested_credits?.toLocaleString()}
                          </td>
                          <td className="px-6 py-4">
                            <StatusBadge status={r.status} />
                          </td>
                          <td className="px-6 py-4 text-xs text-surface-400">
                            {new Date(r.resolved_at || r.updated_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* Manual Credits Tab */}
      {activeTab === 'credits' && (
        <div className="max-w-md">
          <Card>
            <CardHeader>
              <CardTitle>Manual Credit Allocation</CardTitle>
            </CardHeader>
            <form onSubmit={handleAddCredits} className="space-y-4">
              {creditsError && <Alert type="error">{creditsError}</Alert>}
              <Input
                label="User Email"
                type="email"
                required
                value={creditsForm.email}
                onChange={(e) => setCreditsForm({ ...creditsForm, email: e.target.value })}
                placeholder="user@example.com"
              />
              <Input
                label="Amount"
                type="number"
                required
                min="1"
                max="1000000"
                value={creditsForm.amount}
                onChange={(e) => setCreditsForm({ ...creditsForm, amount: e.target.value })}
                placeholder="1000"
              />
              <Input
                label="Internal Note"
                value={creditsForm.note}
                onChange={(e) => setCreditsForm({ ...creditsForm, note: e.target.value })}
                placeholder="Reason for manual credit addition"
              />
              <Button type="submit" fullWidth loading={creditsLoading}>
                Add Credits
              </Button>
            </form>
          </Card>
        </div>
      )}

      {/* Resolve Dialog */}
      {resolveOpen && resolveRequest && (
        <Dialog
          open={resolveOpen}
          onClose={() => {
            setResolveOpen(false);
            setResolveRequest(null);
          }}
          title={`Resolve Request #${resolveRequest.id}`}
        >
          <form onSubmit={handleResolveRequest} className="space-y-4 mt-2">
            {resolveError && <Alert type="error">{resolveError}</Alert>}
            
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="action"
                  value="approve"
                  checked={resolveForm.action === 'approve'}
                  onChange={() => setResolveForm({ ...resolveForm, action: 'approve' })}
                  className="text-brand-600 focus:ring-brand-500"
                />
                <span className="text-sm font-medium text-surface-800 flex items-center gap-1">
                  <CheckCircle className="w-4 h-4 text-green-500" /> Approve
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="action"
                  value="reject"
                  checked={resolveForm.action === 'reject'}
                  onChange={() => setResolveForm({ ...resolveForm, action: 'reject' })}
                  className="text-brand-600 focus:ring-brand-500"
                />
                <span className="text-sm font-medium text-surface-800 flex items-center gap-1">
                  <XCircle className="w-4 h-4 text-red-500" /> Reject
                </span>
              </label>
            </div>

            {resolveForm.action === 'approve' && (
              <Input
                label="Approved Credits"
                type="number"
                required
                min="1"
                value={resolveForm.approvedCredits}
                onChange={(e) => setResolveForm({ ...resolveForm, approvedCredits: e.target.value })}
                placeholder={resolveRequest.requested_credits.toString()}
                hint={`User requested ${resolveRequest.requested_credits.toLocaleString()} credits`}
              />
            )}

            <Input
              label="Admin Note"
              value={resolveForm.adminNote}
              onChange={(e) => setResolveForm({ ...resolveForm, adminNote: e.target.value })}
              placeholder="e.g. Approved standard topup / Rejected due to missing payment verification"
            />

            <div className="flex justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setResolveOpen(false);
                  setResolveRequest(null);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" loading={resolveLoading}>
                Submit
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
