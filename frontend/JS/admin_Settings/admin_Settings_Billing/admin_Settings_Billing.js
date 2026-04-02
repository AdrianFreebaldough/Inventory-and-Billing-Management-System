import { billingConfig } from './data/admin_Settings_Billing_data.js';

const DOM = {};
let isEditing = false;
let originalData = {};
let callbacks = {};

const numericFields = [
    'vatRate',
    'seniorDiscount',
    'pwdDiscount',
    'markupRate',
    'minimumProfitMargin'
];

const controlFields = [
    'priceModeCostMarkup',
    'priceModeManual',
    'autoPriceRecalculation'
];

export function initBilling(api) {
    callbacks = api || {};
    cacheDOM();
    setupEvents();
    loadData();
    
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

function loadData() {
    const defaults = {
        vatRate: 12,
        seniorDiscount: 20,
        pwdDiscount: 20,
        markupRate: 0,
        minimumProfitMargin: 10,
        priceMode: 'cost_markup',
        autoPriceRecalculation: false
    };

    const data = Object.fromEntries(
        numericFields.map(key => [key, billingConfig?.[key] ?? defaults[key]])
    );

    data.priceMode = billingConfig?.priceMode ?? defaults.priceMode;
    data.autoPriceRecalculation = billingConfig?.autoPriceRecalculation ?? defaults.autoPriceRecalculation;

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

function saveChanges() {
    const newData = {
        ...Object.fromEntries(DOM.inputs.map(input => [input.id, parseFloat(input.value) || 0])),
        priceMode: DOM.priceModeManual?.checked ? 'manual' : 'cost_markup',
        autoPriceRecalculation: Boolean(DOM.autoPriceRecalculation?.checked)
    };

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