import { authAPI } from '../src/api/auth.js';
import { projectsAPI } from '../src/api/projects.js';
import { groupsAPI } from '../src/api/groups.js';
import errorHandler from '../src/utils/errorHandler.js';
const { showError, showSuccess, showInfo, handleAPIError } = errorHandler;

// Helper function to get CSRF token from cookies
function getCookie(name) {
  let cookieValue = null;
  if (document.cookie && document.cookie !== '') {
    const cookies = document.cookie.split(';');
    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i].trim();
      // Does this cookie string begin with the name we want?
      if (cookie.substring(0, name.length + 1) === (name + '=')) {
        cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
        break;
      }
    }
  }
  return cookieValue;
}

const profilesContainer = document.getElementById('profilesContainer');
const emptyState = document.getElementById('emptyState');
const searchInput = document.getElementById('searchInput');
const filterBtn = document.getElementById('filterBtn');
const profileCardTemplate = document.getElementById('profileCardTemplate');
const pageTitle = document.getElementById('pageTitle');
const addButton = document.getElementById('addButton');

let allProfiles = [];
let contextType = null; // 'project' or 'study-group'
let contextId = null; // ID of the project or study group
let contextData = null; // Project or study group details
let requiredSkillIds = []; // Required skill IDs for matching
let existingMemberIds = []; // User IDs who are already members

// Advanced matching is always enabled

// Render skill filter buttons
function renderSkillFilters(skills) {
  const skillsContainer = document.getElementById('skillFilters');
  if (!skillsContainer) {
    console.error('Skills container not found');
    return;
  }
  
  if (!skills || skills.length === 0) {
    console.log('No skills to render');
    skillsContainer.hidden = true;
    return;
  }
  
  console.log('Rendering skills:', skills);
  
  // Extract skill names from objects if needed
  const skillNames = skills.map(skill => {
    if (typeof skill === 'string') return skill;
    return skill.skill__name || skill.name || skill.skill?.name || '';
  }).filter(Boolean); // Remove any empty strings
  
  if (skillNames.length === 0) {
    console.log('No valid skill names found');
    skillsContainer.hidden = true;
    return;
  }
  
  skillsContainer.hidden = false;
  skillsContainer.innerHTML = `
    <div class="mb-4">
      <div class="flex justify-between items-center mb-2">
        <p class="text-sm font-medium text-gray-700">Filter by skills:</p>
        <button 
          type="button" 
          id="clearFiltersBtn"
          class="text-xs text-gray-500 hover:text-gray-700 underline focus:outline-none"
        >
          Clear filters
        </button>
      </div>
      <div class="flex flex-wrap gap-2" id="skillButtons">
        ${skillNames.map(skillName => `
          <button 
            type="button" 
            class="skill-filter-btn px-3 py-1 rounded-full text-sm font-medium transition-colors border
                   border-blue-500 text-blue-600 hover:bg-blue-50 active:bg-blue-100"
            data-skill="${encodeURIComponent(skillName)}"
          >
            ${skillName}
          </button>
        `).join('')}
      </div>
    </div>
  `;
  
  // Add click handlers for skill buttons
  document.querySelectorAll('.skill-filter-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      // Toggle the selected state
      this.classList.toggle('bg-blue-100');
      this.classList.toggle('font-semibold');
      this.classList.toggle('text-white');
      this.classList.toggle('bg-blue-600');
      
      // Log the selected skills for debugging
      const selectedSkills = getSelectedSkills();
      console.log('Selected skills:', selectedSkills);
      
      // Reload profiles with the new filter
      loadProfiles();
    });
  });
  
  // Add click handler for clear filters button
  const clearFiltersBtn = document.getElementById('clearFiltersBtn');
  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener('click', function() {
      // Remove all active states from skill buttons
      document.querySelectorAll('.skill-filter-btn').forEach(btn => {
        btn.classList.remove('bg-blue-100', 'font-semibold', 'text-white', 'bg-blue-600');
      });
      
      console.log('Cleared all skill filters');
      
      // Reload profiles without any skill filters
      loadProfiles();
    });
  }
}

