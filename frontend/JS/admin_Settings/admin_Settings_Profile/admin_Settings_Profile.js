import { clinicProfile } from './data/admin_Settings_Profile_data.js';
import { apiFetch } from '../../utils/apiClient.js';

const DOM = {};
let isEditing = false;
let callbacks = {};

export async function initClinicProfile(api) {
    callbacks = api || {};
    cacheDOM();
    await loadData();
    callbacks.onEditStateChange?.(false);
}

export function handleEditSave() {
    isEditing ? saveChanges() : enableEdit();
}

function cacheDOM() {
    DOM.inputs = [
        document.getElementById('clinicName'),
        document.getElementById('clinicAddress'),
        document.getElementById('clinicPhone'),
        document.getElementById('clinicEmail')
    ].filter(Boolean);
    
    DOM.uploadLogoBtn = document.getElementById('uploadLogoBtn');
}

async function loadData() {
    let backendProfile = {};
    try {
        const response = await apiFetch('/api/settings');
        if (response && response.success && response.data) {
            backendProfile = response.data.profile || {};
        }
    } catch (err) {
        console.error('Failed to load clinic profile from backend', err);
    }

    const saved = JSON.parse(localStorage.getItem('clinicProfile')) || clinicProfile;

    const data = {
        clinicName: backendProfile.clinicName ?? saved?.clinicName ?? 'General Medicine Clinic',
        address: backendProfile.clinicAddress ?? saved?.address ?? '123 Main Street, Quezon City',
        telephone: backendProfile.clinicPhone ?? saved?.telephone ?? '(02) 8123-4567',
        email: backendProfile.clinicEmail ?? saved?.email ?? 'contact@clinic.com'
    };

    if (DOM.inputs[0]) DOM.inputs[0].value = data.clinicName;
    if (DOM.inputs[1]) DOM.inputs[1].value = data.address;
    if (DOM.inputs[2]) DOM.inputs[2].value = data.telephone;
    if (DOM.inputs[3]) DOM.inputs[3].value = data.email;
}

function enableEdit() {
    isEditing = true;

    DOM.inputs.forEach(input => {
        input.disabled = false;
        input.classList.replace('bg-gray-50', 'bg-white');
        input.classList.replace('text-gray-600', 'text-gray-900');
        input.classList.remove('cursor-not-allowed');
    });

    if (DOM.uploadLogoBtn) {
        DOM.uploadLogoBtn.disabled = false;
        DOM.uploadLogoBtn.classList.replace('bg-gray-100', 'bg-blue-600');
        DOM.uploadLogoBtn.classList.replace('text-gray-400', 'text-white');
        DOM.uploadLogoBtn.classList.replace('cursor-not-allowed', 'hover:bg-blue-700');
    }

    callbacks.onEditStateChange?.(true);
}

async function saveChanges() {
    const data = {
        clinicName: DOM.inputs[0]?.value.trim(),
        clinicAddress: DOM.inputs[1]?.value.trim(),
        clinicPhone: DOM.inputs[2]?.value.trim(),
        clinicEmail: DOM.inputs[3]?.value.trim()
    };

    if (!data.clinicName) {
        alert("Clinic name is required");
        DOM.inputs[0]?.focus();
        return;
    }

    try {
        const result = await apiFetch('/api/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profile: data })
        });
        if (result && result.success) {
            localStorage.setItem('clinicProfile', JSON.stringify({
                clinicName: data.clinicName,
                address: data.clinicAddress,
                telephone: data.clinicPhone,
                email: data.clinicEmail
            }));
            callbacks.showToast?.('Saved Changes Successfully', 'success');
        } else {
            callbacks.showToast?.(result.message || 'Failed to save changes', 'error');
        }
    } catch (err) {
        console.error('Error updating clinic profile', err);
        callbacks.showToast?.('Network or system error occurred', 'error');
    }

    isEditing = false;
    
    DOM.inputs.forEach(input => {
        input.disabled = true;
        input.classList.replace('bg-white', 'bg-gray-50');
        input.classList.replace('text-gray-900', 'text-gray-600');
        input.classList.add('cursor-not-allowed');
    });

    if (DOM.uploadLogoBtn) {
        DOM.uploadLogoBtn.disabled = true;
        DOM.uploadLogoBtn.classList.replace('bg-blue-600', 'bg-gray-100');
        DOM.uploadLogoBtn.classList.replace('text-white', 'text-gray-400');
        DOM.uploadLogoBtn.classList.replace('hover:bg-blue-700', 'cursor-not-allowed');
    }

    callbacks.onEditStateChange?.(false);
    callbacks.showToast?.('Saved Changes Successfully');
}

export function cleanup() {
    isEditing = false;
}