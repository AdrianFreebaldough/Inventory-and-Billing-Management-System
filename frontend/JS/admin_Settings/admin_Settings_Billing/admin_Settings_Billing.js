import { billingConfig } from './data/admin_Settings_Billing_data.js';
import { apiFetch } from '../../utils/apiClient.js';

const DOM = {};
let isEditing = false;
let originalData = {};
let callbacks = {};

const numericFields = [
    'vatRate',
    'loyaltyDiscount',
    'markupRate',
    'minimumProfitMargin'
];

const controlFields = [
    'priceModeCostMarkup',
    'priceModeManual',
    'autoPriceRecalculation'
];

export async function initBilling(api) {
    callbacks = api || {};
    cacheDOM();
    setupEvents();
    await loadData();
    
    // Notify parent of initial state
    callbacks.onEditStateChange?.(false);
}

export function handleEditSave() {
    isEditing ? saveChanges() : enableEditMode();
}

function cacheDOM() {
    [...numericFields, ...controlFields].forEach(id => DOM[id] = document.getElementById(id));
    DOM.inputs = numericFields.map(f => DOM[f]).filter(Boolean);
    DOM.controls = controlFields.map(f => DOM[f]).filter(Boolean);
    DOM.markupRateContainer = document.getElementById('markupRateContainer');
    DOM.priceModeCostMarkupCard = document.getElementById('priceModeCostMarkupCard');
    DOM.priceModeManualCard = document.getElementById('priceModeManualCard');
}

function setupEvents() {
    DOM.priceModeCostMarkup?.addEventListener('change', applyPriceModeUI);
    DOM.priceModeManual?.addEventListener('change', applyPriceModeUI);
}

async function loadData() {
    let backendConfig = {};
    try {
        const response = await apiFetch('/api/settings');
        if (response && response.success && response.data) {
            backendConfig = response.data.billing || {};
        }
    } catch (err) {
        console.error('Failed to load settings from backend', err);
    }

    const defaults = {
        vatRate: 12,
        loyaltyDiscount: 20,
        markupRate: 0,
        minimumProfitMargin: 10,
        priceMode: 'cost_markup',
        autoPriceRecalculation: false
    };

    const data = Object.fromEntries(
        numericFields.map(key => [key, backendConfig[key] ?? billingConfig?.[key] ?? defaults[key]])
    );

    data.priceMode = backendConfig.priceMode ?? billingConfig?.priceMode ?? defaults.priceMode;
    data.autoPriceRecalculation = backendConfig.autoPriceRecalculation ?? billingConfig?.autoPriceRecalculation ?? defaults.autoPriceRecalculation;

    originalData = { ...data };

    DOM.inputs.forEach(input => {
        if (input) input.value = data[input.id];
    });

    if (DOM.priceModeCostMarkup) {
        DOM.priceModeCostMarkup.checked = data.priceMode === 'cost_markup';
    }
    if (DOM.priceModeManual) {
        DOM.priceModeManual.checked = data.priceMode === 'manual';
    }
    if (DOM.autoPriceRecalculation) {
        DOM.autoPriceRecalculation.checked = Boolean(data.autoPriceRecalculation);
    }

    applyPriceModeUI();
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

    DOM.controls.forEach(control => {
        if (!control) return;
        control.disabled = !editable;
        control.classList.toggle('cursor-not-allowed', !editable);
    });

    applyPriceModeUI();
}

function applyPriceModeUI() {
    const isManualMode = Boolean(DOM.priceModeManual?.checked);
    const markupInput = DOM.markupRate;
    const canEditMarkup = isEditing && !isManualMode;

    if (markupInput) {
        markupInput.disabled = !canEditMarkup;

        markupInput.classList.toggle('bg-white', canEditMarkup);
        markupInput.classList.toggle('text-gray-900', canEditMarkup);
        markupInput.classList.toggle('cursor-not-allowed', !canEditMarkup);

        markupInput.classList.toggle('bg-gray-50', !canEditMarkup);
        markupInput.classList.toggle('text-gray-600', !canEditMarkup);
    }

    DOM.markupRateContainer?.classList.toggle('opacity-60', isManualMode);

    DOM.priceModeCostMarkupCard?.classList.toggle('border-blue-400', !isManualMode);
    DOM.priceModeCostMarkupCard?.classList.toggle('bg-blue-50', !isManualMode);
    DOM.priceModeManualCard?.classList.toggle('border-blue-400', isManualMode);
    DOM.priceModeManualCard?.classList.toggle('bg-blue-50', isManualMode);
}

function enableEditMode() {
    isEditing = true;
    toggleInputs(true);
    callbacks.onEditStateChange?.(true);
}

async function saveChanges() {
    const newData = {
        ...Object.fromEntries(DOM.inputs.map(input => [input.id, parseFloat(input.value) || 0])),
        priceMode: DOM.priceModeManual?.checked ? 'manual' : 'cost_markup',
        autoPriceRecalculation: Boolean(DOM.autoPriceRecalculation?.checked)
    };

    try {
        const result = await apiFetch('/api/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ billing: newData })
        });
        if (result && result.success) {
            originalData = { ...newData };
            callbacks.showToast?.('Saved Changes Successfully', 'success');
        } else {
            callbacks.showToast?.(result.message || 'Failed to save changes', 'error');
        }
    } catch (err) {
        console.error('Error updating billing controls', err);
        callbacks.showToast?.('Network or system error occurred', 'error');
    }

    isEditing = false;
    toggleInputs(false);
    callbacks.onEditStateChange?.(false);
}

export function cleanup() {
    isEditing = false;
}