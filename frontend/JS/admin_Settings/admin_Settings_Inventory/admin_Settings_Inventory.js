import { inventoryConfig } from './data/admin_Settings_Inventory_data.js';
import { apiFetch } from '../../utils/apiClient.js';

const DOM = {};
let isEditing = false;
let originalData = {};
let categories = [];
let callbacks = {};

// Input fields
const fields = [
    'invLowStockThreshold',
    'invWarningPeriod'
];

export async function initInventory(api) {
    callbacks = api || {};
    cacheDOM();
    await loadData();
    callbacks.onEditStateChange?.(false);
    setupGlobalButton();
}

// ================= DOM CACHE =================
function cacheDOM() {
    fields.forEach(id => DOM[id] = document.getElementById(id));
    
    DOM.invNewCategory = document.getElementById('invNewCategory');
    DOM.invAddCategoryBtn = document.getElementById('invAddCategoryBtn');
    DOM.invCategoryList = document.getElementById('invCategoryList');

    DOM.inputs = fields.map(f => DOM[f]).filter(Boolean);
}

// ================= LOAD DATA =================
async function loadData() {
    let backendInventory = {};
    try {
        const response = await apiFetch('/api/settings');
        if (response && response.success && response.data) {
            backendInventory = response.data.inventory || {};
        }
    } catch (err) {
        console.error('Failed to load inventory settings from backend', err);
    }

    const defaults = {
        invLowStockThreshold: 10,
        invWarningPeriod: 90
    };

    const data = {
        invLowStockThreshold: backendInventory.invLowStockThreshold ?? inventoryConfig?.lowStockThreshold ?? defaults.invLowStockThreshold,
        invWarningPeriod: backendInventory.invWarningPeriod ?? inventoryConfig?.warningPeriod ?? defaults.invWarningPeriod
    };

    originalData = { ...data };

    // Load categories
    categories = backendInventory.categories ?? inventoryConfig?.categories ?? [
        'Medications',
        'Medical Supplies',
        'Vaccines',
        'Diagnostic Kits'
    ];

    // Set input values
    DOM.inputs.forEach(input => {
        if (input) input.value = data[input.id];
    });

    renderCategories();
}

// ================= CATEGORY MANAGEMENT =================
function renderCategories() {
    if (!DOM.invCategoryList) return;

    DOM.invCategoryList.innerHTML = '';

    if (!categories || categories.length === 0) {
        DOM.invCategoryList.innerHTML = '<p class="text-sm text-gray-500 italic px-4">No categories defined</p>';
        return;
    }

    categories.forEach((cat, index) => {
        const catDiv = document.createElement('div');
        catDiv.className = 'flex items-center justify-between px-4 py-3 bg-gray-50 rounded-lg border border-gray-100 mb-2';

        catDiv.innerHTML = `
            <span class="text-sm text-gray-700">${cat}</span>
            <div class="flex items-center gap-2">
                <button class="p-1.5 text-gray-400 hover:text-gray-600 transition-colors edit-cat-btn" data-index="${index}" ${!isEditing ? 'disabled' : ''}>
                    <img src="../../assets/edit_icon.png" alt="edit" class="w-4 h-4 opacity-60"/>
                </button>
                <button class="p-1.5 text-gray-400 hover:text-red-600 transition-colors delete-cat-btn" data-index="${index}" ${!isEditing ? 'disabled' : ''}>
                    <img src="../../assets/delete_icon.png" alt="delete" class="w-4 h-4 opacity-60"/>
                </button>
            </div>
        `;

        DOM.invCategoryList.appendChild(catDiv);
    });

    attachCategoryListeners();
}

function attachCategoryListeners() {
    document.querySelectorAll('.edit-cat-btn').forEach(btn => {
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        newBtn.addEventListener('click', (e) => {
            if (!isEditing) return;
            const index = parseInt(e.currentTarget.dataset.index);
            editCategory(index);
        });
    });

    document.querySelectorAll('.delete-cat-btn').forEach(btn => {
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        newBtn.addEventListener('click', (e) => {
            if (!isEditing) return;
            const index = parseInt(e.currentTarget.dataset.index);
            deleteCategory(index);
        });
    });
}

