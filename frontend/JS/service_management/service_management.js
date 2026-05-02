import { apiFetch } from '../utils/apiClient.js';

let allServices = [];
let allRequests = [];
let currentRole = '';
let isEditMode = false;

export async function initServiceManagement() {
  const roleVal = String(localStorage.getItem('role') || 'staff').toUpperCase();
  currentRole = roleVal.includes('OWNER') ? 'OWNER' : 'STAFF';

  setupUIByRole();
  attachEventListeners();
  await loadData();
}

function setupUIByRole() {
  const addBtn = document.getElementById('openAddModalBtn');
  const adminPanel = document.getElementById('adminPanel');
  const submitModalBtn = document.getElementById('submitModalBtn');

  if (currentRole === 'OWNER') {
    if (addBtn) {
      addBtn.innerHTML = `
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
        <span>Add Services</span>
      `;
    }
    if (adminPanel) adminPanel.classList.remove('hidden');
    if (submitModalBtn) submitModalBtn.textContent = 'Submit';
  } else {
    if (addBtn) {
      addBtn.innerHTML = `
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
        <span>Add Services</span>
      `;
    }
    if (adminPanel) adminPanel.classList.remove('hidden');
    if (submitModalBtn) submitModalBtn.textContent = 'Submit Request';
  }
}

async function loadData() {
  try {
    // Load Services
    const serviceRes = await apiFetch('/api/services');
    if (serviceRes && serviceRes.success) {
      allServices = serviceRes.data || [];
    }
    renderServices();

    // Load Requests
    const requestRes = await apiFetch('/api/services/requests');
    if (requestRes && requestRes.success) {
      allRequests = requestRes.data || [];
    }
    renderRequests();
    renderHistory();
  } catch (err) {
    console.error('Failed to fetch service data', err);
    showToast('Failed to communicate with services API', 'error');
  }
}