// Get currently selected skills
function getSelectedSkills() {
  const selectedBtns = document.querySelectorAll('.skill-filter-btn.bg-blue-100');
  return Array.from(selectedBtns).map(btn => decodeURIComponent(btn.dataset.skill));
}

// Render profile cards
function renderProfiles(profiles) {
  profilesContainer.innerHTML = '';
  
  if (profiles.length === 0) {
    emptyState.hidden = false;
    emptyState.textContent = 'No teammates found with the selected skills.';
    return;
  }
  
  emptyState.hidden = true;
  
  profiles.forEach(profile => {
    const card = document.createElement('div');
    card.className = 'bg-white rounded-lg shadow-md p-6 mb-4';
    
    // Format match percentage
    const matchPercentage = typeof profile.matchPercentage === 'number' 
      ? Math.round(profile.matchPercentage * 100) + '%' 
      : profile.matchPercentage || 'N/A';
      
    // Get skill similarity from profile or match_details
    const skillSimilarity = (() => {
      // Check in various possible locations
      if (profile.skill_similarity !== undefined) {
        return Math.round(profile.skill_similarity * 100) + '%';
      }
      if (profile.match_details?.skill_similarity !== undefined) {
        return Math.round(profile.match_details.skill_similarity * 100) + '%';
      }
      if (profile.match_details?.skill_similarity_score !== undefined) {
        return Math.round(profile.match_details.skill_similarity_score * 100) + '%';
      }
      return 'N/A';
    })();
    
    card.innerHTML = `
      <div class="flex justify-between items-start mb-4">
        <div>
          <h3 class="text-xl font-semibold">${profile.name || 'Anonymous User'}</h3>
          <p class="text-gray-600">${profile.department || ''}${profile.department && profile.year ? ' • ' : ''}${profile.year || ''}</p>
        </div>
        <div class="text-right">
          <div class="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium inline-block">
            ${matchPercentage} Match
          </div>
        </div>
      </div>
      
      ${skillSimilarity !== 'N/A' ? `
      <div class="mb-4">
        <h4 class="font-medium text-gray-700 mb-1">Skill Match</h4>
        <div class="text-sm text-gray-600">
          <div class="flex justify-between items-center">
            <span>Skill Similarity:</span>
            <span class="font-medium text-blue-600">${skillSimilarity}</span>
          </div>
        </div>
      </div>` : ''}
      
      <div class="mb-4">
        <h4 class="font-medium text-gray-700 mb-1">Skills</h4>
        <p class="text-gray-600">${profile.skills}</p>
      </div>
      
      <div class="mb-4">
        <h4 class="font-medium text-gray-700 mb-1">Availability</h4>
        <div class="text-gray-600">
          ${profile.availabilityIsHtml ? profile.availability : (profile.availability || 'Not specified')}
        </div>
      </div>
      
      <div class="flex justify-between items-center">
        <button class="text-blue-600 hover:text-blue-800 font-medium"
                data-action="view-availability" data-user-id="${profile.id}">
          View Detailed Availability
        </button>
        <button class="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
                data-action="view-profile" data-user-id="${profile.id}">
          View Profile
        </button>
      </div>
    `;
    
    profilesContainer.appendChild(card);
  });
  
  // Add event listeners for the new buttons
  document.querySelectorAll('[data-action="view-availability"]').forEach(button => {
    button.addEventListener('click', (e) => {
      const userId = e.target.dataset.userId;
      // Show a modal with detailed availability
      showAvailabilityModal(userId);
    });
  });
}

