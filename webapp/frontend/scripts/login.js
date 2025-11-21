// API Configuration
const getAPIBaseURL = () => {
  const hostname = window.location.hostname;
  const protocol = window.location.protocol;
  
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:8000/api/auth';
  }
  
  return `${protocol}//${hostname}/api/auth`;
};

const API_BASE_URL = getAPIBaseURL();

// Function to get CSRF token from cookies
function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}

// Get CSRF token
let csrftoken = getCookie('csrftoken');

// Function to ensure we have a CSRF token
async function ensureCSRFToken() {
    if (!csrftoken) {
        try {
            const response = await fetch(`${API_BASE_URL}/csrf/`, {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            
            if (!response.ok) {
                throw new Error(`CSRF token request failed: ${response.status}`);
            }
            
            const data = await response.json();
            csrftoken = data.csrfToken || data.csrf;
            const csrfInput = document.getElementById('csrf-token');
            if (csrfInput) {
                csrfInput.value = csrftoken;
            }
            return csrftoken;
        } catch (error) {
            console.error('Error getting CSRF token:', error);
            // Don't throw here - let the app continue without CSRF token
            return null;
        }
    }
    return csrftoken;
}

// Initialize CSRF token when the script loads
ensureCSRFToken().catch(console.error);

// Utility functions
function showGlobalError(message) {
    console.log('Showing global error:', message);
    const errorMessage = document.getElementById('error-message');
    if (errorMessage) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
        errorMessage.style.opacity = '1';
        // Scroll to the error message
        errorMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
        console.error('Error message container not found');
    }
}

function hideGlobalError() {
    const errorMessage = document.getElementById('error-message');
    if (errorMessage) {
        errorMessage.style.display = 'none';
    }
}

function showError(element, message) {
    console.log('Showing error for', element.id, ':', message);
    // Find or create the error element
    let errorElement = element.nextElementSibling;
    if (!errorElement || !errorElement.classList.contains('error-message')) {
        errorElement = document.createElement('div');
        errorElement.className = 'error-message';
        element.parentNode.insertBefore(errorElement, element.nextSibling);
    }
    
    // Set error message and show it
    errorElement.textContent = message;
    errorElement.style.display = 'block';
    errorElement.style.opacity = '1';
    
    // Add error class to input wrapper
    const wrapper = element.closest('.input-wrapper');
    if (wrapper) wrapper.classList.add('error');
    
    // Focus on the element with error
    element.focus();
    element.style.borderColor = '#dc3545';
}

function hideError(element) {
    if (!element) return;
    
    // Hide the error message
    const errorElement = element.nextElementSibling;
    if (errorElement && errorElement.classList.contains('error-message')) {
        errorElement.style.display = 'none';
    }
    
    // Remove error class from input wrapper
    const wrapper = element.closest('.input-wrapper');
    if (wrapper) wrapper.classList.remove('error');
    
    element.style.borderColor = '';
}

function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(String(email).toLowerCase());
}

function validatePassword(password) {
    return password && password.length >= 8;
}

// Enhanced fetch function with better error handling
async function makeAPIRequest(url, options = {}) {
    try {
        const response = await fetch(url, {
            ...options,
            credentials: 'include',
            mode: 'cors',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                ...options.headers
            }
        });

        let data = null;
        const contentType = response.headers.get('content-type');
        
        if (contentType && contentType.includes('application/json')) {
            const text = await response.text();
            if (text) {
                data = JSON.parse(text);
            }
        }

        if (!response.ok) {
            // Handle different error scenarios
            let errorMessage = 'An error occurred';
            
            if (data) {
                errorMessage = data.detail || data.message || data.error || errorMessage;
                if (data.non_field_errors && Array.isArray(data.non_field_errors)) {
                    errorMessage = data.non_field_errors[0];
                }
            } else {
                switch (response.status) {
                    case 400:
                        errorMessage = 'Invalid request. Please check your input.';
                        break;
                    case 401:
                        errorMessage = 'Invalid email or password.';
                        break;
                    case 403:
                        errorMessage = 'Access forbidden.';
                        break;
                    case 404:
                        errorMessage = 'Service not found.';
                        break;
                    case 500:
                        errorMessage = 'Server error. Please try again later.';
                        break;
                    default:
                        errorMessage = `Error: ${response.status}`;
                }
            }
            
            throw new Error(errorMessage);
        }

        return { data, response };
    } catch (error) {
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            throw new Error('Unable to connect to server. Please check if the server is running and try again.');
        }
        throw error;
    }
}

