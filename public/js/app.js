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

const realtimeRuntime = {
  baseTitle: document.title.replace(/^\[[0-9]+ running\]\s*/i, ''),
  userEventSource: null,
  adminEventSource: null,
  userPollTimer: null,
  adminPollTimer: null,
  userReconnectTimer: null,
  adminReconnectTimer: null,
};

function setRunningTitlePrefix(runningCount) {
  const count = Number(runningCount || 0);
  if (count > 0) {
    document.title = `[${count} running] ${realtimeRuntime.baseTitle}`;
    return;
  }
  document.title = realtimeRuntime.baseTitle;
}

function renderCampaignStatusBadge(status) {
  if (status === 'completed') {
    return '<span class="badge badge-success"><i class="fa-solid fa-circle-check"></i> Completed</span>';
  }
  if (status === 'running') {
    return '<span class="badge badge-warning"><span class="dot orange"></span> Running</span>';
  }
  return '<span class="badge badge-secondary"><i class="fa-solid fa-clock"></i> Pending</span>';
}

function renderContactStatusBadge(status) {
  if (status === 'sent') {
    return '<span class="badge badge-success"><i class="fa-solid fa-circle-check"></i> Sent</span>';
  }
  if (status === 'failed') {
    return '<span class="badge badge-danger"><i class="fa-solid fa-circle-xmark"></i> Failed</span>';
  }
  return '<span class="badge badge-secondary"><i class="fa-solid fa-clock"></i> Pending</span>';
}

function renderCreditsBalanceBadge(credits) {
  const value = Number(credits || 0);
  if (value === 0) {
    return '<span class="badge badge-danger" style="font-size:13px; padding: 6px 16px;"><i class="fa-solid fa-circle-xmark"></i> No Credits</span>';
  }
  if (value < 20) {
    return '<span class="badge badge-warning" style="font-size:13px; padding: 6px 16px;"><i class="fa-solid fa-triangle-exclamation"></i> Low Balance</span>';
  }
  return '<span class="badge badge-success" style="font-size:13px; padding: 6px 16px;"><i class="fa-solid fa-circle-check"></i> Active</span>';
}

function applyCredits(credits) {
  const value = Number(credits || 0);
  const globalCredits = document.getElementById('globalCreditsValue');
  const dashboardCredits = document.getElementById('dashboardCredits');
  const creditsBalance = document.getElementById('creditsBalanceValue');
  const creditsBadge = document.getElementById('creditsBalanceBadge');

  if (globalCredits) globalCredits.textContent = formatNumber(value);
  if (dashboardCredits) dashboardCredits.textContent = formatNumber(value);
  if (creditsBalance) creditsBalance.textContent = formatNumber(value);
  if (creditsBadge) creditsBadge.innerHTML = renderCreditsBalanceBadge(value);
}

function applyDashboardStats(stats) {
  if (!stats) return;
  const totalContacts = document.getElementById('dashboardTotalContacts');
  const totalTemplates = document.getElementById('dashboardTotalTemplates');
  const activeCampaigns = document.getElementById('dashboardActiveCampaigns');
  const messagesSent = document.getElementById('dashboardMessagesSent');

  if (totalContacts) totalContacts.textContent = formatNumber(stats.totalContacts);
  if (totalTemplates) totalTemplates.textContent = formatNumber(stats.totalTemplates);
  if (activeCampaigns) activeCampaigns.textContent = formatNumber(stats.activeCampaigns);
  if (messagesSent) messagesSent.textContent = formatNumber(stats.messagesSent);
}

function applyConnectionStatus(status) {
  const indicator = document.getElementById('globalTopbarConnectionIndicator');
  const dot = document.getElementById('globalTopbarConnectionDot');
  const text = document.getElementById('globalTopbarConnectionText');

  if (!indicator || !dot || !text) return;

  if (status === 'connected') {
    indicator.className = 'connection-indicator connected compact';
    dot.className = 'dot green';
    text.textContent = 'Connected';
    return;
  }

  if (status === 'connecting' || status === 'qr_ready') {
    indicator.className = 'connection-indicator connecting compact';
    dot.className = 'dot orange';
    text.textContent = 'Connecting';
    return;
  }

  indicator.className = 'connection-indicator disconnected compact';
  dot.className = 'dot red';
  text.textContent = 'Disconnected';
}