// Show detailed availability in a modal
function showAvailabilityModal(userId) {
  const user = allProfiles.find(p => p.id === userId || p.usn === userId);
  if (!user) return;
  
  // Create modal
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50';
  
  modal.innerHTML = `
    <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
      <div class="p-6">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-xl font-semibold">${user.name}'s Availability</h3>
          <button class="text-gray-500 hover:text-gray-700" id="closeAvailabilityModal">
            &times;
          </button>
        </div>
        
        <div class="space-y-4">
          ${user.availabilityIsHtml 
            ? user.availability 
            : (user.availability || 'No availability information available.')}
        </div>
      </div>
    </div>
  `;
  
  // Add to DOM
  document.body.appendChild(modal);
  
  // Add close button handler
  const closeButton = modal.querySelector('#closeAvailabilityModal');
  closeButton.addEventListener('click', () => {
    document.body.removeChild(modal);
  });
  
  // Close when clicking outside the modal
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      document.body.removeChild(modal);
    }
  });
}

function filterProfiles(term) {
  const normalizedTerm = term.trim().toLowerCase();

  if (!normalizedTerm) {
    renderProfiles(allProfiles);
    return;
  }

  const filtered = allProfiles.filter((profile) => {
    // Strip HTML tags from availability for searching
    const availabilityText = profile.availabilityIsHtml
      ? profile.availability.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ')
      : profile.availability;
    
    const searchableFields = [
      profile.name,
      profile.department,
      profile.year,
      profile.skills,
      availabilityText,
      profile.matchPercentage?.toString() ?? '',
    ];

    return searchableFields.some((field) =>
      field && field.toLowerCase().includes(normalizedTerm)
    );
  });

  renderProfiles(filtered);
}

function formatAvailability(availability = []) {
  if (!availability || availability.length === 0) {
    return { text: 'Not specified', isHtml: false };
  }

  // Group by day
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayMap = {};

  // Debug log the input
  console.log('Raw availability data:', availability);

  availability
    .filter(a => a && a.is_available)
    .forEach(a => {
      if (a.day_of_week === undefined || a.time_slot_start === undefined || a.time_slot_end === undefined) {
        console.warn('Invalid availability entry:', a);
        return;
      }
      
      const dayName = dayNames[a.day_of_week];
      if (!dayMap[dayName]) {
        dayMap[dayName] = [];
      }
      
      // Format time (e.g., "09:00:00" -> "9:00 AM")
      const formatTime = (timeStr) => {
        if (!timeStr) return '';
        const [hours, minutes] = timeStr.split(':');
        const hour = parseInt(hours, 10);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour % 12 || 12;
        return `${displayHour}:${minutes} ${ampm}`;
      };

      const timeSlot = `${formatTime(a.time_slot_start)}-${formatTime(a.time_slot_end)}`;
      dayMap[dayName].push(timeSlot);
    });

  if (Object.keys(dayMap).length === 0) {
    return { text: 'Not available', isHtml: false };
  }

  // Format with each day on a new line
  const formatted = Object.entries(dayMap)
    .map(([day, times]) => {
      const dayAbbrev = day.substring(0, 3);
      const timeSlots = times.join(', ');
      return `<div class="availability-line"><span class="availability-day">${dayAbbrev}:</span> <span class="availability-times">${timeSlots}</span></div>`;
    })
    .join('');

  console.log('Formatted availability:', formatted);
  return { text: formatted, isHtml: true };  // Set isHtml to true to render HTML content
}

function calculateMatchPercentage(userSkillIds, requiredSkillIds) {
  if (!requiredSkillIds || requiredSkillIds.length === 0) {
    return null; // No match percentage if no requirements
  }

  if (!userSkillIds || userSkillIds.length === 0) {
    return 0; // No skills = 0% match
  }

  // Calculate how many required skills the user has
  const matchingSkills = userSkillIds.filter(skillId => 
    requiredSkillIds.includes(skillId)
  );

  // Match percentage = (matching skills / required skills) * 100
  const percentage = Math.round((matchingSkills.length / requiredSkillIds.length) * 100);
  return percentage;
}