function renderServices() {
  const container = document.getElementById('servicesContainer');
  const search = document.getElementById('searchInput').value.toLowerCase().trim();
  const statusFilter = document.getElementById('statusFilter').value;
  const categoryFilter = document.getElementById('categoryFilter').value;

  if (!container) return;

  const filtered = allServices.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(search);
    const matchesStatus = statusFilter === 'all' ||
      (statusFilter === 'active' && s.status === 'active') ||
      (statusFilter === 'archived' && s.status === 'archived');
    const matchesCategory = categoryFilter === 'all' || s.category === categoryFilter;
    return matchesSearch && matchesStatus && matchesCategory;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div class="bg-white border border-slate-100 rounded-2xl p-12 text-center text-slate-400 custom-shadow">No procedures found fitting filters.</div>`;
    return;
  }

  // Group by Category
  const groups = {};
  filtered.forEach(s => {
    const cat = s.category || 'Services';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(s);
  });

  let html = '';

  Object.keys(groups).sort().forEach(categoryName => {
    const items = groups[categoryName];

    html += `
      <div class="bg-white border border-slate-100 rounded-2xl overflow-hidden custom-shadow animate-fade-in">
        <div class="bg-slate-50/80 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
          <h3 class="text-sm font-extrabold text-slate-700 tracking-wider uppercase">${categoryName}</h3>
          <span class="px-2.5 py-1 bg-slate-200/60 text-slate-600 text-xs font-bold rounded-lg">${items.length} ${items.length === 1 ? 'Service' : 'Services'}</span>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm border-collapse">
            <thead>
              <tr class="bg-slate-50/30 text-slate-400 font-bold text-xs uppercase tracking-wider border-b border-slate-100">
                <th class="px-6 py-3 w-[40%]">Service Name</th>
                <th class="px-6 py-3 w-[20%]">Price</th>
                <th class="px-6 py-3 w-[20%]">Status</th>
                <th class="px-6 py-3 w-[20%] text-center">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-50">
    `;

    items.forEach(s => {
      const isActive = s.status === 'active';
      const statusBadge = isActive
        ? `<span class="px-3 py-1 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">Active</span>`
        : `<span class="px-3 py-1 rounded-xl text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200/50">Archived</span>`;

      let actionsHtml = '';
      if (currentRole === 'OWNER') {
        if (s.hasPendingRequest) {
          actionsHtml = `
            <div class="flex justify-center items-center gap-3">
              <span class="px-2.5 py-1 text-[10px] font-extrabold bg-amber-50 text-amber-700 rounded-xl border border-amber-200/60 uppercase tracking-wide flex items-center gap-1 shadow-sm">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                Locked / Review
              </span>
            </div>
          `;
        } else {
          actionsHtml = `
            <div class="flex justify-center items-center gap-3">
              ${isActive
              ? `<button onclick="window.handleEditService('${s._id}')" class="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 rounded-lg font-bold text-xs transition flex items-center gap-1 shadow-sm">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                    Edit
                  </button>
                  <button onclick="window.handleArchiveService('${s._id}')" class="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 rounded-lg font-bold text-xs transition flex items-center gap-1 shadow-sm">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    Archive
                  </button>`
              : `<button onclick="window.handleRestoreService('${s._id}')" class="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 rounded-lg font-bold text-xs transition flex items-center gap-1 shadow-sm">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                    Restore
                  </button>`
            }
            </div>
          `;
        }
      } else {
        // Staff Role
        if (s.hasPendingRequest) {
          actionsHtml = `
            <div class="flex justify-center items-center gap-3">
              <span class="px-2.5 py-1 text-[10px] font-extrabold bg-amber-50 text-amber-700 rounded-xl border border-amber-200/60 uppercase tracking-wide flex items-center gap-1 animate-pulse shadow-sm">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                Pending Review
              </span>
            </div>
          `;
        } else {
          actionsHtml = `
            <div class="flex justify-center items-center gap-3">
              ${isActive
              ? `<button onclick="window.handleEditRequest('${s._id}')" class="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 rounded-lg font-bold text-xs transition flex items-center gap-1 shadow-sm">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                    Edit
                  </button>
                  <button onclick="window.handleArchiveRequest('${s._id}')" class="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 rounded-lg font-bold text-xs transition flex items-center gap-1 shadow-sm">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    Archive
                  </button>`
              : `<button onclick="window.handleRestoreRequest('${s._id}')" class="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 rounded-lg font-bold text-xs transition flex items-center gap-1 shadow-sm">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                    Restore
                  </button>`
            }
            </div>
          `;
        }
      }

      html += `
        <tr class="hover:bg-slate-50/60 transition-colors text-slate-700">
          <td class="px-6 py-4 w-[40%] font-semibold text-slate-900">${s.name}</td>
          <td class="px-6 py-4 w-[20%] font-bold text-slate-800">₱${Number(s.price).toFixed(2)}</td>
          <td class="px-6 py-4 w-[20%]">${statusBadge}</td>
          <td class="px-6 py-4 w-[20%] text-center">${actionsHtml}</td>
        </tr>
      `;
    });

    html += `
            </tbody>
          </table>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function formatChanges(request) {
  const { requestedChanges, originalValues, requestType } = request;
  if (!requestedChanges || Object.keys(requestedChanges).length === 0) return 'N/A';

  const changes = [];

  if (requestedChanges.name) {
    // Only show name change if it actually changed or if it's an 'Add' request
    const isRedundant = requestType.startsWith('Edit') && request.serviceId && requestedChanges.name === request.serviceId.name;

    if (!isRedundant || requestType === 'Add') {
      if (originalValues?.name) {
        changes.push(`Name: <span class="line-through text-slate-400">${originalValues.name}</span> → <span class="text-blue-600 font-bold">${requestedChanges.name}</span>`);
      } else {
        changes.push(`Name: ${requestedChanges.name}`);
      }
    }
  }

  if (requestedChanges.price !== undefined) {
    if (originalValues?.price !== undefined) {
      changes.push(`Price: <span class="line-through text-slate-400">₱${originalValues.price}</span> → <span class="text-emerald-600 font-bold">₱${requestedChanges.price}</span>`);
    } else {
      changes.push(`Price: ₱${requestedChanges.price}`);
    }
  }

  if (requestedChanges.category) {
    if (originalValues?.category) {
      changes.push(`Category: <span class="line-through text-slate-400">${originalValues.category}</span> → <span class="text-indigo-600 font-bold">${requestedChanges.category}</span>`);
    } else {
      changes.push(`Category: ${requestedChanges.category}`);
    }
  }

  return changes.join('<br/>');
}

function renderRequests() {
  const tbody = document.getElementById('requestTableBody');
  if (!tbody) return;

  const pending = allRequests.filter(r => r.approvalStatus === 'Pending');

  if (pending.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-slate-400">No submissions currently awaiting audit.</td></tr>`;
    return;
  }

  tbody.innerHTML = pending.map(r => {
    const changes = formatChanges(r);

    const serviceName = r.serviceId?.name || 'New Service Creation';

    let decisionHtml = '';
    if (currentRole === 'OWNER') {
      decisionHtml = `
        <div class="flex justify-center gap-2">
          <button onclick="window.approveRequest('${r._id}')" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 py-1.5 rounded-lg shadow-sm transition">Approve</button>
          <button onclick="window.rejectRequest('${r._id}')" class="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs px-3 py-1.5 rounded-lg shadow-sm transition">Reject</button>
        </div>
      `;
    } else {
      decisionHtml = `
        <span class="text-slate-400 text-xs font-bold tracking-wider uppercase">Pending Audit</span>
      `;
    }

    return `
      <tr class="hover:bg-slate-50/60 transition-colors text-slate-600">
        <td class="px-4 py-4"><span class="px-2 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-100 font-bold text-[10px] uppercase tracking-wider whitespace-nowrap">${r.requestType}</span></td>
        <td class="px-4 py-4 font-medium text-slate-800">${serviceName}</td>
        <td class="px-4 py-4 font-medium">${changes}</td>
        <td class="px-4 py-4 text-slate-500 text-xs font-semibold">${r.staffName}</td>
        <td class="px-4 py-4 text-xs">${new Date(r.createdAt).toLocaleDateString()}</td>
        <td class="px-4 py-4 text-center">
          ${decisionHtml}
        </td>
      </tr>
    `;
  }).join('');
}


function renderHistory() {
  const tbody = document.getElementById('historyTableBody');
  const search = document.getElementById('historySearchInput')?.value.toLowerCase().trim() || '';
  if (!tbody) return;

  const history = allRequests.filter(r => {
    const isProcessed = r.approvalStatus !== 'Pending';
    const matchesSearch = !search || r.staffName.toLowerCase().includes(search);
    return isProcessed && matchesSearch;
  });

  if (history.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-slate-400">${search ? 'No audit records match your search.' : 'No historical audit records found.'}</td></tr>`;
    return;
  }

  tbody.innerHTML = history.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)).map(r => {
    const changes = formatChanges(r);
    const serviceName = r.serviceId?.name || 'New Service Creation';

    let statusBadge = '';
    if (r.approvalStatus === 'Approved') {
      statusBadge = `<span class="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100 font-bold text-[10px] uppercase tracking-wider">Approved</span>`;
    } else if (r.approvalStatus === 'Rejected') {
      statusBadge = `<span class="px-2 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-100 font-bold text-[10px] uppercase tracking-wider">Rejected</span>`;
    } else {
      statusBadge = `<span class="px-2 py-1 rounded-lg bg-slate-50 text-slate-600 border border-slate-100 font-bold text-[10px] uppercase tracking-wider">${r.approvalStatus}</span>`;
    }

    return `
      <tr class="hover:bg-slate-50/60 transition-colors text-slate-600">
        <td class="px-4 py-4"><span class="px-2 py-1 rounded-lg bg-slate-100 text-slate-600 border border-slate-200 font-bold text-[10px] uppercase tracking-wider whitespace-nowrap">${r.requestType}</span></td>
        <td class="px-4 py-4 font-medium text-slate-800">${serviceName}</td>
        <td class="px-4 py-4 font-medium">${changes}</td>
        <td class="px-4 py-4 text-slate-500 text-xs font-semibold">${r.staffName}</td>
        <td class="px-4 py-4">${statusBadge}</td>
        <td class="px-4 py-4 text-xs font-medium text-slate-500">${new Date(r.updatedAt || r.createdAt).toLocaleDateString()}</td>
      </tr>
    `;
  }).join('');
}

