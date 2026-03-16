// ProxySend - Main JavaScript

// ============================================
// MODAL MANAGEMENT
// ============================================

function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('active');
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('active');
}

// Close modal on overlay click
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('active');
  }
});

// ============================================
// AUTO DISMISS ALERTS
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  const alerts = document.querySelectorAll('.alert[data-auto-dismiss]');
  alerts.forEach((alert) => {
    setTimeout(() => {
      alert.style.opacity = '0';
      alert.style.transition = 'opacity 0.3s';
      setTimeout(() => alert.remove(), 300);
    }, 4000);
  });
});

// ============================================
// FILE UPLOAD UI
// ============================================

function initFileUpload(inputId, labelId) {
  const input = document.getElementById(inputId);
  const label = document.getElementById(labelId);
  if (!input || !label) return;

  label.addEventListener('click', () => input.click());

  input.addEventListener('change', () => {
    if (input.files[0]) {
      label.querySelector('p').textContent = input.files[0].name;
    }
  });

  ['dragover', 'dragenter'].forEach((evt) => {
    label.addEventListener(evt, (e) => {
      e.preventDefault();
      label.style.borderColor = 'var(--primary)';
    });
  });

  ['dragleave', 'dragend', 'drop'].forEach((evt) => {
    label.addEventListener(evt, () => {
      label.style.borderColor = '';
    });
  });

  label.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) {
      input.files = e.dataTransfer.files;
      label.querySelector('p').textContent = file.name;
    }
  });
}

// ============================================
// SELECT ALL CONTACTS
// ============================================

function initSelectAll() {
  const selectAll = document.getElementById('selectAll');
  const checkboxes = document.querySelectorAll('.contact-checkbox');
  const countLabel = document.getElementById('selectedCount');

  if (!selectAll) return;

  function getVisibleCheckboxes() {
    return [...document.querySelectorAll('.contact-checkbox')].filter((cb) => {
      const row = cb.closest('.campaign-contact-item');
      if (!row) return true;
      return row.style.display !== 'none';
    });
  }

  function updateCount() {
    const checked = document.querySelectorAll('.contact-checkbox:checked').length;
    if (countLabel) countLabel.textContent = `${checked} selected`;
  }

  function syncSelectAllState() {
    const visible = getVisibleCheckboxes();
    const checkedVisible = visible.filter((cb) => cb.checked).length;

    if (visible.length === 0) {
      selectAll.checked = false;
      selectAll.indeterminate = false;
      return;
    }

    selectAll.checked = checkedVisible === visible.length;
    selectAll.indeterminate = checkedVisible > 0 && checkedVisible < visible.length;
  }

  selectAll.addEventListener('change', () => {
    const visible = getVisibleCheckboxes();
    const targets = visible.length > 0 ? visible : [...checkboxes];
    targets.forEach((cb) => {
      cb.checked = selectAll.checked;
    });
    updateCount();
    syncSelectAllState();
  });

  checkboxes.forEach((cb) => {
    cb.addEventListener('change', () => {
      syncSelectAllState();
      updateCount();
    });
  });

  window.__campaignSelectionSync = () => {
    syncSelectAllState();
    updateCount();
  };

  syncSelectAllState();
  updateCount();
}

// ============================================
// TEMPLATE PREVIEW
// ============================================

function initTemplatePreview() {
  const messageInput = document.getElementById('message');
  const preview = document.getElementById('templatePreview');
  const buttonsPreview = document.getElementById('templateButtonsPreview');
  if (!messageInput || !preview) return;

  function refreshButtonsPreview() {
    if (!buttonsPreview) return;

    const labels = [...document.querySelectorAll('.template-btn-label')]
      .map((el) => el.value.trim())
      .filter(Boolean)
      .slice(0, 3);

    if (labels.length === 0) {
      buttonsPreview.innerHTML = '';
      return;
    }

    buttonsPreview.innerHTML = labels
      .map(
        (label) =>
          `<span class="btn btn-outline btn-sm" style="padding:4px 8px; cursor:default;"><i class="fa-solid fa-link"></i> ${escapeHtml(label)}</span>`
      )
      .join('');
  }

  messageInput.addEventListener('input', () => {
    preview.textContent = messageInput.value || 'Your message preview will appear here...';
  });

  document.querySelectorAll('.template-btn-label').forEach((el) => {
    el.addEventListener('input', refreshButtonsPreview);
  });

  refreshButtonsPreview();
}

// ============================================
// WHATSAPP QR POLLING
// ============================================

