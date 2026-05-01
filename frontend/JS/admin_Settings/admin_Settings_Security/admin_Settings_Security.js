import { systemSecurityConfig } from './data/admin_Settings_SystemSecurity_data.js';
import { apiFetch } from '../../utils/apiClient.js';

const DOM = {};
let isEditing = false;
let originalData = {};
let callbacks = {};

const fields = [
    'retentionPeriod',
    'sessionTimeout'
];

export async function initSystemSecurity(api) {
    callbacks = api || {};
    
    cacheDOM();
    await loadData();
    toggleInputs(false);
    callbacks.onEditStateChange?.(false);
}

export function handleEditSave() {
    if (isEditing) {
        saveChanges();
    } else {
        enableEditMode();
    }
}

function cacheDOM() {
    fields.forEach(id => {
        DOM[id] = document.getElementById(id);
    });
    DOM.inputs = fields.map(f => DOM[f]).filter(Boolean);
}

async function loadData() {
    let backendSecurity = {};
    try {
        const response = await apiFetch('/api/settings');
        if (response && response.success && response.data) {
            backendSecurity = response.data.security || {};
        }
    } catch (err) {
        console.error('Failed to load security settings from backend', err);
    }

    const defaults = {
        retentionPeriod: '1 year',
        sessionTimeout: '30 minutes'
    };

    const data = {};
    fields.forEach(key => {
        data[key] = backendSecurity[key] ?? systemSecurityConfig?.[key] ?? defaults[key];
    });

    originalData = { ...data };

    DOM.inputs.forEach(select => {
        if (select) select.value = data[select.id];
    });
}

function toggleInputs(editable) {
    DOM.inputs.forEach(select => {
        if (!select) return;
        
        select.disabled = !editable;
        
        select.classList.remove('bg-gray-50', 'bg-white', 'text-gray-600', 'text-gray-900', 'cursor-not-allowed');
        
        if (editable) {
            select.classList.add('bg-white', 'text-gray-900');
        } else {
            select.classList.add('bg-gray-50', 'text-gray-600', 'cursor-not-allowed');
        }
    });
}

function enableEditMode() {
    isEditing = true;
    toggleInputs(true);
    callbacks.onEditStateChange?.(true);
}

async function saveChanges() {
    const newData = {};
    DOM.inputs.forEach(select => {
        if (select) newData[select.id] = select.value;
    });

    try {
        const result = await apiFetch('/api/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ security: newData })
        });
        if (result && result.success) {
            originalData = { ...newData };
            callbacks.showToast?.('Saved Changes Successfully', 'success');
        } else {
            callbacks.showToast?.(result.message || 'Failed to save changes', 'error');
        }
    } catch (err) {
        console.error('Error updating security controls', err);
        callbacks.showToast?.('Network or system error occurred', 'error');
    }

    isEditing = false;
    toggleInputs(false);
    callbacks.onEditStateChange?.(false);
}

export function cleanup() {
    isEditing = false;
}