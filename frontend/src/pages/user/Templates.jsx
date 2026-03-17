import React, { useState, useEffect } from 'react';
import { FileText, Plus, Edit, Trash2, Image, Video, File, Link as LinkIcon, Eye } from 'lucide-react';
import { templatesApi } from '../../lib/api';
import Card, { CardHeader, CardTitle } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Dialog from '../../components/ui/Dialog';
import Alert from '../../components/ui/Alert';
import EmptyState from '../../components/ui/EmptyState';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';

const MEDIA_ICON = { image: Image, video: Video, document: File };

function TemplatePreview({ template }) {
  const buttons = template.buttons || [];
  const hasMedia = !!template.media_path;
  const mediaType = template.media_type;

  return (
    <div className="bg-[#0b141a] rounded-2xl p-4 text-white max-w-xs">
      <div className="bg-[#202c33] rounded-xl overflow-hidden">
        {hasMedia && (
          <div className="bg-[#2a3942] flex items-center justify-center h-28">
            {mediaType === 'image' ? (
              <Image className="w-8 h-8 text-[#8696a0]" />
            ) : mediaType === 'video' ? (
              <Video className="w-8 h-8 text-[#8696a0]" />
            ) : (
              <File className="w-8 h-8 text-[#8696a0]" />
            )}
            <span className="ml-2 text-xs text-[#8696a0]">{template.media_original_name}</span>
          </div>
        )}
        <div className="px-3 py-2.5">
          {template.message && (
            <p className="text-sm text-[#e9edef] whitespace-pre-wrap">{template.message}</p>
          )}
          {buttons.length > 0 && (
            <div className="mt-2 space-y-1">
              {buttons.map((btn, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[#00a884] text-xs">
                  <LinkIcon className="w-3 h-3 shrink-0" />
                  <span className="truncate">{btn.label}</span>
                </div>
              ))}
            </div>
          )}
          <p className="text-[10px] text-[#8696a0] text-right mt-1.5">12:00 PM ✓✓</p>
        </div>
      </div>
    </div>
  );
}

const emptyForm = {
  templateName: '',
  message: '',
  buttons: [],
  removeMedia: false,
};

export default function Templates() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState(null);
  const [editTemplate, setEditTemplate] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [mediaFile, setMediaFile] = useState(null);
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [alert, setAlert] = useState(null);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await templatesApi.list();
      setTemplates(res.data.templates);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTemplates(); }, []);

  const openAdd = () => {
    setEditTemplate(null);
    setForm(emptyForm);
    setMediaFile(null);
    setFormError('');
    setFormOpen(true);
  };

  const openEdit = (t) => {
    setEditTemplate(t);
    setForm({
      templateName: t.template_name,
      message: t.message || '',
      buttons: t.buttons || [],
      removeMedia: false,
    });
    setMediaFile(null);
    setFormError('');
    setFormOpen(true);
  };

  const handleAddButton = () => {
    if (form.buttons.length >= 3) return;
    setForm({ ...form, buttons: [...form.buttons, { label: '', url: '' }] });
  };

  const handleButtonChange = (i, field, value) => {
    const btns = [...form.buttons];
    btns[i] = { ...btns[i], [field]: value };
    setForm({ ...form, buttons: btns });
  };

  const handleRemoveButton = (i) => {
    setForm({ ...form, buttons: form.buttons.filter((_, j) => j !== i) });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormLoading(true);
    try {
      const fd = new FormData();
      fd.append('templateName', form.templateName);
      if (form.message) fd.append('message', form.message);
      if (form.buttons.length) fd.append('buttons', JSON.stringify(form.buttons));
      if (mediaFile) fd.append('media', mediaFile);
      if (editTemplate && form.removeMedia) fd.append('removeMedia', 'true');

      if (editTemplate) {
        await templatesApi.update(editTemplate.id, fd);
        setAlert({ type: 'success', msg: 'Template updated' });
      } else {
        await templatesApi.create(fd);
        setAlert({ type: 'success', msg: 'Template created' });
      }
      setFormOpen(false);
      fetchTemplates();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to save template');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await templatesApi.delete(id);
      setDeleteId(null);
      setAlert({ type: 'success', msg: 'Template deleted' });
      fetchTemplates();
    } catch {
      setAlert({ type: 'error', msg: 'Failed to delete template' });
    }
  };

  return (
    <div className="space-y-5">
      {alert && <Alert type={alert.type} onDismiss={() => setAlert(null)}>{alert.msg}</Alert>}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Templates</CardTitle>
            <p className="text-xs text-surface-500 mt-0.5">{templates.length} template{templates.length !== 1 ? 's' : ''}</p>
          </div>
          <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={openAdd}>
            New Template
          </Button>
        </CardHeader>

        {loading ? (
          <div className="flex justify-center py-12"><Spinner className="text-brand-500" /></div>
        ) : templates.length === 0 ? (
          <EmptyState
            icon={<FileText className="w-8 h-8" />}
            title="No templates yet"
            description="Create a reusable message template with optional media and buttons"
            action={<Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={openAdd}>New Template</Button>}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {templates.map((t) => {
              const MediaIcon = MEDIA_ICON[t.media_type] || null;
              return (
                <div
                  key={t.id}
                  className="border border-surface-100 rounded-2xl p-4 hover:border-surface-200 hover:shadow-soft transition-all group"
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <h3 className="text-sm font-semibold text-surface-800 truncate flex-1">{t.template_name}</h3>
                    <div className="flex items-center gap-1 shrink-0">
                      {MediaIcon && <Badge variant="blue" size="sm"><MediaIcon className="w-3 h-3" /></Badge>}
                      {t.buttons?.length > 0 && <Badge variant="purple" size="sm">{t.buttons.length} btn{t.buttons.length > 1 ? 's' : ''}</Badge>}
                    </div>
                  </div>
                  {t.message && (
                    <p className="text-xs text-surface-500 line-clamp-2 mb-3">{t.message}</p>
                  )}
                  <div className="flex items-center gap-2">
                    <Button size="xs" variant="ghost" icon={<Eye className="w-3 h-3" />} onClick={() => setPreviewTemplate(t)}>
                      Preview
                    </Button>
                    <Button size="xs" variant="ghost" icon={<Edit className="w-3 h-3" />} onClick={() => openEdit(t)}>
                      Edit
                    </Button>
                    <Button size="xs" variant="ghost" icon={<Trash2 className="w-3 h-3" />} onClick={() => setDeleteId(t.id)}
                      className="text-red-500 hover:bg-red-50">
                      Delete
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Form Dialog */}
      <Dialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editTemplate ? 'Edit Template' : 'New Template'}
        size="lg"
      >
        {formError && <Alert type="error" className="mb-4">{formError}</Alert>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Template name" required
            value={form.templateName}
            onChange={(e) => setForm({ ...form, templateName: e.target.value })}
          />
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">
              Message
              <span className="text-xs text-surface-400 font-normal ml-2">
                Use {'{{name}}'}, {'{{phone}}'}, {'{{email}}'} for variables
              </span>
            </label>
            <textarea
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              rows={4}
              className="w-full px-3 py-2.5 text-sm bg-white border border-surface-200 rounded-xl
                focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 placeholder:text-surface-400 resize-none"
              placeholder="Hi {{name}}, we have an offer for you!"
            />
          </div>

          {/* Media */}
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">Media (optional)</label>
            {editTemplate?.media_path && !form.removeMedia && !mediaFile && (
              <div className="flex items-center gap-3 p-3 bg-surface-50 rounded-xl mb-2">
                {editTemplate.media_type === 'image' ? <Image className="w-4 h-4 text-surface-500" /> :
                 editTemplate.media_type === 'video' ? <Video className="w-4 h-4 text-surface-500" /> :
                 <File className="w-4 h-4 text-surface-500" />}
                <span className="text-xs text-surface-600 flex-1 truncate">{editTemplate.media_original_name}</span>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, removeMedia: true })}
                  className="text-xs text-red-500 hover:underline"
                >
                  Remove
                </button>
              </div>
            )}
            <div className={`border-2 border-dashed rounded-xl p-4 text-center ${mediaFile ? 'border-brand-300 bg-brand-50' : 'border-surface-200'}`}>
              {mediaFile ? (
                <div className="flex items-center justify-center gap-2">
                  <span className="text-sm text-brand-600 font-medium truncate max-w-[200px]">{mediaFile.name}</span>
                  <button type="button" onClick={() => setMediaFile(null)} className="text-surface-400 hover:text-surface-600 shrink-0">
                    <span className="text-xs">✕</span>
                  </button>
                </div>
              ) : (
                <label className="cursor-pointer">
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*,video/mp4,application/pdf"
                    onChange={(e) => {
                      setMediaFile(e.target.files[0]);
                      setForm({ ...form, removeMedia: false });
                    }}
                  />
                  <div className="flex flex-col items-center gap-1">
                    <Image className="w-6 h-6 text-surface-300" />
                    <span className="text-sm text-brand-600 font-medium">Choose file</span>
                    <span className="text-xs text-surface-400">Image, Video, PDF · Max 25MB</span>
                  </div>
                </label>
              )}
            </div>
          </div>

          {/* Buttons */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-surface-700">Buttons (up to 3)</label>
              {form.buttons.length < 3 && (
                <button
                  type="button"
                  onClick={handleAddButton}
                  className="text-xs text-brand-600 font-medium hover:underline"
                >
                  + Add button
                </button>
              )}
            </div>
            <div className="space-y-3">
              {form.buttons.map((btn, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <div className="flex-1 space-y-2">
                    <Input
                      placeholder="Button label (max 30 chars)"
                      value={btn.label}
                      onChange={(e) => handleButtonChange(i, 'label', e.target.value.slice(0, 30))}
                    />
                    <Input
                      placeholder="https://example.com"
                      value={btn.url}
                      onChange={(e) => handleButtonChange(i, 'url', e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveButton(i)}
                    className="mt-2 w-8 h-8 flex items-center justify-center rounded-xl hover:bg-red-50 text-surface-400 hover:text-red-500"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" fullWidth onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button type="submit" fullWidth loading={formLoading}>
              {editTemplate ? 'Save Changes' : 'Create Template'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={!!previewTemplate} onClose={() => setPreviewTemplate(null)} title="Template Preview">
        {previewTemplate && (
          <div className="flex flex-col items-center gap-4">
            <TemplatePreview template={previewTemplate} />
            <div className="w-full bg-surface-50 rounded-xl p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-surface-500">Name</span>
                <span className="font-medium text-surface-700">{previewTemplate.template_name}</span>
              </div>
              {previewTemplate.media_type && (
                <div className="flex justify-between">
                  <span className="text-surface-500">Media</span>
                  <Badge variant="blue">{previewTemplate.media_type}</Badge>
                </div>
              )}
              {previewTemplate.buttons?.length > 0 && (
                <div className="flex justify-between">
                  <span className="text-surface-500">Buttons</span>
                  <span className="font-medium">{previewTemplate.buttons.length}</span>
                </div>
              )}
            </div>
            <Button variant="secondary" fullWidth onClick={() => setPreviewTemplate(null)}>Close</Button>
          </div>
        )}
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteId} onClose={() => setDeleteId(null)} title="Delete Template">
        <p className="text-sm text-surface-600 mb-5">Delete this template? This cannot be undone.</p>
        <div className="flex gap-3">
          <Button variant="secondary" fullWidth onClick={() => setDeleteId(null)}>Cancel</Button>
          <Button variant="danger" fullWidth onClick={() => handleDelete(deleteId)}>Delete</Button>
        </div>
      </Dialog>
    </div>
  );
}
