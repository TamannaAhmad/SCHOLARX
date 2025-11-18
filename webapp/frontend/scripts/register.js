// Import error handler for notifications
import errorHandler from '../src/utils/errorHandler.js';
const { showError: showErrorNotification, showSuccess, showInfo, handleAPIError } = errorHandler;

// API Configuration
const API_BASE_URL = 'http://127.0.0.1:8000/api/auth';

// Utility functions for error handling
function showGlobalError(message) {
    const errorElement = document.getElementById('error-message');
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.style.display = 'block';
        errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function hideGlobalError() {
    const errorElement = document.getElementById('error-message');
    if (errorElement) {
        errorElement.style.display = 'none';
    }
}

function showError(inputElement, message) {
    if (!inputElement) return;
    
    // Find the parent input wrapper and add error class
    const wrapper = inputElement.closest('.input-wrapper, .form-group');
    if (wrapper) {
        wrapper.classList.add('error');
    }
    
    // Find the error message element
    const errorId = `${inputElement.id}-error`;
    let errorElement = document.getElementById(errorId);
    
    if (!errorElement) {
        // If no error element exists, create one
        errorElement = document.createElement('div');
        errorElement.className = 'error-message';
        errorElement.id = errorId;
        
        // For select elements, find the wrapper and append there
        if (wrapper) {
            wrapper.appendChild(errorElement);
        } else {
            // Fallback: insert after the input element
            inputElement.parentNode.appendChild(errorElement);
        }
    }
    
    // Set error message and show it
    errorElement.textContent = message;
    errorElement.style.display = 'block';
    errorElement.classList.add('show');
    
    // Focus the input with error
    inputElement.focus();
}

function hideError(inputElement) {
    if (!inputElement) return;
    
    // Remove error class from wrapper
    const wrapper = inputElement.closest('.input-wrapper');
    if (wrapper) {
        wrapper.classList.remove('error');
    }
    
    // Hide error message
    const errorId = `${inputElement.id}-error`;
    const errorElement = document.getElementById(errorId);
    if (errorElement) {
        errorElement.style.display = 'none';
        errorElement.classList.remove('show');
    }
}

// Helper function to validate email format
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(String(email).toLowerCase());
}

