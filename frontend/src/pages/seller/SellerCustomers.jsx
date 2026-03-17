import React, { useEffect, useState, useCallback } from 'react';
import { UserPlus, Search, ToggleLeft, ToggleRight, CreditCard } from 'lucide-react';
import { sellerApi } from '../../lib/api';
import Card, { CardHeader, CardTitle } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Dialog from '../../components/ui/Dialog';
import Alert from '../../components/ui/Alert';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import Select from '../../components/ui/Select';

export default function SellerCustomers() {
  const [customers, setCustomers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    referenceCode: '',
  });
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [referenceCodes, setReferenceCodes] = useState([]);

  const [creditsOpen, setCreditsOpen] = useState(false);
  const [creditsCustomer, setCreditsCustomer] = useState(null);
  const [creditsForm, setCreditsForm] = useState({ amount: '', note: '' });
  const [creditsLoading, setCreditsLoading] = useState(false);
  const [creditsError, setCreditsError] = useState('');

  const fetchCustomers = useCallback(async (p = 1, s = '') => {
    setLoading(true);
    try {
      const res = await sellerApi.customers({ page: p, limit: 20, search: s });
      setCustomers(res.data.customers || []);
      setPagination(res.data.pagination || { page: 1, pages: 1, total: 0 });
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchReferenceCodes = useCallback(async () => {
    const res = await sellerApi.referenceCodes();
    const activeCodes = (res.data.referenceCodes || []).filter((r) => r.is_active);
    setReferenceCodes(activeCodes);
    if (activeCodes.length && !form.referenceCode) {
      setForm((prev) => ({ ...prev, referenceCode: activeCodes[0].code }));
    }
  }, [form.referenceCode]);

  useEffect(() => {
    fetchCustomers(page, search);
  }, [fetchCustomers, page, search]);

  const openCreate = async () => {
    setForm({ name: '', email: '', phone: '', password: '', referenceCode: '' });
    setFormError('');
    try {
      await fetchReferenceCodes();
      setCreateOpen(true);
    } catch (err) {
      setAlert({ type: 'error', msg: err.response?.data?.error || 'Failed to load reference codes' });
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setFormLoading(true);
    setFormError('');
    try {
      await sellerApi.createCustomer(form);
      setCreateOpen(false);
      setAlert({ type: 'success', msg: 'Customer created' });
      fetchCustomers(1, search);
      setPage(1);
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to create customer');
    } finally {
      setFormLoading(false);
    }
  };

  const handleToggleCustomer = async (id) => {
    try {
      const res = await sellerApi.toggleCustomer(id);
      setAlert({ type: 'success', msg: `Customer ${res.data.isActive ? 'activated' : 'deactivated'}` });
      fetchCustomers(page, search);
    } catch (err) {
      setAlert({ type: 'error', msg: err.response?.data?.error || 'Failed to update customer status' });
    }
  };

  const openCreditsDialog = (customer) => {
    setCreditsCustomer(customer);
    setCreditsForm({ amount: '', note: '' });
    setCreditsError('');
    setCreditsOpen(true);
  };

  const handleAssignCredits = async (e) => {
    e.preventDefault();
    if (!creditsCustomer) return;

    setCreditsLoading(true);
    setCreditsError('');
    try {
      const payload = {
        amount: parseInt(creditsForm.amount, 10),
        note: creditsForm.note || undefined,
      };
      const res = await sellerApi.addCustomerCredits(creditsCustomer.id, payload);
      setCreditsOpen(false);
      setAlert({
        type: 'success',
        msg: `Added ${payload.amount} credits to ${creditsCustomer.name}. New balance: ${res.data.newBalance}`,
      });
      fetchCustomers(page, search);
    } catch (err) {
      setCreditsError(err.response?.data?.error || 'Failed to assign credits');
    } finally {
      setCreditsLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      {alert && <Alert type={alert.type} onDismiss={() => setAlert(null)}>{alert.msg}</Alert>}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Customers</CardTitle>
            <p className="text-xs text-surface-500 mt-0.5">{(pagination.total || 0).toLocaleString()} total</p>
          </div>
          <Button size="sm" icon={<UserPlus className="w-3.5 h-3.5" />} onClick={openCreate}>Create Customer</Button>
        </CardHeader>

        <div className="mb-4">
          <Input
            placeholder="Search by name, email, phone..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            leftIcon={<Search className="w-4 h-4" />}
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Spinner className="text-brand-500" /></div>
        ) : customers.length === 0 ? (
          <EmptyState title="No customers" description="Create your first customer" />
        ) : (
          <div className="space-y-2">
            {customers.map((c) => (
              <div key={c.id} className="flex items-center gap-3 p-3 bg-surface-50 rounded-xl border border-surface-100">
                <div className="w-9 h-9 bg-brand-100 rounded-xl flex items-center justify-center">
                  <span className="text-brand-700 font-semibold text-sm">{c.name?.[0]?.toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-surface-800 truncate">{c.name}</p>
                  <p className="text-xs text-surface-500 truncate">{c.email} · +{c.phone}</p>
                  <p className="text-xs text-surface-400 mt-0.5">Ref: {c.reference_code || '—'} · ₹{c.inr_per_message ?? 0}/msg</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-surface-500">Credits</p>
                  <p className="text-sm font-bold text-brand-700">{(c.credits || 0).toLocaleString()}</p>
                </div>
                <Button
                  size="xs"
                  variant="secondary"
                  icon={<CreditCard className="w-3.5 h-3.5" />}
                  onClick={() => openCreditsDialog(c)}
                >
                  Add
                </Button>
                <button
                  onClick={() => handleToggleCustomer(c.id)}
                  className={`shrink-0 transition-colors ${c.is_active ? 'text-green-500 hover:text-red-500' : 'text-surface-400 hover:text-green-500'}`}
                  title={c.is_active ? 'Deactivate customer' : 'Activate customer'}
                >
                  {c.is_active ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                </button>
              </div>
            ))}
          </div>
        )}

        {pagination.pages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-surface-100">
            <p className="text-xs text-surface-500">Page {pagination.page} of {pagination.pages}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <Button size="sm" variant="secondary" disabled={page >= pagination.pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </Card>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="Create Customer" size="md">
        {formError && <Alert type="error" className="mb-4">{formError}</Alert>}
        <form onSubmit={handleCreate} className="space-y-4">
          <Input label="Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="Email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input label="Phone" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input
            label="Password"
            type="password"
            required
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            hint="Min 8 chars with uppercase, lowercase and number"
          />
          <Select
            label="Reference code"
            required
            value={form.referenceCode}
            onChange={(e) => setForm({ ...form, referenceCode: e.target.value })}
          >
            {!referenceCodes.length && <option value="">No active reference codes</option>}
            {referenceCodes.map((rc) => (
              <option key={rc.id} value={rc.code}>{rc.code} - ₹{rc.inr_per_message}/msg</option>
            ))}
          </Select>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" fullWidth onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="submit" fullWidth loading={formLoading} disabled={!referenceCodes.length}>Create</Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={creditsOpen}
        onClose={() => setCreditsOpen(false)}
        title={`Add Credits${creditsCustomer ? ` - ${creditsCustomer.name}` : ''}`}
        size="md"
      >
        {creditsError && <Alert type="error" className="mb-4">{creditsError}</Alert>}
        <form onSubmit={handleAssignCredits} className="space-y-4">
          <Input
            label="Credits amount"
            type="number"
            min="1"
            max="1000000"
            required
            value={creditsForm.amount}
            onChange={(e) => setCreditsForm({ ...creditsForm, amount: e.target.value })}
            placeholder="500"
          />
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">Note (optional)</label>
            <textarea
              value={creditsForm.note}
              onChange={(e) => setCreditsForm({ ...creditsForm, note: e.target.value })}
              rows={2}
              className="w-full px-3 py-2.5 text-sm bg-white border border-surface-200 rounded-xl focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 resize-none placeholder:text-surface-400"
              placeholder="Reason for adding credits"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" fullWidth onClick={() => setCreditsOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" fullWidth loading={creditsLoading}>
              Add Credits
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