function attachEventListeners() {
  const openModalBtn = document.getElementById('openAddModalBtn');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const cancelModalBtn = document.getElementById('cancelModalBtn');
  const searchInput = document.getElementById('searchInput');
  const statusFilter = document.getElementById('statusFilter');
  const categoryFilter = document.getElementById('categoryFilter');
  const form = document.getElementById('serviceForm');

  // Tab Navigation Bindings
  const tabServices = document.getElementById('tabServices');
  const tabRequests = document.getElementById('tabRequests');
  const tabHistory = document.getElementById('tabHistory');
  const viewServices = document.getElementById('viewServices');
  const viewRequests = document.getElementById('viewRequests');
  const viewHistory = document.getElementById('viewHistory');

  const switchTab = (activeTab, activeView) => {
    [tabServices, tabRequests, tabHistory].forEach(t => {
      if (t) t.className = 'py-3 px-6 font-bold text-sm text-slate-500 hover:text-slate-700 border-b-2 border-transparent hover:border-slate-300 outline-none transition-all flex items-center gap-2';
    });
    [viewServices, viewRequests, viewHistory].forEach(v => {
      if (v) {
        v.classList.remove('block');
        v.classList.add('hidden');
      }
    });

    if (activeTab) activeTab.className = 'py-3 px-6 font-bold text-sm text-blue-600 border-b-2 border-blue-600 outline-none transition-all flex items-center gap-2';
    if (activeView) {
      activeView.classList.remove('hidden');
      activeView.classList.add('block');
    }
  };

  tabServices?.addEventListener('click', () => switchTab(tabServices, viewServices));
  tabRequests?.addEventListener('click', () => switchTab(tabRequests, viewRequests));
  tabHistory?.addEventListener('click', () => switchTab(tabHistory, viewHistory));

  openModalBtn?.addEventListener('click', () => {
    isEditMode = false;
    document.getElementById('modalTitle').textContent = currentRole === 'OWNER' ? 'Create Procedure' : 'Submit Add Service Request';
    document.getElementById('serviceId').value = '';
    document.getElementById('serviceName').value = '';
    document.getElementById('servicePrice').value = '';
    document.getElementById('serviceCategory').value = 'Consultation';
    toggleModal(true);
  });

  const close = () => toggleModal(false);
  closeModalBtn?.addEventListener('click', close);
  cancelModalBtn?.addEventListener('click', close);

  // Archive Modal Bindings
  const archiveForm = document.getElementById('archiveForm');
  const cancelArchiveModalBtn = document.getElementById('cancelArchiveModalBtn');

  cancelArchiveModalBtn?.addEventListener('click', () => toggleArchiveModal(false));

  archiveForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('archiveServiceId').value;
    const reason = document.getElementById('archiveReason').value.trim();

    if (!reason) {
      alert('Reason is required');
      return;
    }

    try {
      if (currentRole === 'OWNER') {
        await apiFetch(`/api/services/${id}/archive`, {
          method: 'PATCH',
          body: JSON.stringify({ reason })
        });
        showToast('Service archived');
      } else {
        await apiFetch('/api/services/requests', {
          method: 'POST',
          body: JSON.stringify({ requestType: 'Archive', serviceId: id, requestedChanges: { reason } })
        });
        showToast('Archive request submitted');
      }
      toggleArchiveModal(false);
      await loadData();
    } catch (err) {
      alert(err.message);
    }
  });

  searchInput?.addEventListener('input', renderServices);
  document.getElementById('historySearchInput')?.addEventListener('input', renderHistory);
  statusFilter?.addEventListener('change', renderServices);
  categoryFilter?.addEventListener('change', renderServices);

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('serviceId').value;
    const name = document.getElementById('serviceName').value.trim();
    const price = parseFloat(document.getElementById('servicePrice').value);
    const category = document.getElementById('serviceCategory').value;

    if (!name || isNaN(price) || price <= 0) {
      alert('A valid name and positive price are required.');
      return;
    }

    try {
      const requestedChanges = { name, price, category };

      // Validation: Check if anything actually changed during an EDIT
      if (isEditMode) {
        const original = allServices.find(s => s._id === id);
        if (original) {
          if (name === original.name) delete requestedChanges.name;
          if (price === Number(original.price)) delete requestedChanges.price;
          if (category === original.category) delete requestedChanges.category;
        }

        if (Object.keys(requestedChanges).length === 0) {
          showToast('No changes detected. Please modify a field first.', 'warning');
          return; // Stay on modal so user can fix
        }
      }

      if (currentRole === 'OWNER') {
        if (isEditMode) {
          await apiFetch(`/api/services/${id}`, {
            method: 'PUT',
            body: JSON.stringify(requestedChanges) // Only send what changed
          });
          showToast('Service updated successfully');
        } else {
          await apiFetch('/api/services', {
            method: 'POST',
            body: JSON.stringify({ name, price, category })
          });
          showToast('Service added successfully');
        }
      } else {
        // Staff Workflow
        const reqType = isEditMode ? 'Edit Name' : 'Add';

        await apiFetch('/api/services/requests', {
          method: 'POST',
          body: JSON.stringify({
            requestType: reqType,
            serviceId: id || null,
            requestedChanges
          })
        });
        showToast('Request submitted for Admin review');
      }
      toggleModal(false);
      await loadData();
    } catch (err) {
      console.error(err);
      alert('Action failed: ' + err.message);
    }
  });
}

