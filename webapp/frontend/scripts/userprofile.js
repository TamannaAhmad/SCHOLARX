// User Profile JavaScript
const API_AUTH_BASE_URL = 'http://127.0.0.1:8000/api/auth';
const API_BASE_URL = 'http://127.0.0.1:8000/api';
let currentUserData = null;
let isOwnProfile = true;
let availableSkills = []; // Store available skills from database
let availableDepartments = []; // Store available departments from database

// Department names (matching what the user provided)
const DEPARTMENT_NAMES = [
    "Civil Engineering",
    "Computer Science and Business Systems",
    "Computer Science and Engineering",
    "Electronics and Communication Engineering",
    "Mechanical Engineering",
    "Artificial Intelligence and Data Science"
];

// Skill level names mapping
const skillLevelNames = {
    5: 'Master',
    4: 'Expert',
    3: 'Advanced',
    2: 'Intermediate',
    1: 'Novice',
    0: 'Beginner'
};

// Time slots for schedule (24-hour format)
const timeSlots = Array.from({length: 24}, (_, i) => `${i.toString().padStart(2, '0')}:00`);
const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// Helper function to get URL parameters
function getUrlParameter(name) {
    name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
    const regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
    const results = regex.exec(location.search);
    return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
}

// Initialize the page when DOM is loaded
document.addEventListener('DOMContentLoaded', async function() {
    try {
        // Initialize event listeners first
        setupEventListeners();
        
        // Check if user is logged in
        const token = localStorage.getItem('authToken');
        if (!token) {
            window.location.href = 'login.html';
            return;
        }

        // Check if we're viewing a specific user's profile
        const usn = getUrlParameter('usn');
        if (usn) {
            await fetchUserProfile(usn);
        } else {
            await fetchCurrentUserProfile();
        }
        
        // Load projects and study groups
        await loadUserProjectsAndGroups();
    } catch (error) {
        console.error('Error initializing profile:', error);
        showError('Failed to load profile. Please try again.');
    }
});

// Load projects and study groups for the current user
async function loadUserProjectsAndGroups() {
    try {
        showLoading(true);
        const token = localStorage.getItem('authToken');
        
        // Determine if we're viewing another user's profile
        const usn = getUrlParameter('usn');
        let userId = null;
        
        if (usn && currentUserData && currentUserData.usn !== usn) {
            // If viewing another user's profile, we need to get their user ID
            const userResponse = await fetch(`${API_AUTH_BASE_URL}/users/?usn=${encodeURIComponent(usn)}`, {
                headers: {
                    'Authorization': `Token ${token}`,
                    'Content-Type': 'application/json',
                },
                credentials: 'include'
            });
            
            if (userResponse.ok) {
                const users = await userResponse.json();
                if (users.length > 0) {
                    userId = users[0].id;
                }
            }
        }
        
        // Fetch projects where user is a member
        const projectsUrl = userId 
            ? `${API_BASE_URL}/projects/member-projects/${userId}/`
            : `${API_BASE_URL}/projects/member-projects/`;
            
        const projectsResponse = await fetch(projectsUrl, {
            headers: {
                'Authorization': `Token ${token}`,
                'Content-Type': 'application/json',
            },
            credentials: 'include'
        });
        
        if (projectsResponse.ok) {
            const projects = await projectsResponse.json();
            displayProjects(projects);
        } else {
            console.warn('Failed to fetch member projects');
        }
        
        // Fetch study groups where user is a member
        const groupsUrl = userId
            ? `${API_BASE_URL}/projects/groups/member-groups/${userId}/`
            : `${API_BASE_URL}/projects/groups/member-groups/`;
            
        const groupsResponse = await fetch(groupsUrl, {
            headers: {
                'Authorization': `Token ${token}`,
                'Content-Type': 'application/json',
            },
            credentials: 'include'
        });
        
        if (groupsResponse.ok) {
            const groups = await groupsResponse.json();
            displayStudyGroups(groups);
        } else {
            console.warn('Failed to fetch member study groups');
        }
        
    } catch (error) {
        console.error('Error loading projects and groups:', error);
    } finally {
        showLoading(false);
    }
}

// Display projects in the UI
function displayProjects(projects) {
    const projectsList = document.getElementById('projectsList');
    if (!projectsList) return;
    
    if (!projects || projects.length === 0) {
        projectsList.innerHTML = '<p class="no-items">No projects found</p>';
        return;
    }
    
    projectsList.innerHTML = projects.map(project => `
        <div class="project-item">
            <h3 class="project-title">${escapeHtml(project.title || 'Untitled Project')}</h3>
            <a href="project-view.html?id=${project.project_id}" class="project-link">View Details</a>
        </div>
    `).join('');
}

// Display study groups in the UI
function displayStudyGroups(groups) {
    const groupsList = document.getElementById('studyGroupsList');
    if (!groupsList) return;
    
    if (!groups || groups.length === 0) {
        groupsList.innerHTML = '<p class="no-items">No study groups found</p>';
        return;
    }
    
    groupsList.innerHTML = groups.map(group => `
        <div class="group-item">
            <h3 class="group-name">${escapeHtml(group.name || 'Untitled Group')}</h3>
            <a href="study-group-view.html?id=${group.group_id}" class="group-link">View Group</a>
        </div>
    `).join('');
}