function applyRunningIndicators(runningCount, connectionStatus) {
  const count = Number(runningCount || 0);
  const topbarBadge = document.getElementById('globalRunningBadge');
  const topbarCount = document.getElementById('globalRunningCount');
  const sidebarPill = document.getElementById('sidebarRunningCount');
  const sidebarDot = document.getElementById('globalSidebarStatusDot');
  const sidebarText = document.getElementById('globalSidebarStatusText');
  const banner = document.getElementById('globalRealtimeBanner');

  if (topbarBadge && topbarCount) {
    topbarCount.textContent = String(count);
    topbarBadge.style.display = count > 0 ? 'inline-flex' : 'none';
  }

  if (sidebarPill) {
    sidebarPill.textContent = String(count);
    sidebarPill.style.display = count > 0 ? 'inline-flex' : 'none';
  }

  if (sidebarDot && sidebarText) {
    if (count > 0) {
      sidebarDot.className = 'dot orange';
      sidebarText.textContent = `${count} campaign${count === 1 ? '' : 's'} running in background`;
    } else if (connectionStatus === 'connected') {
      sidebarDot.className = 'dot green';
      sidebarText.textContent = 'No active campaigns';
    } else {
      sidebarDot.className = 'dot red';
      sidebarText.textContent = 'WhatsApp disconnected';
    }
  }

  if (banner) {
    if (count > 0) {
      banner.innerHTML = `<span class="dot orange"></span> ${count} campaign${count === 1 ? '' : 's'} running in background`;
      banner.style.display = 'flex';
    } else {
      banner.style.display = 'none';
    }
  }

  setRunningTitlePrefix(count);
}

function renderCampaignListRealtime(campaigns) {
  if (!Array.isArray(campaigns)) return;

  campaigns.forEach((campaign) => {
    const campaignId = Number(campaign.id);
    if (!Number.isInteger(campaignId)) return;

    const progressText = document.getElementById(`campaign-progress-text-${campaignId}`);
    const progressBar = document.getElementById(`campaign-progress-bar-${campaignId}`);
    const statusBadge = document.getElementById(`campaign-status-badge-${campaignId}`);

    const total = Number(campaign.total_contacts || 0);
    const sent = Number(campaign.sent_count || 0);
    const pct = total > 0 ? Math.round((sent / total) * 100) : 0;

    if (progressText) {
      progressText.textContent = `${sent}/${total}`;
    }

    if (progressBar) {
      progressBar.style.width = `${pct}%`;
      progressBar.classList.toggle('success', campaign.status === 'completed');
    }

    if (statusBadge) {
      statusBadge.innerHTML = renderCampaignStatusBadge(campaign.status);
    }
  });
}

function renderCampaignDetailRealtime(campaign, contacts) {
  if (!campaign) return;

  const total = Number(campaign.total_contacts || 0);
  const sent = Number(campaign.sent_count || 0);
  const failed = Number(campaign.failed_count || 0);
  const pending = Math.max(total - sent - failed, 0);
  const pct = total > 0 ? Math.round((sent / total) * 100) : 0;

  const statTotal = document.getElementById('campaign-stat-total');
  const statSent = document.getElementById('campaign-stat-sent');
  const statFailed = document.getElementById('campaign-stat-failed');
  const statPending = document.getElementById('campaign-stat-pending');
  const pctEl = document.getElementById('campaign-progress-pct');
  const barEl = document.getElementById('campaign-progress-bar');
  const statusWrap = document.getElementById('campaignDetailsStatusBadge');

  if (statTotal) statTotal.textContent = String(total);
  if (statSent) statSent.textContent = String(sent);
  if (statFailed) statFailed.textContent = String(failed);
  if (statPending) statPending.textContent = String(pending);
  if (pctEl) pctEl.textContent = `${pct}%`;
  if (barEl) {
    barEl.style.width = `${pct}%`;
    barEl.classList.toggle('success', campaign.status === 'completed');
  }
  if (statusWrap) {
    statusWrap.innerHTML = renderCampaignStatusBadge(campaign.status);
  }

  if (Array.isArray(contacts)) {
    contacts.forEach((contact) => {
      const contactId = Number(contact.id);
      if (!Number.isInteger(contactId)) return;

      const statusEl = document.getElementById(`campaign-contact-status-${contactId}`);
      const sentAtEl = document.getElementById(`campaign-contact-sentat-${contactId}`);
      const errorEl = document.getElementById(`campaign-contact-error-${contactId}`);

      if (statusEl) statusEl.innerHTML = renderContactStatusBadge(contact.status);
      if (sentAtEl) sentAtEl.textContent = contact.sent_at ? new Date(contact.sent_at).toLocaleString() : '-';
      if (errorEl) errorEl.textContent = contact.error_message || '-';
    });
  }
}

