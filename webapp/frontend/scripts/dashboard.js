import projectsAPI from '../src/api/projects.js';
import groupsAPI from '../src/api/groups.js';
import { authAPI } from '../src/api/auth.js';
import { showError, handleAPIError } from '../src/utils/errorHandler.js';

document.addEventListener('DOMContentLoaded', async () => {
    const projectsList = document.getElementById('user-projects-list');
    const studyGroupsList = document.getElementById('user-study-groups-list');
    const logoutBtn = document.getElementById('logoutBtn');
    const userNameElement = document.getElementById('userName');
    const userInitialsElement = document.getElementById('userInitials');

    // Restore missing loadUserProfile function
    async function loadUserProfile() {
        try {
            const userData = await authAPI.getProfile();
            // Set user name
            const displayName = `${userData.first_name || ''} ${userData.last_name || ''}`.trim();
            userNameElement.textContent = displayName || 'User';

            // Set user initials
            const initials = `${userData.first_name ? userData.first_name[0] : ''}${userData.last_name ? userData.last_name[0] : ''}`.toUpperCase();
            userInitialsElement.textContent = initials || 'U';
        } catch (error) {
            console.error('Failed to load user profile:', error);
            const errorMsg = handleAPIError(error, 'Failed to load user profile.');
            showError(errorMsg);
            userNameElement.textContent = 'User';
            userInitialsElement.textContent = 'U';
        }
    }

    function toTitleCase(s) {
        if (!s) return s;
        const str = String(s);
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    }

    async function loadUserProjects() {
        try {
            const projects = await projectsAPI.getUserProjects();
            if (!projects || projects.length === 0) {
                projectsList.innerHTML = '<p class="no-data">No projects found. <a href="project-creation.html">Create your first project</a></p>';
            } else {
                projectsList.innerHTML = projects.map(project => {
                    const statusLabel = project.status_display || toTitleCase(project.status) || 'Unknown';
                    return `
                    <div class="dashboard-list-item">
                        <a href="project-view.html?id=${project.project_id}">
                            ${project.title || 'Untitled Project'} | <span class="project-status">Status: ${statusLabel}</span>
                        </a>
                    </div>
                    `;
                }).join('');
            }
        } catch (error) {
            console.error('Failed to load projects:', error);
            const errorMsg = handleAPIError(error, 'Failed to load projects. Please refresh the page.');
            showError(errorMsg);
            projectsList.innerHTML = '<p class="error-message">Error loading projects. Please try again.</p>';
        }
    }

    async function loadUserStudyGroups() {
        try {
            const groups = await groupsAPI.listMyGroups();
            if (!groups || groups.length === 0) {
                studyGroupsList.innerHTML = '<p class="no-data">No study groups found. <a href="group-creation.html">Create your first study group</a></p>';
            } else {
                studyGroupsList.innerHTML = groups.map(group => {
                    const subjectLabel = toTitleCase(group.subject_area) || 'Unknown';
                    return `
                    <div class="dashboard-list-item">
                        <a href="study-group-view.html?id=${group.group_id}">
                            ${group.name || 'Unnamed Group'} | <span class="group-subject">Subject: ${subjectLabel}</span>
                        </a>
                    </div>
                    `;
                }).join('');
            }
        } catch (error) {
            console.error('Failed to load study groups:', error);
            const errorMsg = handleAPIError(error, 'Failed to load study groups. Please refresh the page.');
            showError(errorMsg);
            studyGroupsList.innerHTML = '<p class="error-message">Error loading study groups. Please try again.</p>';
        }
    }

    // Logout functionality
    async function handleLogout() {
        try {
            // Call logout API
            await authAPI.logout();

            // Clear local storage
            localStorage.removeItem('authToken');
            localStorage.removeItem('user');

            // Redirect to login page
            window.location.href = 'login.html';
        } catch (error) {
            console.error('Logout failed:', error);
            
            // Force logout even if API call fails
            localStorage.removeItem('authToken');
            localStorage.removeItem('user');
            window.location.href = 'login.html';
        }
    }

    // Add logout event listener
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }

    // Load user profile, projects, and study groups
    await Promise.all([
        loadUserProfile(), 
        loadUserProjects(), 
        loadUserStudyGroups()
    ]);
});