// Helper function to escape HTML to prevent XSS
function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Fetch current user's profile
async function fetchCurrentUserProfile() {
    try {
        showLoading(true);
        const token = localStorage.getItem('authToken');
        if (!token) {
            window.location.href = 'login.html';
            return;
        }

        // Fetch current user's profile data
        const profileResponse = await fetch(`${API_AUTH_BASE_URL}/profile/`, {
            method: 'GET',
            headers: {
                'Authorization': `Token ${token}`,
                'Content-Type': 'application/json',
            },
            credentials: 'include'
        });

        if (!profileResponse.ok) {
            if (profileResponse.status === 401) {
                localStorage.removeItem('authToken');
                localStorage.removeItem('user');
                window.location.href = 'login.html';
                return;
            }
            throw new Error('Failed to fetch profile');
        }

        // Get user data (now includes profile fields)
        currentUserData = await profileResponse.json();
        
        // Fetch all pages of user skills
        let allSkills = [];
        let nextUrl = `${API_AUTH_BASE_URL}/user/skills/`;
        
        try {
            while (nextUrl) {
                const skillsResponse = await fetch(nextUrl, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Token ${token}`,
                        'Content-Type': 'application/json',
                    },
                    credentials: 'include'
                });
                
                if (!skillsResponse.ok) {
                    throw new Error(`Failed to fetch skills: ${skillsResponse.status}`);
                }
                
                const data = await skillsResponse.json();
                
                // Add the current page's results to our collection
                if (data.results) {
                    allSkills = [...allSkills, ...data.results];
                } else if (Array.isArray(data)) {
                    allSkills = [...allSkills, ...data];
                }
                
                // Check if there's another page
                nextUrl = data.next;
            }
            
            currentUserData.skills = allSkills;
        } catch (error) {
            console.warn('Error fetching skills:', error);
            currentUserData.skills = [];
        }
        
        // Fetch available skills from database
        await fetchAvailableSkills();
        
        // Fetch available departments from database
        await fetchAvailableDepartments();
        
        localStorage.setItem('user', JSON.stringify(currentUserData));
        initializeUserProfile();
    } catch (error) {
        console.error('Error fetching profile:', error);
        showError('Failed to load profile. Please try again.');
    } finally {
        showLoading(false);
    }
}

// Fetch a specific user's profile by USN
async function fetchUserProfile(usn) {
    try {
        showLoading(true);
        const token = localStorage.getItem('authToken');
        const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
        
        // Always fetch fresh data for the requested user
        const response = await fetch(`${API_AUTH_BASE_URL}/profile/${usn}/`, {
            method: 'GET',
            headers: {
                'Authorization': `Token ${token}`,
                'Content-Type': 'application/json',
            },
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error('User not found');
        }

        const data = await response.json();
        currentUserData = data;
        
        // Check if this is the current user's profile
        isOwnProfile = currentUser && currentUser.usn && 
                      currentUser.usn.toLowerCase() === usn.toLowerCase();
        
        initializeUserProfile();
    } catch (error) {
        console.error('Error fetching user profile:', error);
        showError('User not found or you do not have permission to view this profile.');
    } finally {
        showLoading(false);
    }
}

// Show loading state
function showLoading(isLoading) {
    const loadingElement = document.getElementById('loadingIndicator');
    const contentElement = document.getElementById('profileContent');
    
    if (loadingElement && contentElement) {
        loadingElement.style.display = isLoading ? 'block' : 'none';
        contentElement.style.display = isLoading ? 'none' : 'block';
    }
}

// Fetch available departments from database
async function fetchAvailableDepartments() {
    try {
        const token = localStorage.getItem('authToken');
        const departmentsResponse = await fetch(`${API_AUTH_BASE_URL}/departments/`, {
            method: 'GET',
            headers: {
                'Authorization': `Token ${token}`,
                'Content-Type': 'application/json',
            },
            credentials: 'include'
        });
        
        if (departmentsResponse.ok) {
            const data = await departmentsResponse.json();
            // Handle paginated response
            if (data.results) {
                availableDepartments = data.results;
            } else if (Array.isArray(data)) {
                availableDepartments = data;
            } else {
                availableDepartments = [];
            }
            console.log(`Loaded ${availableDepartments.length} available departments`);
            
            // If no departments from API, create from hardcoded list
            if (availableDepartments.length === 0) {
                availableDepartments = DEPARTMENT_NAMES.map((name, index) => ({
                    id: index + 1,
                    name: name
                }));
            }
            
            return availableDepartments;
        } else {
            console.warn('Failed to fetch available departments, using hardcoded list');
            // Use hardcoded list as fallback
            availableDepartments = DEPARTMENT_NAMES.map((name, index) => ({
                id: index + 1,
                name: name
            }));
            return availableDepartments;
        }
    } catch (error) {
        console.error('Error fetching available departments:', error);
        // Use hardcoded list as fallback
        availableDepartments = DEPARTMENT_NAMES.map((name, index) => ({
            id: index + 1,
            name: name
        }));
        return availableDepartments;
    }
}

// Fetch available skills from database (extracted function)
async function fetchAvailableSkills() {
    try {
        const token = localStorage.getItem('authToken');
        const availableSkillsResponse = await fetch(`${API_AUTH_BASE_URL}/skills/`, {
            method: 'GET',
            headers: {
                'Authorization': `Token ${token}`,
                'Content-Type': 'application/json',
            },
            credentials: 'include'
        });
        
        if (availableSkillsResponse.ok) {
            const data = await availableSkillsResponse.json();
            // Handle paginated response
            if (data.results) {
                availableSkills = data.results;
            } else if (Array.isArray(data)) {
                availableSkills = data;
            } else {
                availableSkills = [];
            }
            console.log(`Loaded ${availableSkills.length} available skills`);
            return availableSkills;
        } else {
            console.warn('Failed to fetch available skills:', availableSkillsResponse.status);
            availableSkills = [];
            return [];
        }
    } catch (error) {
        console.error('Error fetching available skills:', error);
        availableSkills = [];
        return [];
    }
}

// Show error message
function showError(message) {
    const errorElement = document.getElementById('errorMessage');
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.style.display = 'block';
    }
    
    // Also show a notification-style error
    const notification = document.createElement('div');
    notification.className = 'notification error';
    notification.textContent = message;
    notification.style.cssText = 'position: fixed; top: 20px; right: 20px; background: #f56565; color: white; padding: 1rem; border-radius: 0.5rem; z-index: 10000; box-shadow: 0 4px 6px rgba(0,0,0,0.1);';
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 5000);
}

// Initialize user profile data
function initializeUserProfile() {
    if (!currentUserData) {
        showError('No user data available');
        return;
    }

    populateUserInfo();
    populateSkills();
    populateSchedule();
    populateProjects();
    populateStudyGroups();
    
    // Show/hide edit buttons based on whether it's the user's own profile
    const editButtons = document.querySelectorAll('.edit-btn');
    editButtons.forEach(btn => {
        btn.style.display = isOwnProfile ? 'inline-block' : 'none';
    });
}

// Populate user information
function populateUserInfo() {
    if (!currentUserData) {
        console.error('No user data available');
        return;
    }

    const user = currentUserData;
    const profile = user.profile || user; // Handle both nested and flat profile data
    
    // Helper function to safely set element content
    const setElementText = (id, text, defaultValue = '') => {
        const element = document.getElementById(id);
        if (!element) return;
        
        const displayText = text || defaultValue;
        
        if (element.tagName === 'A') {
            // For links, set both href and text content
            if (text) {
                // Handle different URL formats
                let href = text;
                if (!href.match(/^https?:\/\//)) {
                    if (id === 'userLinkedIn') {
                        href = `https://linkedin.com/in/${text.replace(/^@/, '')}`;
                    } else if (id === 'userGitHub') {
                        href = `https://github.com/${text.replace(/^@/, '')}`;
                    } else if (text.includes('linkedin.com')) {
                        href = `https://${text.replace(/^https?:\/\//, '')}`;
                    } else if (text.includes('github.com')) {
                        href = `https://${text.replace(/^https?:\/\//, '')}`;
                    } else {
                        href = `https://${text}`;
                    }
                }
                
                element.href = href;
                element.textContent = text;
                element.style.display = 'inline-block';
                element.target = '_blank';
                element.rel = 'noopener noreferrer';
            } else {
                element.style.display = 'none';
            }
        } else {
            element.textContent = displayText;
        }
    };
    
    // Set page title with user's name or USN
    const displayName = profile.name || user.usn || 'User';
    document.title = `${displayName} - ScholarX`;
    
    // Basic info
    setElementText('userName', `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'User');
    setElementText('userUSN', user.usn, 'N/A');
    setElementText('userEmail', user.email, 'No email provided');
    
    // Department - set text content and store ID for dropdown
    const departmentEl = document.getElementById('userDepartment');
    if (departmentEl) {
        const departmentName = user.department?.name || 'Not specified';
        departmentEl.textContent = departmentName;
        if (user.department?.id) {
            departmentEl.setAttribute('data-department-id', user.department.id);
        }
        // Store department name for matching
        if (departmentName !== 'Not specified') {
            departmentEl.setAttribute('data-department-name', departmentName);
        }
    }
    
    // Year - set text content
    const yearEl = document.getElementById('userYear');
    if (yearEl) {
        const yearValue = user.study_year || 'N/A';
        yearEl.textContent = yearValue;
        if (user.study_year) {
            yearEl.setAttribute('data-year', user.study_year);
        }
    }
    
    // Social links
    const linkedInLink = document.getElementById('userLinkedIn');
    if (linkedInLink) {
        if (user.linkedin_url) {
            const formattedUrl = user.linkedin_url.startsWith('http') ? user.linkedin_url : 
                              user.linkedin_url.startsWith('linkedin.com') ? `https://${user.linkedin_url}` : 
                              `https://linkedin.com/in/${user.linkedin_url}`;
            linkedInLink.href = formattedUrl;
            linkedInLink.textContent = formattedUrl;
            linkedInLink.target = '_blank';
            linkedInLink.style.display = 'block';
        } else {
            linkedInLink.style.display = 'none';
        }
    }
    
    const gitHubLink = document.getElementById('userGitHub');
    if (gitHubLink) {
        if (user.github_url) {
            const formattedUrl = user.github_url.startsWith('http') ? user.github_url : 
                              user.github_url.startsWith('github.com') ? `https://${user.github_url}` : 
                              `https://github.com/${user.github_url}`;
            gitHubLink.href = formattedUrl;
            gitHubLink.textContent = formattedUrl;
            gitHubLink.target = '_blank';
            gitHubLink.style.display = 'block';
        } else {
            gitHubLink.style.display = 'none';
        }
    }
    
    // Bio
    const bioElement = document.getElementById('userBio');
    if (bioElement) {
        if (profile.bio) {
            bioElement.textContent = profile.bio;
            bioElement.style.display = 'block';
        } else {
            bioElement.style.display = 'none';
        }
    }
}

