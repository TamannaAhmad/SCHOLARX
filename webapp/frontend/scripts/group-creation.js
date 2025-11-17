import groupsAPI from '../src/api/groups.js';
import projectsAPI from '../src/api/projects.js';
import { showError as showErr, hideError, showFieldError, hideFieldError, setButtonLoading, handleAPIError } from '../src/utils/errorHandler.js';

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('group-creation-form');
    const errorContainer = document.getElementById('error-container');
    const skillsInput = document.getElementById('skills-input');
    const skillsSuggestions = document.getElementById('skills-suggestions');
    const selectedSkillsContainer = document.getElementById('selected-skills');
    const createGroupBtn = document.querySelector('#create-group-btn');

    let allSkills = [];
    let selectedSkills = [];
    let selectedTopics = [];

    function showError(message) {
        if (errorContainer) {
            errorContainer.textContent = message;
            errorContainer.style.display = 'block';
        } else {
            showErr(message);
        }
        console.error(message);
    }

    function hideErrorMsg() {
        if (errorContainer) {
            errorContainer.textContent = '';
            errorContainer.style.display = 'none';
        }
    }

    function renderTopics() {
        selectedTopicsContainer.innerHTML = selectedTopics.map((topic, index) => `
            <div class="topic-tag">
                ${topic}
                <button type="button" class="remove-topic" data-index="${index}">&times;</button>
            </div>
        `).join('');

        // Add event listeners to remove buttons
        selectedTopicsContainer.querySelectorAll('.remove-topic').forEach(btn => {
            btn.addEventListener('click', function() {
                const index = parseInt(this.getAttribute('data-index'));
                selectedTopics.splice(index, 1);
                renderTopics();
            });
        });
    }



    // Skills functionality
    async function fetchSkills() {
        try {
            allSkills = await projectsAPI.fetchSkills();
            if (!allSkills || allSkills.length === 0) {
                console.warn('No skills found');
            }
        } catch (error) {
            console.error('Error fetching skills:', error);
        }
    }

    function renderSelectedSkills() {
        selectedSkillsContainer.innerHTML = '';
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

    function showSkillSuggestions(searchTerm) {
        skillsSuggestions.innerHTML = '';
        const filteredSkills = allSkills.filter(skill => 
            skill.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
            !selectedSkills.some(selected => selected.id === skill.id)
        );

        filteredSkills.forEach(skill => {
            const suggestionItem = document.createElement('div');
            suggestionItem.className = 'skill-suggestion';
            suggestionItem.textContent = skill.name;
            suggestionItem.addEventListener('click', () => {
                selectedSkills.push(skill);
                renderSelectedSkills();
                skillsInput.value = '';
                skillsSuggestions.innerHTML = '';
                hideFieldError(skillsInput);
            });
            skillsSuggestions.appendChild(suggestionItem);
        });

        skillsSuggestions.style.display = filteredSkills.length > 0 ? 'block' : 'none';
    }

    // Skills input handling
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
        if (!skillsInput.contains(e.target) && !skillsSuggestions.contains(e.target)) {
            skillsSuggestions.innerHTML = '';
            skillsSuggestions.style.display = 'none';
        }
    });

    // Initialize skills
    fetchSkills();

    // Validate form before submission
    function validateForm() {
        hideErrorMsg();
        
        // Clear all field errors
        document.querySelectorAll('.field-error').forEach(el => el.remove());
        document.querySelectorAll('.has-error').forEach(el => el.classList.remove('has-error'));

        const groupName = document.getElementById('group-name').value.trim();
        const subject = document.getElementById('subject').value.trim();
        const maxGroupSize = document.getElementById('max-group-size').value;
        const description = document.getElementById('group-description').value.trim();

        let isValid = true;

        // Validate group name
        if (!groupName) {
            showFieldError(document.getElementById('group-name'), 'Please enter a group name.');
            isValid = false;
        } else if (groupName.length < 3 || groupName.length > 100) {
            showFieldError(document.getElementById('group-name'), 'Group name must be between 3 and 100 characters.');
            isValid = false;
        }

        // Validate subject
        if (!subject) {
            showFieldError(document.getElementById('subject'), 'Please enter a subject area.');
            isValid = false;
        } else if (subject.length < 2 || subject.length > 100) {
            showFieldError(document.getElementById('subject'), 'Subject must be between 2 and 100 characters.');
            isValid = false;
        }

        // Validate description
        if (description && description.length > 1000) {
            showFieldError(document.getElementById('group-description'), 'Description must be less than 1000 characters.');
            isValid = false;
        }

        // Validate max group size
        const maxSize = parseInt(maxGroupSize);
        if (!maxGroupSize || isNaN(maxSize) || maxSize < 1 || maxSize > 5) {
            showFieldError(document.getElementById('max-group-size'), 'Maximum group size must be between 1 and 5.');
            isValid = false;
        }

        // Validate skills
        if (selectedSkills.length === 0) {
            showFieldError(skillsInput, 'Please select at least one required skill.');
            isValid = false;
        }

        return isValid;
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Validate form first
        if (!validateForm()) {
            return;
        }

        // Collect form data
        const groupData = {
            name: document.getElementById('group-name').value.trim(),
            course_code: document.getElementById('subject-code').value.trim(),
            subject_area: document.getElementById('subject').value.trim(),
            description: document.getElementById('group-description').value.trim(),
            max_size: parseInt(document.getElementById('max-group-size').value),
            required_skills: selectedSkills.map(skill => skill.id)
        };

        console.log('Submitting group data:', groupData);

        try {
            if (createGroupBtn) {
                setButtonLoading(createGroupBtn, true, 'Creating group...');
            }

            const response = await groupsAPI.createGroup(groupData);
            
            console.log('Create group response:', response);
            
            // Redirect to the newly created study group view
            if (response.group && response.group.group_id) {
                window.location.href = `study-group-view.html?id=${response.group.group_id}`;
            } else {
                showError('Group created, but unable to redirect.');
                if (createGroupBtn) setButtonLoading(createGroupBtn, false);
            }
        } catch (error) {
            console.error('Group creation error:', error);
            const errorMsg = handleAPIError(error, 'Failed to create study group. Please check your input and try again.');
            showError(errorMsg);
            if (createGroupBtn) setButtonLoading(createGroupBtn, false);
        }
    });
});
