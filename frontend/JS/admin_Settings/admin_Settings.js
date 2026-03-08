const State = { 
    isLoading: false, 
    pendingLoad: null, 
    currentTab: 'billing',
    abortController: null,
    isEditing: false
};

const DOM = {};
const SettingsCache = { billing: null, clinic: null, inventory: null, system: null };
let currentModule = null;
let currentEditHandler = null;

export function initSettings() {
    cacheDOM();
    setupNavigation();
    setupGlobalButton();
    
    // Load billing by default immediately
    loadBilling();
}

// ============ GLOBAL COMPONENTS ============

export function showGlobalToast(message = 'Saved Changes Successfully', type = 'success') {
    if (!DOM.globalToast) return;
    
    const toastText = document.getElementById('globalToastText');
    const toastIcon = document.getElementById('toastIcon');
    
    if (toastText) toastText.textContent = message;
    if (toastIcon) toastIcon.classList.toggle('hidden', type !== 'success');
    
    DOM.globalToast.classList.remove('translate-y-20', 'opacity-0');
    
    setTimeout(() => {
        DOM.globalToast.classList.add('translate-y-20', 'opacity-0');
    }, 3000);
}

export function updateGlobalButton(state, options = {}) {
    const { color = 'blue', onClick } = options;
    const isEditing = state === 'editing';
    
    const btnText = document.getElementById('globalBtnText');
    const btnIcon = document.getElementById('globalBtnIcon');
    
    if (btnText) btnText.textContent = isEditing ? 'Save Changes' : 'Edit';
    if (btnIcon) {
        btnIcon.src = isEditing ? '../../assets/save_icon.png' : '../../assets/edit_icon.png';
        btnIcon.alt = isEditing ? 'Save' : 'Edit';
        btnIcon.style.filter = 'brightness(0) invert(1)';
    }
    
    // Update button color
    const btn = DOM.globalEditSaveBtn;
    if (btn) {
        // Reset classes
        btn.className = 'px-4 py-3 text-white rounded-md text-base font-semibold focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors flex items-center gap-2';
        
        // Add color classes
        if (color === 'emerald') {
            btn.classList.add('bg-emerald-800', 'hover:bg-emerald-900', 'focus:ring-emerald-600');
        } else {
            btn.classList.add('bg-blue-700', 'hover:bg-blue-800', 'focus:ring-blue-500');
        }
    }
    
    // Update click handler
    if (onClick) {
        currentEditHandler = onClick;
    }
}

export function toggleGlobalButton(show) {
    if (DOM.globalActionContainer) {
        if (show) {
            DOM.globalActionContainer.classList.remove('hidden');
        } else {
            DOM.globalActionContainer.classList.add('hidden');
        }
    }
}

export function setGlobalButtonEnabled(enabled) {
    if (DOM.globalEditSaveBtn) {
        DOM.globalEditSaveBtn.disabled = !enabled;
        DOM.globalEditSaveBtn.classList.toggle('opacity-50', !enabled);
        DOM.globalEditSaveBtn.classList.toggle('cursor-not-allowed', !enabled);
    }
}

// ============ CORE FUNCTIONS ============

function cacheDOM() {
    DOM.content = document.getElementById('settingsContentArea');
    DOM.nav = document.getElementById('tabButtons');
    DOM.globalActionContainer = document.getElementById('globalActionContainer');
    DOM.globalEditSaveBtn = document.getElementById('globalEditSaveBtn');
    DOM.globalToast = document.getElementById('globalToast');
}

function setupGlobalButton() {
    if (!DOM.globalEditSaveBtn) return;
    
    DOM.globalEditSaveBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (currentEditHandler) {
            currentEditHandler();
        }
    });
}

function setupNavigation() {
    if (!DOM.nav) return;
    DOM.nav.addEventListener('click', handleNavClick);
}

function handleNavClick(e) {
    const btn = e.target.closest('button');
    if (!btn) return;
    
    const tabMap = { 
        'tab-billing': 'billing', 
        'tab-clinic': 'clinic', 
        'tab-inventory': 'inventory',
        'tab-system': 'system'
    };
    const tab = tabMap[btn.id];
    
    if (!tab || tab === State.currentTab) return;
    e.preventDefault();
    
    if (State.abortController) {
        State.abortController.abort();
    }
    
    cleanupCurrentModule();
    
    State.currentTab = tab;
    State.isEditing = false;
    updateActiveTab(tab);
    
    const loaders = { 
        billing: loadBilling, 
        clinic: loadClinic, 
        inventory: loadInventory,
        system: loadSystem
    };
    
    debouncedLoad(loaders[tab]);
}