function applyUserRealtimeSnapshot(payload) {
  if (!payload || payload.success === false) return;

  const creditsValue = payload.user && payload.user.credits !== undefined
    ? payload.user.credits
    : payload.stats && payload.stats.credits !== undefined
      ? payload.stats.credits
      : null;

  if (creditsValue !== null) {
    applyCredits(creditsValue);
  }

  applyDashboardStats(payload.stats);

  if (Array.isArray(payload.activeCampaigns)) {
    renderDashboardCampaignProgress(payload.activeCampaigns);
  }

  if (payload.connectionStatus) {
    renderDashboardWhatsAppStatus(payload.connectionStatus);
    applyConnectionStatus(payload.connectionStatus);
  }

  if (Array.isArray(payload.campaigns)) {
    renderCampaignListRealtime(payload.campaigns);
  }

  if (payload.campaignDetail) {
    renderCampaignDetailRealtime(payload.campaignDetail, payload.campaignContacts || []);
  }

  const runningCountFromCampaigns = Array.isArray(payload.campaigns)
    ? payload.campaigns.filter((campaign) => campaign.status === 'running').length
    : null;
  const runningCountFromActive = Array.isArray(payload.activeCampaigns)
    ? payload.activeCampaigns.filter((campaign) => campaign.status === 'running').length
    : 0;
  const runningCount = runningCountFromCampaigns !== null ? runningCountFromCampaigns : runningCountFromActive;

  applyRunningIndicators(runningCount, payload.connectionStatus || 'disconnected');
}

function applyAdminRealtimeSnapshot(payload) {
  if (!payload || payload.success === false) return;

  const runningCount = Number(payload.runningCount || 0);
  const runningBadge = document.getElementById('adminRunningBadge');
  const runningCountEl = document.getElementById('adminRunningCount');
  const banner = document.getElementById('adminGlobalRealtimeBanner');

  if (runningBadge && runningCountEl) {
    runningCountEl.textContent = String(runningCount);
    runningBadge.style.display = runningCount > 0 ? 'inline-flex' : 'none';
  }

  if (banner) {
    if (runningCount > 0) {
      banner.innerHTML = `<span class="dot orange"></span> ${runningCount} campaign${runningCount === 1 ? '' : 's'} running in background`;
      banner.style.display = 'flex';
    } else {
      banner.style.display = 'none';
    }
  }

  setRunningTitlePrefix(runningCount);

  if (payload.totals) {
    const totalUsers = document.getElementById('admin-total-users');
    const totalTransactions = document.getElementById('admin-total-transactions');
    const totalMessages = document.getElementById('admin-total-messages');

    if (totalUsers) totalUsers.textContent = formatNumber(payload.totals.users);
    if (totalTransactions) totalTransactions.textContent = formatNumber(payload.totals.transactions);
    if (totalMessages) totalMessages.textContent = formatNumber(payload.totals.messages);
  }

  if (Array.isArray(payload.users)) {
    payload.users.forEach((user) => {
      const creditsMain = document.getElementById(`admin-user-credits-${user.id}`);
      const creditsAdd = document.getElementById(`admin-add-user-credits-${user.id}`);

      if (creditsMain) creditsMain.textContent = formatNumber(user.credits);
      if (creditsAdd) creditsAdd.textContent = formatNumber(user.credits);

      const selectOption = document.querySelector(`#userSelect option[data-user-id="${user.id}"]`);
      if (selectOption) {
        selectOption.dataset.credits = String(user.credits);
        const currentText = selectOption.textContent || '';
        const prefix = currentText.split(' — ')[0];
        selectOption.textContent = `${prefix} — ${formatNumber(user.credits)} credits`;
      }
    });

    const userSelect = document.getElementById('userSelect');
    const currentCreditsValue = document.getElementById('currentCreditsValue');
    if (userSelect && currentCreditsValue && userSelect.selectedIndex >= 0) {
      const selected = userSelect.options[userSelect.selectedIndex];
      if (selected && selected.dataset.credits) {
        currentCreditsValue.textContent = formatNumber(selected.dataset.credits);
      }
    }
  }
}

function setAdminStreamState(connected) {
  const badge = document.getElementById('adminStreamStateBadge');
  const dot = document.getElementById('adminStreamStateDot');
  const text = document.getElementById('adminStreamStateText');
  if (!badge || !dot || !text) return;

  if (connected) {
    badge.className = 'badge badge-success';
    dot.className = 'dot green';
    text.textContent = 'Live';
  } else {
    badge.className = 'badge badge-secondary';
    dot.className = 'dot red';
    text.textContent = 'Offline';
  }
}

function buildUserRealtimeUrls(bootstrapEl) {
  const streamUrl = bootstrapEl.getAttribute('data-stream-url');
  const pollUrl = bootstrapEl.getAttribute('data-poll-url');
  const params = new URLSearchParams();

  if (document.getElementById('campaignsRealtimeRoot')) {
    params.set('includeCampaigns', '1');
  }

  const campaignRoot = document.getElementById('campaignDetailsRoot');
  if (campaignRoot) {
    const campaignId = Number(campaignRoot.getAttribute('data-campaign-id'));
    if (Number.isInteger(campaignId) && campaignId > 0) {
      params.set('campaignId', String(campaignId));
    }
  }

  const query = params.toString();
  return {
    stream: query ? `${streamUrl}?${query}` : streamUrl,
    poll: query ? `${pollUrl}?${query}` : pollUrl,
  };
}