function initQRPolling() {
  const qrContainer = document.getElementById('qrContainer');
  const statusEl = document.getElementById('connectionStatus');
  if (!qrContainer) return;

  let polling = setInterval(async () => {
    try {
      const response = await fetch('/whatsapp/status');
      const data = await response.json();

      if (data.status === 'connected') {
        clearInterval(polling);
        if (statusEl) {
          statusEl.innerHTML = '<span class="dot green"></span> Connected';
          statusEl.className = 'connection-indicator connected';
        }
        qrContainer.innerHTML = `
          <div style="text-align:center; padding: 24px;">
            <i class="fa-solid fa-circle-check" style="font-size:48px; color: var(--success); margin-bottom: 12px; display:block;"></i>
            <p style="font-weight:600; color: var(--success);">WhatsApp Connected!</p>
            <p style="font-size:13px; color: var(--text-secondary); margin-top: 8px;">Redirecting to dashboard...</p>
          </div>
        `;
        setTimeout(() => (window.location.href = '/dashboard'), 2000);
      } else if (data.qrCode && data.status === 'qr_ready') {
        const img = qrContainer.querySelector('img');
        if (img) img.src = data.qrCode;
        if (statusEl) {
          statusEl.innerHTML = '<span class="dot orange"></span> Waiting for scan...';
          statusEl.className = 'connection-indicator connecting';
        }
      }
    } catch (err) {
      console.error('Status poll error:', err);
    }
  }, 3000);

  // Stop polling after 3 minutes
  setTimeout(() => clearInterval(polling), 180000);
}

// ============================================
// CONFIRM DELETE
// ============================================

function confirmDelete(url, message) {
  if (confirm(message || 'Are you sure you want to delete this item?')) {
    window.location.href = url;
  }
}

function initConfirmActions() {
  document.addEventListener('click', (event) => {
    const deleteButton = event.target.closest('.js-confirm-delete');
    if (deleteButton) {
      event.preventDefault();
      const url = deleteButton.getAttribute('data-confirm-delete-url');
      const message =
        deleteButton.getAttribute('data-confirm-message') ||
        'Are you sure you want to delete this item?';

      if (url && confirm(message)) {
        window.location.href = url;
      }
      return;
    }

    const confirmLink = event.target.closest('.js-confirm-link');
    if (confirmLink) {
      event.preventDefault();
      const url = confirmLink.getAttribute('href');
      const message =
        confirmLink.getAttribute('data-confirm-message') ||
        'Are you sure you want to continue?';

      if (url && confirm(message)) {
        window.location.href = url;
      }
    }
  });
}

// ============================================
// CONTACT SEARCH (live)
// ============================================