// Toggle password visibility
function togglePasswordVisibility(inputId, button) {
    const input = document.getElementById(inputId);
    const isPassword = input.type === 'password';
    
    // Toggle the input type
    input.type = isPassword ? 'text' : 'password';
    
    // Toggle the eye icon
    const eyeIcon = button.querySelector('svg');
    if (eyeIcon) {
        if (isPassword) {
            // Change to eye-off icon
            eyeIcon.innerHTML = `
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                <line x1="1" y1="1" x2="23" y2="23"></line>
            `;
        } else {
            // Change back to eye icon
            eyeIcon.innerHTML = `
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
            `;
        }
    }
}

// Main execution
document.addEventListener('DOMContentLoaded', function() {
    // Check if user is already logged in by attempting to fetch profile
    // If user has valid session cookie, they'll be redirected
    // This will be handled by the API response

    // Get form elements
    const loginForm = document.getElementById('loginForm');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const passwordToggle = document.getElementById('passwordToggle');
    const rememberMeCheckbox = document.getElementById('rememberMe');
    const loginBtn = document.querySelector('.login-btn');
    const btnText = document.querySelector('.btn-text');
    const btnLoader = document.getElementById('btnLoader');

    if (!loginForm || !emailInput || !passwordInput || !loginBtn) {
        console.error('Required form elements not found');
        return;
    }

    // Password visibility toggle
    if (passwordToggle) {
        passwordToggle.addEventListener('click', function() {
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);
            
            // Update icon
            const icon = passwordToggle.querySelector('svg');
            if (icon) {
                if (type === 'text') {
                    icon.innerHTML = `
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                        <line x1="1" y1="1" x2="23" y2="23"/>
                    `;
                } else {
                    icon.innerHTML = `
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                    `;
                }
            }
        });
    }

    // Enhanced error display functions for form inputs
    function showInputError(inputElement, message) {
        if (!inputElement) return;
        
        hideInputError(inputElement); // Clear any existing error first
        
        // Find or create error element
        const inputId = inputElement.id;
        const errorId = `${inputId}-error`;
        let errorElement = document.getElementById(errorId);
        
        // If error element doesn't exist, try to find it in the input-group
        if (!errorElement) {
            const inputGroup = inputElement.closest('.input-group');
            if (inputGroup) {
                errorElement = inputGroup.querySelector(`#${errorId}`) || inputGroup.querySelector('.error-message');
            }
        }
        
        // If still not found, create it
        if (!errorElement) {
            errorElement = document.createElement('div');
            errorElement.className = 'error-message';
            errorElement.id = errorId;
            
            // Insert after the input-wrapper
            const inputWrapper = inputElement.closest('.input-wrapper');
            if (inputWrapper && inputWrapper.parentNode) {
                inputWrapper.parentNode.insertBefore(errorElement, inputWrapper.nextSibling);
            }
        }
        
        // Display the error
        if (errorElement) {
            errorElement.textContent = message;
            errorElement.classList.add('show');
            errorElement.style.display = 'block';
        }
        
        // Add error styling to input wrapper
        const inputWrapper = inputElement.closest('.input-wrapper');
        if (inputWrapper) {
            inputWrapper.classList.add('error');
        }
        inputElement.style.borderColor = '#dc3545';
    }

    function hideInputError(inputElement) {
        if (!inputElement) return;
        
        const inputId = inputElement.id;
        const errorId = `${inputId}-error`;
        const errorElement = document.getElementById(errorId);
        
        if (errorElement) {
            errorElement.classList.remove('show');
            errorElement.style.display = 'none';
            errorElement.textContent = '';
        }
        
        // Remove error styling from input wrapper
        const inputWrapper = inputElement.closest('.input-wrapper');
        if (inputWrapper) {
            inputWrapper.classList.remove('error');
        }
        inputElement.style.borderColor = '';
    }

    // Real-time validation
    emailInput.addEventListener('blur', function() {
        const email = this.value.trim();
        if (email && !validateEmail(email)) {
            showInputError(this, 'Please enter a valid email address');
        } else {
            hideInputError(this);
        }
    });

    emailInput.addEventListener('input', function() {
        if (this.value.trim() && validateEmail(this.value.trim())) {
            hideInputError(this);
        }
    });

    passwordInput.addEventListener('blur', function() {
        const password = this.value;
        if (password && !validatePassword(password)) {
            showInputError(this, 'Password must be at least 8 characters long');
        } else {
            hideInputError(this);
        }
    });

    passwordInput.addEventListener('input', function() {
        if (this.value && validatePassword(this.value)) {
            hideInputError(this);
        }
    });

    // Token verification function
    async function verifyToken(token) {
        try {
            // Ensure CSRF token before verification
            await ensureCSRFToken();

            const result = await makeAPIRequest(`${API_BASE_URL}/verify/`, {
                method: 'POST',
                headers: {
                    'Authorization': `Token ${token}`,
                    'X-CSRFToken': csrftoken
                }
            });
            return true;
        } catch (error) {
            console.error('Token verification failed:', error);
            return false;
        }
    }

    // Form submission
    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        // Validate form
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        const rememberMe = rememberMeCheckbox ? rememberMeCheckbox.checked : false;
        
        let isValid = true;
        
        // Reset previous errors
        hideGlobalError();
        hideInputError(emailInput);
        hideInputError(passwordInput);
        
        // Validate email
        if (!email) {
            showInputError(emailInput, 'Email is required');
            isValid = false;
        } else if (!validateEmail(email)) {
            showInputError(emailInput, 'Please enter a valid email');
            isValid = false;
        }
        
        // Validate password
        if (!password) {
            showInputError(passwordInput, 'Password is required');
            isValid = false;
        } else if (!validatePassword(password)) {
            showInputError(passwordInput, 'Password must be at least 8 characters long');
            isValid = false;
        }
        
        if (isValid) {
            try {
                // Show loading state
                loginBtn.disabled = true;
                if (btnText) btnText.textContent = 'Signing in...';
                if (btnLoader) btnLoader.classList.remove('hidden');
                
                // Ensure we have a CSRF token
                const token = await ensureCSRFToken();
                
                // Prepare headers
                const headers = {
                    'X-Requested-With': 'XMLHttpRequest',
                };
                
                if (token) {
                    headers['X-CSRFToken'] = token;
                }
                
                // Make the login request to the custom login endpoint
                const response = await fetch(`${API_BASE_URL}/login/`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': csrftoken,
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    credentials: 'include',
                    body: JSON.stringify({
                        username: email,  // The backend expects 'username' field
                        password: password
                    })
                });

                if (!response.ok) {
                    let errorMessage = 'An error occurred during login. Please try again.';
                    let errorData = {};
                    
                    try {
                        const responseText = await response.text();
                        try {
                            errorData = JSON.parse(responseText);
                        } catch (e) {
                            console.error('Failed to parse error response as JSON:', e);
                        }
                        
                        // Handle different HTTP status codes with specific messages
                        switch (response.status) {
                            case 400:
                                errorMessage = errorData.non_field_errors?.[0] || 
                                             'Invalid request. Please check your input.';
                                break;
                            case 401:
                                errorMessage = 'Invalid email or password. Please try again.';
                                // Highlight both email and password fields for auth errors
                                showInputError(emailInput, 'Invalid email or password');
                                showInputError(passwordInput, ' '); // Empty message to show red border
                                break;
                            case 403:
                                errorMessage = 'Account not active. Please verify your email or contact support.';
                                break;
                            case 404:
                                errorMessage = 'Account not found. Please check your email or sign up.';
                                showInputError(emailInput, 'Account not found');
                                break;
                            case 429:
                                errorMessage = 'Too many login attempts. Please try again later.';
                                break;
                            case 500:
                                errorMessage = 'Server error. Please try again later.';
                                break;
                            default:
                                errorMessage = errorData.detail || 
                                             errorData.message || 
                                             `Login failed with status ${response.status}`;
                        }
                    } catch (e) {
                        console.error('Error processing error response:', e);
                        errorMessage = 'An unexpected error occurred. Please try again.';
                    }
                    
                    // Log detailed error info for debugging
                    console.error('Login error:', {
                        status: response.status,
                        statusText: response.statusText,
                        errorData,
                        timestamp: new Date().toISOString()
                    });
                    
                    // Show the error message to the user
                    throw new Error(errorMessage);
                }

                let data;
                try {
                    data = await response.json();
                    console.log('Login successful, response data:', data);
                } catch (e) {
                    console.error('Failed to parse login response:', e);
                    throw new Error('Invalid response from server');
                }
                
                // Store the tokens and user data
                if (data) {
                    // Clear any existing tokens and data
                    ['authToken', 'refreshToken', 'user'].forEach(item => localStorage.removeItem(item));
                    
                    // Handle Knox token format
                    const token = data.token || data.access;
                    const userData = data.user || {};
                    
                    if (token) {
                        localStorage.setItem('authToken', token);
                        console.log('Knox token stored');
                        
                        // For Knox, we don't have a refresh token, so we'll use the same token
                        // and implement token refresh differently if needed
                        
                        // Store user data if available
                        if (userData && typeof userData === 'object' && Object.keys(userData).length > 0) {
                            localStorage.setItem('user', JSON.stringify(userData));
                            console.log('User data stored:', Object.keys(userData));
                        } else {
                            // If no user data in response, try to fetch it
                            try {
                                const profileResponse = await fetch(`${API_BASE_URL}/profile/`, {
                                    method: 'GET',
                                    headers: {
                                        'Authorization': `Token ${token}`,  // Changed from Bearer to Token for Knox
                                        'Content-Type': 'application/json',
                                        'X-Requested-With': 'XMLHttpRequest'
                                    },
                                    credentials: 'include'
                                });
                                
                                if (profileResponse.ok) {
                                    const profileData = await profileResponse.json();
                                    localStorage.setItem('user', JSON.stringify(profileData));
                                } else {
                                    console.warn('Login successful but failed to fetch user profile');
                                }
                            } catch (profileError) {
                                console.error('Error fetching user profile:', profileError);
                            }
                        }
                        
                        // Store email if remember me is checked
                        if (rememberMe) {
                            localStorage.setItem('scholarx-remember-email', email);
                        } else {
                            localStorage.removeItem('scholarx-remember-email');
                        }
                        
                        // Redirect to dashboard or home page
                        window.location.href = 'dashboard.html';
                        return; // Exit after redirect
                    } else {
                        throw new Error('No authentication token received');
                    }
                } else {
                    throw new Error('Invalid response from server');
                }
                
            } catch (error) {
                console.error('Login error:', error);
                // Show the error message in the global error container
                const errorMessage = error.message || 'An unexpected error occurred. Please try again.';
                showGlobalError(errorMessage);
                
                // Focus on the appropriate field if needed
                if (error.message.includes('email')) {
                    emailInput.focus();
                } else if (error.message.includes('password')) {
                    passwordInput.focus();
                } else {
                    // Default focus to email if we're not sure
                    emailInput.focus();
                }
            } finally {
                // Reset loading state
                loginBtn.disabled = false;
                if (btnText) btnText.textContent = 'Sign In';
                if (btnLoader) btnLoader.classList.add('hidden');
            }
        } else {
            // Focus on the first invalid input
            const firstError = document.querySelector('input[style*="border-color: rgb(220, 53, 69)"]');
            if (firstError) {
                firstError.focus();
            }
        }
    });

    // Enhanced input focus effects
    const inputs = document.querySelectorAll('.form-input');
    inputs.forEach(input => {
        const icon = input.parentNode.querySelector('.input-icon');
        
        input.addEventListener('focus', function() {
            if (icon) {
                icon.style.color = 'var(--primary-color, #007bff)';
            }
        });

        input.addEventListener('blur', function() {
            if (!this.value && icon) {
                icon.style.color = 'var(--text-secondary, #6c757d)';
            }
        });
    });

    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // Add ripple effect to buttons
    function createRipple(event) {
        const button = event.currentTarget;
        const circle = document.createElement('span');
        const diameter = Math.max(button.clientWidth, button.clientHeight);
        const radius = diameter / 2;

        circle.style.width = circle.style.height = `${diameter}px`;
        circle.style.left = `${event.clientX - button.offsetLeft - radius}px`;
        circle.style.top = `${event.clientY - button.offsetTop - radius}px`;
        circle.classList.add('ripple');

        const ripple = button.getElementsByClassName('ripple')[0];
        if (ripple) {
            ripple.remove();
        }

        button.appendChild(circle);
    }

    // Add ripple effect styles
    const style = document.createElement('style');
    style.textContent = `
        .primary-btn, .login-btn {
            position: relative;
            overflow: hidden;
        }
        
        .ripple {
            position: absolute;
            border-radius: 50%;
            background-color: rgba(255, 255, 255, 0.3);
            transform: scale(0);
            animation: ripple-animation 0.6s linear;
            pointer-events: none;
        }
        
        @keyframes ripple-animation {
            to {
                transform: scale(4);
                opacity: 0;
            }
        }
        
        .error-message.show {
            display: block !important;
        }
    `;
    document.head.appendChild(style);

    // Apply ripple effect to primary button
    loginBtn.addEventListener('click', createRipple);

    // Keyboard navigation improvements
    document.addEventListener('keydown', function(e) {
        // Enter key on form elements
        if (e.key === 'Enter' && e.target.classList.contains('form-input')) {
            const inputs = Array.from(document.querySelectorAll('.form-input'));
            const currentIndex = inputs.indexOf(e.target);
            
            if (currentIndex < inputs.length - 1) {
                inputs[currentIndex + 1].focus();
            } else {
                loginBtn.click();
            }
        }
        
        // Escape key to clear focus
        if (e.key === 'Escape') {
            document.activeElement.blur();
        }
    });

    // Auto-focus first input on page load
    setTimeout(() => {
        emailInput.focus();
    }, 100);

    // Form auto-save (remember form data)
    const rememberedEmail = localStorage.getItem('scholarx-remember-email');
    if (rememberedEmail) {
        emailInput.value = rememberedEmail;
        if (rememberMeCheckbox) {
            rememberMeCheckbox.checked = true;
        }
    }

    // Save email if remember me is checked
    if (rememberMeCheckbox) {
        rememberMeCheckbox.addEventListener('change', function() {
            if (this.checked && emailInput.value) {
                localStorage.setItem('scholarx-remember-email', emailInput.value);
            } else {
                localStorage.removeItem('scholarx-remember-email');
            }
        });

        emailInput.addEventListener('input', function() {
            if (rememberMeCheckbox.checked) {
                localStorage.setItem('scholarx-remember-email', this.value);
            }
        });
    }
});