// Populate skills section
function populateSkills() {
    const skillsContainer = document.getElementById('skillsContainer');
    
    if (!skillsContainer) {
        console.error('Skills container not found in DOM!');
        return;
    }
    
    // Clear existing content
    skillsContainer.innerHTML = '';
    
    // Check if skills data exists
    if (!currentUserData) {
        skillsContainer.innerHTML = '<p>No user data available</p>';
        return;
    }
    
    if (!currentUserData.skills) {
        skillsContainer.innerHTML = '<p>No skills information available</p>';
        return;
    }
    
    const userSkills = currentUserData.skills;
    
    // Handle both array and paginated response formats
    let skillsArray = [];
    if (Array.isArray(userSkills)) {
        skillsArray = userSkills;
    } else if (userSkills.results && Array.isArray(userSkills.results)) {
        skillsArray = userSkills.results;
    }
    
    if (skillsArray.length === 0) {
        skillsContainer.innerHTML = '<p>No skills added yet</p>';
        return;
    }
    
    // Group skills by proficiency level
    const skillsByLevel = {};
    
    skillsArray.forEach((userSkill) => {
        const level = userSkill.proficiency_level || 0;
        if (!skillsByLevel[level]) {
            skillsByLevel[level] = [];
        }
        if (userSkill.skill_name) {
            skillsByLevel[level].push(userSkill); // Store full skill object, not just name
        }
    });
    
    // Sort levels in descending order (5 to 0)
    const sortedLevels = Object.keys(skillsByLevel)
        .map(Number)
        .sort((a, b) => b - a);
    
    if (sortedLevels.length === 0) {
        skillsContainer.innerHTML = '<p>No valid skills found</p>';
        return;
    }
    
    // Create skill groups for each level
    sortedLevels.forEach(level => {
        const levelSkills = skillsByLevel[level];
        
        if (levelSkills && levelSkills.length > 0) {
            // Create skill level group
            const skillGroup = document.createElement('div');
            skillGroup.className = 'skill-level-group';
            
            // Create skill level title
            const levelTitle = document.createElement('div');
            levelTitle.className = 'skill-level-title';
            levelTitle.textContent = `${skillLevelNames[level] || 'Unknown'} (Level ${level})`;
            skillGroup.appendChild(levelTitle);
            
            // Create skills list
            const skillsList = document.createElement('div');
            skillsList.className = 'skills-list';
            
            levelSkills.forEach(userSkill => {
                const skillChip = document.createElement('span');
                skillChip.className = 'skill-chip';
                skillChip.textContent = userSkill.skill_name;
                
                // Store skill data as attributes for editing
                // The UserSkill has an 'id' field (the UserSkill ID, not the Skill ID)
                const userSkillId = userSkill.id || userSkill.pk;
                if (userSkillId) {
                    skillChip.setAttribute('data-skill-id', userSkillId.toString());
                } else {
                    console.warn('Skill missing ID:', userSkill);
                }
                
                skillChip.setAttribute('data-skill-name', userSkill.skill_name || '');
                skillChip.setAttribute('data-skill-level', level.toString());
                
                // skill_id is the ID of the Skill itself (not UserSkill)
                const skillDbId = userSkill.skill_id || (userSkill.skill && userSkill.skill.id) || (userSkill.skill && userSkill.skill.pk);
                if (skillDbId) {
                    skillChip.setAttribute('data-skill-db-id', skillDbId.toString());
                }
                
                skillsList.appendChild(skillChip);
            });
            
            skillGroup.appendChild(skillsList);
            skillsContainer.appendChild(skillGroup);
        }
    });
}

// Populate schedule grid
function populateSchedule() {
    const scheduleGrid = document.getElementById('scheduleGrid');
    if (!scheduleGrid) {
        console.warn('Schedule grid element not found');
        return;
    }
    
    // Clear existing content
    scheduleGrid.innerHTML = '';
    
    // Remove any existing "no schedule" message
    const existingMessage = scheduleGrid.parentNode.querySelector('.no-schedule-message');
    if (existingMessage) {
        existingMessage.remove();
    }
    
    // Create a set of available slots for quick lookup
    const availableSlots = new Set();
    if (currentUserData.availability && currentUserData.availability.length > 0) {
        currentUserData.availability.forEach(slot => {
            if (slot.is_available) {
                const dayKey = dayKeys[slot.day_of_week];
                const startHour = parseInt(slot.time_slot_start.split(':')[0]);
                const endHour = parseInt(slot.time_slot_end.split(':')[0]);

                // Add all hours in the range to the set
                for (let i = startHour; i < endHour; i++) {
                    const time = `${i.toString().padStart(2, '0')}:00`;
                    availableSlots.add(`${dayKey}-${time}`);
                }
            }
        });
    }

    // Always render the grid, even if no schedule exists (so users can set schedule in edit mode)
    // Create empty cell for top-left corner
    const emptyCell = document.createElement('div');
    emptyCell.className = 'schedule-corner-cell';
    scheduleGrid.appendChild(emptyCell);
    
    // Create day headers
    days.forEach((day, index) => {
        const dayHeader = document.createElement('div');
        dayHeader.className = 'schedule-header-cell';
        dayHeader.textContent = day;
        dayHeader.title = dayKeys[index]; // Show full day name on hover
        scheduleGrid.appendChild(dayHeader);
    });
    
    // Create time slots and schedule cells
    timeSlots.forEach(timeSlot => {
        // Skip some time slots for better readability (e.g., show every 2 hours)
        const hour = parseInt(timeSlot.split(':')[0]);
        if (hour % 2 !== 0) return; // Only show even hours
        
        // Create time slot label
        const timeCell = document.createElement('div');
        timeCell.className = 'schedule-time-cell';
        timeCell.textContent = timeSlot;
        scheduleGrid.appendChild(timeCell);
        
        // Create schedule cells for each day
        days.forEach((day, dayIndex) => {
            const timeSlotCell = document.createElement('div');
            timeSlotCell.className = 'time-slot';
            
            // Check if this time slot is available
            const dayKey = dayKeys[dayIndex];
            const slotKey = `${dayKey}-${timeSlot}`;
            const isAvailable = availableSlots.has(slotKey);
            
            timeSlotCell.setAttribute('data-day', dayKey);
            timeSlotCell.setAttribute('data-time', timeSlot);
            
            if (isAvailable) {
                timeSlotCell.classList.add('available');
                timeSlotCell.classList.add('selected'); // Mark as selected for edit mode
                timeSlotCell.setAttribute('data-available', 'true');
            } else {
                timeSlotCell.setAttribute('data-available', 'false');
            }
            
            scheduleGrid.appendChild(timeSlotCell);
        });
    });
    
    // If no schedule exists, show a helpful message below the grid (but still show the grid)
    if (availableSlots.size === 0 && !document.body.classList.contains('edit-mode')) {
        // Only show message when not in edit mode
        const messageContainer = document.createElement('div');
        messageContainer.className = 'no-schedule-message';
        messageContainer.style.cssText = 'text-align: center; padding: 1rem; color: #6c757d; font-style: italic;';
        messageContainer.textContent = 'No schedule set yet. Click EDIT to set your availability.';
        scheduleGrid.parentNode.appendChild(messageContainer);
    }
    
    // Add some basic styling if not already present
    if (!document.getElementById('schedule-styles')) {
        const style = document.createElement('style');
        style.id = 'schedule-styles';
        style.textContent = `
            #scheduleGrid {
                display: grid;
                grid-template-columns: 60px repeat(7, 1fr);
                gap: 2px;
                max-width: 100%;
                overflow-x: auto;
            }
            .schedule-header-cell, .schedule-time-cell, .schedule-cell {
                padding: 8px;
                text-align: center;
                border: 1px solid #ddd;
            }
            .schedule-header-cell {
                background-color: #f5f5f5;
                font-weight: bold;
            }
            .schedule-time-cell {
                background-color: #f9f9f9;
                font-size: 0.9em;
            }
            .schedule-cell {
                min-height: 30px;
                background-color: #fff;
            }
            .schedule-cell.available {
                background-color: #d4edda;
                cursor: pointer;
            }
            .schedule-cell.available:hover {
                background-color: #c3e6cb;
            }`;
        document.head.appendChild(style);
    }
}

// Placeholder functions for projects and study groups
function populateProjects() {
    // This function is called but projects are loaded separately
    // in loadUserProjectsAndGroups()
}

function populateStudyGroups() {
    // This function is called but study groups are loaded separately
    // in loadUserProjectsAndGroups()
}

