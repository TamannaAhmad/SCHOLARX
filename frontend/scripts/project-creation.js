import projectsAPI from '../src/api/projects.js';
import { showError as showErr, hideError, showFieldError, hideFieldError, setButtonLoading, handleAPIError } from '../src/utils/errorHandler.js';

document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('project-creation-form');
    const skillsInput = document.getElementById('skills-input');
    const skillsSuggestions = document.getElementById('skills-suggestions');
    const selectedSkillsContainer = document.getElementById('selected-skills');
    const saveDraftBtn = document.getElementById('save-draft-btn');
    const createProjectBtn = document.getElementById('create-project-btn');
    const errorContainer = document.getElementById('error-container');

    let allSkills = []; // Store all skills globally
    let selectedSkills = []; // Store selected skills

    // Display error message
    function showError(message) {
        // Always show in the main error container
        if (errorContainer) {
            errorContainer.textContent = message;
            errorContainer.style.display = 'block';
            // Scroll to error container so user can see it
            errorContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
            showErr(message);
        }
        console.error(message);
    }

    // Hide error message
    function hideErrorMsg() {
        if (errorContainer) {
            errorContainer.textContent = '';
            errorContainer.style.display = 'none';
        }
    }

    // Render selected skills as tags
    function renderSelectedSkills() {
        selectedSkillsContainer.innerHTML = '';
        
        // Clear skills error when skills are added
        if (selectedSkills.length > 0) {
            const skillsInput = document.getElementById('skills-input');
            if (skillsInput) {
                hideFieldError(skillsInput);
            }
        }
        
        selectedSkills.forEach((skill, index) => {
            const skillTag = document.createElement('div');
            skillTag.className = 'skill-tag';
            skillTag.innerHTML = `
                <span>${skill.name}</span>
                <button type="button" class="remove-skill" data-index="${index}">&times;</button>
            `;
            selectedSkillsContainer.appendChild(skillTag);
        });

        // Add event listeners to remove buttons
        selectedSkillsContainer.querySelectorAll('.remove-skill').forEach(button => {
            button.addEventListener('click', function() {
                const index = parseInt(this.getAttribute('data-index'));
                selectedSkills.splice(index, 1);
                renderSelectedSkills();
            });
        });
    }

    // Show skill suggestions
    function showSkillSuggestions(searchTerm) {
        // Clear previous suggestions
        skillsSuggestions.innerHTML = '';

        // Filter skills based on search term
        const filteredSkills = allSkills.filter(skill => 
            skill.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
            !selectedSkills.some(selected => selected.id === skill.id)
        );

        // Show suggestions
        filteredSkills.forEach(skill => {
            const suggestionItem = document.createElement('div');
            suggestionItem.className = 'skill-suggestion';
            suggestionItem.textContent = skill.name;
            suggestionItem.addEventListener('click', () => {
                // Add skill to selected skills
                selectedSkills.push(skill);
                renderSelectedSkills();
                
                // Clear input and suggestions
                skillsInput.value = '';
                skillsSuggestions.innerHTML = '';
            });
            skillsSuggestions.appendChild(suggestionItem);
        });

        // Show/hide suggestions container
        skillsSuggestions.style.display = filteredSkills.length > 0 ? 'block' : 'none';
    }

    // Fetch skills from backend
    async function fetchSkills() {
        try {
            console.log('Fetching skills...');
            allSkills = await projectsAPI.fetchSkills();
            
            console.log('Skills fetched:', allSkills);
            
            if (!allSkills || allSkills.length === 0) {
                showError('No skills found. Please contact support.');
            }
        } catch (error) {
            console.error('Error fetching skills:', error);
            const errorMsg = handleAPIError(error, 'Failed to load skills. Please refresh the page.');
            showError(errorMsg);
        }
    }

    // Skills input event listeners
    skillsInput.addEventListener('input', function() {
        const searchTerm = this.value.trim();
        if (searchTerm) {
            showSkillSuggestions(searchTerm);
        } else {
            skillsSuggestions.innerHTML = '';
            skillsSuggestions.style.display = 'none';
        }
    });

    // Close suggestions when clicking outside
    document.addEventListener('click', function(e) {
        if (!skillsSuggestions.contains(e.target) && e.target !== skillsInput) {
            skillsSuggestions.innerHTML = '';
            skillsSuggestions.style.display = 'none';
        }
    });

    // Validate form before submission
    function validateForm() {
        hideErrorMsg();
        
        // Clear all field errors
        document.querySelectorAll('.field-error').forEach(el => el.remove());
        document.querySelectorAll('.has-error').forEach(el => el.classList.remove('has-error'));

        const projectTitle = document.getElementById('project-title').value.trim();
        const projectType = document.getElementById('project-type').value;
        const maxTeamSize = document.getElementById('max-team-size').value;
        const projectDeadline = document.getElementById('project-deadline').value;
        const projectDescription = document.getElementById('project-description').value.trim();

        let isValid = true;

        // Validate project title
        if (!projectTitle) {
            showFieldError(document.getElementById('project-title'), 'Please enter a project title.');
            isValid = false;
        } else if (projectTitle.length < 5 || projectTitle.length > 100) {
            showFieldError(document.getElementById('project-title'), 'Project title must be between 5 and 100 characters.');
            isValid = false;
        }

        // Validate project type
        if (!projectType) {
            showFieldError(document.getElementById('project-type'), 'Please select a project type.');
            isValid = false;
        }

        // Validate description
        if (projectDescription && projectDescription.length > 1000) {
            showFieldError(document.getElementById('project-description'), 'Description must be less than 1000 characters.');
            isValid = false;
        }

        // Validate skills
        if (selectedSkills.length === 0) {
            const skillsInput = document.getElementById('skills-input');
            if (skillsInput) {
                showFieldError(skillsInput, 'Please select at least one required skill.');
            } else {
                showError('Please select at least one required skill.');
            }
            isValid = false;
        } else {
            // Clear skills error if skills are selected
            const skillsInput = document.getElementById('skills-input');
            if (skillsInput) {
                hideFieldError(skillsInput);
            }
        }

        // Validate team size
        const teamSize = parseInt(maxTeamSize);
        if (!maxTeamSize || isNaN(teamSize) || teamSize < 1 || teamSize > 10) {
            showFieldError(document.getElementById('max-team-size'), 'Please enter a valid team size between 1 and 10.');
            isValid = false;
        }

        // Validate deadline
        if (!projectDeadline) {
            showFieldError(document.getElementById('project-deadline'), 'Please select a project deadline.');
            isValid = false;
        } else {
            const selectedDeadline = new Date(projectDeadline);
            const today = new Date();
            today.setHours(0, 0, 0, 0); // Reset time for fair comparison
            if (selectedDeadline <= today) {
                showFieldError(document.getElementById('project-deadline'), 'Project deadline must be in the future.');
                isValid = false;
            }
        }

        return isValid;
    }

    // Handle form submission
    async function submitProject(isDraft = false) {
        // Validate form first
        if (!validateForm()) {
            return;
        }

        // Collect form data
        const formData = {
            title: document.getElementById('project-title').value.trim(),
            type: document.getElementById('project-type').value,
            description: document.getElementById('project-description').value.trim(),
            required_skills: selectedSkills.map(skill => skill.id),
            max_team_size: parseInt(document.getElementById('max-team-size').value),
            deadline: document.getElementById('project-deadline').value,
            isDraft: isDraft
        };

        try {
            // Show loading state on appropriate button
            const activeBtn = isDraft ? saveDraftBtn : createProjectBtn;
            setButtonLoading(activeBtn, true, isDraft ? 'Saving draft...' : 'Creating project...');
            setButtonLoading(isDraft ? createProjectBtn : saveDraftBtn, true);

            // Choose appropriate API method based on draft status
            const result = isDraft 
                ? await projectsAPI.saveDraftProject(formData)
                : await projectsAPI.createProject(formData);

            // Show success message
            const successMsg = isDraft ? 'Project saved as draft!' : 'Project created successfully!';
            alert(successMsg);
            
            // Redirect to dashboard
            window.location.href = '/dashboard.html';
        } catch (error) {
            // Show detailed error message using handler
            const errorMsg = handleAPIError(error, 'An error occurred while submitting the project.');
            showError(errorMsg);
            
            // Re-enable buttons
            setButtonLoading(createProjectBtn, false);
            setButtonLoading(saveDraftBtn, false);
        }
    }

    // Event Listeners
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        submitProject(false); // Create project
    });

    saveDraftBtn.addEventListener('click', function() {
        submitProject(true); // Save as draft
    });

    // Initialize skills dropdown
    fetchSkills();

    // Max team size validation
    const maxTeamSizeInput = document.getElementById('max-team-size');
    maxTeamSizeInput.addEventListener('input', function() {
        const value = parseInt(this.value);
        if (value > 10) {
            this.value = 10;
        }
        if (value < 1) {
            this.value = 1;
        }
    });

    // Deadline validation (prevent past dates)
    const deadlineInput = document.getElementById('project-deadline');
    const today = new Date().toISOString().split('T')[0];
    deadlineInput.setAttribute('min', today);
});