const authAPI = {
    async register(data) {
        try {
            console.log('Registering user with data:', JSON.stringify(data, null, 2));
            
            // Clear any previous errors
            hideGlobalError();
            document.querySelectorAll('.error-message').forEach(el => el.style.display = 'none');
            document.querySelectorAll('.input-wrapper').forEach(el => el.classList.remove('error'));
            
            // Get CSRF token first
            const csrfResponse = await fetch(`${API_BASE_URL}/csrf/`, {
                credentials: 'include'
            });
            
            if (!csrfResponse.ok) {
                const errorText = await csrfResponse.text();
                console.error('Failed to get CSRF token:', {
                    status: csrfResponse.status,
                    statusText: csrfResponse.statusText,
                    responseText: errorText
                });
                throw new Error('Failed to connect to server. Please try again.');
            }
            
            const csrfData = await csrfResponse.json();
            console.log('Got CSRF token:', csrfData);
            
            const response = await fetch(`${API_BASE_URL}/register/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrfData.csrfToken,
                    'X-Requested-With': 'XMLHttpRequest',
                },
                credentials: 'include',
                body: JSON.stringify(data, (key, value) => {
                    if (value instanceof Date) {
                        return value.toISOString();
                    }
                    return value;
                }, 2)
            });
            
            let responseData;
            try {
                responseData = await response.json();
                
                // Handle field-specific errors from the server
                if (!response.ok && responseData) {
                    let hasFieldErrors = false;
                    
                    // Process field errors
                    for (const [field, errors] of Object.entries(responseData)) {
                        if (Array.isArray(errors) && errors.length > 0) {
                            const fieldElement = document.getElementById(field);
                            if (fieldElement) {
                                showError(fieldElement, errors[0]);
                                hasFieldErrors = true;
                            }
                        }
                    }
                    
                    // If we have field errors, show them and stop
                    if (hasFieldErrors) {
                        // Determine which step has errors and navigate to it
                        let errorStep = 1; // Default to step 1
                        
                        // Check if USN or email fields have errors (step 1)
                        const usnError = document.getElementById('usn-error');
                        const emailError = document.getElementById('email-error');
                        
                        if ((usnError && usnError.style.display === 'block') || 
                            (emailError && emailError.style.display === 'block')) {
                            errorStep = 1;
                        }
                        
                        // Navigate to the step with errors
                        if (window.registrationForm) {
                            window.registrationForm.navigateToStep(errorStep);
                            
                            // Scroll to the first error
                            setTimeout(() => {
                                const firstError = document.querySelector('.error-message[style*="display: block"], .input-wrapper.error');
                                if (firstError) {
                                    firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                }
                            }, 100);
                        }
                        
                        // Don't show the generic error message
                        return { 
                            status: response.status, 
                            data: responseData,
                            ok: false
                        };
                    }
                    
                    // Show non-field errors
                    let errorMessage = 'An error occurred during registration. Please try again.';
                    if (responseData.non_field_errors) {
                        errorMessage = responseData.non_field_errors[0];
                    } else if (responseData.detail) {
                        errorMessage = responseData.detail;
                    }
                    
                    throw new Error(errorMessage);
                }
            } catch (e) {
                const errorText = await response.text();
                console.error('Failed to parse JSON response:', {
                    error: e,
                    status: response.status,
                    statusText: response.statusText,
                    responseText: errorText
                });
                
                // Handle different HTTP status codes with specific messages
                let errorMessage = 'An error occurred. Please try again.';
                
                switch (response.status) {
                    case 400:
                        errorMessage = 'Invalid request. Please check your input.';
                        break;
                    case 409:
                        errorMessage = 'An account with this email already exists.';
                        break;
                    case 500:
                        errorMessage = 'Server error. Please try again later.';
                        break;
                    default:
                        errorMessage = e.message || `Error: ${response.status} ${response.statusText}`;
                }
                
                throw new Error(errorMessage);
            }
            
            console.log('Registration response:', {
                status: response.status,
                statusText: response.statusText,
                data: responseData
            });
            
            return { 
                status: response.status, 
                data: responseData,
                ok: response.ok
            };    
        } catch (error) {
            console.error('Registration error:', error);
            throw error;
        }
    },
    
    async getDepartments() {
        const response = await fetch(`${API_BASE_URL}/departments/`);
        if (!response.ok) throw new Error('Failed to fetch departments');
        return response.json();
    },
    
    async getSkills(departmentId = null) {
        let url = `${API_BASE_URL}/skills/`;
        if (departmentId) {
            url += `?department_id=${departmentId}`;
        }
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch skills');
        return response.json();
    }
};

class RegistrationForm {
    constructor() {
        this.currentStep = 1;
        this.totalSteps = 4;
        this.departments = [];
        this.skills = [];
        this.formData = {
            name: '',
            usn: '',
            email: '',
            password: '',
            confirmPassword: '',
            password2: '',
            first_name: '',
            last_name: '',
            phone_number: '',
            department: '',
            study_year: 1,
            profile: {
                linkedin_url: '',
                github_url: '',
                bio: '',
                date_of_birth: null,
                address: '',
                profile_picture: null
            },
            skills: [],
            availability: []
        };
        
        this.init();
    }
    
    async init() {
        this.bindEvents();
        this.updateProgressBar();
        await this.fetchData();
    }

    async fetchData() {
        try {
            const [departments, skills] = await Promise.all([
                authAPI.getDepartments(),
                authAPI.getSkills()
            ]);
            
            this.departments = departments;
            this.skills = skills;
            
            this.populateDepartmentDropdown();
            this.populateSkillsDatalist();
            
            const departmentSelect = document.getElementById('department');
            if (departmentSelect) {
                departmentSelect.addEventListener('change', (e) => {
                    this.onDepartmentChange(e.target.value);
                });
            }
        } catch (error) {
            console.error('Error fetching data:', error);
            this.showError('Failed to load required data. Please refresh the page to try again.');
        }
    }
    
    populateDepartmentDropdown() {
        const select = document.getElementById('department');
        if (!select) return;
        
        select.innerHTML = '<option value="">Select Department</option>';
        
        this.departments.forEach(dept => {
            const option = document.createElement('option');
            option.value = dept.id;
            option.textContent = dept.name;
            select.appendChild(option);
        });
    }
    
    async onDepartmentChange(departmentId) {
        if (!departmentId) return;
        
        try {
            this.skills = await authAPI.getSkills(departmentId);
            this.populateSkillsDatalist();
        } catch (error) {
            console.error('Error fetching skills for department:', error);
            this.showError('Failed to load skills for selected department');
        }
    }
    
    populateSkillsDatalist() {
        const datalist = document.getElementById('skillsDatalist');
        if (!datalist) return;
        
        datalist.innerHTML = '';
        
        this.skills.forEach(skill => {
            const option = document.createElement('option');
            option.value = skill.name;
            option.setAttribute('data-id', skill.id);
            datalist.appendChild(option);
        });
    }
    
    /**
     * Normalizes social media URLs by adding proper protocol and domain if missing
     * @param {string} url - The user input URL
     * @param {string} platform - The platform type ('linkedin' or 'github')
     * @returns {string} - The normalized URL or empty string if invalid
     */
    normalizeUrl(url, platform) {
        if (!url || !url.trim()) {
            return '';
        }
        
        url = url.trim();
        
        // If it's already a complete URL, validate and return it
        if (url.startsWith('http://') || url.startsWith('https://')) {
            try {
                const urlObj = new URL(url);
                // Validate that it's for the correct platform
                if (platform === 'linkedin' && !urlObj.hostname.includes('linkedin.com')) {
                    console.warn('LinkedIn URL does not contain linkedin.com');
                }
                if (platform === 'github' && !urlObj.hostname.includes('github.com')) {
                    console.warn('GitHub URL does not contain github.com');
                }
                return url;
            } catch (e) {
                console.warn('Invalid URL format:', url);
                return '';
            }
        }
        
        // Remove common prefixes that users might add
        url = url.replace(/^(www\.)?/, '');
        
        // Handle different input formats based on platform
        if (platform === 'linkedin') {
            // Remove linkedin.com if user included it
            url = url.replace(/^linkedin\.com\/?/, '');
            // Remove /in/ prefix if user included it
            url = url.replace(/^in\//, '');
            // If it looks like just a username, build the full URL
            if (url && !url.includes('/')) {
                return `https://www.linkedin.com/in/${url}`;
            } else if (url.startsWith('/')) {
                return `https://www.linkedin.com${url}`;
            } else if (url) {
                return `https://www.linkedin.com/in/${url}`;
            }
        }
        
        if (platform === 'github') {
            // Remove github.com if user included it
            url = url.replace(/^github\.com\/?/, '');
            // If it looks like just a username, build the full URL
            if (url && !url.includes('/')) {
                return `https://github.com/${url}`;
            } else if (url.startsWith('/')) {
                return `https://github.com${url}`;
            } else if (url) {
                return `https://github.com/${url}`;
            }
        }
        
        return '';
    }
    
    bindEvents() {
        // Skills functionality
        const addSkillBtn = document.getElementById('addSkillBtn');
        const skillInput = document.getElementById('skillInput');
        
        if (addSkillBtn && skillInput) {
            addSkillBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.addSkill(skillInput.value);
                skillInput.value = '';
            });

            skillInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.addSkill(skillInput.value);
                    skillInput.value = '';
                }
            });
        }
        
        // Name field validation
        const nameInput = document.getElementById('name');
        if (nameInput) {
            nameInput.addEventListener('input', (e) => {
                hideError(e.target);
            });
        }
        
        // USN formatting and validation as user types
        const usnInput = document.getElementById('usn');
        if (usnInput) {
            usnInput.addEventListener('input', (e) => {
                // Convert to uppercase
                e.target.value = e.target.value.toUpperCase();
                
                // Hide error when user starts typing
                hideError(e.target);
            });
        }
        
        // Real-time password validation
        const passwordInput = document.getElementById('password');
        const confirmPasswordInput = document.getElementById('confirmPassword');
        
        if (passwordInput) {
            passwordInput.addEventListener('input', (e) => {
                hideError(e.target);
                
                // Clear confirm password error when password changes
                if (confirmPasswordInput) {
                    hideError(confirmPasswordInput);
                }
            });
        }
        
        if (confirmPasswordInput) {
            confirmPasswordInput.addEventListener('input', (e) => {
                hideError(e.target);
                
                // Check if passwords match in real-time
                const password = passwordInput ? passwordInput.value : '';
                if (password && e.target.value && password !== e.target.value) {
                    showError(e.target, 'Passwords do not match');
                }
            });
        }
        
        // Email validation as user types
        const emailInput = document.getElementById('email');
        if (emailInput) {
            emailInput.addEventListener('input', (e) => {
                hideError(e.target);
            });
            
            emailInput.addEventListener('blur', (e) => {
                const email = e.target.value.trim();
                if (email && !validateEmail(email)) {
                    showError(e.target, 'Please enter a valid email address (e.g., name@example.com)');
                }
            });
        }
        
        // Department and year select validation
        const departmentSelect = document.getElementById('department');
        const yearSelect = document.getElementById('year');
        
        if (departmentSelect) {
            departmentSelect.addEventListener('change', (e) => {
                hideError(e.target);
            });
        }
        
        if (yearSelect) {
            yearSelect.addEventListener('change', (e) => {
                hideError(e.target);
            });
        }
        
        // Schedule cells
        document.querySelectorAll('.schedule-cell').forEach(cell => {
            cell.addEventListener('click', () => this.toggleScheduleCell(cell));
        });
        
        // Form submission
        const registerForm = document.getElementById('registerForm');
        if (registerForm) {
            registerForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleSubmit();
            });
        }
    }
    
    addSkill(skillName) {
        if (!skillName) {
            this.showSectionError('skillsForm', 'Please enter a skill name');
            return;
        }
        
        const proficiencyLevel = document.getElementById('proficiencyLevel');
        const level = proficiencyLevel ? parseInt(proficiencyLevel.value) : NaN;
        
        if (isNaN(level) || level < 0 || level > 5) {
            this.showSectionError('skillsForm', 'Please select a proficiency level (0-5) before adding the skill');
            return;
        }
        
        const skill = this.skills.find(s => 
            s.name.toLowerCase() === skillName.toLowerCase()
        );
        
        if (!skill) {
            this.showSectionError('skillsForm', `"${skillName}" is not a recognized skill. Please select from the list or try a different skill.`);
            return;
        }
        
        // Check if skill already added
        if (this.formData.skills.some(s => s.skill_id === skill.id)) {
            this.showSectionError('skillsForm', `"${skillName}" has already been added to your skills list`);
            return;
        }
        
        const skillData = {
            skill_id: skill.id,
            name: skill.name,
            proficiency_level: level
        };
        
        this.formData.skills.push(skillData);
        this.renderSkills();
        
        // Clear any section errors after successful addition
        document.querySelectorAll('.section-error').forEach(el => el.remove());
        
        // Reset the proficiency level selector
        if (proficiencyLevel) {
            proficiencyLevel.value = "";
        }
    }
    
    removeSkill(skillId) {
        this.formData.skills = this.formData.skills.filter(
            skill => skill.skill_id !== skillId
        );
        this.renderSkills();
        const sectionErrors = document.querySelectorAll('.skills-section .section-error');
        sectionErrors.forEach(error => error.remove());
    }
    
    renderSkills() {
        const skillsContainer = document.getElementById('selectedSkills');
        if (!skillsContainer) return;
        
        skillsContainer.innerHTML = '';
        
        this.formData.skills.forEach(skill => {
            const skillObj = this.skills.find(s => s.id === skill.skill_id);
            
            if (!skillObj) return;
            
            const skillElement = document.createElement('div');
            skillElement.className = 'skill-tag';
            skillElement.innerHTML = `
                <span>${skillObj.name}</span>
                <span class="proficiency-badge">${skill.proficiency_level}/5</span>
                <button type="button" class="remove-skill" data-skill-id="${skill.skill_id}">
                    &times;
                </button>
            `;
            skillsContainer.appendChild(skillElement);
        });
        
        // Add event listeners to remove buttons
        document.querySelectorAll('.remove-skill').forEach(button => {
            button.addEventListener('click', (e) => {
                const skillId = parseInt(e.target.closest('button').getAttribute('data-skill-id'));
                this.removeSkill(skillId);
            });
        });
    }
    
    toggleScheduleCell(cell) {
        if (!cell || !cell.classList.contains('schedule-cell')) return;
        
        cell.classList.toggle('selected');
        this.updateAvailabilityFromSchedule();
    }
    
    updateAvailabilityFromSchedule() {
        this.formData.availability = [];
        const selectedCells = document.querySelectorAll('.schedule-cell.selected');
        
        selectedCells.forEach(cell => {
            const day = cell.getAttribute('data-day');
            const time = cell.getAttribute('data-time');
            
            // Convert day to number (0 = Sunday, 1 = Monday, etc.)
            const dayMap = {
                'sun': 0, 'mon': 1, 'tue': 2, 'wed': 3, 
                'thu': 4, 'fri': 5, 'sat': 6
            };
            
            const dayNumber = dayMap[day] || 0;
            
            // Convert time to proper format (e.g., "08:00" to "08:00:00")
            const startTime = time + ':00';
            const endTime = this.getNextTimeSlot(time) + ':00';
            
            this.formData.availability.push({
                day_of_week: dayNumber,
                time_slot_start: startTime,
                time_slot_end: endTime,
                is_available: true
            });
        });
    }
    
    getNextTimeSlot(time) {
        const [hours, minutes] = time.split(':').map(Number);
        if (hours === 22) {
            return '23:59';
        }
        const nextHours = (hours + 2) % 24;
        return `${nextHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }
    
    validateStep(stepNumber) {
        let isValid = true;
        let firstErrorElement = null;
        
        // Clear previous errors
        hideGlobalError();
        document.querySelectorAll('.error-message').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.input-wrapper, .form-group').forEach(el => el.classList.remove('error'));
        
        // Helper function to set error and track first error
        function setError(element, message) {
            if (isValid) {
                firstErrorElement = element;
            }
            showError(element, message);
            isValid = false;
        }
        
        // Step 1 validation
        if (stepNumber === 1) {
            const name = document.getElementById('name');
            const usn = document.getElementById('usn');
            const email = document.getElementById('email');
            const password = document.getElementById('password');
            const confirmPassword = document.getElementById('confirmPassword');
            
            if (!name.value.trim()) {
                setError(name, 'Name is required');
            }
            
            if (!usn.value.trim()) {
                setError(usn, 'USN is required');
            } else if (!/^\d{1}[A-Za-z]{2}\d{2}[A-Za-z]{2}\d{3}$/i.test(usn.value.trim())) {
                setError(usn, 'Please enter a valid USN (e.g., 1KG22CS001)');
            }
            
            if (!email.value.trim()) {
                setError(email, 'Email is required');
            } else if (!validateEmail(email.value.trim())) {
                setError(email, 'Please enter a valid email address');
            }
            
            if (!password.value) {
                setError(password, 'Password is required');
            } else if (password.value.length < 8) {
                setError(password, 'Password must be at least 8 characters long');
            }
            
            if (!confirmPassword.value) {
                setError(confirmPassword, 'Please confirm your password');
            } else if (password.value !== confirmPassword.value) {
                setError(confirmPassword, 'Passwords do not match');
            }
            
            // Scroll to first error if any
            if (firstErrorElement) {
                firstErrorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            
            // Update form data when validation passes
            if (isValid) {
                this.formData = {
                    ...this.formData,
                    name: name.value.trim(),
                    usn: usn.value.trim().toUpperCase(),
                    email: email.value.trim(),
                    password: password.value,
                    password2: confirmPassword.value
                };
            }
        } else if (stepNumber === 2) {
            const departmentElement = document.getElementById('department');
            const yearElement = document.getElementById('year');
            const department = departmentElement?.value || '';
            const year = yearElement?.value || '';
            
            if (!department) {
                setError(departmentElement, 'Please select your department');
            }
            
            if (!year) {
                setError(yearElement, 'Please select your year');
            }
            
            // Scroll to first error if any
            if (firstErrorElement) {
                firstErrorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            
            // Update form data when validation passes
            if (isValid) {
                this.formData.department = department;
                this.formData.study_year = parseInt(year);
                this.formData.profile.linkedin_url = document.getElementById('linkedin')?.value || '';
                this.formData.profile.github_url = document.getElementById('github')?.value || '';
            }
        } else if (stepNumber === 3) {
            // Validate Step 3: Skills
            if (this.formData.skills.length === 0) {
                this.showSectionError('skillsForm', 'Please add at least one skill to continue');
                isValid = false;
            }
            
            // Check if any skill was added without proficiency level
            const hasInvalidSkill = this.formData.skills.some(skill => 
                skill.proficiency_level === undefined || skill.proficiency_level === null || 
                isNaN(skill.proficiency_level) || skill.proficiency_level < 0 || skill.proficiency_level > 5
            );
            
            if (hasInvalidSkill) {
                this.showSectionError('skillsForm', 'Please select a valid proficiency level (0-5) for all skills');
                isValid = false;
            }
            
            const skillsSection = document.querySelector('.skills-section');
            if (skillsSection) {
                skillsSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
                skillsSection.classList.add('error');
                setTimeout(() => {
                    skillsSection.classList.remove('error');
                }, 2000);
            }
        } else if (stepNumber === 4) {
            // Validate Step 4: Schedule
            const selectedSlots = document.querySelectorAll('.schedule-cell.selected');
            if (selectedSlots.length === 0) {
                const scheduleSection = document.querySelector('.schedule-grid');
                if (scheduleSection) {
                    scheduleSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    scheduleSection.classList.add('error');
                    setTimeout(() => {
                        scheduleSection.classList.remove('error');
                    }, 2000);
                }
                showGlobalError('Please select at least one time slot for your availability');
                isValid = false;
            }
        }

        return isValid;
    }

    updateFormData(stepNumber) {
        if (stepNumber === 1) {
            this.formData.email = document.getElementById('email')?.value || '';
            this.formData.password = document.getElementById('password')?.value || '';
            
            // Get and validate password confirmation
            const password = this.formData.password;
            const confirmPassword = document.getElementById('confirmPassword')?.value || '';
            
            if (password && confirmPassword && password !== confirmPassword) {
                this.showError('Passwords do not match.');
                return false;
            }
            
            this.formData.password2 = confirmPassword;
            
            // Split name into first and last name
            const fullName = (document.getElementById('name')?.value || '').trim();
            const nameParts = fullName.split(' ');
            this.formData.first_name = nameParts[0] || '';
            // Make last name optional - if not provided, use an empty string
            this.formData.last_name = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
            
            this.formData.usn = document.getElementById('usn')?.value || '';
        } else if (stepNumber === 2) {
            const departmentId = document.getElementById('department')?.value;
            if (departmentId) {
                this.formData.department = departmentId;
            }
            this.formData.study_year = parseInt(document.getElementById('year')?.value || '1');
            this.formData.phone_number = document.getElementById('phone')?.value || '';
            
            // Get and normalize social media URLs
            const linkedinInput = document.getElementById('linkedin')?.value || '';
            const githubInput = document.getElementById('github')?.value || '';
            
            const normalizedLinkedin = this.normalizeUrl(linkedinInput, 'linkedin');
            const normalizedGithub = this.normalizeUrl(githubInput, 'github');
            
            // Update profile data with normalized URLs
            this.formData.profile = {
                ...this.formData.profile,
                linkedin_url: normalizedLinkedin,
                github_url: normalizedGithub,
                bio: document.getElementById('bio')?.value || ''
            };
        } else if (stepNumber === 3) {
            // Skills are already handled by addSkill/removeSkill methods
        } else if (stepNumber === 4) {
            this.updateAvailabilityFromSchedule();
        }
    }

    async submitForm() {
        try {
            // Clear any existing errors
            hideGlobalError();
            document.querySelectorAll('.error-message').forEach(el => el.style.display = 'none');
            document.querySelectorAll('.input-wrapper').forEach(el => el.classList.remove('error'));
            document.querySelectorAll('.section-error').forEach(el => el.remove());
            
            // Validate all steps before submission
            for (let step = 1; step <= 4; step++) {
                if (!this.validateStep(step)) {
                    // If validation fails, navigate to that step
                    this.navigateToStep(step);
                    
                    // Find and scroll to the first error
                    setTimeout(() => {
                        const firstError = document.querySelector('.error-message[style*="display: block"], .section-error, .input-wrapper.error');
                        if (firstError) {
                            firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                    }, 100);
                    return false;
                }
            }

            // Show loading state
            this.showLoadingState(true);

            // Format skills data for the backend - using skill_id as required by the API
            const skillsData = (this.formData.skills || []).map(skill => ({
                skill_id: skill.skill_id || skill.skill?.id || skill.id,
                proficiency_level: parseInt(skill.proficiency_level) || 3
            }));

            // Format availability data for the backend
            const availabilityData = (this.formData.availability || []).map(slot => ({
                day_of_week: parseInt(slot.day_of_week),
                time_slot_start: slot.time_slot_start,
                time_slot_end: slot.time_slot_end,
                is_available: true
            }));

            // Normalize social media URLs
            const normalizedLinkedin = this.normalizeUrl(this.formData.profile?.linkedin_url || '', 'linkedin');
            const normalizedGithub = this.normalizeUrl(this.formData.profile?.github_url || '', 'github');

            // Get password confirmation from the form directly to ensure we have the latest value
            const password2 = document.getElementById('confirmPassword')?.value || '';

            // Prepare the data for submission
            const submissionData = {
                usn: this.formData.usn.toUpperCase().trim(),
                email: this.formData.email.trim(),
                password: this.formData.password,
                password2: password2, // Get password confirmation directly from the form
                first_name: this.formData.first_name.trim(),
                last_name: (this.formData.last_name || '').trim(),
                phone_number: (this.formData.phone_number || '').trim(),
                department: this.formData.department?.id || this.formData.department,
                study_year: parseInt(this.formData.study_year) || 1,
                profile: {
                    ...(this.formData.profile || {}),
                    bio: (this.formData.profile?.bio || '').trim(),
                    linkedin_url: normalizedLinkedin,
                    github_url: normalizedGithub
                },
                skills: skillsData,
                availability: availabilityData
            };

            console.log('Submitting registration data:', JSON.stringify(submissionData, null, 2));

            // Send the registration request
            const response = await authAPI.register(submissionData);

            if (response && response.data && response.data.token) {
                // Registration successful
                console.log('Registration successful:', response);
                this.showSuccessStep();
                
                // Show success message
                showSuccess('Registration successful! Redirecting to login...', { duration: 2000 });
                
                // Store the token and redirect after a short delay
                localStorage.setItem('token', response.data.token);
                setTimeout(() => {
                    window.location.href = '/login.html';
                }, 2000);
                
                return true;
            } else {
                const errorMessage = response?.data?.detail || 
                                   response?.data?.message || 
                                   'Registration failed. Please try again.';
                console.error('Registration failed:', errorMessage);
                this.showError(errorMessage);
            }
        } catch (error) {
            console.error('Registration error:', error);
            
            // Don't show the generic error message for validation errors
            if (error.message !== 'Please correct the errors in the form') {
                this.showError('Registration failed. Please try again.');
            }
        } finally {
            this.showLoadingState(false);
        }
    }
    
    showLoadingState(isLoading) {
        const submitButton = document.querySelector('button[onclick="completeRegistration()"]');
        if (submitButton) {
            if (isLoading) {
                submitButton.disabled = true;
                submitButton.textContent = 'Creating Account...';
            } else {
                submitButton.disabled = false;
                submitButton.textContent = 'Create Account';
            }
        }
    }
    
    showError(message) {
        // Find or create error container
        let errorContainer = document.getElementById('formErrors');
        if (!errorContainer) {
            errorContainer = document.createElement('div');
            errorContainer.id = 'formErrors';
            errorContainer.className = 'alert alert-danger';
            const form = document.querySelector('form');
            if (form) {
                form.prepend(errorContainer);
            }
        }
        
        errorContainer.textContent = message;
        errorContainer.style.display = 'block';
        
        // Scroll to error
        errorContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    
    showSectionError(formId, message) {
        const form = document.getElementById(formId);
        if (!form) return;
        
        // Remove any existing section errors
        const existingErrors = form.querySelectorAll('.section-error');
        existingErrors.forEach(error => error.remove());
        
        // Create and add the error message
        const errorElement = document.createElement('div');
        errorElement.className = 'section-error';
        errorElement.style.color = '#e74c3c';
        errorElement.style.marginTop = '10px';
        errorElement.style.padding = '8px';
        errorElement.style.backgroundColor = '#fdecea';
        errorElement.style.borderRadius = '4px';
        errorElement.style.borderLeft = '4px solid #e74c3c';
        errorElement.textContent = message;
        
        // Add the error to the form
        form.appendChild(errorElement);
    }
    
    navigateToStep(stepNumber) {
        // Hide all steps first
        document.querySelectorAll('.registration-step').forEach(step => {
            step.classList.remove('active');
        });
        
        // Show the target step
        const targetStep = document.getElementById(`step${stepNumber}`);
        if (targetStep) {
            targetStep.classList.add('active');
            
            // Update current step and progress
            this.currentStep = stepNumber;
            this.updateProgressBar();
            
            // Scroll to the step
            targetStep.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }
    
    showSuccessStep() {
        // Hide all steps
        document.querySelectorAll('.step').forEach(step => {
            step.style.display = 'none';
        });
        
        // Show success step
        const successStep = document.getElementById('successStep');
        if (successStep) {
            successStep.style.display = 'block';
        }
    }
    
    updateProgressBar() {
        const steps = document.querySelectorAll('.progress-step');
        const progressLine = document.querySelector('.progress-line');
        
        if (!steps.length) return;
        
        steps.forEach((step) => {
            const stepNumber = parseInt(step.getAttribute('data-step'));
            const stepCircle = step.querySelector('.step-circle');
            
            // Update classes based on step state
            const isComplete = stepNumber < this.currentStep;
            const isActive = stepNumber === this.currentStep;
            
            step.classList.toggle('completed', isComplete);
            step.classList.toggle('active', isActive);
            
            if (stepCircle) {
                // Update the circle content
                if (isComplete) {
                    stepCircle.innerHTML = '✓';
                    stepCircle.style.fontSize = '1.2rem';
                } else {
                    stepCircle.textContent = stepNumber;
                    stepCircle.style.fontSize = '';
                }
            }
        });
        
        // Update the progress line
        if (progressLine) {
            const activeStep = document.querySelector('.progress-step.active');
            if (activeStep) {
                const activeStepNumber = parseInt(activeStep.getAttribute('data-step'));
                const progressPercentage = ((activeStepNumber - 1) / (this.totalSteps - 1)) * 100;
                
                // Calculate the exact width based on the active step's position
                const firstStepRect = steps[0].getBoundingClientRect();
                const activeStepRect = activeStep.getBoundingClientRect();
                const lineWidth = (activeStepRect.left + (activeStepRect.width / 2)) - (firstStepRect.left + (firstStepRect.width / 2));
                
                progressLine.style.width = `${lineWidth}px`;
                progressLine.style.display = 'block';
            }
        }
    }
}

// Initialize the registration form when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.registrationForm = new RegistrationForm();
});

// Global functions for button onclick handlers
function nextStep(stepNumber){
    // Hide any previous errors
    hideGlobalError();
    document.querySelectorAll('.section-error').forEach(el => el.remove());

    // Validate current step before proceeding
    if (window.registrationForm && !window.registrationForm.validateStep(stepNumber)) {
        // Find first error message and scroll to it
        const firstError = document.querySelector('.error-message[style*="display: block"], .section-error, .input-wrapper.error');
        if (firstError) {
            firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
    }

    // Update form data before moving to next step
    if (window.registrationForm) {
        window.registrationForm.updateFormData(stepNumber);
    }

    // Hide current step
    const currentStepElement = document.getElementById(`step${stepNumber}`);
    if (currentStepElement) {
        currentStepElement.classList.remove('active');
    }

    // Show the next step
    const nextStepNumber = stepNumber + 1;
    const nextStepElement = document.getElementById(`step${nextStepNumber}`);
    if (nextStepElement) {
        nextStepElement.classList.add('active');
        // Scroll to top of the form
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Update current step and progress
    if (window.registrationForm) {
        window.registrationForm.currentStep = nextStepNumber;
        window.registrationForm.updateProgressBar();
    }
}

function prevStep(currentStepNumber) {
    // Don't go back if we're on the first step
    if (currentStepNumber <= 1) {
        return;
    }
    
    // Hide all steps first
    document.querySelectorAll('.registration-step').forEach(step => {
        step.classList.remove('active');
    });
    
    // Show the previous step
    const prevStepNumber = currentStepNumber - 1;
    const prevStepElement = document.getElementById(`step${prevStepNumber}`);
    if (prevStepElement) {
        prevStepElement.classList.add('active');
        // Scroll to top of the form
        prevStepElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        
        // Update current step and progress
        if (window.registrationForm) {
            window.registrationForm.currentStep = prevStepNumber;
            window.registrationForm.updateProgressBar();
        }
    }
}

function completeRegistration() {
    if (window.registrationForm) {
        // Update form data before submission
        window.registrationForm.updateFormData(4);
        window.registrationForm.submitForm();
    }
}

// Make registration form functions globally available after script loads
window.nextStep = nextStep;
window.prevStep = prevStep;
window.completeRegistration = completeRegistration;

// Export the functions for module usage
export { nextStep, prevStep, completeRegistration, RegistrationForm };