// Save profile changes
async function saveProfileChanges() {
    try {
        showLoading(true);
        const token = localStorage.getItem('authToken');
        const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
        
        if (!currentUser || !currentUser.usn) {
            throw new Error('User not logged in');
        }
        
        // Get all the editable fields from the UI
        const userNameEl = document.getElementById('userName');
        const userEmailEl = document.getElementById('userEmail');
        const userDepartmentEl = document.getElementById('userDepartment');
        const userYearEl = document.getElementById('userYear');
        const userLinkedInEl = document.getElementById('userLinkedIn');
        const userGitHubEl = document.getElementById('userGitHub');
        
        // Extract name (could be first_name last_name or just textContent)
        let firstName = '';
        let lastName = '';
        const nameText = userNameEl ? userNameEl.textContent.trim() : '';
        if (nameText) {
            const nameParts = nameText.split(' ');
            firstName = nameParts[0] || '';
            lastName = nameParts.slice(1).join(' ') || '';
        }
        
        // Extract department ID from dropdown or current data
        let departmentId = null;
        const departmentSelect = document.getElementById('userDepartmentSelect');
        if (departmentSelect && departmentSelect.value) {
            // Dropdown exists (edit mode)
            const deptValue = departmentSelect.value.trim();
            // Try to parse as integer (ID), if it fails, try to find by name
            const parsedId = parseInt(deptValue, 10);
            if (!isNaN(parsedId)) {
                departmentId = parsedId;
            } else {
                // Value is a name, find the department ID by name
                const dept = availableDepartments.find(d => d.name === deptValue) || 
                            DEPARTMENT_NAMES.map((name, idx) => ({ id: idx + 1, name })).find(d => d.name === deptValue);
                if (dept && dept.id) {
                    departmentId = parseInt(dept.id, 10);
                }
            }
        } else if (currentUserData && currentUserData.department && currentUserData.department.id) {
            // Fallback to current data (not in edit mode)
            departmentId = currentUserData.department.id;
        }
        
        // Extract year from dropdown or current data
        let year = null;
        const yearSelect = document.getElementById('userYearSelect');
        if (yearSelect) {
            // Dropdown exists (edit mode)
            year = yearSelect.value ? parseInt(yearSelect.value, 10) : null;
        } else if (userYearEl) {
            // Fallback to text content
            const yearText = userYearEl.textContent.trim();
            year = yearText && yearText !== 'N/A' ? parseInt(yearText, 10) : null;
        }
        
        // Extract LinkedIn URL
        let linkedinUrl = '';
        if (userLinkedInEl && userLinkedInEl.href) {
            linkedinUrl = userLinkedInEl.href;
        } else if (userLinkedInEl && userLinkedInEl.textContent.trim()) {
            const linkedinText = userLinkedInEl.textContent.trim();
            if (linkedinText.startsWith('http')) {
                linkedinUrl = linkedinText;
            } else {
                linkedinUrl = `https://linkedin.com/in/${linkedinText.replace(/^@/, '')}`;
            }
        }
        
        // Extract GitHub URL
        let githubUrl = '';
        if (userGitHubEl && userGitHubEl.href) {
            githubUrl = userGitHubEl.href;
        } else if (userGitHubEl && userGitHubEl.textContent.trim()) {
            const githubText = userGitHubEl.textContent.trim();
            if (githubText.startsWith('http')) {
                githubUrl = githubText;
            } else {
                githubUrl = `https://github.com/${githubText.replace(/^@/, '')}`;
            }
        }
        
        // Build data object
        const data = {
            first_name: firstName,
            last_name: lastName,
            email: userEmailEl ? userEmailEl.textContent.trim() : '',
        };
        
        // Add department_id if available
        if (departmentId) {
            data.department_id = departmentId;
        }
        
        // Add year if available
        if (year) {
            data.study_year = year;
        }
        
        // Add profile URLs
        if (linkedinUrl || githubUrl) {
            data.profile = {};
            if (linkedinUrl) {
                data.profile.linkedin_url = linkedinUrl;
            }
            if (githubUrl) {
                data.profile.github_url = githubUrl;
            }
        }
        
        // Get the USN from the URL or use the current user's USN
        const usn = getUrlParameter('usn') || currentUser.usn;
        
        // Update basic profile info
        const profileResponse = await fetch(`${API_AUTH_BASE_URL}/profile/${usn}/`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Token ${token}`,
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken')
            },
            body: JSON.stringify(data),
            credentials: 'include'
        });

        if (!profileResponse.ok) {
            const errorData = await profileResponse.json().catch(() => ({}));
            console.error('Error response:', errorData);
            throw new Error(errorData.detail || 'Failed to update profile');
        }

        // Update skills and availability if it's the user's own profile
        if (usn === currentUser.usn) {
            await updateUserSkills();
            await updateUserAvailability();
        }

        // Restore dropdowns back to text elements first (before refresh)
        restoreDepartmentFromDropdown();
        restoreYearFromDropdown();
        
        // Refresh profile data
        if (usn === currentUser.usn) {
            await fetchCurrentUserProfile();
        } else {
            await fetchUserProfile(usn);
        }
        
        showNotification('Profile updated successfully!');
        
    } catch (error) {
        console.error('Error updating profile:', error);
        showError(error.message || 'Failed to update profile. Please try again.');
        
        // Restore dropdowns even on error so UI is consistent
        restoreDepartmentFromDropdown();
        restoreYearFromDropdown();
    } finally {
        showLoading(false);
    }
}

// Update user skills
async function updateUserSkills() {
    try {
        const token = localStorage.getItem('authToken');
        if (!token) {
            throw new Error('Not authenticated');
        }

        // Get current user
        const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
        if (!currentUser || !currentUser.usn) {
            throw new Error('User not found');
        }

        const skillsContainer = document.getElementById('skillsContainer');
        if (!skillsContainer) {
            return true; // No skills container, nothing to update
        }

        // Collect all skill chips from the UI (both existing and new)
        const skillChips = skillsContainer.querySelectorAll('.skill-chip');
        const skillsInUI = new Map();
        const newSkillsInUI = [];
        
        skillChips.forEach(chip => {
            // Skip if it's still a new-skill form (not validated yet)
            if (chip.classList.contains('new-skill') && chip.querySelector('.new-skill-select')) {
                return; // Skip unvalidated forms
            }
            
            const skillId = chip.getAttribute('data-skill-id'); // UserSkill ID (may not exist for new skills)
            const skillName = chip.getAttribute('data-skill-name');
            const isNew = chip.getAttribute('data-is-new') === 'true';
            
            // Check if there's a level select dropdown (in edit mode), otherwise use data attribute
            const levelSelect = chip.querySelector('.skill-level-select');
            const skillLevel = levelSelect ? parseInt(levelSelect.value || '0', 10) : parseInt(chip.getAttribute('data-skill-level') || '0', 10);
            const skillDbId = chip.getAttribute('data-skill-db-id'); // The Skill ID from database
            
            if (skillName !== null && skillDbId) {
                if (isNew || !skillId) {
                    // This is a new skill that needs to be created
                    newSkillsInUI.push({
                        skill_id: parseInt(skillDbId, 10),
                        skill_name: skillName,
                        proficiency_level: skillLevel
                    });
                } else {
                    // Existing skill
                    skillsInUI.set(skillId, {
                        id: skillId,
                        skill_name: skillName,
                        proficiency_level: skillLevel,
                        skill_id: skillDbId
                    });
                }
            }
        });

        // Get existing skills from currentUserData
        const existingSkills = currentUserData.skills || [];
        let existingSkillsArray = [];
        if (Array.isArray(existingSkills)) {
            existingSkillsArray = existingSkills;
        } else if (existingSkills.results && Array.isArray(existingSkills.results)) {
            existingSkillsArray = existingSkills.results;
        }

        // Create a map of skill_db_id to skill for existing skills
        const existingSkillsMap = new Map();
        existingSkillsArray.forEach(skill => {
            const dbId = skill.skill_id || (skill.skill && skill.skill.id);
            if (dbId) {
                existingSkillsMap.set(dbId.toString(), skill);
            }
        });

        // Find skills to delete (in currentUserData but not in UI)
        const skillsToDelete = [];
        existingSkillsArray.forEach(skill => {
            const dbId = (skill.skill_id || (skill.skill && skill.skill.id))?.toString();
            if (dbId) {
                // Check if this skill exists in the UI by skill_db_id
                let existsInUI = false;
                skillsInUI.forEach(uiSkill => {
                    if (uiSkill.skill_id === dbId) {
                        existsInUI = true;
                    }
                });
                
                if (!existsInUI) {
                    skillsToDelete.push(skill);
                }
            }
        });

        // Find skills to update or create
        const updatePromises = [];
        
        // Delete removed skills
        for (const skill of skillsToDelete) {
            if (skill.id) {
                updatePromises.push(
                    fetch(`${API_AUTH_BASE_URL}/user/skills/${skill.id}/`, {
                        method: 'DELETE',
                        headers: {
                            'Authorization': `Token ${token}`,
                            'Content-Type': 'application/json',
                            'X-CSRFToken': getCookie('csrftoken')
                        },
                        credentials: 'include'
                    }).catch(err => {
                        console.warn(`Failed to delete skill ${skill.id}:`, err);
                    })
                );
            }
        }

        // Create new skills
        for (const newSkill of newSkillsInUI) {
            updatePromises.push(
                fetch(`${API_AUTH_BASE_URL}/user/skills/`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Token ${token}`,
                        'Content-Type': 'application/json',
                        'X-CSRFToken': getCookie('csrftoken')
                    },
                    body: JSON.stringify({
                        skill_id: newSkill.skill_id,
                        proficiency_level: newSkill.proficiency_level
                    }),
                    credentials: 'include'
                }).then(response => {
                    if (!response.ok) {
                        throw new Error(`Failed to create skill: ${newSkill.skill_name}`);
                    }
                    return response.json();
                })
            );
        }
        
        // Update existing skills
        for (const [skillId, skillData] of skillsInUI.entries()) {
            const existingSkill = existingSkillsArray.find(s => s.id?.toString() === skillId);
            
            if (existingSkill) {
                // Update existing skill if level changed
                if (existingSkill.proficiency_level !== skillData.proficiency_level) {
                    updatePromises.push(
                        fetch(`${API_AUTH_BASE_URL}/user/skills/${skillId}/`, {
                            method: 'PATCH',
                            headers: {
                                'Authorization': `Token ${token}`,
                                'Content-Type': 'application/json',
                                'X-CSRFToken': getCookie('csrftoken')
                            },
                            body: JSON.stringify({
                                proficiency_level: skillData.proficiency_level
                            }),
                            credentials: 'include'
                        }).then(response => {
                            if (!response.ok) {
                                throw new Error(`Failed to update skill: ${skillData.skill_name}`);
                            }
                            return response.json();
                        })
                    );
                }
            } else {
                // This shouldn't happen if skills are properly initialized, but handle it
                console.warn(`Skill ${skillData.skill_name} found in UI but not in data`);
            }
        }

        await Promise.all(updatePromises);
        return true;
    } catch (error) {
        console.error('Error updating skills:', error);
        throw error;
    }
}