function normalizeProfile(profile, skills = [], userSkillIds = []) {
  if (!profile) {
    return null;
  }

  const fullName = [`${profile.first_name ?? ''}`.trim(), `${profile.last_name ?? ''}`.trim()]
    .filter(Boolean)
    .join(' ');

  // Format availability first
  const availability = formatAvailability(profile.availability || []);
  console.log('Formatted availability in normalizeProfile:', availability);
  
  // Calculate match percentage only if we have required skills
  // When no parameters are provided, match percentage will always be "—"
  let matchPercentage = '—';
  if (requiredSkillIds.length > 0) {
    const match = calculateMatchPercentage(userSkillIds, requiredSkillIds);
    matchPercentage = match !== null ? `${match}%` : '—';
  }
  
  // Create the profile object with all data
  const profileData = {
    userId: profile.usn || profile.id,
    name: fullName || profile.usn || 'Unnamed Student',
    skills: Array.isArray(skills) && skills.length > 0 ? skills.join(', ') : 'None specified',
    matchPercentage: matchPercentage,
    userSkillIds: userSkillIds || [],
    matchValue: requiredSkillIds.length > 0 ? calculateMatchPercentage(userSkillIds, requiredSkillIds) : null,
    availability: availability.text || 'Not specified',
    availabilityIsHtml: Boolean(availability.isHtml)
  };
  
  console.log('Final profile data:', profileData);
  
  return profileData;
}

async function loadContextData() {
  // Reset context data
  contextData = null;
  requiredSkillIds = [];
  existingMemberIds = [];

  // Only load context if type and ID are provided
  if (!contextType || !contextId) {
    return; // No context to load - will show all users
  }

  try {
    if (contextType === 'project') {
      // Fetch project details
      contextData = await projectsAPI.getProjectDetails(contextId);
      
      // Extract required skill IDs for matching
      if (contextData.skills && Array.isArray(contextData.skills)) {
        requiredSkillIds = contextData.skills
          .map(skill => {
            // Handle nested skill structure: { skill: { id: X, name: Y } }
            return skill.skill?.id || skill.skill_id || skill.id;
          })
          .filter(id => id != null);
      }
      
      // Extract existing member IDs (exclude them from results)
      if (contextData.members && Array.isArray(contextData.members)) {
        existingMemberIds = contextData.members
          .map(member => member.user_details?.usn || member.user || member.user_id)
          .filter(id => id != null);
      }
    } else if (contextType === 'study-group') {
      // Fetch study group details
      contextData = await groupsAPI.getGroup(contextId);
      
      // For study groups, matching logic will be added later
      // For now, we'll show all users
      
      // Extract existing member IDs
      if (contextData.members && Array.isArray(contextData.members)) {
        existingMemberIds = contextData.members
          .map(member => member.user_details?.usn || member.user || member.user_id)
          .filter(id => id != null);
      }
    }
  } catch (error) {
    console.error('Failed to load context data:', error);
    const errorMsg = handleAPIError(error, 'Failed to load project/group information. Showing all available teammates.');
    showError(errorMsg, { duration: 3000, type: 'warning' });
    // Continue without context data - will show all users (excluding current user via backend)
  }
}