function cleanupCurrentModule() {
    if (currentModule && currentModule.cleanup) {
        try {
            currentModule.cleanup();
        } catch (err) {
            // Error during cleanup
        }
    }
    currentModule = null;
    currentEditHandler = null;
}

function updateActiveTab(active) {
    const tabs = DOM.nav?.querySelectorAll('button') || [];
    
    tabs.forEach(btn => {
        const isActive = btn.id === `tab-${active}`;
        
        if (isActive) {
            btn.classList.remove('bg-gray-200', 'text-gray-700', 'hover:bg-gray-300');
            btn.classList.add('bg-blue-700', 'text-white');
        } else {
            btn.classList.remove('bg-blue-700', 'text-white');
            btn.classList.add('bg-gray-200', 'text-gray-700', 'hover:bg-gray-300');
        }
    });
}

function debouncedLoad(fn) {
    if (State.isLoading) {
        if (State.pendingLoad) clearTimeout(State.pendingLoad);
        State.pendingLoad = setTimeout(() => debouncedLoad(fn), 100);
        return;
    }
    State.isLoading = true;
    fn().finally(() => { 
        State.isLoading = false; 
        State.pendingLoad = null; 
    });
}

function showLoading() {
    if (!DOM.content) return;
    DOM.content.innerHTML = `
        <div class="flex items-center justify-center p-12">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span class="ml-2 text-gray-600">Loading...</span>
        </div>`;
    toggleGlobalButton(false);
}

function showError(name, err) {
    if (!DOM.content) return;
    DOM.content.innerHTML = `
        <div class="text-red-500 p-8 font-medium text-center">
            <p>Failed to load ${name}</p>
            <p class="text-sm text-gray-500 mt-2">${err.message}</p>
        </div>`;
    toggleGlobalButton(false);
}