function initContactSearch() {
  const searchInput = document.getElementById('contactSearch');
  const tableBody = document.getElementById('contactTableBody');
  if (!searchInput || !tableBody) return;

  let timeout;
  searchInput.addEventListener('input', () => {
    clearTimeout(timeout);
    timeout = setTimeout(async () => {
      const q = searchInput.value.trim();
      if (q.length < 2) {
        window.location.href = '/contacts';
        return;
      }
      try {
        const res = await fetch(`/contacts/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (data.success) {
          renderContactTable(data.contacts, tableBody);
        }
      } catch (err) {
        console.error('Search error:', err);
      }
    }, 300);
  });
}

function renderContactTable(contacts, tbody) {
  if (contacts.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center; padding: 32px; color: var(--text-secondary);">
          No contacts found
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = contacts
    .map(
      (c) => `
    <tr>
      <td>${escapeHtml(c.name)}</td>
      <td>${escapeHtml(c.phone)}</td>
      <td>${escapeHtml(c.email || '-')}</td>
      <td>${escapeHtml(c.gender || 'unspecified')}</td>
      <td>${formatDate(c.created_at)}</td>
      <td>
        <div class="flex gap-8">
          <a href="/contacts/edit/${c.id}" class="btn btn-outline btn-sm">
            <i class="fa-solid fa-pen"></i>
          </a>
          <button
            type="button"
            class="btn btn-danger btn-sm js-confirm-delete"
            data-confirm-delete-url="/contacts/delete/${c.id}"
            data-confirm-message="Delete contact ${escapeHtml(c.name)}?"
          >
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </td>
    </tr>
  `
    )
    .join('');
}

function initCampaignContactFilters() {
  const searchInput = document.getElementById('campaignContactSearch');
  const genderSelect = document.getElementById('campaignGenderFilter');
  const list = document.getElementById('campaignContactList');
  const empty = document.getElementById('campaignFilterEmpty');
  if (!searchInput || !genderSelect || !list) return;

  const rows = [...list.querySelectorAll('.campaign-contact-item')];

  const applyFilters = () => {
    const q = searchInput.value.trim().toLowerCase();
    const gender = genderSelect.value;
    let visible = 0;

    rows.forEach((row) => {
      const haystack = `${row.dataset.name || ''} ${row.dataset.phone || ''} ${row.dataset.email || ''}`;
      const rowGender = row.dataset.gender || 'unspecified';
      const passSearch = !q || haystack.includes(q);
      const passGender = gender === 'all' || rowGender === gender;
      const show = passSearch && passGender;

      row.style.display = show ? '' : 'none';
      if (show) visible += 1;
    });

    if (empty) {
      empty.style.display = visible === 0 ? '' : 'none';
    }

    if (typeof window.__campaignSelectionSync === 'function') {
      window.__campaignSelectionSync();
    }
  };

  searchInput.addEventListener('input', applyFilters);
  genderSelect.addEventListener('change', applyFilters);
  applyFilters();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str || ''));
  return div.innerHTML;
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString();
}

function formatNumber(value) {
  const num = Number(value || 0);
  return num.toLocaleString();
}

function renderDashboardCampaignProgress(campaigns) {
  const list = document.getElementById('dashboardCampaignProgressList');
  if (!list) return;

  if (!Array.isArray(campaigns) || campaigns.length === 0) {
    list.innerHTML = `
      <div class="empty-state" style="padding:20px;">
        <i class="fa-solid fa-signal"></i>
        <h3>No active campaigns</h3>
        <p>Start a campaign to see live progress here</p>
      </div>
    `;
    return;
  }

  list.innerHTML = campaigns
    .map((campaign) => {
      const total = Number(campaign.total_contacts || 0);
      const sent = Number(campaign.sent_count || 0);
      const failed = Number(campaign.failed_count || 0);
      const pct = total > 0 ? Math.round((sent / total) * 100) : 0;
      const safeName = escapeHtml(campaign.campaign_name || 'Untitled campaign');
      const safeTemplate = escapeHtml(campaign.template_name || 'No template');
      const statusBadge =
        campaign.status === 'running'
          ? '<span class="badge badge-warning"><span class="dot orange"></span> Running</span>'
          : '<span class="badge badge-secondary"><i class="fa-solid fa-clock"></i> Pending</span>';

      return `
        <div class="card" style="margin:0;">
          <div style="padding:14px 16px;">
            <div class="flex-center" style="justify-content:space-between; margin-bottom:6px;">
              <div>
                <div class="fw-600">${safeName}</div>
                <div class="text-sm text-muted">${safeTemplate}</div>
              </div>
              <div>${statusBadge}</div>
            </div>
            <div class="flex-center" style="justify-content:space-between; margin-bottom:6px;">
              <span class="text-sm text-muted">${sent}/${total} sent</span>
              <span class="text-sm text-muted">${failed} failed</span>
            </div>
            <div class="progress">
              <div class="progress-bar" style="width:${pct}%"></div>
            </div>
          </div>
        </div>
      `;
    })
    .join('');
}

function renderDashboardWhatsAppStatus(status) {
  const box = document.getElementById('dashboardWaStatus');
  if (!box) return;

  if (status === 'connected') {
    box.innerHTML = `
      <div style="margin-bottom: 16px;">
        <i class="fa-brands fa-whatsapp" style="font-size:48px; color: var(--success);"></i>
      </div>
      <div class="connection-indicator connected" style="display:inline-flex; margin-bottom:16px;">
        <span class="dot green"></span> Connected
      </div>
      <p class="text-muted text-sm mb-16">Your WhatsApp is connected and ready to send messages.</p>
      <a href="/whatsapp" class="btn btn-outline btn-sm">
        <i class="fa-solid fa-gear"></i> Manage Connection
      </a>
    `;
    return;
  }

  box.innerHTML = `
    <div style="margin-bottom: 16px;">
      <i class="fa-brands fa-whatsapp" style="font-size:48px; color: var(--text-light);"></i>
    </div>
    <div class="connection-indicator disconnected" style="display:inline-flex; margin-bottom:16px;">
      <span class="dot red"></span> Disconnected
    </div>
    <p class="text-muted text-sm mb-16">Connect your WhatsApp account to start sending messages.</p>
    <a href="/whatsapp/connect" class="btn btn-primary btn-sm">
      <i class="fa-solid fa-link"></i> Connect WhatsApp
    </a>
  `;
}

function initDashboardRealtime() {
  const root = document.getElementById('dashboardRealtimeRoot');
  if (!root) return;

  const ids = {
    totalContacts: document.getElementById('dashboardTotalContacts'),
    totalTemplates: document.getElementById('dashboardTotalTemplates'),
    activeCampaigns: document.getElementById('dashboardActiveCampaigns'),
    messagesSent: document.getElementById('dashboardMessagesSent'),
    credits: document.getElementById('dashboardCredits'),
  };

  const refreshMs = Number(root.getAttribute('data-refresh-ms')) || 4000;

  const pull = async () => {
    try {
      const res = await fetch('/dashboard/realtime');
      const data = await res.json();
      if (!data.success) return;

      if (ids.totalContacts) ids.totalContacts.textContent = formatNumber(data.stats.totalContacts);
      if (ids.totalTemplates) ids.totalTemplates.textContent = formatNumber(data.stats.totalTemplates);
      if (ids.activeCampaigns) ids.activeCampaigns.textContent = formatNumber(data.stats.activeCampaigns);
      if (ids.messagesSent) ids.messagesSent.textContent = formatNumber(data.stats.messagesSent);
      if (ids.credits) ids.credits.textContent = formatNumber(data.stats.credits);

      renderDashboardCampaignProgress(data.activeCampaigns);
      renderDashboardWhatsAppStatus(data.connectionStatus);
    } catch (err) {
      console.error('Dashboard realtime error:', err);
    }
  };

  pull();
  setInterval(pull, refreshMs);
}

// ============================================
// INIT ALL
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  initConfirmActions();
  initSelectAll();
  initTemplatePreview();
  initFileUpload('csvFile', 'csvUploadLabel');
  initDashboardRealtime();
  initCampaignContactFilters();

  if (document.getElementById('qrContainer')) {
    initQRPolling();
  }

  initContactSearch();
});