function editCategory(index) {
    if (!isEditing || !categories[index]) return;
    const newName = prompt('Edit category name:', categories[index]);
    if (newName && newName.trim() && newName.trim() !== categories[index]) {
        categories[index] = newName.trim();
        renderCategories();
    }
}

function deleteCategory(index) {
    if (!isEditing || !categories[index]) return;
    if (confirm(`Delete category "${categories[index]}"?`)) {
        categories.splice(index, 1);
        renderCategories();
    }
}

function handleAddCategory() {
    if (!isEditing) return;
    
    const name = DOM.invNewCategory?.value.trim();
    if (!name) return alert('Please enter a category name');
    if (categories.includes(name)) return alert('Category already exists');

    categories.push(name);
    DOM.invNewCategory.value = '';
    renderCategories();
}

// ================= INPUT TOGGLING =================
function toggleInputs(editable) {
    DOM.inputs.forEach(input => {
        if (!input) return;
        input.disabled = !editable;
        input.classList.toggle('bg-white', editable);
        input.classList.toggle('text-gray-900', editable);
        input.classList.toggle('border-gray-300', editable);
        input.classList.toggle('bg-gray-50', !editable);
        input.classList.toggle('text-gray-600', !editable);
        input.classList.toggle('cursor-not-allowed', !editable);
    });

    if (DOM.invNewCategory) {
        DOM.invNewCategory.disabled = !editable;
        DOM.invNewCategory.classList.toggle('bg-white', editable);
        DOM.invNewCategory.classList.toggle('text-gray-900', editable);
        DOM.invNewCategory.classList.toggle('bg-gray-50', !editable);
        DOM.invNewCategory.classList.toggle('text-gray-600', !editable);
        DOM.invNewCategory.classList.toggle('cursor-not-allowed', !editable);
    }

    if (DOM.invAddCategoryBtn) {
        DOM.invAddCategoryBtn.disabled = !editable;
        if (editable) {
            DOM.invAddCategoryBtn.classList.remove('bg-gray-300', 'text-gray-500', 'cursor-not-allowed');
            DOM.invAddCategoryBtn.classList.add('bg-blue-600', 'hover:bg-blue-700', 'text-white');
        } else {
            DOM.invAddCategoryBtn.classList.add('bg-gray-300', 'text-gray-500', 'cursor-not-allowed');
            DOM.invAddCategoryBtn.classList.remove('bg-blue-600', 'hover:bg-blue-700', 'text-white');
        }
    }

    renderCategories();
}

function enableEditMode() {
    isEditing = true;
    toggleInputs(true);
    callbacks.onEditStateChange?.(true);

    if (DOM.invAddCategoryBtn) {
        DOM.invAddCategoryBtn.addEventListener('click', handleAddCategory);
    }
}

// ================= SAVE CHANGES =================
async function saveChanges() {
    const newData = Object.fromEntries(
        DOM.inputs.map(input => [input.id, parseFloat(input.value) || 0])
    );

    const payload = { 
        invLowStockThreshold: newData.invLowStockThreshold,
        invWarningPeriod: newData.invWarningPeriod,
        categories: categories 
    };

    try {
        const result = await apiFetch('/api/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ inventory: payload })
        });
        if (result && result.success) {
            originalData = { ...newData };
            callbacks.showToast?.('Saved Changes Successfully', 'success');
        } else {
            callbacks.showToast?.(result.message || 'Failed to save changes', 'error');
        }
    } catch (err) {
        console.error('Error updating inventory controls', err);
        callbacks.showToast?.('Network or system error occurred', 'error');
    }

    isEditing = false;
    toggleInputs(false);
    callbacks.onEditStateChange?.(false);

    if (DOM.invAddCategoryBtn) {
        DOM.invAddCategoryBtn.removeEventListener('click', handleAddCategory);
    }
}

// ================= GLOBAL BUTTON =================
function setupGlobalButton() {
    if (!callbacks) return;
    callbacks.onEditStateChange?.(false);
    // Hook into global button
    if (DOM.invAddCategoryBtn) {
        DOM.invAddCategoryBtn.disabled = !isEditing;
    }
}

// ================= PUBLIC API =================
export function handleEditSave() {
    if (isEditing) saveChanges();
    else enableEditMode();
}

export function cleanup() {
    if (DOM.invAddCategoryBtn) {
        DOM.invAddCategoryBtn.removeEventListener('click', handleAddCategory);
    }
    isEditing = false;
}