async function loadProfiles() {
  try {
    // Show loading state
    profilesContainer.innerHTML = '<div class="text-center py-8">Loading potential teammates...</div>';
    emptyState.hidden = true;

    // Get the current user's authentication token
    const token = localStorage.getItem('token');
    if (!token) {
      window.location.href = 'login.html';
      return;
    }

    // Load context data first if we have a context
    await loadContextData();

    // Get selected skills
    const selectedSkills = getSelectedSkills();
    
    // Make API call to get potential teammates using advanced matching
    const url = new URL(`/api/projects/${contextId}/find-teammates/`, window.location.origin);
    if (selectedSkills.length > 0) {
      url.searchParams.append('skills', selectedSkills.join(','));
    }
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    if (!response.ok) {
      throw new Error('Failed to fetch potential teammates');
    }

    const data = await response.json();
    console.log('API Response:', data); // Debug log
    
    // Extract the profiles array from the response
    const profilesData = data.profiles?.profiles || data.profiles || [];
    
    if (profilesData.length > 0) {
      // Update page title with project name
      if (data.project_title) {
        document.title = `Find Teammates - ${data.project_title} | ScholarX`;
        pageTitle.textContent = `Find Teammates for "${data.project_title}"`;
      } else if (data.profiles?.project_title) {
        document.title = `Find Teammates - ${data.profiles.project_title} | ScholarX`;
        pageTitle.textContent = `Find Teammates for "${data.profiles.project_title}"`;
      }

            // Update skill filters if not already set
      const requiredSkills = data.required_skills || data.profiles?.required_skills || [];
      console.log('Required skills from API:', requiredSkills);
      
      const skillFiltersContainer = document.getElementById('skillFilters');
      console.log('Skill filters container:', skillFiltersContainer);
      
      if (requiredSkills.length > 0) {
        console.log('Rendering skill filters...');
        renderSkillFilters(requiredSkills);
      } else {
        console.log('No skills to render or skills array is empty');
      }
      
      // Process and display profiles
      allProfiles = profilesData.map(profile => {
        // Format availability first
        const availability = profile.availability && Array.isArray(profile.availability) 
          ? formatAvailability(profile.availability)
          : { text: 'Not specified', isHtml: false };
          
        // Handle both basic and advanced response formats
        const matchPercentage = profile.match_percentage || profile.match_percentage === 0
          ? `${profile.match_percentage}%`
          : (profile.match_percentage !== undefined ? `${Math.round(profile.match_percentage * 10) / 10}%` : 'N/A');
          
        const skills = profile.skills || 
          (profile.matched_skills && Array.isArray(profile.matched_skills)
            ? profile.matched_skills
                .map(skill => `${skill.name}${skill.proficiency ? ` (${skill.proficiency}/5)` : ''}`)
                .join(', ')
            : 'No skills specified');
            
        // Prepare match details for advanced matching
        const matchDetails = profile.match_details?.skill_similarity !== undefined ? `
          <div class="text-xs text-gray-600 mt-1">
            <div>Skill Similarity: ${Math.round(profile.match_details.skill_similarity * 100)}%</div>
          </div>
        ` : '';
          
        return {
          id: profile.id || profile.user_id,
          usn: profile.usn || '',
          name: profile.name,
          email: profile.email,
          department: profile.department || 'Not specified',
          year: profile.year ? (typeof profile.year === 'string' ? profile.year : `Year ${profile.year}`) : 'Not specified',
          matchPercentage: matchPercentage,
          skills: skills,
          availability: availability.text,
          availabilityIsHtml: availability.isHtml,
          matchValue: profile.match_percentage || 0, // For sorting
          matchDetails: matchDetails
        };
      });

      // Sort by match percentage (descending)
      allProfiles.sort((a, b) => (b.matchValue || 0) - (a.matchValue || 0));
      
      renderProfiles(allProfiles);
      
      // Show add button if user is the project owner
      if (contextData && contextData.created_by === parseInt(localStorage.getItem('user_id'))) {
        addButton.hidden = false;
      }
    } else {
      emptyState.hidden = false;
      emptyState.textContent = data.message || 'No potential teammates found with matching skills';
    }
  } catch (error) {
    console.error('Failed to load profiles:', error);
    const errorMsg = handleAPIError(error, 'Failed to load teammate profiles. Please refresh the page.');
    showError(errorMsg);
    emptyState.hidden = false;
    emptyState.textContent = 'Unable to load teammate profiles right now. Please try again later.';
  } finally {
    profilesContainer.removeAttribute('aria-busy');
  }
}

searchInput?.addEventListener('input', (event) => {
  filterProfiles(event.target.value);
});

filterBtn?.addEventListener('click', () => {
  alert('Filter options coming soon.');
});

