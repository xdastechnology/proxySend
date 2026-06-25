import React, { useState, useEffect, useCallback } from 'react';
import { Users, Plus, Upload, Download, Search, Edit, Trash2, X, Tag, Folder } from 'lucide-react';
import { contactsApi, groupsApi } from '../../lib/api';
import Card, { CardHeader, CardTitle } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Badge from '../../components/ui/Badge';
import Dialog from '../../components/ui/Dialog';
import Alert from '../../components/ui/Alert';
import EmptyState from '../../components/ui/EmptyState';
import Spinner from '../../components/ui/Spinner';

const GENDER_OPTIONS = [
  { value: 'unspecified', label: 'Unspecified' },
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];

const emptyForm = { name: '', phone: '', email: '', gender: 'unspecified' };

export default function Contacts() {
  const [contacts, setContacts] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, pages: 1 });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editContact, setEditContact] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [formFieldErrors, setFormFieldErrors] = useState({});
  const [formLoading, setFormLoading] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [importFile, setImportFile] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError] = useState('');
  const [alert, setAlert] = useState(null);
  const [page, setPage] = useState(1);

  // Group states
  const [groups, setGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupLoading, setNewGroupLoading] = useState(false);
  const [deleteGroupId, setDeleteGroupId] = useState(null);
  const [selectedFormGroupIds, setSelectedFormGroupIds] = useState([]);
  const [importGroupName, setImportGroupName] = useState('');

  const fetchContacts = useCallback(async (p = 1, s = '', gId = null) => {
    setLoading(true);
    try {
      const params = { page: p, limit: 20, search: s };
      if (gId) {
        params.groupId = gId;
      }
      const res = await contactsApi.list(params);
      setContacts(res.data.contacts);
      setPagination(res.data.pagination);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchGroups = useCallback(async () => {
    try {
      const res = await groupsApi.list();
      setGroups(res.data.groups || []);
    } catch (err) {
      console.error('Failed to fetch groups', err);
    }
  }, []);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchContacts(1, search, selectedGroupId);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, selectedGroupId, fetchContacts]);

  useEffect(() => {
    fetchContacts(page, search, selectedGroupId);
  }, [page]);

  const openAdd = () => {
    setEditContact(null);
    setForm(emptyForm);
    setFormError('');
    setFormFieldErrors({});
    setSelectedFormGroupIds([]);
    setFormOpen(true);
  };

  const openEdit = (c) => {
    setEditContact(c);
    setForm({ name: c.name, phone: c.phone, email: c.email || '', gender: c.gender || 'unspecified' });
    setFormError('');
    setFormFieldErrors({});
    setSelectedFormGroupIds(c.groups ? c.groups.map(g => g.id) : []);
    setFormOpen(true);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormFieldErrors({});
    setFormLoading(true);
    try {
      const payload = { ...form, groupIds: selectedFormGroupIds };
      if (editContact) {
        await contactsApi.update(editContact.id, payload);
        setAlert({ type: 'success', msg: 'Contact updated' });
      } else {
        await contactsApi.create(payload);
        setAlert({ type: 'success', msg: 'Contact added' });
      }
      setFormOpen(false);
      fetchContacts(page, search, selectedGroupId);
      fetchGroups();
    } catch (err) {
      const data = err.response?.data;
      if (data?.errors) {
        const fe = {};
        data.errors.forEach((e) => { fe[e.field] = e.message; });
        setFormFieldErrors(fe);
      } else {
        setFormError(data?.error || 'Failed to save contact');
      }
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await contactsApi.delete(id);
      setDeleteId(null);
      setAlert({ type: 'success', msg: 'Contact deleted' });
      fetchContacts(page, search, selectedGroupId);
      fetchGroups();
    } catch {
      setAlert({ type: 'error', msg: 'Failed to delete contact' });
    }
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    setNewGroupLoading(true);
    try {
      await groupsApi.create({ name: newGroupName.trim() });
      setNewGroupName('');
      fetchGroups();
      setAlert({ type: 'success', msg: 'Group created' });
    } catch (err) {
      setAlert({ type: 'error', msg: err.response?.data?.error || 'Failed to create group' });
    } finally {
      setNewGroupLoading(false);
    }
  };

  const handleDeleteGroup = async (id) => {
    try {
      await groupsApi.delete(id);
      setDeleteGroupId(null);
      if (selectedGroupId === id) {
        setSelectedGroupId(null);
      }
      fetchGroups();
      fetchContacts(1, search, null);
      setAlert({ type: 'success', msg: 'Group deleted' });
    } catch (err) {
      setAlert({ type: 'error', msg: err.response?.data?.error || 'Failed to delete group' });
      setDeleteGroupId(null);
    }
  };

  const handleImport = async (e) => {
    e.preventDefault();
    if (!importFile) return;
    setImportLoading(true);
    setImportError('');
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append('file', importFile);
      if (importGroupName.trim()) {
        fd.append('groupName', importGroupName.trim());
      }
      const res = await contactsApi.import(fd);
      setImportResult(res.data.summary);
      fetchContacts(1, '', selectedGroupId);
      fetchGroups();
      setSearch('');
      setPage(1);
    } catch (err) {
      setImportError(err.response?.data?.error || 'Import failed');
    } finally {
      setImportLoading(false);
    }
  };

  const handleDownloadTemplate = () => {
    const headers = 'name,phone,email,gender\n';
    const rows = 'John Doe,919000000001,john@example.com,male\nJane Smith,919000000002,jane@example.com,female\n';
    const csvContent = '\uFEFF' + headers + rows;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'contacts_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExport = async () => {
    try {
      const res = await contactsApi.exportCsv();
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'contacts.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setAlert({ type: 'error', msg: 'Export failed' });
    }
  };

  const genderBadge = { male: 'blue', female: 'purple', other: 'orange', unspecified: 'default' };

  return (
    <div className="space-y-5">
      {alert && (
        <Alert type={alert.type} onDismiss={() => setAlert(null)}>{alert.msg}</Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        {/* Groups Sidebar */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader className="pb-3 border-b border-surface-100 flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <Tag className="w-4 h-4 text-brand-500" />
                Groups
              </CardTitle>
            </CardHeader>
            <div className="p-4 space-y-4">
              <form onSubmit={handleCreateGroup} className="flex gap-2">
                <Input
                  placeholder="New group..."
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="flex-1"
                  size="sm"
                />
                <Button type="submit" size="sm" loading={newGroupLoading} icon={<Plus className="w-3.5 h-3.5" />} className="shrink-0" />
              </form>

              <div className="space-y-1">
                <button
                  onClick={() => setSelectedGroupId(null)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-sm font-medium flex items-center justify-between transition-colors ${!selectedGroupId ? 'bg-brand-50 text-brand-700' : 'text-surface-700 hover:bg-surface-50'}`}
                >
                  <span className="flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    All Contacts
                  </span>
                </button>

                {groups.map((g) => (
                  <div
                    key={g.id}
                    className={`w-full group/item px-3 py-2 rounded-xl text-sm font-medium flex items-center justify-between transition-colors ${selectedGroupId === g.id ? 'bg-brand-50 text-brand-700' : 'text-surface-700 hover:bg-surface-50'}`}
                  >
                    <button
                      onClick={() => setSelectedGroupId(g.id)}
                      className="flex-1 text-left truncate mr-2 flex items-center gap-2"
                    >
                      <Folder className="w-4 h-4 text-surface-400 group-hover:text-brand-500" />
                      <span className="truncate">{g.name}</span>
                    </button>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${selectedGroupId === g.id ? 'bg-brand-100 text-brand-700' : 'bg-surface-100 text-surface-600'}`}>
                        {g.count}
                      </span>
                      <button
                        onClick={() => setDeleteGroupId(g.id)}
                        className="opacity-0 group-hover/item:opacity-100 p-0.5 text-surface-400 hover:text-red-500 rounded transition-opacity"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>

        {/* Contacts list */}
        <div className="lg:col-span-3">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>
                  {!selectedGroupId ? 'All Contacts' : groups.find(g => g.id === selectedGroupId)?.name || 'Contacts'}
                </CardTitle>
                <p className="text-xs text-surface-500 mt-0.5">{pagination.total.toLocaleString()} total</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button size="sm" variant="secondary" icon={<Download className="w-3.5 h-3.5" />} onClick={handleExport}>
                  Export
                </Button>
                <Button size="sm" variant="secondary" icon={<Upload className="w-3.5 h-3.5" />} onClick={() => { setImportOpen(true); setImportResult(null); setImportError(''); setImportFile(null); setImportGroupName(''); }}>
                  Import
                </Button>
                <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={openAdd}>
                  Add Contact
                </Button>
              </div>
            </CardHeader>

            <div className="mb-4">
              <Input
                placeholder="Search contacts..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                leftIcon={<Search className="w-4 h-4" />}
                rightIcon={search ? (
                  <button onClick={() => setSearch('')} className="pointer-events-auto">
                    <X className="w-3.5 h-3.5" />
                  </button>
                ) : null}
              />
            </div>

            {loading ? (
              <div className="flex justify-center py-12">
                <Spinner className="text-brand-500" />
              </div>
            ) : contacts.length === 0 ? (
              <EmptyState
                icon={<Users className="w-8 h-8" />}
                title={search ? 'No contacts found' : 'No contacts yet'}
                description={search ? 'Try a different search term' : 'Add your first contact or import from CSV'}
                action={!search && (
                  <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={openAdd}>
                    Add Contact
                  </Button>
                )}
              />
            ) : (
              <div className="space-y-1 -mx-1">
                {contacts.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-surface-50 transition-colors group"
                  >
                    <div className="w-9 h-9 bg-brand-100 rounded-xl flex items-center justify-center shrink-0">
                      <span className="text-brand-700 font-semibold text-sm">{c.name[0].toUpperCase()}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-surface-800 truncate">{c.name}</p>
                        {c.groups && c.groups.map((g) => (
                          <span
                            key={g.id}
                            className="inline-flex items-center text-[10px] font-semibold bg-brand-50 text-brand-600 px-1.5 py-0.5 rounded border border-brand-100/50"
                          >
                            {g.name}
                          </span>
                        ))}
                      </div>
                      <p className="text-xs text-surface-500 truncate">
                        +{c.phone}{c.email ? ` · ${c.email}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={genderBadge[c.gender] || 'default'} size="sm">
                        {c.gender === 'unspecified' ? '—' : c.gender}
                      </Badge>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openEdit(c)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-surface-100 text-surface-400 hover:text-surface-600"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteId(c.id)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-surface-400 hover:text-red-500"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {pagination.pages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-surface-100">
                <p className="text-xs text-surface-500">
                  Page {pagination.page} of {pagination.pages}
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm" variant="secondary"
                    disabled={page <= 1}
                    onClick={() => setPage(p => p - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    size="sm" variant="secondary"
                    disabled={page >= pagination.pages}
                    onClick={() => setPage(p => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editContact ? 'Edit Contact' : 'Add Contact'}
      >
        {formError && <Alert type="error" className="mb-4">{formError}</Alert>}
        <form onSubmit={handleFormSubmit} className="space-y-4">
          <Input
            label="Name" name="name" required
            value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            error={formFieldErrors.name}
          />
          <Input
            label="Phone" name="phone" required
            value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="9876543210"
            hint="Indian numbers auto-normalized"
            error={formFieldErrors.phone}
          />
          <Input
            label="Email (optional)" name="email" type="email"
            value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
            error={formFieldErrors.email}
          />
          <Select
            label="Gender" name="gender"
            value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}
          >
            {GENDER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>

          {/* Group mapping */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-surface-700">
              Groups (optional)
            </label>
            {groups.length === 0 ? (
              <p className="text-xs text-surface-400 italic">No groups created yet. Create a group on the sidebar to select here.</p>
            ) : (
              <div className="border border-surface-200 rounded-xl p-3 max-h-32 overflow-y-auto divide-y divide-surface-50 space-y-1">
                {groups.map((g) => (
                  <label key={g.id} className="flex items-center gap-2 py-1.5 cursor-pointer text-sm text-surface-700 hover:text-surface-900">
                    <input
                      type="checkbox"
                      checked={selectedFormGroupIds.includes(g.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedFormGroupIds([...selectedFormGroupIds, g.id]);
                        } else {
                          setSelectedFormGroupIds(selectedFormGroupIds.filter(id => id !== g.id));
                        }
                      }}
                      className="w-4 h-4 rounded accent-brand-600 border-surface-300"
                    />
                    {g.name}
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" fullWidth onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" fullWidth loading={formLoading}>
              {editContact ? 'Save Changes' : 'Add Contact'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteId} onClose={() => setDeleteId(null)} title="Delete Contact">
        <p className="text-sm text-surface-600 mb-5">
          Are you sure you want to delete this contact? This action cannot be undone.
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" fullWidth onClick={() => setDeleteId(null)}>Cancel</Button>
          <Button variant="danger" fullWidth onClick={() => handleDelete(deleteId)}>Delete</Button>
        </div>
      </Dialog>

      {/* Delete Group Confirm */}
      <Dialog open={!!deleteGroupId} onClose={() => setDeleteGroupId(null)} title="Delete Group">
        <p className="text-sm text-surface-600 mb-5">
          Are you sure you want to delete this group? Contacts in this group will not be deleted, but they will be removed from this group.
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" fullWidth onClick={() => setDeleteGroupId(null)}>Cancel</Button>
          <Button variant="danger" fullWidth onClick={() => handleDeleteGroup(deleteGroupId)}>Delete</Button>
        </div>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={importOpen} onClose={() => setImportOpen(false)} title="Import Contacts">
        {importError && <Alert type="error" className="mb-4">{importError}</Alert>}
        {importResult ? (
          <div className="space-y-4">
            <Alert type="success" title="Import Complete">
              Successfully imported contacts from CSV
            </Alert>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Total Rows', value: importResult.total, color: 'text-surface-700' },
                { label: 'Imported', value: importResult.imported, color: 'text-green-600' },
                { label: 'Duplicates Skipped', value: importResult.skippedDuplicate, color: 'text-yellow-600' },
                { label: 'Invalid Skipped', value: importResult.skippedInvalid, color: 'text-red-600' },
                { label: 'Not on WhatsApp', value: importResult.skippedNoWhatsApp, color: 'text-orange-600' },
              ].map(s => (
                <div key={s.label} className="bg-surface-50 rounded-xl p-3">
                  <p className="text-xs text-surface-500">{s.label}</p>
                  <p className={`text-xl font-bold mt-0.5 ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>
            <Button fullWidth onClick={() => setImportOpen(false)}>Done</Button>
          </div>
        ) : (
          <form onSubmit={handleImport} className="space-y-4">
            <Input
              label="Group Name (optional)"
              placeholder="e.g. Newsletter, Launch Leads"
              value={importGroupName}
              onChange={(e) => setImportGroupName(e.target.value)}
              hint="All imported contacts will be automatically added to this group"
            />
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1.5">
                CSV File <span className="text-red-500">*</span>
              </label>
              <div className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${importFile ? 'border-brand-300 bg-brand-50' : 'border-surface-200 hover:border-surface-300'}`}>
                {importFile ? (
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-sm text-brand-600 font-medium">{importFile.name}</span>
                    <button type="button" onClick={() => setImportFile(null)} className="text-surface-400 hover:text-surface-600">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-surface-300 mx-auto mb-2" />
                    <p className="text-sm text-surface-500">
                      <label className="text-brand-600 cursor-pointer hover:underline font-medium">
                        Browse file
                        <input
                          type="file" accept=".csv" className="hidden"
                          onChange={(e) => setImportFile(e.target.files[0])}
                        />
                      </label>{' '}
                      or drag and drop
                    </p>
                    <p className="text-xs text-surface-400 mt-1">CSV up to 5MB</p>
                  </>
                )}
              </div>
            </div>
            <div className="bg-surface-50 rounded-xl p-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-surface-600 mb-0.5">Expected columns:</p>
                <p className="text-xs text-surface-500">name, phone, email, gender</p>
              </div>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="text-xs text-brand-600 font-medium hover:underline shrink-0"
              >
                Download Template
              </button>
            </div>
            <div className="flex gap-3">
              <Button type="button" variant="secondary" fullWidth onClick={() => setImportOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" fullWidth loading={importLoading} disabled={!importFile}>
                Import
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}
