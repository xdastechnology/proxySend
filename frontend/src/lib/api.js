import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      const path = window.location.pathname;
      if (!path.startsWith('/login') && !path.startsWith('/register') && !path.startsWith('/admin')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export default api;

// Auth
export const authApi = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  logout: () => api.post('/auth/logout'),
  me: (requestConfig = {}) => api.get('/auth/me', requestConfig),
  adminLogin: (data) => api.post('/auth/admin/login', data),
  adminMe: (requestConfig = {}) => api.get('/auth/admin/me', requestConfig),
};

// Profile
export const profileApi = {
  get: () => api.get('/profile'),
  update: (data) => api.put('/profile', data),
  changePassword: (data) => api.put('/profile/password', data),
};

// WhatsApp
export const waApi = {
  status: () => api.get('/whatsapp/status'),
  connect: () => api.post('/whatsapp/connect'),
  qr: () => api.get('/whatsapp/qr'),
  disconnect: () => api.post('/whatsapp/disconnect'),
  checkNumber: (phone) => api.post('/whatsapp/check-number', { phone }),
};

// Contacts
export const contactsApi = {
  list: (params) => api.get('/contacts', { params }),
  picker: (params) => api.get('/contacts/picker', { params }),
  search: (q) => api.get('/contacts/search', { params: { q } }),
  get: (id) => api.get(`/contacts/${id}`),
  create: (data) => api.post('/contacts', data),
  update: (id, data) => api.put(`/contacts/${id}`, data),
  delete: (id) => api.delete(`/contacts/${id}`),
  import: (formData) =>
    api.post('/contacts/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  exportCsv: () =>
    api.get('/contacts/export/csv', { responseType: 'blob' }),
};

// Templates
export const templatesApi = {
  list: () => api.get('/templates'),
  get: (id) => api.get(`/templates/${id}`),
  create: (formData) =>
    api.post('/templates', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  update: (id, formData) =>
    api.put(`/templates/${id}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  delete: (id) => api.delete(`/templates/${id}`),
};

// Campaigns
export const campaignsApi = {
  list: (params) => api.get('/campaigns', { params }),
  get: (id) => api.get(`/campaigns/${id}`),
  create: (data) => api.post('/campaigns', data),
  start: (id) => api.post(`/campaigns/${id}/start`),
  delete: (id) => api.delete(`/campaigns/${id}`),
};

// Credits
export const creditsApi = {
  overview: () => api.get('/credits'),
  request: (data) => api.post('/credits/request', data),
};

// Admin
export const adminApi = {
  dashboard: () => api.get('/admin/dashboard'),
  users: () => api.get('/admin/users'),
  addCredits: (data) => api.post('/admin/credits/add', data),
  createRefCode: (data) => api.post('/admin/reference-codes', data),
  toggleRefCode: (id) => api.patch(`/admin/reference-codes/${id}/toggle`),
  creditRequests: (params) => api.get('/admin/credit-requests', { params }),
  resolveCreditRequest: (id, data) => api.patch(`/admin/credit-requests/${id}`, data),
};