function toggleArchiveModal(show) {
  const modal = document.getElementById('archiveModal');
  if (!modal) return;
  const inner = modal.querySelector('.max-w-md');
  if (show) {
    modal.classList.remove('opacity-0', 'pointer-events-none');
    inner.classList.remove('scale-95');
    inner.classList.add('scale-100');
  } else {
    modal.classList.add('opacity-0', 'pointer-events-none');
    inner.classList.remove('scale-100');
    inner.classList.add('scale-95');
  }
}

function toggleModal(show) {
  const modal = document.getElementById('serviceModal');
  if (!modal) return;
  const inner = modal.querySelector('.max-w-md');
  if (show) {
    modal.classList.remove('opacity-0', 'pointer-events-none');
    inner.classList.remove('scale-95');
    inner.classList.add('scale-100');
  } else {
    modal.classList.add('opacity-0', 'pointer-events-none');
    inner.classList.remove('scale-100');
    inner.classList.add('scale-95');
  }
}

function ensureToastContainer() {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'fixed right-8 bottom-12 flex flex-col items-end gap-3 z-[9999] animate-fade-in';
    document.body.appendChild(container);
  }
  return container;
}

function showToast(message, type = 'success') {
  const container = ensureToastContainer();
  const toast = document.createElement('div');

  let bgColor = 'bg-blue-600';
  if (type === 'success') bgColor = 'bg-emerald-600';
  if (type === 'error') bgColor = 'bg-rose-600';
  if (type === 'warning') bgColor = 'bg-amber-500';

  toast.className = `${bgColor} text-white px-5 py-3 rounded-xl shadow-lg text-sm font-bold transition-all duration-300 translate-y-2 opacity-0`;
  toast.textContent = message;
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  });

  setTimeout(() => {
    toast.classList.add('translate-y-2', 'opacity-0');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

window.handleEditService = (id) => {
  const service = allServices.find(s => s._id === id);
  if (!service) return;
  isEditMode = true;
  document.getElementById('modalTitle').textContent = 'Edit Service';
  document.getElementById('serviceId').value = service._id;
  document.getElementById('serviceName').value = service.name;
  document.getElementById('servicePrice').value = service.price;
  document.getElementById('serviceCategory').value = service.category || 'Consultation';
  toggleModal(true);
};

window.handleEditRequest = (id) => {
  const service = allServices.find(s => s._id === id);
  if (!service) return;
  isEditMode = true;
  document.getElementById('modalTitle').textContent = 'Request Service Edit';
  document.getElementById('serviceId').value = service._id;
  document.getElementById('serviceName').value = service.name;
  document.getElementById('servicePrice').value = service.price;
  document.getElementById('serviceCategory').value = service.category || 'Consultation';
  toggleModal(true);
};

window.handleRestoreService = async (id) => {
  try {
    await apiFetch(`/api/services/${id}/restore`, { method: 'PATCH' });
    showToast('Service restored');
    await loadData();
  } catch (err) { alert(err.message); }
};

window.handleArchiveService = (id) => {
  document.getElementById('archiveServiceId').value = id;
  document.getElementById('archiveReason').value = '';
  toggleArchiveModal(true);
};

window.handleArchiveRequest = (id) => {
  document.getElementById('archiveServiceId').value = id;
  document.getElementById('archiveReason').value = '';
  toggleArchiveModal(true);
};

window.handleRestoreRequest = async (id) => {
  try {
    await apiFetch('/api/services/requests', {
      method: 'POST',
      body: JSON.stringify({ requestType: 'Restore', serviceId: id })
    });
    showToast('Restore request submitted');
    await loadData();
  } catch (err) { alert(err.message); }
};

window.approveRequest = async (id) => {
  try {
    await apiFetch(`/api/services/requests/${id}/approve`, { method: 'PUT' });
    showToast('Request approved');
    await loadData();
  } catch (err) { alert(err.message); }
};

window.rejectRequest = async (id) => {
  try {
    await apiFetch(`/api/services/requests/${id}/reject`, { method: 'PUT' });
    showToast('Request rejected');
    await loadData();
  } catch (err) { alert(err.message); }
};

document.addEventListener('DOMContentLoaded', () => {
  initServiceManagement();
});
