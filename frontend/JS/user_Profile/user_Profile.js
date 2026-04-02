// User Profile JavaScript - All Logic Centralized

import { staffProfileData, adminProfileData } from './data/user_Profile_data.js';

// ==========================================
// Configuration
// ==========================================
const CONFIG = {
    notificationDuration: 3000,
    phoneRegex: /^09\d{9}$/,
    emailRegex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    maxFileSize: 5 * 1024 * 1024,
    allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
};

// ==========================================
// Data Access Functions
// ==========================================
const getUserProfileData = (userType = 'staff') => {
    if (!staffProfileData || !adminProfileData) {
        return {
            fullName: "Error Loading",
            employeeId: "N/A",
            role: "Unknown",
            contactNumber: "",
            email: "",
            avatar: null
        };
    }
    
    const data = userType === 'admin' 
        ? adminProfileData 
        : staffProfileData;
    
    return { ...data };
};

// ==========================================
// DOM Helpers
// ==========================================
const getElements = () => ({
    avatar: document.getElementById('profile-avatar'),
    avatarUpload: document.getElementById('avatar-upload'),
    avatarOverlay: document.getElementById('avatar-overlay'),
    displayName: document.getElementById('profile-fullname'),
    displayRole: document.getElementById('profile-role'),
    fullName: document.getElementById('full-name'),
    employeeId: document.getElementById('employee-id'),
    role: document.getElementById('role'),
    contactNumber: document.getElementById('contact-number'),
    email: document.getElementById('email'),
    saveBtn: document.getElementById('saveProfileBtn')
});

// ==========================================
// Utilities
// ==========================================
const getInitials = (name) => {
    if (!name || typeof name !== 'string') {
        return '??';
    }
    
    return name
        .split(' ')
        .map(word => word[0]?.toUpperCase() || '')
        .join('')
        .slice(0, 2);
};

const cleanPhone = (phone) => phone?.replace(/\s/g, '') || '';

const validateEmail = (email) => CONFIG.emailRegex.test(email);
const validatePhone = (phone) => CONFIG.phoneRegex.test(cleanPhone(phone));

// ==========================================
// Avatar Handling
// ==========================================
const handleAvatarClick = (elements) => {
    elements.avatarUpload.click();
};

const handleAvatarChange = (elements, userType) => (e) => {
    const file = e.target.files[0];
    
    if (!file) return;
    
    if (!CONFIG.allowedTypes.includes(file.type)) {
        showNotification('Please upload a valid image (JPEG, PNG, GIF, WebP)', 'error');
        return;
    }
    
    if (file.size > CONFIG.maxFileSize) {
        showNotification('File size must be less than 5MB', 'error');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = (event) => {
        const imageUrl = event.target.result;
        
        elements.avatar.innerHTML = `<img src="${imageUrl}" class="w-full h-full object-cover" alt="Profile">`;
        elements.avatar.classList.remove('bg-blue-600', 'text-white', 'text-2xl', 'font-semibold');
        
        const targetData = userType === 'admin' ? adminProfileData : staffProfileData;
        targetData.avatar = imageUrl;
        
        showNotification('Profile picture updated', 'success');
    };
    
    reader.onerror = () => {
        showNotification('Failed to read image file', 'error');
    };
    
    reader.readAsDataURL(file);
};

const loadAvatar = (elements, data) => {
    if (data?.avatar) {
        elements.avatar.innerHTML = `<img src="${data.avatar}" class="w-full h-full object-cover" alt="Profile">`;
        elements.avatar.classList.remove('bg-blue-600', 'text-white', 'text-2xl', 'font-semibold');
    } else {
        elements.avatar.textContent = getInitials(data.fullName);
    }
};

// ==========================================
// Validation
// ==========================================
const validateProfileData = (data) => {
    const errors = [];
    
    if (!data?.fullName?.trim() || data.fullName.trim().length < 2) {
        errors.push('Full name must be at least 2 characters');
    }
    if (!validateEmail(data?.email || '')) {
        errors.push('Valid email address is required');
    }
    if (!validatePhone(data?.contactNumber || '')) {
        errors.push('Valid contact number required');
    }
    
    return errors;
};

// ==========================================
// UI Updates
// ==========================================
const updateDisplayElements = (elements, data) => {
    if (!data || !data.fullName) {
        return;
    }
    
    loadAvatar(elements, data);
    elements.displayName.textContent = data.fullName;
    elements.displayRole.textContent = data.role;
};

const populateForm = (elements, data) => {
    if (!data) {
        return;
    }
    
    elements.fullName.value = data.fullName || '';
    elements.employeeId.value = data.employeeId || '';
    elements.role.value = data.role || '';
    elements.contactNumber.value = data.contactNumber || '';
    elements.email.value = data.email || '';
};

const showNotification = (message, type = 'info') => {
    document.querySelectorAll('.profile-notification').forEach(el => el.remove());
    
    const notification = document.createElement('div');
    // Position: bottom-8 (more up from bottom), right-8 (more left from right edge)
    notification.className = `profile-notification fixed bottom-16 right-14 px-4 py-3 rounded-lg text-white font-medium z-50 shadow-lg bg-blue-600`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), CONFIG.notificationDuration);
};

// ==========================================
// Event Handlers
// ==========================================
const handleSave = (userType) => (e) => {
    e.preventDefault();
    const elements = getElements();
    
    const formData = {
        fullName: elements.fullName.value,
        employeeId: elements.employeeId.value,
        role: elements.role.value,
        contactNumber: elements.contactNumber.value,
        email: elements.email.value,
        avatar: userType === 'admin' ? adminProfileData.avatar : staffProfileData.avatar
    };
    
    const errors = validateProfileData(formData);
    if (errors.length) {
        showNotification(errors.join(', '), 'error');
        return;
    }
    
    const targetData = userType === 'admin' ? adminProfileData : staffProfileData;
    Object.assign(targetData, formData);
    
    updateDisplayElements(elements, formData);
    showNotification('Profile saved successfully!', 'success');
};

// ==========================================
// Initialization
// ==========================================
export const initProfile = (userType = 'staff') => {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => doInit(userType));
    } else {
        doInit(userType);
    }
};

const doInit = (userType) => {
    const elements = getElements();
    
    const missing = Object.entries(elements)
        .filter(([_, el]) => !el)
        .map(([name]) => name);
    
    if (missing.length) {
        return;
    }
    
    const data = getUserProfileData(userType);
    
    if (!data || !data.fullName) {
        showNotification('Failed to load profile data', 'error');
        return;
    }
    
    elements.avatar.addEventListener('click', () => handleAvatarClick(elements));
    elements.avatarOverlay.addEventListener('click', () => handleAvatarClick(elements));
    elements.avatarUpload.addEventListener('change', handleAvatarChange(elements, userType));
    
    updateDisplayElements(elements, data);
    populateForm(elements, data);
    
    elements.saveBtn.addEventListener('click', handleSave(userType));
};

// Auto-init if contentArea exists
if (typeof window !== 'undefined' && document.querySelector('#contentArea')) {
    initProfile();
}