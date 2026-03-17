import React, { useEffect, useState, useCallback } from 'react';
import { Plus, ToggleLeft, ToggleRight, Tag } from 'lucide-react';
import { sellerApi } from '../../lib/api';
import Card, { CardHeader, CardTitle } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Dialog from '../../components/ui/Dialog';
import Alert from '../../components/ui/Alert';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import Badge from '../../components/ui/Badge';

export default function SellerReferenceCodes() {
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState(null);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ code: '', inrPerMessage: '', marketingMessage: '' });
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');

  const fetchCodes = useCallback(async () => {
    try {
      const res = await sellerApi.referenceCodes();
      setCodes(res.data.referenceCodes || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCodes();
  }, [fetchCodes]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormLoading(true);
    try {
      await sellerApi.createReferenceCode({
        code: form.code,
        inrPerMessage: parseFloat(form.inrPerMessage),
        marketingMessage: form.marketingMessage,
      });
      setAlert({ type: 'success', msg: `Reference code ${form.code} created` });
      setFormOpen(false);
      setForm({ code: '', inrPerMessage: '', marketingMessage: '' });
      fetchCodes();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to create reference code');
    } finally {
      setFormLoading(false);
    }
  };

  const handleToggle = async (id) => {
    try {
      const res = await sellerApi.toggleReferenceCode(id);
      setAlert({ type: 'success', msg: `Reference code ${res.data.isActive ? 'activated' : 'deactivated'}` });
      fetchCodes();
    } catch (err) {
      setAlert({ type: 'error', msg: err.response?.data?.error || 'Failed to update reference code' });
    }
  };

  return (
    <div className="space-y-5">
      {alert && <Alert type={alert.type} onDismiss={() => setAlert(null)}>{alert.msg}</Alert>}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Reference Codes</CardTitle>
            <p className="text-xs text-surface-500 mt-0.5">{codes.length} code(s)</p>
          </div>
          <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => { setFormOpen(true); setFormError(''); }}>
            New Code
          </Button>
        </CardHeader>

        {loading ? (
          <div className="flex justify-center py-12"><Spinner className="text-brand-500" /></div>
        ) : codes.length === 0 ? (
          <EmptyState icon={<Tag className="w-6 h-6" />} title="No reference codes" description="Create your first code" />
        ) : (
          <div className="space-y-2">
            {codes.map((rc) => (
              <div key={rc.id} className="flex items-center gap-3 p-3 bg-surface-50 rounded-xl border border-surface-100">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-brand-700">{rc.code}</span>
                    <Badge variant={rc.is_active ? 'green' : 'default'} size="sm" dot>
                      {rc.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  <p className="text-xs text-surface-500 mt-0.5">
                    ₹{rc.inr_per_message}/msg · {rc.customer_count || 0} customer(s)
                  </p>
                  {rc.marketing_message && (
                    <p className="text-xs text-surface-400 mt-1 italic truncate">"{rc.marketing_message}"</p>
                  )}
                </div>
                <button
                  onClick={() => handleToggle(rc.id)}
                  className={`shrink-0 transition-colors ${rc.is_active ? 'text-green-500 hover:text-red-500' : 'text-surface-400 hover:text-green-500'}`}
                  title={rc.is_active ? 'Deactivate' : 'Activate'}
                >
                  {rc.is_active ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Dialog open={formOpen} onClose={() => setFormOpen(false)} title="Create Reference Code" size="md">
        {formError && <Alert type="error" className="mb-4">{formError}</Alert>}
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label="Code"
            required
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
            placeholder="MYSELLERCODE"
            hint="Alphanumeric, 3-20 characters"
          />
          <Input
            label="INR per message"
            type="number"
            step="0.01"
            min="0"
            required
            value={form.inrPerMessage}
            onChange={(e) => setForm({ ...form, inrPerMessage: e.target.value })}
            placeholder="0.50"
          />
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">Marketing message (optional)</label>
            <textarea
              value={form.marketingMessage}
              onChange={(e) => setForm({ ...form, marketingMessage: e.target.value })}
              rows={3}
              className="w-full px-3 py-2.5 text-sm bg-white border border-surface-200 rounded-xl focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 resize-none placeholder:text-surface-400"
              placeholder="Message shown in admin views"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" fullWidth onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button type="submit" fullWidth loading={formLoading}>Create</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
