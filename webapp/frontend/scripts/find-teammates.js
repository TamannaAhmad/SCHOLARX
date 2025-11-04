import { authAPI } from '../src/api/auth.js';
import { projectsAPI } from '../src/api/projects.js';
import { groupsAPI } from '../src/api/groups.js';
import { showError, handleAPIError } from '../src/utils/errorHandler.js';

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


function renderProfiles(profiles) {
  profilesContainer.innerHTML = '';

  if (!profiles.length) {
    emptyState.hidden = false;
    return;
  }

  emptyState.hidden = true;

  profiles.forEach((profile) => {
    const card = profileCardTemplate.content.cloneNode(true);

    Object.entries(profile).forEach(([key, value]) => {
      const target = card.querySelector(`[data-field="${key}"]`);
      if (!target) return;

      // Handle availability field specially if it's HTML
      if (key === 'availability' && profile.availabilityIsHtml) {
        target.innerHTML = value || '—';
      } else {
        target.textContent = value || '—';
      }
    });

    profilesContainer.appendChild(card);
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
      profile.semester,
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

  availability
    .filter(a => a.is_available)
    .forEach(a => {
      const dayName = dayNames[a.day_of_week];
      if (!dayMap[dayName]) {
        dayMap[dayName] = [];
      }
      
      // Format time (e.g., "09:00:00" -> "9:00 AM")
      const formatTime = (timeStr) => {
        const [hours, minutes] = timeStr.split(':');
        const hour = parseInt(hours, 10);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour % 12 || 12;
        return `${displayHour}:${minutes} ${ampm}`;
      };

      dayMap[dayName].push(`${formatTime(a.time_slot_start)}-${formatTime(a.time_slot_end)}`);
    });

  if (Object.keys(dayMap).length === 0) {
    return { text: 'Not available', isHtml: false };
  }

  // Format as HTML with line breaks for better readability
  const formatted = Object.entries(dayMap)
    .map(([day, times]) => {
      const dayAbbrev = day.substring(0, 3);
      const timeSlots = times.join(', ');
      return `<span class="availability-day">${dayAbbrev}</span> <span class="availability-times">${timeSlots}</span>`;
    })
    .join('<br>');

  return { text: formatted, isHtml: true };
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

  const availability = formatAvailability(profile.availability);
  
  // Calculate match percentage only if we have required skills
  // When no parameters are provided, match percentage will always be "—"
  let matchPercentage = '—';
  if (requiredSkillIds.length > 0) {
    const match = calculateMatchPercentage(userSkillIds, requiredSkillIds);
    matchPercentage = match !== null ? `${match}%` : '—';
  }
  
  return {
    userId: profile.usn || profile.id,
    name: fullName || profile.usn || 'Unnamed Student',
    department: profile.department?.name || 'Not specified',
    semester: profile.study_year ? `Year ${profile.study_year}` : 'Not specified',
    skills: skills.length > 0 ? skills.join(', ') : 'None specified',
    availability: availability.text,
    availabilityIsHtml: availability.isHtml,
    matchPercentage: matchPercentage,
    userSkillIds: userSkillIds, // Store for sorting
    matchValue: requiredSkillIds.length > 0 ? calculateMatchPercentage(userSkillIds, requiredSkillIds) : null,
  };
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
    emptyState.hidden = true;
    profilesContainer.setAttribute('aria-busy', 'true');

    // Load context data (project/study group) if applicable
    await loadContextData();

    // Get all users except current user
    const users = await authAPI.getAllUsers();
    
    // Normalize all user profiles
    allProfiles = users
      .map(user => {
        // Extract user skill IDs and names
        // UserSkillSerializer returns: { id, skill_name, skill: { id, name }, proficiency_level }
        const userSkillIds = (user.skills || [])
          .map(skill => {
            // skill.skill.id is the actual Skill ID (added to serializer)
            return skill.skill?.id || skill.skill_id || null;
          })
          .filter(id => id != null);
        
        const skillNames = (user.skills || [])
          .map((skill) => skill?.skill_name || skill?.skill?.name || null)
          .filter(Boolean);
        
        return normalizeProfile(user, skillNames, userSkillIds);
      })
      .filter(profile => {
        if (!profile) return false;
        
        // Filter out existing members only if we have a context (project/study-group)
        // When no parameters, existingMemberIds will be empty, so all users pass
        if (contextType && existingMemberIds.length > 0) {
          return !existingMemberIds.includes(profile.userId);
        }
        
        // No context or no existing members - show all profiles
        // (current user already excluded by backend getAllUsers endpoint)
        return true;
      });

    // Sort by match percentage (highest first) if we have requirements
    if (requiredSkillIds.length > 0) {
      allProfiles.sort((a, b) => {
        const aMatch = a.matchValue ?? -1;
        const bMatch = b.matchValue ?? -1;
        return bMatch - aMatch; // Descending order
      });
    }

    renderProfiles(allProfiles);

    if (!allProfiles.length) {
      emptyState.hidden = false;
      if (existingMemberIds.length > 0 && users.length > 0) {
        emptyState.textContent = 'All available users are already members.';
      } else {
        emptyState.textContent = 'No teammate profiles available yet.';
      }
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
    pageTitle.textContent = 'FIND PROJECT TEAMMATES';
    addButton.textContent = 'Add to Team';
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
    pageTitle.textContent = 'FIND STUDY GROUP MEMBERS';
    addButton.textContent = 'Add to Group';
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

document.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  const action = button.dataset.action;
  const card = button.closest('.profile-card');
  const name = card?.querySelector('[data-field="name"]')?.textContent || 'User';

  if (action === 'contact') {
    alert(`Contact request sent to ${name}.`);
  }

  if (action === 'add') {
    // Determine context-appropriate message
    let message;
    if (contextType === 'project') {
      message = `${name} has been invited to join your project team.`;
    } else if (contextType === 'study-group') {
      message = `${name} has been invited to join your study group.`;
    } else {
      message = `${name} has been invited to join your team.`;
    }
    alert(message);
    
    // TODO: Implement actual API calls to add member based on contextType and contextId
    // if (contextType === 'project' && contextId) {
    //   // Call project API to add team member
    // } else if (contextType === 'study-group' && contextId) {
    //   // Call study group API to add member
    // }
  }
});

// Initialize context and load profiles
initializePageContext();
loadProfiles();
