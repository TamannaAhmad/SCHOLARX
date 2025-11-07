// API Configuration
const API_BASE_URL = 'http://127.0.0.1:8000/api/auth';

const authAPI = {
    async register(data) {
        try {
            console.log('Registering user with data:', data);
            
            // Get CSRF token first
            const csrfResponse = await fetch(`${API_BASE_URL}/csrf/`, {
                credentials: 'include'
            });
            
            if (!csrfResponse.ok) {
                console.error('Failed to get CSRF token:', csrfResponse.status, csrfResponse.statusText);
                throw new Error('Failed to get CSRF token');
            }
            
            const csrfData = await csrfResponse.json();
            console.log('Got CSRF token');
            
            const response = await fetch(`${API_BASE_URL}/register/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrfData.csrfToken,
                    'X-Requested-With': 'XMLHttpRequest',
                },
                credentials: 'include',
                body: JSON.stringify(data, (key, value) => {
                    // Handle circular references in the data
                    if (value instanceof Date) {
                        return value.toISOString();
                    }
                    return value;
                }, 2)  // Pretty print JSON for better readability
            });
            
            let responseData;
            try {
                responseData = await response.json();
            } catch (e) {
                console.error('Failed to parse JSON response:', e);
                throw new Error('Invalid response from server');
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
            usn: '',
            email: '',
            password: '',
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

        // Schedule functionality
        const scheduleCells = document.querySelectorAll('.schedule-cell');
        scheduleCells.forEach(cell => {
            cell.addEventListener('click', () => this.toggleScheduleCell(cell));
        });

        this.bindFormValidation();
    }

    bindFormValidation() {
        const step1Inputs = document.querySelectorAll('#step1 input');
        step1Inputs.forEach(input => {
            input.addEventListener('blur', () => this.validateField(input));
            input.addEventListener('input', () => this.clearError(input));
        });

        const step2Inputs = document.querySelectorAll('#step2 input, #step2 select');
        step2Inputs.forEach(input => {
            input.addEventListener('blur', () => this.validateField(input));
            input.addEventListener('change', () => this.clearError(input));
        });
    }

    validateField(field) {
        const value = field.value.trim();
        const fieldName = field.name;
        let isValid = true;
        let errorMessage = '';
    
        this.clearError(field);
    
        if (field.hasAttribute('required') && !value) {
            isValid = false;
            errorMessage = `${this.getFieldLabel(field)} is required.`;
        }
    
        switch (fieldName) {
            case 'name':
                if (value && value.trim().length === 0) {
                    isValid = false;
                    errorMessage = 'Name is required.';
                }
                break;
            case 'email':
                if (value && !this.isValidEmail(value)) {
                    isValid = false;
                    errorMessage = 'Please enter a valid email address.';
                }
                break;
            case 'usn':
                if (value && value.length !== 10) {
                    isValid = false;
                    errorMessage = 'USN must be exactly 10 characters.';
                }
                break;
            case 'password':
                if (value && value.length < 6) {
                    isValid = false;
                    errorMessage = 'Password must be at least 6 characters long.';
                }
                break;
            case 'confirmPassword':
                const password = document.getElementById('password');
                if (password && value && value !== password.value) {
                    isValid = false;
                    errorMessage = 'Passwords do not match.';
                }
                break;
            case 'linkedin':
                if (value && !this.isValidURL(value)) {
                    isValid = false;
                    errorMessage = 'Please enter a valid LinkedIn URL.';
                }
                break;
            case 'github':
                if (value && !this.isValidURL(value)) {
                    isValid = false;
                    errorMessage = 'Please enter a valid GitHub URL.';
                }
                break;
        }
    
        if (!isValid) {
            this.showError(field, errorMessage);
        }
        
        return isValid;
    }

    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    isValidURL(url) {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }

    getFieldLabel(field) {
        const label = document.querySelector(`label[for="${field.id}"]`);
        return label ? label.textContent : field.name;
    }

    showError(field, message) {
        if (typeof field === 'string') {
            // If first parameter is a string, treat it as a general error message
            this.showGeneralError(field);
            return;
        }
        
        field.classList.add('error');
        field.style.borderColor = '#EF4444';
        
        let errorDiv = field.parentNode.querySelector('.field-error');
        if (errorDiv) {
            errorDiv.remove();
        }
        
        errorDiv = document.createElement('div');
        errorDiv.className = 'field-error';
        errorDiv.textContent = message;
        
        const wrapper = field.closest('.input-wrapper') || field.closest('.select-wrapper');
        if (wrapper) {
            wrapper.parentNode.insertBefore(errorDiv, wrapper.nextSibling);
        } else {
            field.parentNode.insertBefore(errorDiv, field.nextSibling);
        }
    }
    
    showGeneralError(message) {
        let errorContainer = document.querySelector('.error-message');
        if (!errorContainer) {
            errorContainer = document.createElement('div');
            errorContainer.className = 'error-message';
            const form = document.querySelector('.registration-step.active');
            if (form) {
                form.insertBefore(errorContainer, form.firstChild);
            }
        }
        
        errorContainer.textContent = message;
        errorContainer.style.display = 'block';
        
        setTimeout(() => {
            errorContainer.style.display = 'none';
        }, 5000);
    }
    
    clearError(field) {
        field.classList.remove('error');
        field.style.borderColor = '';
        
        const formGroup = field.closest('.form-group');
        if (formGroup) {
            const errorDiv = formGroup.querySelector('.field-error');
            if (errorDiv) {
                errorDiv.remove();
            }
        }
    }

    validateStep(stepNumber) {
        const stepElement = document.getElementById(`step${stepNumber}`);
        if (!stepElement) return false;
        
        let isValid = true;
        const requiredInputs = stepElement.querySelectorAll('input[required], select[required]');
        
        requiredInputs.forEach(input => {
            if (!this.validateField(input)) {
                isValid = false;
            }
        });

        const existingErrors = stepElement.querySelectorAll('.section-error');
        existingErrors.forEach(error => error.remove());

        if (isValid) {
            switch(stepNumber) {
                case 1: {
                    const password = document.getElementById('password');
                    const confirmPassword = document.getElementById('confirmPassword');
                    if (password && confirmPassword && password.value !== confirmPassword.value) {
                        this.showError(confirmPassword, 'Passwords do not match.');
                        isValid = false;
                    }
                    break;
                }
                
                case 2: {
                    break;
                }
                    
                case 3: {
                    if (this.formData.skills.length === 0) {
                        const skillsSection = document.querySelector('.skills-section');
                        if (skillsSection) {
                            const errorDiv = document.createElement('div');
                            errorDiv.className = 'section-error';
                            errorDiv.style.color = '#EF4444';
                            errorDiv.style.marginTop = '0.5rem';
                            errorDiv.textContent = 'Please add at least one skill.';
                            skillsSection.appendChild(errorDiv);
                            isValid = false;
                        }
                    }
                    break;
                }
                
                case 4: {
                    this.updateAvailabilityFromSchedule();
                    if (this.formData.availability.length === 0) {
                        const scheduleSection = document.querySelector('.schedule-container');
                        if (scheduleSection) {
                            const errorDiv = document.createElement('div');
                            errorDiv.className = 'section-error';
                            errorDiv.style.color = '#EF4444';
                            errorDiv.style.marginTop = '1rem';
                            errorDiv.textContent = 'Please select at least one time slot for your availability.';
                            scheduleSection.appendChild(errorDiv);
                            isValid = false;
                        }
                    }
                    break;
                }
            }
        }
        
        return isValid;
    }
    
    addSkill(skillName) {
        if (!skillName) return;
        
        const skill = this.skills.find(s => 
            s.name.toLowerCase() === skillName.toLowerCase()
        );
        
        if (!skill) {
            this.showError('Please select a valid skill from the list');
            return;
        }
        
        // Check if skill already added
        if (this.formData.skills.some(s => s.skill_id === skill.id)) {
            this.showError('This skill has already been added');
            return;
        }
        
        const proficiencyLevel = document.getElementById('proficiencyLevel');
        const level = proficiencyLevel ? parseInt(proficiencyLevel.value) : 1;
        
        if (isNaN(level) || level < 0 || level > 5) {
            this.showError('Please select a valid proficiency level (0-5)');
            return;
        }
        
        const skillData = {
            skill_id: skill.id,
            proficiency_level: level
        };
        
        this.formData.skills.push(skillData);
        this.renderSkills();
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
            
            if (!skillObj) {
                return;
            }
            
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
        const nextHours = (hours + 2) % 24;
        return `${nextHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }
    
    updateFormData(stepNumber) {
        const form = document.querySelector(`#step${stepNumber} form`);
        if (!form) return;
        
        if (stepNumber === 1) {
            this.formData.email = document.getElementById('email')?.value || '';
            this.formData.password = document.getElementById('password')?.value || '';
            this.formData.password2 = document.getElementById('confirmPassword')?.value || '';
            
            // Split name into first and last name
            const fullName = document.getElementById('name')?.value || '';
            const nameParts = fullName.split(' ');
            this.formData.first_name = nameParts[0] || '';
            this.formData.last_name = nameParts.slice(1).join(' ') || '';
            
            this.formData.usn = document.getElementById('usn')?.value || '';
        } else if (stepNumber === 2) {
            const departmentId = document.getElementById('department')?.value;
            if (departmentId) {
                this.formData.department = departmentId; // Keep as string, will be parsed by serializer
            }
            this.formData.study_year = parseInt(document.getElementById('year')?.value || '1');
            this.formData.phone_number = document.getElementById('phone')?.value || '';
            
            // Update profile data
            this.formData.profile = {
                ...this.formData.profile,
                linkedin_url: document.getElementById('linkedin')?.value || '',
                github_url: document.getElementById('github')?.value || '',
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
            // Ensure all form data is up to date
            this.updateFormData(1);
            this.updateFormData(2);
            this.updateFormData(3);
            this.updateFormData(4);
            
            // Prepare the data for submission
            const submissionData = {
                ...this.formData,
                department: this.formData.department, // Keep as string, will be parsed by serializer
                study_year: parseInt(this.formData.study_year) || 1,
                profile: {
                    linkedin_url: this.formData.profile.linkedin_url || '',
                    github_url: this.formData.profile.github_url || '',
                    bio: this.formData.profile.bio || ''
                }
            };
            
            console.log('Submitting form data:', submissionData);
            
            const result = await authAPI.register(submissionData);
            
            if (result.ok) {
                console.log('Registration successful:', result.data);
                this.showSuccessStep();
            } else {
                console.error('Registration failed:', result);
                this.handleRegistrationError(result.data, result.status);
            }
        } catch (error) {
            console.error('Registration error:', error);
            this.showError(`An error occurred during registration: ${error.message || 'Please try again.'}`);
        }
    }

    handleRegistrationError(errorData, status) {
        console.log('Handling registration error:', { status, errorData });

        let errorMessage = 'Registration failed. Please check your information and try again.';

        if (status === 400) {
            const errors = [];

            // Handle nested profile errors
            if (errorData.profile) {
                Object.entries(errorData.profile).forEach(([field, messages]) => {
                    if (Array.isArray(messages)) {
                        errors.push(...messages);
                    } else if (typeof messages === 'string') {
                        errors.push(`${field}: ${messages}`);
                    } else if (typeof messages === 'object') {
                        Object.entries(messages).forEach(([subField, subMessages]) => {
                            if (Array.isArray(subMessages)) {
                                errors.push(...subMessages.map(m => `${field}.${subField}: ${m}`));
                            } else {
                                errors.push(`${field}.${subField}: ${subMessages}`);
                            }
                        });
                    }
                });
            }
            
            // Handle flat errors
            Object.entries(errorData).forEach(([field, messages]) => {
                if (field !== 'profile') { // Skip profile as we handled it above
                    if (Array.isArray(messages)) {
                        errors.push(...messages.map(m => `${field}: ${m}`));
                    } else if (typeof messages === 'string') {
                        errors.push(`${field}: ${messages}`);
                    } else if (typeof messages === 'object' && !Array.isArray(messages) && messages !== null) {
                        // Handle nested error objects
                        Object.entries(messages).forEach(([subField, subMessages]) => {
                            if (Array.isArray(subMessages)) {
                                errors.push(...subMessages.map(m => `${field}.${subField}: ${m}`));
                            } else {
                                errors.push(`${field}.${subField}: ${subMessages}`);
                            }
                        });
                    }
                }
            });

            if (errors.length > 0) {
                errorMessage = errors.join('; ');
            }
        } else if (status === 409) {
            errorMessage = errorData.message || 'A user with this email or USN already exists.';
        } else if (status === 500) {
            errorMessage = 'Server error occurred. Please try again later.';
        }

        this.showError(errorMessage);
    }

    updateProgressBar() {
        const steps = document.querySelectorAll('.progress-step');
        
        steps.forEach((step, index) => {
            const stepNumber = index + 1;
            
            if (stepNumber < this.currentStep) {
                step.classList.add('completed');
                step.classList.remove('active');
            } else if (stepNumber === this.currentStep) {
                step.classList.add('active');
                step.classList.remove('completed');
            } else {
                step.classList.remove('active', 'completed');
            }
        });
    }
    
    showStep(stepNumber) {
        // Hide all steps
        document.querySelectorAll('.registration-step').forEach(step => {
            step.classList.remove('active');
        });
        
        // Show current step
        const currentStep = document.getElementById(`step${stepNumber}`);
        if (currentStep) {
            currentStep.classList.add('active');
        }
        
        // Update current step
        this.currentStep = stepNumber;
        this.updateProgressBar();
    }
    
    showSuccessStep() {
        document.querySelectorAll('.registration-step').forEach(step => {
            step.classList.remove('active');
        });
        
        const successStep = document.getElementById('success');
        if (successStep) {
            successStep.classList.add('active');
        }
    }
}

// Initialize the registration form when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.registrationForm = new RegistrationForm();
});

// Global functions for button onclick handlers
function nextStep(stepNumber) {
    const registrationForm = window.registrationForm;
    if (registrationForm && registrationForm.validateStep(stepNumber)) {
        registrationForm.updateFormData(stepNumber);
        registrationForm.showStep(stepNumber + 1);
    }
}

function prevStep(stepNumber) {
    const registrationForm = window.registrationForm;
    if (registrationForm) {
        registrationForm.showStep(stepNumber - 1);
    }
}

function completeRegistration() {
    const registrationForm = window.registrationForm;
    if (registrationForm) {
        registrationForm.updateFormData(4);
        registrationForm.submitForm();
    }
}