// ================= BILLING CONTROLS (Default) =================
async function loadBilling() {
    if (!DOM.content) return;
    
    updateActiveTab('billing');
    
    if (SettingsCache.billing) {
        DOM.content.innerHTML = SettingsCache.billing;
        await initBillingModule();
        return;
    }
    
    State.abortController = new AbortController();
    const signal = State.abortController.signal;
    
    try {
        showLoading();
        if (signal.aborted) return;
        
        const res = await fetch('../../HTML/admin_Settings/admin_Settings_Billing/admin_Settings_Billing.html', { signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        
        const html = await res.text();
        if (signal.aborted) return;
        
        SettingsCache.billing = html;
        DOM.content.innerHTML = html;
        
        await initBillingModule();
        
    } catch (err) {
        if (err.name === 'AbortError') return;
        showError('Billing Controls', err);
    } finally {
        if (State.abortController?.signal === signal) {
            State.abortController = null;
        }
    }
}

async function initBillingModule() {
    try {
        const module = await import('./admin_Settings_Billing/admin_Settings_Billing.js');
        currentModule = module;
        
        if (module.initBilling) {
            // Define the edit handler function
            const editHandler = () => {
                if (module.handleEditSave) {
                    module.handleEditSave();
                }
            };
            
            await module.initBilling({
                onEditStateChange: (isEditing) => {
                    State.isEditing = isEditing;
                    updateGlobalButton(isEditing ? 'editing' : 'view', {
                        color: 'blue',
                        onClick: editHandler
                    });
                },
                showToast: showGlobalToast
            });
            
            toggleGlobalButton(true);
            updateGlobalButton('view', {
                color: 'blue',
                onClick: editHandler
            });
            
            // Store the handler reference
            currentEditHandler = editHandler;
        }
    } catch (err) {
        toggleGlobalButton(false);
    }
}

// ================= CLINIC PROFILE =================
async function loadClinic() {
    if (!DOM.content) return;
    
    updateActiveTab('clinic');
    
    if (SettingsCache.clinic) {
        DOM.content.innerHTML = SettingsCache.clinic;
        await initClinicModule();
        return;
    }
    
    State.abortController = new AbortController();
    const signal = State.abortController.signal;
    
    try {
        showLoading();
        if (signal.aborted) return;
        
        const res = await fetch('../../HTML/admin_Settings/admin_Settings_Profile/admin_Settings_Profile.html', { signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        
        const html = await res.text();
        if (signal.aborted) return;
        
        SettingsCache.clinic = html;
        DOM.content.innerHTML = html;
        
        await initClinicModule();
        
    } catch (err) {
        if (err.name === 'AbortError') return;
        showError('Clinic Profile', err);
    } finally {
        if (State.abortController?.signal === signal) {
            State.abortController = null;
        }
    }
}

async function initClinicModule() {
    try {
        const module = await import('./admin_Settings_Profile/admin_Settings_Profile.js');
        currentModule = module;
        
        if (module.initClinicProfile) {
            // Define the edit handler function
            const editHandler = () => {
                if (module.handleEditSave) {
                    module.handleEditSave();
                }
            };
            
            await module.initClinicProfile({
                onEditStateChange: (isEditing) => {
                    State.isEditing = isEditing;
                    updateGlobalButton(isEditing ? 'editing' : 'view', {
                        color: 'blue',
                        onClick: editHandler
                    });
                },
                showToast: showGlobalToast
            });
            
            toggleGlobalButton(true);
            updateGlobalButton('view', {
                color: 'blue',
                onClick: editHandler
            });
            
            // Store the handler reference
            currentEditHandler = editHandler;
        }
    } catch (err) {
        toggleGlobalButton(false);
    }
}

// ================= INVENTORY CONTROLS =================
async function loadInventory() {
    if (!DOM.content) return;
    
    updateActiveTab('inventory');
    
    if (SettingsCache.inventory) {
        DOM.content.innerHTML = SettingsCache.inventory;
        await initInventoryModule();
        return;
    }
    
    State.abortController = new AbortController();
    const signal = State.abortController.signal;
    
    try {
        showLoading();
        if (signal.aborted) return;
        
        const res = await fetch('../../HTML/admin_Settings/admin_Settings_Inventory/admin_Settings_Inventory.html', { signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        
        const html = await res.text();
        if (signal.aborted) return;
        
        SettingsCache.inventory = html;
        DOM.content.innerHTML = html;
        
        await initInventoryModule();
        
    } catch (err) {
        if (err.name === 'AbortError') return;
        showError('Inventory Controls', err);
    } finally {
        if (State.abortController?.signal === signal) {
            State.abortController = null;
        }
    }
}

async function initInventoryModule() {
    try {
        const module = await import('./admin_Settings_Inventory/admin_Settings_Inventory.js');
        currentModule = module;
        
        if (module.initInventory) {
            // Define the edit handler function
            const editHandler = () => {
                if (module.handleEditSave) {
                    module.handleEditSave();
                }
            };
            
            await module.initInventory({
                onEditStateChange: (isEditing) => {
                    State.isEditing = isEditing;
                    updateGlobalButton(isEditing ? 'editing' : 'view', {
                        color: 'blue',
                        onClick: editHandler
                    });
                },
                showToast: showGlobalToast
            });
            
            toggleGlobalButton(true);
            updateGlobalButton('view', {
                color: 'blue',
                onClick: editHandler
            });
            
            // Store the handler reference
            currentEditHandler = editHandler;
        }
    } catch (err) {
        toggleGlobalButton(false);
    }
}

// ================= SYSTEM & SECURITY =================
async function loadSystem() {
    if (!DOM.content) return;
    
    updateActiveTab('system');
    
    // FORCE SHOW BUTTON IMMEDIATELY
    toggleGlobalButton(true);
    
    if (SettingsCache.system) {
        DOM.content.innerHTML = SettingsCache.system;
        await initSystemModule();
        return;
    }
    
    State.abortController = new AbortController();
    const signal = State.abortController.signal;
    
    try {
        showLoading();
        if (signal.aborted) return;
        
        const res = await fetch('../../HTML/admin_Settings/admin_Settings_Security/admin_Settings_Security.html', { signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        
        const html = await res.text();
        if (signal.aborted) return;
        
        SettingsCache.system = html;
        DOM.content.innerHTML = html;
        
        await initSystemModule();
        
    } catch (err) {
        if (err.name === 'AbortError') return;
        showError('System & Security', err);
    } finally {
        if (State.abortController?.signal === signal) {
            State.abortController = null;
        }
    }
}

async function initSystemModule() {
    try {
        const module = await import('./admin_Settings_Security/admin_Settings_Security.js');
        currentModule = module;
        
        if (module.initSystemSecurity) {
            // Define the edit handler function
            const editHandler = () => {
                if (module.handleEditSave) {
                    module.handleEditSave();
                }
            };
            
            await module.initSystemSecurity({
                onEditStateChange: (isEditing) => {
                    State.isEditing = isEditing;
                    updateGlobalButton(isEditing ? 'editing' : 'view', {
                        color: 'blue',
                        onClick: editHandler
                    });
                },
                showToast: showGlobalToast
            });
            
            // ENSURE BUTTON IS VISIBLE
            toggleGlobalButton(true);
            updateGlobalButton('view', {
                color: 'blue',
                onClick: editHandler
            });
            
            // Store the handler reference
            currentEditHandler = editHandler;
        } else {
            // Module loaded but no init function - still show button with default handler
            toggleGlobalButton(true);
            updateGlobalButton('view', {
                color: 'blue',
                onClick: () => {}
            });
        }
    } catch (err) {
        // Even on error, try to show button
        toggleGlobalButton(true);
    }
}