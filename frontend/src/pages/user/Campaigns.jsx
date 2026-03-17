import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Megaphone, Plus, Play, Trash2, ArrowRight, Search } from 'lucide-react';
import { campaignsApi, templatesApi, contactsApi } from '../../lib/api';
import Card, { CardHeader, CardTitle } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Dialog from '../../components/ui/Dialog';
import Alert from '../../components/ui/Alert';
import EmptyState from '../../components/ui/EmptyState';
import Badge, { StatusBadge } from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [alert, setAlert] = useState(null);
  const [page, setPage] = useState(1);

  const [templates, setTemplates] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [contactSearch, setContactSearch] = useState('');
  const [selectedContacts, setSelectedContacts] = useState([]);
  const [form, setForm] = useState({ campaignName: '', templateId: '' });
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  const fetchCampaigns = async (p = 1) => {
    setLoading(true);
    try {
      const res = await campaignsApi.list({ page: p, limit: 20 });
      setCampaigns(res.data.campaigns);
      setPagination(res.data.pagination);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCampaigns(page); }, [page]);

  const openCreate = async () => {
    setForm({ campaignName: '', templateId: '' });
    setSelectedContacts([]);
    setContactSearch('');
    setFormError('');
    const [tmplRes, ctRes] = await Promise.all([
      templatesApi.list(),
      contactsApi.list({ limit: 100 }),
    ]);
    setTemplates(tmplRes.data.templates);
    setContacts(ctRes.data.contacts);
    setFormOpen(true);
  };

  const filteredContacts = contacts.filter(c =>
    !contactSearch ||
    c.name.toLowerCase().includes(contactSearch.toLowerCase()) ||
    c.phone.includes(contactSearch)
  );

  const toggleContact = (id) => {
    setSelectedContacts(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!form.campaignName.trim()) return setFormError('Campaign name required');
    if (!form.templateId) return setFormError('Please select a template');
    if (!selectedContacts.length) return setFormError('Select at least one contact');
    setFormLoading(true);
    try {
      const res = await campaignsApi.create({
        campaignName: form.campaignName,
        templateId: parseInt(form.templateId),
        contactIds: selectedContacts,
      });
      setFormOpen(false);
      setAlert({ type: 'success', msg: 'Campaign created! Click Start to begin sending.' });
      fetchCampaigns(1);
      setPage(1);
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to create campaign');
    } finally {
      setFormLoading(false);
    }
  };

  const handleStart = async (id) => {
    try {
      await campaignsApi.start(id);
      setAlert({ type: 'success', msg: 'Campaign started!' });
      fetchCampaigns(page);
    } catch (err) {
      setAlert({ type: 'error', msg: err.response?.data?.error || 'Failed to start campaign' });
    }
  };

  const handleDelete = async (id) => {
    try {
      await campaignsApi.delete(id);
      setDeleteId(null);
      setAlert({ type: 'success', msg: 'Campaign deleted' });
      fetchCampaigns(page);
    } catch (err) {
      setAlert({ type: 'error', msg: err.response?.data?.error || 'Failed to delete campaign' });
      setDeleteId(null);
    }
  };

  const progressPct = (c) => {
    if (!c.total_contacts) return 0;
    return Math.round(((c.sent_count + c.failed_count) / c.total_contacts) * 100);
  };

  return (
    <div className="space-y-5">
      {alert && <Alert type={alert.type} onDismiss={() => setAlert(null)}>{alert.msg}</Alert>}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Campaigns</CardTitle>
            <p className="text-xs text-surface-500 mt-0.5">{pagination.total} total</p>
          </div>
          <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={openCreate}>
            New Campaign
          </Button>
        </CardHeader>

        {loading ? (
          <div className="flex justify-center py-12"><Spinner className="text-brand-500" /></div>

        ) : campaigns.length === 0 ? (
          <EmptyState
            icon={<Megaphone className="w-8 h-8" />}
            title="No campaigns yet"
            description="Create a campaign to start sending messages to your contacts"
            action={<Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={openCreate}>New Campaign</Button>}
          />
        ) : (
          <div className="space-y-3">
            {campaigns.map((c) => (
              <div key={c.id} className="border border-surface-100 rounded-2xl p-4 hover:border-surface-200 transition-all">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-surface-800 truncate">{c.campaign_name}</h3>
                      <StatusBadge status={c.status} />
                    </div>
                    <p className="text-xs text-surface-500 mt-1">
                      {c.sent_count} sent · {c.failed_count} failed · {c.total_contacts} total
                      {c.started_at && ` · Started ${new Date(c.started_at).toLocaleDateString()}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {c.status === 'pending' && (
                      <Button
                        size="xs" icon={<Play className="w-3 h-3" />}
                        onClick={() => handleStart(c.id)}
                      >
                        Start
                      </Button>
                    )}
                    <Link to={`/campaigns/${c.id}`}>
                      <Button size="xs" variant="secondary" iconRight={<ArrowRight className="w-3 h-3" />}>
                        Details
                      </Button>
                    </Link>
                    {c.status !== 'running' && (
                      <button
                        onClick={() => setDeleteId(c.id)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-surface-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Progress bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-surface-500">
                    <span>{progressPct(c)}% complete</span>
                    <span>{c.sent_count + c.failed_count} / {c.total_contacts}</span>
                  </div>
                  <div className="h-1.5 bg-surface-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${c.status === 'completed' ? 'bg-green-500' :
                          c.status === 'running' ? 'bg-brand-500 animate-pulse' :
                            'bg-surface-300'
                        }`}
                      style={{ width: `${progressPct(c)}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {pagination.pages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-surface-100">
            <p className="text-xs text-surface-500">Page {pagination.page} of {pagination.pages}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                Previous
              </Button>
              <Button size="sm" variant="secondary" disabled={page >= pagination.pages} onClick={() => setPage(p => p + 1)}>
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Create Campaign Dialog */}
      <Dialog open={formOpen} onClose={() => setFormOpen(false)} title="New Campaign" size="lg">
        {formError && <Alert type="error" className="mb-4">{formError}</Alert>}
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label="Campaign name" required
            value={form.campaignName}
            onChange={(e) => setForm({ ...form, campaignName: e.target.value })}
            placeholder="Summer Sale Blast"
          />

          <Select
            label="Template" required
            value={form.templateId}
            onChange={(e) => setForm({ ...form, templateId: e.target.value })}
          >
            <option value="">Select a template...</option>
            {templates.map(t => (
              <option key={t.id} value={t.id}>{t.template_name}</option>
            ))}
          </Select>

          {/* Contact Picker */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-surface-700">
                Contacts <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-surface-500">{selectedContacts.length} selected</span>
                <button
                  type="button"
                  onClick={() => setSelectedContacts(
                    selectedContacts.length === filteredContacts.length
                      ? []
                      : filteredContacts.map(c => c.id)
                  )}
                  className="text-xs text-brand-600 font-medium hover:underline"
                >
                  {selectedContacts.length === filteredContacts.length ? 'Deselect all' : 'Select all'}
                </button>
              </div>
            </div>
            <div className="mb-2">
              <Input
                placeholder="Filter contacts..."
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
                leftIcon={<Search className="w-4 h-4" />}
              />
            </div>
            <div className="border border-surface-200 rounded-xl max-h-48 overflow-y-auto scrollbar-thin divide-y divide-surface-50">
              {filteredContacts.length === 0 ? (
                <div className="py-8 text-center text-sm text-surface-500">No contacts found</div>
              ) : (
                filteredContacts.map(c => (
                  <label
                    key={c.id}
                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-surface-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedContacts.includes(c.id)}
                      onChange={() => toggleContact(c.id)}
                      className="w-4 h-4 rounded accent-brand-600"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-surface-700 truncate">{c.name}</p>
                      <p className="text-xs text-surface-500">+{c.phone}</p>
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" fullWidth onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button type="submit" fullWidth loading={formLoading}>
              Create Campaign
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteId} onClose={() => setDeleteId(null)} title="Delete Campaign">
        <p className="text-sm text-surface-600 mb-5">Delete this campaign? This cannot be undone.</p>
        <div className="flex gap-3">
          <Button variant="secondary" fullWidth onClick={() => setDeleteId(null)}>Cancel</Button>
          <Button variant="danger" fullWidth onClick={() => handleDelete(deleteId)}>Delete</Button>
        </div>
      </Dialog>
    </div>
  );
}