// Initialize page based on URL parameters
function initializePageContext() {
  const urlParams = new URLSearchParams(window.location.search);
  contextType = urlParams.get('type'); // 'project' or 'study-group'
  contextId = urlParams.get('id'); // project_id or group_id

  // Update page title, button text, and search placeholder based on context
  if (contextType === 'project') {
    if (pageTitle) pageTitle.textContent = 'FIND PROJECT TEAMMATES';
    if (addButton) addButton.textContent = 'Add to Team';
    if (searchInput) {
      searchInput.placeholder = 'Search for teammates...';
      searchInput.setAttribute('aria-label', 'Search for project teammates');
    }
    // Update back button to return to project view if ID provided
    if (contextId) {
      const backBtn = document.getElementById('backBtn');
      if (backBtn) {
        backBtn.href = `project-view.html?id=${contextId}`;
      }
    }
  } else if (contextType === 'study-group') {
    if (pageTitle) pageTitle.textContent = 'FIND STUDY GROUP MEMBERS';
    if (addButton) addButton.textContent = 'Add to Group';
    if (searchInput) {
      searchInput.placeholder = 'Search for members...';
      searchInput.setAttribute('aria-label', 'Search for study group members');
    }
    // Update back button to return to study group view if ID provided
    if (contextId) {
      const backBtn = document.getElementById('backBtn');
      if (backBtn) {
        backBtn.href = `study-group-view.html?id=${contextId}`;
      }
    }
  } else {
    // Default: generic teammates
    pageTitle.textContent = 'FIND TEAMMATES';
    addButton.textContent = 'Add to Team';
    if (searchInput) {
      searchInput.placeholder = 'Search';
      searchInput.setAttribute('aria-label', 'Search teammates');
    }
  }
}

document.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  
  const action = button.getAttribute('data-action');
  const card = button.closest('.profile-card');
  const userId = card ? card.querySelector('[data-field="userId"]')?.textContent : '';
  const name = card?.querySelector('[data-field="name"]')?.textContent || 'User';
  const userEmail = card?.querySelector('[data-field="email"]')?.textContent || '';
  
  if (action === 'view-profile' && userId) {
    // Navigate to the user's profile page
    window.location.href = `/profile.html?user=${userId}`;
    return;
  }

  if (action === 'contact') {
    alert(`Contact request sent to ${name}.`);
    return;
  }

  if (action === 'add') {
    // Show loading state on the button
    const originalText = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Adding...';

    try {
      let response;
      
      if (contextType === 'project' && contextId) {
        // Add to project team
        response = await fetch(`/api/projects/${contextId}/add-team-member/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
            'X-CSRFToken': getCookie('csrftoken')
          },
          body: JSON.stringify({
            user_id: userId,
            email: userEmail
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || 'Failed to add team member');
        }

        const result = await response.json();
        
        // Show success message
        showSuccess(`${name} has been added to your project team!`, { duration: 3000 });
        
        // Remove the card from the UI
        card.style.opacity = '0.5';
        card.style.pointerEvents = 'none';
        button.disabled = true;
        button.textContent = 'Added';
        
        // Update the project details if needed
        if (result.project) {
          // You might want to update any project-related UI here
          console.log('Project updated:', result.project);
        }
        
      } else if (contextType === 'study-group' && contextId) {
        // Add to study group (similar structure as project)
        response = await fetch(`/api/study-groups/${contextId}/add-member/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
            'X-CSRFToken': getCookie('csrftoken')
          },
          body: JSON.stringify({
            user_id: userId,
            email: userEmail
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || 'Failed to add group member');
        }

        const result = await response.json();
        showSuccess(`${name} has been added to your study group!`, { duration: 3000 });
        
        // Update UI
        card.style.opacity = '0.5';
        card.style.pointerEvents = 'none';
        button.disabled = true;
        button.textContent = 'Added';
      } else {
        // Generic add (shouldn't happen with proper UI state)
        showInfo(`${name} has been invited to join your team.`);
      }
    } catch (error) {
      console.error('Error adding member:', error);
      showError(`Failed to add ${name}: ${error.message}`);
      button.disabled = false;
      button.innerHTML = originalText;
    }
  }
});

// Initialize context and load profiles
initializePageContext();
loadProfiles();
