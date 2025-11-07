/**
 * Centralized Error Handling Utility
 * Provides consistent error message display and handling across the application
 */

/**
 * Displays an error message to the user in a consistent way
 * @param {string} message - The error message to display
 * @param {Object} options - Additional options for error display
 */
export function showError(message, options = {}) {
    const {
        containerId = 'error-container',
        duration = 5000,
        type = 'error', // 'error', 'warning', 'info'
        position = 'top-right'
    } = options;

    // First try to find the error container in the page
    let errorContainer = document.getElementById(containerId) || 
                        document.getElementById('error-message') ||
                        document.getElementById('error-container');

    // If container exists, use it
    if (errorContainer) {
        errorContainer.textContent = message;
        errorContainer.className = 'error-message';
        errorContainer.style.display = 'block';
        
        // Auto-hide after duration
        if (duration > 0) {
            setTimeout(() => {
                errorContainer.style.display = 'none';
            }, duration);
        }
        return;
    }

    // Otherwise create a floating notification
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    // Apply styling based on type
    const styles = {
        error: {
            backgroundColor: '#fee',
            border: '1px solid #fcc',
            color: '#c33'
        },
        warning: {
            backgroundColor: '#fff3cd',
            border: '1px solid #ffc107',
            color: '#856404'
        },
        info: {
            backgroundColor: '#d1ecf1',
            border: '1px solid #0c5460',
            color: '#0c5460'
        }
    };

    const positionStyles = {
        'top-right': { top: '20px', right: '20px' },
        'top-center': { top: '20px', left: '50%', transform: 'translateX(-50%)' },
        'top-left': { top: '20px', left: '20px' },
        'bottom-right': { bottom: '20px', right: '20px' }
    };

    notification.style.cssText = `
        position: fixed;
        ${Object.entries(positionStyles[position]).map(([key, val]) => `${key}: ${val};`).join(' ')}
        padding: 1rem 1.5rem;
        border-radius: 0.5rem;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        z-index: 10000;
        max-width: 400px;
        font-size: 0.9rem;
        line-height: 1.5;
        ${Object.entries(styles[type]).map(([key, val]) => `${key}: ${val};`).join(' ')}
    `;

    document.body.appendChild(notification);

    // Auto-remove after duration
    if (duration > 0) {
        setTimeout(() => {
            notification.remove();
        }, duration);
    }

    // Also log to console for debugging
    console.error(`[Error Handler] ${message}`);
}

/**
 * Hides an error message
 * @param {string} containerId - The ID of the error container to hide
 */
export function hideError(containerId) {
    const containers = [
        containerId ? document.getElementById(containerId) : null,
        document.getElementById('error-container'),
        document.getElementById('error-message')
    ].filter(Boolean);

    containers.forEach(container => {
        if (container) {
            container.style.display = 'none';
            container.textContent = '';
        }
    });
}

/**
 * Shows an informational notification
 * @param {string} message - The info message
 * @param {Object} options - Additional options
 */
export function showInfo(message, options = {}) {
    return showError(message, { 
        ...options, 
        type: 'info',
        ...(options.duration === undefined && { duration: 3000 })
    });
}

/**
 * Shows a success notification
 * @param {string} message - The success message
 * @param {Object} options - Additional options
 */
export function showSuccess(message, options = {}) {
    showError(message, { ...options, type: 'info' });
    
    // Create a success-specific notification with green color
    const notification = document.createElement('div');
    notification.className = 'notification success';
    notification.textContent = message;
    
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #d4edda;
        border: 1px solid #c3e6cb;
        color: #155724;
        padding: 1rem 1.5rem;
        border-radius: 0.5rem;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        z-index: 10000;
        max-width: 400px;
        font-size: 0.9rem;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, options.duration || 3000);
    
    console.log(`[Success] ${message}`);
}

/**
 * Handles API errors and extracts user-friendly messages
 * @param {Error} error - The error object
 * @param {string} defaultMessage - Default message if error can't be parsed
 * @returns {string} User-friendly error message
 */
export function handleAPIError(error, defaultMessage = 'An error occurred. Please try again.') {
    console.error('API Error:', error);

    // Check if it's a network error
    if (error.message && error.message.includes('fetch')) {
        return 'Unable to connect to server. Please check your internet connection.';
    }

    // Check if error has a specific message
    if (error.message) {
        return error.message;
    }

    // Check if error has detail property
    if (error.detail) {
        return error.detail;
    }

    // Return default message
    return defaultMessage;
}

/**
 * Validates email format
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid
 */
export function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(String(email).toLowerCase());
}

/**
 * Validates password strength
 * @param {string} password - Password to validate
 * @returns {Object} {isValid, message}
 */
export function validatePassword(password) {
    if (!password) {
        return { isValid: false, message: 'Password is required' };
    }
    if (password.length < 8) {
        return { isValid: false, message: 'Password must be at least 8 characters long' };
    }
    return { isValid: true, message: '' };
}

/**
 * Shows field-level validation error
 * @param {HTMLElement} element - The form element with error
 * @param {string} message - Error message
 */
export function showFieldError(element, message) {
    if (!element) return;

    // Find or create error element
    const wrapper = element.closest('.input-wrapper, .form-group, .input-group');
    let errorElement = null;

    if (wrapper) {
        errorElement = wrapper.querySelector('.field-error');
        if (!errorElement) {
            errorElement = document.createElement('div');
            errorElement.className = 'field-error';
            wrapper.appendChild(errorElement);
        }
    } else {
        // Create error element after the input
        errorElement = document.createElement('div');
        errorElement.className = 'field-error';
        element.parentNode.insertBefore(errorElement, element.nextSibling);
    }

    // Display error
    errorElement.textContent = message;
    errorElement.style.display = 'block';

    // Add error class to wrapper
    if (wrapper) {
        wrapper.classList.add('has-error');
    }

    // Focus the field
    element.focus();
    element.style.borderColor = '#dc2626';
}

/**
 * Hides field-level validation error
 * @param {HTMLElement} element - The form element to clear error for
 */
export function hideFieldError(element) {
    if (!element) return;

    const wrapper = element.closest('.input-wrapper, .form-group, .input-group');
    if (wrapper) {
        const errorElement = wrapper.querySelector('.field-error');
        if (errorElement) {
            errorElement.style.display = 'none';
        }
        wrapper.classList.remove('has-error');
    }

    element.style.borderColor = '';
}

/**
 * Creates a loading state on a button
 * @param {HTMLElement} button - Button element
 * @param {boolean} isLoading - Whether loading or not
 * @param {string} loadingText - Text to show while loading
 */
export function setButtonLoading(button, isLoading, loadingText = 'Loading...') {
    if (!button) return;

    if (isLoading) {
        button.dataset.originalText = button.textContent;
        button.textContent = loadingText;
        button.disabled = true;
        button.style.opacity = '0.6';
        button.style.cursor = 'not-allowed';
    } else {
        button.textContent = button.dataset.originalText || button.textContent;
        button.disabled = false;
        button.style.opacity = '1';
        button.style.cursor = 'pointer';
    }
}

// Export default object for convenience
export default {
    showError,
    hideError,
    showSuccess,
    showInfo,  // Add showInfo to the default export
    handleAPIError,
    validateEmail,
    validatePassword,
    showFieldError,
    hideFieldError,
    setButtonLoading
};