function stopUserPolling() {
  if (realtimeRuntime.userPollTimer) {
    clearInterval(realtimeRuntime.userPollTimer);
    realtimeRuntime.userPollTimer = null;
  }
}

function startUserPolling(pollUrl) {
  if (realtimeRuntime.userPollTimer) return;

  const pull = async () => {
    try {
      const res = await fetch(pollUrl, { cache: 'no-store' });
      const data = await res.json();
      applyUserRealtimeSnapshot(data);
    } catch (err) {
      console.error('User realtime poll error:', err);
    }
  };

  pull();
  realtimeRuntime.userPollTimer = setInterval(pull, 4000);
}

function connectUserStream(streamUrl, pollUrl) {
  if (realtimeRuntime.userEventSource) {
    realtimeRuntime.userEventSource.close();
  }

  const eventSource = new EventSource(streamUrl);
  realtimeRuntime.userEventSource = eventSource;

  eventSource.addEventListener('state', (event) => {
    try {
      const payload = JSON.parse(event.data);
      applyUserRealtimeSnapshot(payload);
      stopUserPolling();
    } catch (err) {
      console.error('User realtime parse error:', err);
    }
  });

  eventSource.onerror = () => {
    if (realtimeRuntime.userEventSource !== eventSource) return;
    eventSource.close();
    realtimeRuntime.userEventSource = null;
    startUserPolling(pollUrl);

    if (!realtimeRuntime.userReconnectTimer) {
      realtimeRuntime.userReconnectTimer = setTimeout(() => {
        realtimeRuntime.userReconnectTimer = null;
        connectUserStream(streamUrl, pollUrl);
      }, 6000);
    }
  };
}

function startUserRealtime() {
  const bootstrapEl = document.getElementById('realtimeUserBootstrap');
  if (!bootstrapEl) return;

  const initialCredits = Number(bootstrapEl.getAttribute('data-initial-credits'));
  if (!Number.isNaN(initialCredits)) {
    applyCredits(initialCredits);
  }

  const urls = buildUserRealtimeUrls(bootstrapEl);
  connectUserStream(urls.stream, urls.poll);
}

function stopAdminPolling() {
  if (realtimeRuntime.adminPollTimer) {
    clearInterval(realtimeRuntime.adminPollTimer);
    realtimeRuntime.adminPollTimer = null;
  }
}

function startAdminPolling(pollUrl) {
  if (realtimeRuntime.adminPollTimer) return;

  const pull = async () => {
    try {
      const res = await fetch(pollUrl, { cache: 'no-store' });
      const data = await res.json();
      applyAdminRealtimeSnapshot(data);
    } catch (err) {
      console.error('Admin realtime poll error:', err);
    }
  };

  pull();
  realtimeRuntime.adminPollTimer = setInterval(pull, 5000);
}

function connectAdminStream(streamUrl, pollUrl) {
  if (realtimeRuntime.adminEventSource) {
    realtimeRuntime.adminEventSource.close();
  }

  const eventSource = new EventSource(streamUrl);
  realtimeRuntime.adminEventSource = eventSource;

  eventSource.addEventListener('admin-state', (event) => {
    try {
      const payload = JSON.parse(event.data);
      applyAdminRealtimeSnapshot(payload);
      setAdminStreamState(true);
      stopAdminPolling();
    } catch (err) {
      console.error('Admin realtime parse error:', err);
    }
  });

  eventSource.onerror = () => {
    if (realtimeRuntime.adminEventSource !== eventSource) return;
    eventSource.close();
    realtimeRuntime.adminEventSource = null;
    setAdminStreamState(false);
    startAdminPolling(pollUrl);

    if (!realtimeRuntime.adminReconnectTimer) {
      realtimeRuntime.adminReconnectTimer = setTimeout(() => {
        realtimeRuntime.adminReconnectTimer = null;
        connectAdminStream(streamUrl, pollUrl);
      }, 7000);
    }
  };
}

function startAdminRealtime() {
  const bootstrapEl = document.getElementById('realtimeAdminBootstrap');
  if (!bootstrapEl) return;

  const streamUrl = bootstrapEl.getAttribute('data-stream-url');
  const pollUrl = bootstrapEl.getAttribute('data-poll-url');
  connectAdminStream(streamUrl, pollUrl);
}

function initRealtime() {
  startUserRealtime();
  startAdminRealtime();
}

// ============================================
// INIT ALL
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  initConfirmActions();
  initSelectAll();
  initTemplatePreview();
  initFileUpload('csvFile', 'csvUploadLabel');
  initRealtime();
  initCampaignContactFilters();

  if (document.getElementById('qrContainer')) {
    initQRPolling();
  }

  initContactSearch();
});