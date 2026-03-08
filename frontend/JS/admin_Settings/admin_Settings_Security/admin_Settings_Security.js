import { systemSecurityConfig } from './data/admin_Settings_SystemSecurity_data.js';

const DOM = {};
let isEditing = false;
let originalData = {};
let callbacks = {};

const fields = [
    'retentionPeriod',
    'sessionTimeout'
];

export function initSystemSecurity(api) {
    callbacks = api || {};
    
    cacheDOM();
    loadData();
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

function loadData() {
    const defaults = {
        retentionPeriod: '1 year',
        sessionTimeout: '30 minutes'
    };

    const data = {};
    fields.forEach(key => {
        data[key] = systemSecurityConfig?.[key] ?? defaults[key];
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

function saveChanges() {
    const newData = {};
    DOM.inputs.forEach(select => {
        if (select) newData[select.id] = select.value;
    });

    // API call here

    originalData = { ...newData };

    isEditing = false;
    toggleInputs(false);
    callbacks.onEditStateChange?.(false);
    callbacks.showToast?.('Saved Changes Successfully');
}

export function cleanup() {
    isEditing = false;
}