// Helper function to get the next time slot
function getNextTimeSlot(time) {
    const [hours] = time.split(':').map(Number);
    const nextHour = (hours + 1) % 24;
    return `${nextHour.toString().padStart(2, '0')}:00`;
}

// Update user availability/schedule
async function updateUserAvailability() {
    try {
        const scheduleGrid = document.getElementById('scheduleGrid');
        if (!scheduleGrid) return true; // If no schedule grid, nothing to update
        
        // Get all time slots (both selected and available)
        const allTimeSlots = scheduleGrid.querySelectorAll('.time-slot');
        
        // Group selected/available slots by day
        const slotsByDay = {};
        
        allTimeSlots.forEach(cell => {
            const day = cell.getAttribute('data-day');
            const time = cell.getAttribute('data-time');
            const isSelected = cell.classList.contains('selected');
            const isAvailable = cell.getAttribute('data-available') === 'true';
            
            // Include if selected or marked as available
            if (isSelected || isAvailable) {
                if (!slotsByDay[day]) {
                    slotsByDay[day] = [];
                }
                slotsByDay[day].push(time);
            }
        });
        
        // Convert to availability format
        const availability = [];
        const dayMap = {
            'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3,
            'thursday': 4, 'friday': 5, 'saturday': 6
        };
        
        for (const [day, times] of Object.entries(slotsByDay)) {
            if (!times || times.length === 0) continue;
            
            // Sort times
            times.sort();
            
            // Remove duplicates
            const uniqueTimes = [...new Set(times)];
            
            // Group consecutive times into ranges
            if (uniqueTimes.length > 0) {
                let startTime = uniqueTimes[0];
                let prevTime = uniqueTimes[0];
                
                for (let i = 1; i < uniqueTimes.length; i++) {
                    const currentTime = uniqueTimes[i];
                    const currentHour = parseInt(currentTime.split(':')[0]);
                    const prevHour = parseInt(prevTime.split(':')[0]);
                    
                    if (currentHour !== prevHour + 1) {
                        // End of consecutive hours, add to availability
                        availability.push({
                            day_of_week: dayMap[day],
                            time_slot_start: startTime,
                            time_slot_end: getNextTimeSlot(prevTime),
                            is_available: true
                        });
                        startTime = currentTime;
                    }
                    prevTime = currentTime;
                }
                
                // Add the last slot
                availability.push({
                    day_of_week: dayMap[day],
                    time_slot_start: startTime,
                    time_slot_end: getNextTimeSlot(prevTime),
                    is_available: true
                });
            }
        }
        
        // Get auth token
        const token = localStorage.getItem('authToken');
        if (!token) {
            throw new Error('Not authenticated');
        }
        
        // Get current user
        const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
        if (!currentUser || !currentUser.usn) {
            throw new Error('User not found');
        }
        
        // Delete all existing availability entries first
        const existingAvailability = currentUserData.availability || [];
        if (existingAvailability.length > 0) {
            const deletePromises = existingAvailability.map(async (slot) => {
                if (slot.id) {
                    try {
                        const deleteResponse = await fetch(`${API_AUTH_BASE_URL}/user/availability/${slot.id}/`, {
                            method: 'DELETE',
                            headers: {
                                'Authorization': `Token ${token}`,
                                'Content-Type': 'application/json',
                                'X-CSRFToken': getCookie('csrftoken')
                            },
                            credentials: 'include'
                        });
                        
                        if (!deleteResponse.ok && deleteResponse.status !== 404) {
                            console.warn(`Failed to delete availability slot ${slot.id}:`, deleteResponse.status, deleteResponse.statusText);
                        }
                    } catch (err) {
                        console.warn(`Error deleting availability slot ${slot.id}:`, err);
                    }
                }
            });
            
            // Wait for all deletions to complete before creating new entries
            await Promise.all(deletePromises);
            
            // Small delay to ensure database cleanup completes
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Create new availability entries with proper time format (HH:MM:SS)
        // Process sequentially to avoid race conditions and duplicate key errors
        const createdSlots = [];
        for (const slot of availability) {
            // Ensure time format includes seconds (HH:MM:SS)
            const formattedSlot = {
                ...slot,
                time_slot_start: slot.time_slot_start.includes(':') && slot.time_slot_start.split(':').length === 2 
                    ? `${slot.time_slot_start}:00` 
                    : slot.time_slot_start,
                time_slot_end: slot.time_slot_end.includes(':') && slot.time_slot_end.split(':').length === 2 
                    ? `${slot.time_slot_end}:00` 
                    : slot.time_slot_end
            };
            
            try {
                const response = await fetch(`${API_AUTH_BASE_URL}/user/availability/`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Token ${token}`,
                        'Content-Type': 'application/json',
                        'X-CSRFToken': getCookie('csrftoken')
                    },
                    body: JSON.stringify(formattedSlot),
                    credentials: 'include'
                });
                
                if (!response.ok) {
                    // Try to get the actual error message from the response
                    let errorMessage = 'Failed to create availability slot';
                    let errorData = null;
                    let errorText = '';
                    
                    try {
                        // First try to get as text (in case it's HTML error page)
                        errorText = await response.text();
                        try {
                            errorData = JSON.parse(errorText);
                        } catch (e) {
                            // If not JSON, it might be HTML error page
                            console.warn('Availability error response is not JSON, likely HTML error page');
                            // Try to extract error from HTML if possible
                            const htmlMatch = errorText.match(/<h[12]>(.*?)<\/h[12]>/i);
                            if (htmlMatch) {
                                errorMessage = htmlMatch[1];
                            }
                        }
                        
                        if (errorData) {
                            console.error('Availability error response (JSON):', errorData);
                            
                            // Extract validation errors
                            if (errorData.non_field_errors) {
                                errorMessage = errorData.non_field_errors.join(', ');
                            } else if (errorData.detail) {
                                errorMessage = errorData.detail;
                            } else {
                                // Collect all field errors
                                const fieldErrors = Object.entries(errorData)
                                    .map(([field, errors]) => `${field}: ${Array.isArray(errors) ? errors.join(', ') : errors}`)
                                    .join('; ');
                                if (fieldErrors) {
                                    errorMessage = fieldErrors;
                                }
                            }
                        }
                    } catch (e) {
                        // If response is not JSON, use status text
                        errorMessage = `${errorMessage} (${response.status} ${response.statusText})`;
                        console.error('Error parsing availability error response:', e);
                    }
                    
                    // Check if it's a duplicate/constraint error (might already exist)
                    const errorStr = (errorData ? JSON.stringify(errorData) : errorText).toLowerCase();
                    if (response.status === 400 || response.status === 500) {
                        if (errorStr.includes('unique') || errorStr.includes('already exists') || errorStr.includes('duplicate') || errorStr.includes('integrity')) {
                            console.warn(`Availability slot may already exist or conflict, skipping: ${JSON.stringify(formattedSlot)}`);
                            continue; // Skip this slot and continue
                        }
                        if (errorStr.includes('validationerror') || errorStr.includes('validation error')) {
                            // Validation error - log details but continue
                            console.warn(`Validation error for slot (may be invalid range or duplicate): ${errorMessage}`, formattedSlot);
                            continue; // Skip invalid slot
                        }
                    }
                    
                    // For other errors, log but continue (some slots might have succeeded)
                    console.warn(`Error creating availability slot (${response.status}): ${errorMessage}`, formattedSlot);
                    // Don't throw - continue processing other slots
                } else {
                    const createdSlot = await response.json();
                    createdSlots.push(createdSlot);
                }
            } catch (err) {
                console.error('Exception creating availability slot:', err, formattedSlot);
                // Continue processing other slots
            }
        }
        
        // Log summary of what was created
        if (createdSlots.length > 0) {
            console.log(`Successfully created ${createdSlots.length} out of ${availability.length} availability slots`);
        }
        if (createdSlots.length < availability.length) {
            const failed = availability.length - createdSlots.length;
            console.warn(`${failed} availability slot(s) failed to create (may be duplicates or validation errors)`);
            // Only show a warning if a significant portion failed
            if (failed > availability.length * 0.5) {
                showError('Warning: Some availability slots could not be saved. Please check your schedule.');
            }
        }
        
        return true;
    } catch (error) {
        console.error('Error updating availability:', error);
        showError('Failed to update availability. Please try again.');
        return false;
    }
}

// Helper function to get cookie by name
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

// Show notification
function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification success';
    notification.textContent = message;
    notification.style.cssText = 'position: fixed; top: 20px; right: 20px; background: #48bb78; color: white; padding: 1rem; border-radius: 0.5rem; z-index: 10000; box-shadow: 0 4px 6px rgba(0,0,0,0.1);';
    
    document.body.appendChild(notification);
    
    // Remove notification after 3 seconds
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Convert department field to dropdown
function convertDepartmentToDropdown() {
    const departmentEl = document.getElementById('userDepartment');
    if (!departmentEl) return;
    
    // Get current department info
    const currentDeptId = departmentEl.getAttribute('data-department-id');
    const currentDeptName = departmentEl.getAttribute('data-department-name') || departmentEl.textContent.trim();
    
    // Create select dropdown
    const select = document.createElement('select');
    select.id = 'userDepartmentSelect';
    select.className = 'department-select';
    select.style.cssText = 'width: 100%; padding: 0.5rem; border: 2px solid #dee2e6; border-radius: 0.25rem; font-size: 1rem; background-color: #f8f9fa; cursor: pointer;';
    
    // Add default option
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Select Department';
    if (!currentDeptId && !currentDeptName) {
        defaultOption.selected = true;
    }
    select.appendChild(defaultOption);
    
    // Add department options
    const departmentsToUse = availableDepartments.length > 0 ? availableDepartments : DEPARTMENT_NAMES.map((name, index) => ({ id: index + 1, name }));
    
    departmentsToUse.forEach(dept => {
        const option = document.createElement('option');
        option.value = dept.id || dept.name;
        option.textContent = dept.name;
        // Select current department by ID or name match
        if (currentDeptId && dept.id && parseInt(currentDeptId) === parseInt(dept.id)) {
            option.selected = true;
        } else if (!currentDeptId && dept.name === currentDeptName && currentDeptName !== 'Not specified') {
            option.selected = true;
        }
        select.appendChild(option);
    });
    
    // Replace the text element with select
    departmentEl.parentNode.replaceChild(select, departmentEl);
}

// Convert year field to dropdown
function convertYearToDropdown() {
    const yearEl = document.getElementById('userYear');
    if (!yearEl) return;
    
    // Get current year
    const currentYear = yearEl.getAttribute('data-year') || (yearEl.textContent.trim() !== 'N/A' ? parseInt(yearEl.textContent.trim()) : null);
    
    // Create select dropdown
    const select = document.createElement('select');
    select.id = 'userYearSelect';
    select.className = 'year-select';
    select.style.cssText = 'width: 100%; padding: 0.5rem; border: 2px solid #dee2e6; border-radius: 0.25rem; font-size: 1rem; background-color: #f8f9fa; cursor: pointer;';
    
    // Add default option
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Select Year';
    if (!currentYear) {
        defaultOption.selected = true;
    }
    select.appendChild(defaultOption);
    
    // Add year options (typically 1-4 for undergraduate)
    for (let year = 1; year <= 4; year++) {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        if (currentYear && parseInt(currentYear) === year) {
            option.selected = true;
        }
        select.appendChild(option);
    }
    
    // Store the original element reference for restoration
    select.setAttribute('data-original-id', 'userYear');
    
    // Replace the text element with select
    yearEl.parentNode.replaceChild(select, yearEl);
}

// Restore department field from dropdown to text
function restoreDepartmentFromDropdown() {
    const departmentSelect = document.getElementById('userDepartmentSelect');
    if (!departmentSelect) return;
    
    // Get selected value
    const selectedValue = departmentSelect.value;
    let displayText = 'Not specified';
    let departmentId = null;
    let departmentName = null;
    
    if (selectedValue) {
        // Find the selected department
        const departmentsToUse = availableDepartments.length > 0 ? availableDepartments : DEPARTMENT_NAMES.map((name, index) => ({ id: index + 1, name }));
        const selectedDept = departmentsToUse.find(dept => 
            (dept.id && dept.id.toString() === selectedValue) || dept.name === selectedValue
        );
        
        if (selectedDept) {
            displayText = selectedDept.name;
            departmentId = selectedDept.id;
            departmentName = selectedDept.name;
        }
    }
    
    // Create new text element
    const textEl = document.createElement('div');
    textEl.id = 'userDepartment';
    textEl.className = 'info-value';
    textEl.textContent = displayText;
    if (departmentId) {
        textEl.setAttribute('data-department-id', departmentId);
    }
    if (departmentName) {
        textEl.setAttribute('data-department-name', departmentName);
    }
    
    // Replace select with text element
    departmentSelect.parentNode.replaceChild(textEl, departmentSelect);
}

// Restore year field from dropdown to text
function restoreYearFromDropdown() {
    const yearSelect = document.getElementById('userYearSelect');
    if (!yearSelect) return;
    
    // Get selected value
    const selectedValue = yearSelect.value;
    const displayText = selectedValue || 'N/A';
    
    // Create new text element
    const textEl = document.createElement('div');
    textEl.id = 'userYear';
    textEl.className = 'info-value';
    textEl.textContent = displayText;
    if (selectedValue) {
        textEl.setAttribute('data-year', selectedValue);
    }
    
    // Replace select with text element
    yearSelect.parentNode.replaceChild(textEl, yearSelect);
}

// Make a field editable
function makeEditable(fieldId) {
    const field = document.getElementById(fieldId);
    if (!field) return;
    
    field.contentEditable = true;
    field.focus();
    
    // Select all text for easier editing
    const range = document.createRange();
    range.selectNodeContents(field);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
}

// Enable or disable skill edit mode
function setSkillEditMode(enabled) {
    const skillsContainer = document.getElementById('skillsContainer');
    if (!skillsContainer) {
        console.warn('Skills container not found');
        return;
    }
    
    if (enabled) {
        // Enable editing
        skillsContainer.classList.add('editing');
        
        // Add edit controls to each skill
        const skillChips = skillsContainer.querySelectorAll('.skill-chip[data-skill-id]');
        console.log(`Found ${skillChips.length} skill chips with data-skill-id`);
        
        if (skillChips.length === 0) {
            // Try to find all skill chips to see if they exist
            const allChips = skillsContainer.querySelectorAll('.skill-chip');
            console.log(`Total skill chips found: ${allChips.length}`);
            allChips.forEach(chip => {
                console.log('Skill chip:', {
                    hasId: chip.hasAttribute('data-skill-id'),
                    id: chip.getAttribute('data-skill-id'),
                    name: chip.getAttribute('data-skill-name'),
                    level: chip.getAttribute('data-skill-level')
                });
            });
        }
        
        skillChips.forEach(chip => {
            // Remove existing controls if any
            const existingControls = chip.querySelector('.skill-edit-controls');
            if (existingControls) {
                existingControls.remove();
            }
            
            const controls = document.createElement('div');
            controls.className = 'skill-edit-controls';
            
            const levelSelect = document.createElement('select');
            levelSelect.className = 'skill-level-select';
            
            // Get current skill level
            const currentLevel = parseInt(chip.getAttribute('data-skill-level') || '0', 10);
            
            // Add proficiency levels
            for (let i = 0; i <= 5; i++) {
                const option = document.createElement('option');
                option.value = i;
                option.textContent = `${skillLevelNames[i]} (${i})`;
                if (i === currentLevel) {
                    option.selected = true;
                }
                levelSelect.appendChild(option);
            }
            
            // Update data attribute and sync with backend when level changes
            levelSelect.addEventListener('change', async (e) => {
                const newLevel = parseInt(e.target.value, 10);
                const skillId = chip.getAttribute('data-skill-id');
                chip.setAttribute('data-skill-level', newLevel);
                
                // If this is an existing skill, update it in the backend
                if (skillId) {
                    try {
                        const token = localStorage.getItem('authToken');
                        if (!token) throw new Error('Not authenticated');
                        
                        const response = await fetch(`${API_AUTH_BASE_URL}/user/skills/${skillId}/`, {
                            method: 'PATCH',
                            headers: {
                                'Authorization': `Token ${token}`,
                                'Content-Type': 'application/json',
                                'X-CSRFToken': getCookie('csrftoken')
                            },
                            body: JSON.stringify({
                                proficiency_level: newLevel
                            }),
                            credentials: 'include'
                        });
                        
                        if (!response.ok) {
                            throw new Error(`Failed to update skill level: ${response.statusText}`);
                        }
                        
                        showNotification('Skill level updated successfully');
                        
                    } catch (error) {
                        console.error('Error updating skill level:', error);
                        showNotification('Failed to update skill level', 'error');
                        // Revert the UI to the previous state
                        const previousLevel = chip.getAttribute('data-skill-level');
                        levelSelect.value = previousLevel;
                    }
                }
            });
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-skill';
            deleteBtn.textContent = '×';
            deleteBtn.title = 'Delete skill';
            deleteBtn.onclick = async (e) => {
                e.stopPropagation();
                // Store the skill ID before removing for error handling
                const skillId = chip.getAttribute('data-skill-id');
                
                try {
                    // First, try to delete from the backend
                    const token = localStorage.getItem('authToken');
                    if (!token) throw new Error('Not authenticated');
                    
                    // If this is an existing skill (has a skill ID), delete it from the backend
                    if (skillId) {
                        const response = await fetch(`${API_AUTH_BASE_URL}/user/skills/${skillId}/`, {
                            method: 'DELETE',
                            headers: {
                                'Authorization': `Token ${token}`,
                                'X-CSRFToken': getCookie('csrftoken')
                            },
                            credentials: 'include'
                        });
                        
                        if (!response.ok) {
                            throw new Error(`Failed to delete skill: ${response.statusText}`);
                        }
                    }
                    
                    // If successful, remove from UI
                    chip.remove();
                    showNotification('Skill deleted successfully');
                    
                } catch (error) {
                    console.error('Error deleting skill:', error);
                    showNotification('Failed to delete skill', 'error');
                    // Reload the profile to restore the correct state
                    await fetchCurrentUserProfile();
                }
            };
            
            controls.appendChild(levelSelect);
            controls.appendChild(deleteBtn);
            chip.appendChild(controls);
        });
        
        // Add "Add Skill" button if it doesn't exist
        if (!document.getElementById('addSkillBtn')) {
            const addBtn = document.createElement('button');
            addBtn.id = 'addSkillBtn';
            addBtn.className = 'add-skill-btn no-ripple'; // Add no-ripple to prevent interference
            addBtn.textContent = '+ Add Skill';
            addBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                addNewSkill();
            });
            skillsContainer.appendChild(addBtn);
        }
    } else {
        // Disable editing
        skillsContainer.classList.remove('editing');
        
        // Remove edit controls
        const controls = skillsContainer.querySelectorAll('.skill-edit-controls');
        controls.forEach(control => control.remove());
        
        const addBtn = document.getElementById('addSkillBtn');
        if (addBtn) addBtn.remove();
    }
}

// Add a new skill
function addNewSkill() {
    console.log('addNewSkill called');
    const skillsContainer = document.getElementById('skillsContainer');
    if (!skillsContainer) {
        console.error('Skills container not found');
        return;
    }
    
    // Check if available skills are loaded
    if (!availableSkills || availableSkills.length === 0) {
        console.warn('No available skills loaded, attempting to fetch...');
        showError('Skills are still loading. Please try again in a moment.');
        // Try to fetch skills if not loaded
        fetchAvailableSkills().then(() => {
            // Retry after fetching
            setTimeout(() => addNewSkill(), 500);
        }).catch(err => {
            console.error('Failed to fetch skills:', err);
            showError('Failed to load available skills. Please refresh the page.');
        });
        return;
    }
    
    // Get current user's skill IDs to filter them out
    const currentUserSkillIds = new Set();
    const existingChips = skillsContainer.querySelectorAll('.skill-chip[data-skill-db-id]');
    existingChips.forEach(chip => {
        const skillDbId = chip.getAttribute('data-skill-db-id');
        if (skillDbId) {
            currentUserSkillIds.add(parseInt(skillDbId, 10));
        }
    });
    
    // Filter out skills user already has
    const availableSkillsList = availableSkills.filter(skill => 
        !currentUserSkillIds.has(skill.id)
    );
    
    if (availableSkillsList.length === 0) {
        showError('No more skills available to add. You have all available skills.');
        return;
    }
    
    // Create a new skill chip
    const chip = document.createElement('div');
    chip.className = 'skill-chip new-skill';
    
    // Create skill select dropdown
    const skillSelect = document.createElement('select');
    skillSelect.className = 'new-skill-select';
    skillSelect.innerHTML = '<option value="">-- Select a skill --</option>';
    
    availableSkillsList.forEach(skill => {
        const option = document.createElement('option');
        option.value = skill.id;
        option.textContent = skill.name;
        skillSelect.appendChild(option);
    });
    
    // Create proficiency level select
    const levelSelect = document.createElement('select');
    levelSelect.className = 'new-skill-level';
    Object.entries(skillLevelNames).forEach(([level, name]) => {
        const option = document.createElement('option');
        option.value = level;
        option.textContent = `${name} (${level})`;
        levelSelect.appendChild(option);
    });
    
    // Create validate button (validates and converts to pending skill, doesn't save)
    const validateBtn = document.createElement('button');
    validateBtn.className = 'validate-new-skill';
    validateBtn.textContent = '✓';
    validateBtn.title = 'Validate (will be saved with profile)';
    validateBtn.addEventListener('click', () => validateNewSkill(chip));
    
    // Create cancel button
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'cancel-new-skill';
    cancelBtn.textContent = '×';
    cancelBtn.title = 'Cancel';
    cancelBtn.addEventListener('click', () => chip.remove());
    
    chip.appendChild(skillSelect);
    chip.appendChild(levelSelect);
    chip.appendChild(validateBtn);
    chip.appendChild(cancelBtn);
    
    skillsContainer.insertBefore(chip, document.getElementById('addSkillBtn'));
    skillSelect.focus();
}

// Validate and convert a new skill form to a pending skill chip
function validateNewSkill(chip) {
    const skillSelect = chip.querySelector('.new-skill-select');
    const levelSelect = chip.querySelector('.new-skill-level');
    
    const skillId = skillSelect ? skillSelect.value : null;
    const level = levelSelect ? levelSelect.value : null;
    
    if (!skillId) {
        showError('Please select a skill');
        return;
    }
    
    if (!level) {
        showError('Please select a proficiency level');
        return;
    }
    
    // Find the selected skill name
    const selectedSkill = availableSkills.find(s => s.id === parseInt(skillId, 10));
    if (!selectedSkill) {
        showError('Selected skill not found');
        return;
    }
    
    // Convert the form chip to a regular skill chip with pending marker
    chip.classList.remove('new-skill');
    chip.innerHTML = ''; // Clear the form
    
    // Create skill chip content similar to existing skills
    const skillName = document.createTextNode(selectedSkill.name);
    chip.appendChild(skillName);
    
    // Add data attributes for saving
    chip.setAttribute('data-skill-db-id', skillId); // The skill ID from database
    chip.setAttribute('data-skill-name', selectedSkill.name);
    chip.setAttribute('data-skill-level', level);
    chip.setAttribute('data-is-new', 'true'); // Mark as new (not saved yet)
    
    // Add edit controls like existing skills
    const controls = document.createElement('div');
    controls.className = 'skill-edit-controls';
    
    const levelSelectEdit = document.createElement('select');
    levelSelectEdit.className = 'skill-level-select';
    
    // Add proficiency levels
    for (let i = 0; i <= 5; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = `${skillLevelNames[i]} (${i})`;
        if (i === parseInt(level, 10)) {
            option.selected = true;
        }
        levelSelectEdit.appendChild(option);
    }
    
    // Update data attribute when level changes
    levelSelectEdit.addEventListener('change', (e) => {
        const newLevel = parseInt(e.target.value, 10);
        chip.setAttribute('data-skill-level', newLevel);
    });
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-skill';
    deleteBtn.textContent = '×';
    deleteBtn.title = 'Delete skill';
    deleteBtn.onclick = (e) => {
        e.stopPropagation();
        chip.remove();
    };
    
    controls.appendChild(levelSelectEdit);
    controls.appendChild(deleteBtn);
    chip.appendChild(controls);
    
    // Visual indicator that it's pending save (optional - you can style this)
    chip.style.opacity = '0.8';
    chip.title = 'Pending save - will be saved when you click SAVE';
}

// Enable or disable schedule edit mode
function setScheduleEditMode(enabled) {
    const scheduleGrid = document.getElementById('scheduleGrid');
    if (!scheduleGrid) {
        console.warn('Schedule grid not found');
        return;
    }
    
    if (enabled) {
        // Enable editing
        scheduleGrid.classList.add('editing');
        
        // Update cursor and click handlers for all time slots
        const timeSlots = scheduleGrid.querySelectorAll('.time-slot');
        console.log(`Found ${timeSlots.length} time slots`);
        
        timeSlots.forEach(slot => {
            slot.style.cursor = 'pointer';
            
            // Remove existing click listeners by cloning
            const newSlot = slot.cloneNode(true);
            slot.parentNode.replaceChild(newSlot, slot);
            
            // Add click handler
            newSlot.addEventListener('click', handleTimeSlotClick);
            
            // Ensure selected state is synced with data-available
            const isAvailable = newSlot.getAttribute('data-available') === 'true';
            if (isAvailable && !newSlot.classList.contains('selected')) {
                newSlot.classList.add('selected');
                newSlot.classList.add('available');
            }
        });
    } else {
        // Disable editing
        scheduleGrid.classList.remove('editing');
        
        const timeSlots = scheduleGrid.querySelectorAll('.time-slot');
        timeSlots.forEach(slot => {
            slot.style.cursor = 'default';
            // Remove click handler by cloning (clean way to remove all listeners)
            const newSlot = slot.cloneNode(true);
            slot.parentNode.replaceChild(newSlot, slot);
        });
    }
}

// Handle time slot click for editing
function handleTimeSlotClick(event) {
    const cell = event.currentTarget;
    if (!cell || !cell.classList.contains('time-slot')) return;
    
    // Toggle the selected class
    const wasSelected = cell.classList.contains('selected');
    cell.classList.toggle('selected');
    const isSelected = cell.classList.contains('selected');
    
    // Update the data-available attribute
    cell.setAttribute('data-available', isSelected ? 'true' : 'false');
    
    // Also toggle available class for visual feedback
    if (isSelected) {
        cell.classList.add('available');
    } else {
        cell.classList.remove('available');
    }
}

// Setup event listeners
function setupEventListeners() {
    console.log('Setting up event listeners...');
    // Back button
    const backBtn = document.getElementById('backBtn');
    if (backBtn) {
        backBtn.addEventListener('click', function(e) {
            e.preventDefault();
            window.history.back();
        });
    }
    
    // Add ripple effect to buttons
    const buttons = document.querySelectorAll('.btn, button:not(.no-ripple)');
    buttons.forEach(button => {
        button.addEventListener('click', createRipple);
    });
    
    // Handle form submission
    const profileForm = document.getElementById('profileForm');
    if (profileForm) {
        profileForm.addEventListener('submit', function(e) {
            e.preventDefault();
            if (document.body.classList.contains('edit-mode') && isOwnProfile) {
                saveProfileChanges();
            }
        });
    }
    
    // Edit profile button - only show if it's the user's own profile
    const editBtn = document.getElementById('editBtn');
    if (editBtn) {
        if (isOwnProfile) {
            editBtn.style.display = 'block';
            let isEditing = false;
            
            editBtn.addEventListener('click', async function(e) {
                e.preventDefault();
                
                if (!isEditing) {
                    // Enter edit mode
                    isEditing = true;
                    document.body.classList.add('edit-mode');
                    editBtn.textContent = 'SAVE';
                    
                    // Make text fields clickable for editing
                    const editableFields = [
                        'userName', 'userEmail', 'userLinkedIn', 'userGitHub'
                    ];
                    
                    editableFields.forEach(fieldId => {
                        const field = document.getElementById(fieldId);
                        if (field) {
                            field.style.cursor = 'text';
                            // Remove old listeners and add new one
                            const newField = field.cloneNode(true);
                            field.parentNode.replaceChild(newField, field);
                            newField.addEventListener('click', function() {
                                makeEditable(fieldId);
                            });
                        }
                    });
                    
                    // Convert department and year to dropdowns
                    // Make sure departments are loaded first
                    if (availableDepartments.length === 0) {
                        await fetchAvailableDepartments();
                    }
                    convertDepartmentToDropdown();
                    convertYearToDropdown();
                    
                    // Remove "no schedule" message if it exists (since we're now in edit mode)
                    const scheduleSection = document.getElementById('scheduleSection');
                    if (scheduleSection) {
                        const noScheduleMsg = scheduleSection.querySelector('.no-schedule-message');
                        if (noScheduleMsg) {
                            noScheduleMsg.remove();
                        }
                    }
                    
                    // Re-populate schedule to ensure grid is visible (in case it wasn't rendered before)
                    populateSchedule();
                    
                    // Enable direct editing of skills and schedule
                    setSkillEditMode(true);
                    setScheduleEditMode(true);
                    
                } else {
                    // Exit edit mode and save
                    isEditing = false;
                    document.body.classList.remove('edit-mode');
                    editBtn.textContent = 'EDIT';
                    
                    // Disable editing of skills and schedule first
                    setSkillEditMode(false);
                    setScheduleEditMode(false);
                    
                    // Save changes
                    await saveProfileChanges();
                    
                    // Restore dropdowns back to text elements (if saveProfileChanges didn't already)
                    // This is a backup - saveProfileChanges should handle it
                    restoreDepartmentFromDropdown();
                    restoreYearFromDropdown();
                }
            });
        } else {
            // Hide edit button for other users' profiles
            editBtn.style.display = 'none';
        }
    }
}

// Add ripple effect to buttons
function createRipple(event) {
    const button = event.currentTarget;
    const ripple = document.createElement('span');
    const diameter = Math.max(button.clientWidth, button.clientHeight);
    const radius = diameter / 2;
    
    ripple.style.width = ripple.style.height = `${diameter}px`;
    ripple.style.left = `${event.clientX - button.getBoundingClientRect().left - radius}px`;
    ripple.style.top = `${event.clientY - button.getBoundingClientRect().top - radius}px`;
    ripple.classList.add('ripple');
    
    const existingRipple = button.querySelector('.ripple');
    if (existingRipple) {
        existingRipple.remove();
    }
    
    button.appendChild(ripple);
    
    // Remove ripple after animation completes
    setTimeout(() => {
        ripple.remove();
    }, 600);
}

// Export functions for potential external use
window.UserProfile = {
    initializeUserProfile,
    populateUserInfo,
    populateSkills,
    populateSchedule,
    populateProjects,
    populateStudyGroups
};
