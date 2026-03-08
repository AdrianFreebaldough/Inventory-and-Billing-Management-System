import { billingConfig } from './data/admin_Settings_Billing_data.js';

const DOM = {};
let isEditing = false;
let originalData = {};
let callbacks = {};

const fields = [
    'vatRate',
    'seniorDiscount',
    'pwdDiscount',
    'bulkAdjustment',
    'markupRate'
];

export function initBilling(api) {
    callbacks = api || {};
    cacheDOM();
    loadData();
    
    // Notify parent of initial state
    callbacks.onEditStateChange?.(false);
}

export function handleEditSave() {
    isEditing ? saveChanges() : enableEditMode();
}

function cacheDOM() {
    fields.forEach(id => DOM[id] = document.getElementById(id));
    DOM.inputs = fields.map(f => DOM[f]).filter(Boolean);
}

function loadData() {
    const defaults = {
        vatRate: 12,
        seniorDiscount: 20,
        pwdDiscount: 20,
        bulkAdjustment: 0,
        markupRate: 0
    };

    const data = Object.fromEntries(
        fields.map(key => [key, billingConfig?.[key] ?? defaults[key]])
    );

    originalData = { ...data };

    DOM.inputs.forEach(input => {
        if (input) input.value = data[input.id];
    });
}

function toggleInputs(editable) {
    DOM.inputs.forEach(input => {
        if (!input) return;
        
        input.disabled = !editable;

        input.classList.toggle('bg-white', editable);
        input.classList.toggle('text-gray-900', editable);

        input.classList.toggle('bg-gray-50', !editable);
        input.classList.toggle('text-gray-600', !editable);
        input.classList.toggle('cursor-not-allowed', !editable);
    });
}

function enableEditMode() {
    isEditing = true;
    toggleInputs(true);
    callbacks.onEditStateChange?.(true);
}

function saveChanges() {
    const newData = Object.fromEntries(
        DOM.inputs.map(input => [input.id, parseFloat(input.value) || 0])
    );

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