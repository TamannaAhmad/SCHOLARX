import { authAPI } from '../src/api/auth.js';
import { projectsAPI } from '../src/api/projects.js';
import { groupsAPI } from '../src/api/groups.js';
import errorHandler from '../src/utils/errorHandler.js';
import { createMessageModal } from '../src/utils/modal.js';
const { showError, showSuccess, showInfo, handleAPIError } = errorHandler;

// Global state for selected skills
let selectedSkills = [];

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
const profileCardTemplate = document.getElementById('profileCardTemplate');
const pageTitle = document.getElementById('pageTitle');
const addButton = document.getElementById('addButton');
const availabilityToggle = document.getElementById('availabilityToggle');

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
  
  // Preserve current selection if it exists
  const currentSelectedSkills = getSelectedSkills();
  
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
    <div class="skill-filters-container">
      <div class="skill-filters-header">
        <h3 class="skill-filters-title">Filter by Skills</h3>
        <button 
          type="button" 
          id="clearFiltersBtn"
          class="clear-filters-btn"
          aria-label="Clear all skill filters"
        >
          Clear all
        </button>
      </div>
      <div class="skill-buttons-container" id="skillButtons">
        ${skillNames.map(skillName => `
          <button 
            type="button" 
            class="skill-filter-btn"
            data-skill="${encodeURIComponent(skillName)}"
            aria-pressed="false"
          >
            ${skillName}
            <span class="skill-checkmark">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </span>
          </button>
        `).join('')}
      </div>
    </div>
  `;
  
    // Helper function to update button states
  const updateButtonStates = () => {
    document.querySelectorAll('.skill-filter-btn').forEach(btn => {
      const skillName = btn.getAttribute('data-skill');
      const isSelected = selectedSkills.includes(skillName);
      btn.setAttribute('aria-pressed', isSelected);
      btn.classList.toggle('skill-filter-btn--selected', isSelected);
    });
  };

  // Set initial button states
  updateButtonStates();

  // Add click handlers for skill buttons
  document.querySelectorAll('.skill-filter-btn').forEach(btn => {
    btn.addEventListener('click', function() {  
      const skillName = this.getAttribute('data-skill');
      const isNowSelected = this.getAttribute('aria-pressed') !== 'true';
      
      // Update the selectedSkills array
      if (isNowSelected) {
        if (!selectedSkills.includes(skillName)) {
          selectedSkills.push(skillName);
        }
      } else {
        const index = selectedSkills.indexOf(skillName);
        if (index > -1) {
          selectedSkills.splice(index, 1);
        }
      }
      
      // Update all button states to ensure consistency
      updateButtonStates();      
      
      // Reload profiles with the new filter
      loadProfiles();
    });
  });
  
    // Add click handler for clear filters button
  const clearFiltersBtn = document.getElementById('clearFiltersBtn');
  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener('click', function() {
      // Clear the global selectedSkills array
      selectedSkills = [];
      
      // Update button states to reflect cleared selection
      updateButtonStates();
      
      console.log('Cleared all skill filters');
      
      // Reload profiles without any skill filters
      loadProfiles();
    });
  }
}

// Get currently selected skills
function getSelectedSkills() {
  const selectedBtns = document.querySelectorAll('.skill-filter-btn[aria-pressed="true"]');
  return Array.from(selectedBtns).map(btn => decodeURIComponent(btn.dataset.skill));
}

// Render profile cards
function renderProfiles(profiles) {
  profilesContainer.innerHTML = '';
  
  const parsePercentage = (value) => {
    if (value === undefined || value === null) return null;
    if (typeof value === 'string') {
      const numericString = value.replace(/[^0-9.\-]/g, '');
      if (!numericString) return null;
      const parsed = parseFloat(numericString);
      return Number.isFinite(parsed) ? parsed : null;
    }

    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
  };

  const formatPercentage = (value) => {
    if (value === null) return null;
    const rounded = Math.round(value * 10) / 10;
    return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}%`;
  };

  const toNumber = (value) => {
    if (value === undefined || value === null) return null;
    if (typeof value === 'string') {
      const numericString = value.replace(/[^0-9.\-]/g, '');
      if (!numericString) return null;
      const parsed = parseFloat(numericString);
      return Number.isFinite(parsed) ? parsed : null;
    }

    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
  };

  const rawToPercent = (rawValue) => {
    const raw = toNumber(rawValue);
    if (raw === null) return null;
    return raw <= 1 ? raw * 100 : raw;
  };

  const extractPercentage = (source, fallback) => {
    if (source) {
      if (source.percentage !== undefined) {
        const pct = toNumber(source.percentage);
        if (pct !== null) return pct;
      }
      if (source.raw !== undefined) {
        const pctFromRaw = rawToPercent(source.raw);
        if (pctFromRaw !== null) return pctFromRaw;
      }
    }

    if (fallback !== undefined) {
      const normalizedFallback = rawToPercent(fallback);
      if (normalizedFallback !== null) return normalizedFallback;

      const directFallback = toNumber(fallback);
      if (directFallback !== null) return directFallback;
    }

    return null;
  };

  const formatPercentageOrPlaceholder = (value, isRawNumber = false) => {
    if (value === null || value === undefined) return '—';
    if (isRawNumber) {
      return `${value}%`;
    }
    return formatPercentage(value);
  };
  
  if (profiles.length === 0) {
    emptyState.hidden = false;
    emptyState.textContent = 'No teammates found with the selected skills.';
    return;
  }
  
  emptyState.hidden = true;
  
  profiles.forEach(profile => {
    const card = document.createElement('article');
    card.className = 'profile-card';
    
    // Use the pre-calculated match score that was set in loadProfiles
    const matchScore = typeof profile.match_score === 'number' 
      ? Math.round(profile.match_score) 
      : 0;
    
    // Store match score on the profile object for template access
    profile._matchScore = matchScore;
    const breakdown = profile.score_breakdown ?? {};
    
    // Get the current toggle state
    const toggle = document.getElementById('availabilityToggle');
    const includeAvailability = toggle?.checked;
    
    // Get scores from the profile data and score_breakdown
    const skillMatch = parseFloat(profile.adjusted_skill_match ?? profile.skill_match ?? 0);
    const availabilityMatch = includeAvailability ? parseFloat(profile.availability_match ?? 0) : 0;
    const proficiencyBonus = parseInt(profile.proficiency_bonus || 0);
    const overallPercentage = parseFloat(profile.match_percentage ?? profile.match_score ?? 0);

    // Use the backend-calculated values directly
    const skillPercentage = skillMatch;
    const availabilityPercentage = availabilityMatch;
    
    // Ensure the match score is set for sorting and display
    profile.match_score = overallPercentage;
    profile._matchScore = overallPercentage;
    
    const baseSkillComponent = rawToPercent(
      breakdown.skill_components?.base_skill_component
    );

    console.log('Profile data:', {
      profileId: profile.user_id,
      rawProficiency: profile.proficiency_bonus,
      parsedProficiency: proficiencyBonus,
      profileData: profile
    });

    const breakdownItems = [
      { label: 'Overall Match', value: overallPercentage },
      { label: 'Skill Match', value: skillPercentage },
      includeAvailability ? { label: 'Availability Match', value: availabilityPercentage } : null,
      { 
        label: 'Proficiency Bonus', 
        value: proficiencyBonus,
        tooltip: 'Bonus based on the proficiency level of matched skills (0-20% of total score)'
      }
    ];

    console.log('Breakdown items:', breakdownItems);

    const scoreBreakdownHtml = `
      <div class="detail-row score-breakdown-row">
        <span class="detail-label">Score Breakdown</span>
        <div class="detail-value">
          <ul class="score-breakdown-list">
            ${breakdownItems.filter(Boolean).map(item => `
              <li class="score-breakdown-item">
                <span class="score-breakdown-label">${item.label}</span>
                <span class="score-breakdown-value">${formatPercentageOrPlaceholder(item.value, item.label === 'Proficiency Bonus')}</span>
              </li>
            `).join('')}
          </ul>
        </div>
      </div>
    `;

    // Format skills
    let skillsHtml = 'No skills specified';
    if (Array.isArray(profile.skills) && profile.skills.length > 0) {
      skillsHtml = `
        <div class="skills-list">
          ${profile.skills.map(skill => 
            `<span class="skill-tag">
              ${typeof skill === 'string' ? skill : (skill.name || skill.skill?.name || '')}
            </span>`
          ).join('')}
        </div>`;
    } else if (typeof profile.skills === 'string' && profile.skills.trim()) {
      skillsHtml = profile.skills;
    }
    
    // Get profile details for display
    const department = profile.department || '';
    const year = profile.year ? `Year ${profile.year}` : '';
    
    // Determine button text based on ownership
    const currentUserId = parseInt(localStorage.getItem('user_id'));
    const isOwner = contextData && (contextData.owner_id === currentUserId || contextData.created_by === currentUserId);
    const buttonText = isOwner ? 'Send Invite' : 'Send Request';
    const buttonIcon = '<svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>';
    
    card.innerHTML = `
      <div class="profile-header">
        <div class="profile-info">
          <div class="profile-name-row">
            <h3 class="profile-name">${profile.name || 'Anonymous User'}</h3>
          </div>
          <div class="profile-meta">
            ${department ? `<div class="profile-department">${department}</div>` : ''}
            ${year ? `<div class="profile-year">${year}</div>` : ''}
            ${matchScore > 0 ? `<div class="match-score-text">Match: ${matchScore}%</div>` : ''}
          </div>
        </div>
      </div>
      
      <div class="profile-card-body">
        <div class="profile-details">
          <div class="detail-row">
            <span class="detail-label">Skills</span>
            <div class="detail-value">${skillsHtml}</div>
          </div>
          
          ${scoreBreakdownHtml}
        </div>
      </div>
      
      <div class="profile-card-footer">
        <div class="profile-card-actions">
          <a href="userprofile.html?usn=${encodeURIComponent(profile.usn || profile.id || profile.user_id || '')}" class="secondary-btn view-profile-btn">
            View Profile
          </a>
          <button type="button" class="primary-btn request-btn" data-action="request" data-user-usn="${profile.usn || profile.id || profile.user_id || ''}" data-user-name="${profile.name || 'User'}">
            ${buttonIcon}
            ${buttonText}
          </button>
        </div>
      </div>
    `;
    
    profilesContainer.appendChild(card);
  });
  
  // View profile links are now direct HTML links, no need for click handlers
}

function filterProfiles(term) {
  const normalizedTerm = term.trim().toLowerCase();

  if (!normalizedTerm) {
    renderProfiles(allProfiles);
    return;
  }

  const filtered = allProfiles.filter((profile) => {
    const searchableFields = [
      profile.name,
      profile.department,
      profile.year,
      profile.skills,
      profile.matchPercentage?.toString() ?? '',
    ];

    return searchableFields.some((field) =>
      field && field.toLowerCase().includes(normalizedTerm)
    );
  });

  renderProfiles(filtered);
}

function calculateMatchPercentage(userSkillIds, requiredSkillIds, availabilityMatch) {
  if (!requiredSkillIds || requiredSkillIds.length === 0) {
    return null; // No match percentage if no requirements
  }

  if (!userSkillIds || userSkillIds.length === 0) {
    return 0; // No skills = 0% match
  }

  // Calculate skill match percentage
  const matchingSkills = userSkillIds.filter(skillId => 
    requiredSkillIds.includes(skillId)
  );
  const skillPercentage = (matchingSkills.length / requiredSkillIds.length) * 100;

  // Get the current state of the toggle
  const toggle = document.getElementById('availabilityToggle');
  
  // Only include availability if toggle is checked and we have a match value
  if (toggle?.checked && availabilityMatch !== undefined && availabilityMatch !== null) {
    // Calculate weighted average: 70% skills, 30% availability
    return Math.round((skillPercentage * 0.7) + (availabilityMatch * 0.3));
  }
  
  // Just return skill percentage if toggle is off or no availability data
  return Math.round(skillPercentage);
}

function normalizeProfile(profile, skills = [], userSkillIds = []) {
  if (!profile) {
    return null;
  }

  const fullName = [`${profile.first_name ?? ''}`.trim(), `${profile.last_name ?? ''}`.trim()]
    .filter(Boolean)
    .join(' ');

    // Calculate match percentage only if we have required skills
  // When no parameters are provided, match percentage will always be "—"
  let matchPercentage = '—';
  if (requiredSkillIds.length > 0) {
    // Always pass the availability match, let the function handle the toggle state
    const availabilityMatch = profile.availability_match !== undefined ? 
      parseFloat(profile.availability_match) : undefined;
      
    const match = calculateMatchPercentage(userSkillIds, requiredSkillIds, availabilityMatch);
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
      console.log('Loaded project context data:', contextData);
      
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
      console.log('Loaded study group context data:', contextData);
      
      // Extract required skill IDs for matching from study group
      if (contextData.skills && Array.isArray(contextData.skills)) {
        requiredSkillIds = contextData.skills
          .map(skill => {
            // Handle different skill object structures
            if (typeof skill === 'object' && skill !== null) {
              return skill.id || skill.skill_id || skill.skill?.id;
            }
            return skill;
          })
          .filter(id => id != null);
      } else if (contextData.required_skills && Array.isArray(contextData.required_skills)) {
        requiredSkillIds = contextData.required_skills
          .map(skill => skill.id || skill.skill_id || skill.skill?.id)
          .filter(id => id != null);
      }
      
      console.log('Required skill IDs for study group:', requiredSkillIds);
      
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
    // Show loading state in a card
    profilesContainer.innerHTML = `
      <div class="loading-card">
        <div class="loading-spinner">
          <div class="spinner"></div>
        </div>
        <p class="loading-text">Finding potential teammates...</p>
      </div>
    `;
    emptyState.hidden = true;

    // Get the current user's authentication token
    const token = localStorage.getItem('token');
    if (!token) {
      window.location.href = 'login.html';
      return;
    }

    // Load context data first if we have a context
    await loadContextData();
    
    let data;
    const startTime = performance.now();
    
    if (contextType === 'project') {
      // Use the existing project matching endpoint
      const endpoint = `/api/projects/${contextId}/find-teammates/`;
      const url = new URL(endpoint, window.location.origin);
      
      // Add selected skills as query parameters if any are selected
      if (selectedSkills.length > 0) {
        url.searchParams.delete('skills');
        selectedSkills.forEach(skill => {
          url.searchParams.append('skills', skill);
        });
      }
      
      // Add include_availability parameter based on toggle state
      const toggle = document.getElementById('availabilityToggle');
      if (toggle) {
        url.searchParams.set('include_availability', toggle.checked.toString());
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
      
      data = await response.json();
    } else {
      // Use the new study group matching endpoint
      data = await groupsAPI.findGroupMembers(contextId, selectedSkills, document.getElementById('availabilityToggle')?.checked ?? true);
      
      // Transform the response to match the expected format
      if (data && Array.isArray(data)) {
        data = {
          profiles: data,
          group_title: contextData?.name || 'Study Group',
          required_skills: contextData?.topics?.split(',').map(t => t.trim()) || []
        };
      }
    }
    
    const endTime = performance.now();
    
    // Extract the profiles array from the response
    const profilesData = data.profiles?.profiles || data.profiles || [];
    
    if (profilesData.length > 0) {
      // Update page title with project/group name
      const title = data.project_title || data.group_title || data.profiles?.project_title || data.profiles?.group_title;
      if (title) {
        const pageTitleText = contextType === 'project' 
          ? `Find Teammates for "${title}"`
          : `Find Members for "${title}"`;
        document.title = `${pageTitleText} | ScholarX`;
        pageTitle.textContent = pageTitleText;
      }

            // Update skill filters if not already set
      const requiredSkills = data.required_skills || data.profiles?.required_skills || [];
      
      const skillFiltersContainer = document.getElementById('skillFilters');
      
      if (requiredSkills.length > 0) {
        renderSkillFilters(requiredSkills);
      } else {
        console.log('No skills to render or skills array is empty');
      }
      
      // Process and update scores based on toggle state
    const toggle = document.getElementById('availabilityToggle');
    const includeAvailability = toggle?.checked;
    
    allProfiles = profilesData.map(profile => {
      // Get values from the API response
      const rawSkillMatch = parseFloat(profile.skill_match ?? 0);
      const adjustedSkillMatch = parseFloat(profile.adjusted_skill_match ?? profile.skill_match ?? 0);
      const availabilityMatch = includeAvailability ? parseFloat(profile.availability_match ?? 0) : 0;
      // Use the direct proficiency_bonus from the profile if available, otherwise try to get it from the breakdown
      const proficiencyBonus = profile.proficiency_bonus !== undefined 
        ? parseInt(profile.proficiency_bonus, 10)
        : parseInt(profile.score_breakdown?.proficiency_bonus?.raw || 0) * 100;
      
      // Get the skill component from the backend (before availability is applied)
      const skillComponent = parseFloat(profile.adjusted_skill_match ?? 0) / 100; // Convert from percentage to decimal
      const availabilityScore = includeAvailability ? (parseFloat(profile.availability_match ?? 0) / 100) : 0;
      
      // Use the backend's calculated score
      // The backend already handles the availability toggle and score calculation
      let finalMatchScore = parseFloat(profile.match_percentage) || 0;
      
      // Format skills with proficiency
      let skills = 'No skills specified';
      if (Array.isArray(profile.matched_skills) && profile.matched_skills.length > 0) {
          skills = profile.matched_skills
              .map(skill => {
                  const name = skill?.name || skill?.skill?.name || '';
                  const proficiency = skill?.proficiency_level ?? skill?.proficiency;
                  return name
                      ? `${name}${proficiency !== undefined ? ` (${proficiency}/5)` : ''}`
                      : null;
              })
              .filter(Boolean)
              .join(', ');
      } else if (Array.isArray(profile.skills) && profile.skills.length > 0) {
          skills = profile.skills
              .map(skill => {
                  const name = skill?.name || skill?.skill?.name || '';
                  const proficiency = skill?.proficiency_level ?? skill?.proficiency;
                  return name
                      ? `${name}${proficiency !== undefined ? ` (${proficiency}/5)` : ''}`
                      : null;
              })
              .filter(Boolean)
              .join(', ');
      } else if (typeof profile.skills === 'string' && profile.skills.trim()) {
          skills = profile.skills;
      }

      // Generate score breakdown using the backend's calculated values
      const scoreBreakdown = profile.score_breakdown || {
          skill: { 
              percentage: adjustedSkillMatch,
              raw: adjustedSkillMatch / 100
          },
          availability: {
              percentage: includeAvailability ? availabilityScore : 0,
              raw: includeAvailability ? availabilityScore / 100 : 0
          },
          proficiency_bonus: { 
              percentage: proficiencyBonus,
              raw: proficiencyBonus / 100
          }
      };

      // Use the match_percentage from the API response if available, otherwise calculate it
      const finalScore = profile.match_percentage !== undefined ? 
          parseFloat(profile.match_percentage) : finalMatchScore;
          
      return {
          ...profile,
          id: profile.id || profile.user_id,
          usn: profile.usn || '',
          name: profile.name || `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Anonymous',
          email: profile.email || '',
          department: profile.department || 'Not specified',
          year: profile.year ? (typeof profile.year === 'string' ? profile.year : `${profile.year}`) : 'Not specified',
          matchPercentage: finalScore,
          matchValue: finalScore, // Ensure this is a number for sorting
          skills: skills,
          score_breakdown: scoreBreakdown,
          skill_match: profile.skill_match !== undefined ? parseFloat(profile.skill_match) : rawSkillMatch,
          availability_match: profile.availability_match !== undefined ? 
              parseFloat(profile.availability_match) : 
              (includeAvailability ? availabilityMatch : 0),
          proficiency_bonus: proficiencyBonus
      };
    });

      // Sort by match percentage (descending)
      allProfiles.sort((a, b) => (b.matchValue || 0) - (a.matchValue || 0));
      
      renderProfiles(allProfiles);
      
      // Show add button if user is the project/group owner
      const currentUserId = parseInt(localStorage.getItem('user_id'));
      const isOwner = contextData && (
        contextData.owner_id === currentUserId || 
        contextData.created_by === currentUserId ||
        (contextData.owner && (contextData.owner.id === currentUserId || contextData.owner.user_id === currentUserId))
      );
      
      if (isOwner) {
        addButton.hidden = false;
      }
    } else {
      // Clear the loading state
      profilesContainer.innerHTML = '';
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

// Event listeners
searchInput?.addEventListener('input', (event) => {
  filterProfiles(event.target.value);
});

// Add event listener for availability toggle
availabilityToggle?.addEventListener('change', () => {
  // Clear the profiles cache to force a reload with the new toggle state
  allProfiles = [];
  // Re-render profiles when toggle state changes
  loadProfiles();
  
  // Log the current state for debugging
  console.log('Availability toggle changed. New state:', availabilityToggle.checked);
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

  if (action === 'request') {
    // Get user data from button attributes
    const userUsn = button.getAttribute('data-user-usn');
    const userName = button.getAttribute('data-user-name') || 'User';
    
    if (!userUsn) {
      showError('Unable to identify user. Please try again.');
      return;
    }
    
    // Check if we have a context (project or study group)
    if (!contextType || !contextId) {
      showError('Unable to send request. Please navigate from a project or study group page.');
      return;
    }
    
    // Check if current user is the owner
    const currentUserId = parseInt(localStorage.getItem('user_id'));
    const isOwner = contextData && (contextData.owner_id === currentUserId || contextData.created_by === currentUserId);
    
    // Debug logging
    console.log('Ownership check:', {
      currentUserId,
      contextDataOwnerId: contextData?.owner_id,
      contextDataCreatedBy: contextData?.created_by,
      isOwner,
      contextData,
      contextType,
      contextId
    });
    
    if (isOwner) {
      // Owner is sending an invitation
      // Show modal for optional message input
      const actionText = contextType === 'project' ? 'Invite to Project' : 'Invite to Group';
      createMessageModal(async (message) => {
        const originalText = button.innerHTML;
        button.disabled = true;
        button.innerHTML = `<span class="loading-spinner"></span> Sending ${actionText}...`;
        
        try {
          try {
            if (contextType === 'project') {
              await projectsAPI.inviteToProject(contextId, userUsn, message);
            } else if (contextType === 'study-group') {
              await groupsAPI.inviteToGroup(contextId, userUsn, message);
            }
          } catch (error) {
            // Check for different variations of the "already a member" error message
            const errorMessage = error.message || '';
            if (errorMessage.includes('already a member') || errorMessage.includes('User is already a member') || 
                (error.response && error.response.data && 
                 (error.response.data.detail || '').includes('already a member'))) {
              // If user is already a member, update the UI to reflect that
              button.innerHTML = '<svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg> Already a Member';
              button.classList.remove('primary-btn');
              button.classList.add('success-btn');
              button.disabled = true;
              showInfo(`${userName} is already a member of this ${contextType === 'project' ? 'project' : 'group'}.`);
              return;
            }
            throw error; // Re-throw other errors to be caught by the outer catch
          }
          
          // Update button to show success state
          button.innerHTML = '<svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg> Invited';
          button.classList.remove('primary-btn');
          button.classList.add('success-btn');
          button.disabled = true;
          
          showSuccess(`Invitation sent to ${userName}! They will be notified.`);
        } catch (error) {
          console.error('Error sending invitation:', error);
          // Check if this is an "already a member" error
          const errorData = error.response?.data || {};
          const errorMessage = errorData.detail || error.message || 'Failed to send invitation. Please try again.';
          
          if (errorMessage.includes('already a member') || errorMessage.includes('User is already a member')) {
            button.innerHTML = '<svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg> Already a Member';
            button.classList.remove('primary-btn');
            button.classList.add('success-btn');
            button.disabled = true;
            showInfo(errorMessage);
          } else {
            // For other errors, show the error message
            showError(errorMessage);
            button.innerHTML = originalText;
            button.disabled = false;
          }
        }
      }, {
        title: `Invite ${userName}`,
        label: 'Message (optional)',
        placeholder: `Why would ${userName} be a great fit for your ${contextType === 'project' ? 'project' : 'group'}?`,
        confirmText: 'Send Invitation'
      });
    } else {
      // Non-owner is requesting to join
      // Show modal for message input
      createMessageModal(async (message) => {
        const originalText = button.innerHTML;
        button.disabled = true;
        button.innerHTML = '<span class="loading-spinner"></span> Sending...';
        
        try {
          let response;
          
          if (contextType === 'project') {
            // Call the project API to send invitation
            response = await projectsAPI.inviteToProject(contextId, userUsn, message);
          } else {
            // Call the study group API to send invitation
            response = await groupsAPI.inviteToGroup(contextId, userUsn, message);
          }
          
          // The API returns a 201 status with a message and invitation object on success
          if (response.message && response.invitation) {
            const successMessage = contextType === 'project'
              ? `Invitation sent to ${userName} successfully!`
              : `Invitation to join the group has been sent to ${userName}!`;
              
            // Show success message in the same style as messages.js
            showSuccess(successMessage, {
              position: 'top-right',
              type: 'success',
              duration: 5000
            });
            
            // Update button state
            button.innerHTML = '<svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg> Invitation Sent';
            button.disabled = true;
          } else {
            throw new Error(response.error || `Failed to send ${contextType === 'project' ? 'invitation' : 'group invite'}`);
          }
        } catch (error) {
          console.error('Error sending request:', error);
          
          // Extract detailed error message
          let errorMsg = 'Failed to send request. Please try again.';
          
          if (error.response) {
            // The request was made and the server responded with a status code
            // that falls out of the range of 2xx
            const { status, data } = error.response;
            console.error('Response error:', status, data);
            
            if (status === 400 && data.detail) {
              // Handle 400 Bad Request with detail message
              errorMsg = data.detail;
            } else if (status === 403) {
              errorMsg = data.detail || 'You do not have permission to perform this action.';
            } else if (status === 404) {
              errorMsg = data.detail || 'The requested resource was not found.';
            } else if (data.detail) {
              errorMsg = data.detail;
            } else if (typeof data === 'string') {
              errorMsg = data;
            } else if (data.errors) {
              // Handle validation errors
              errorMsg = Object.entries(data.errors)
                .map(([field, messages]) => `${field}: ${Array.isArray(messages) ? messages.join(', ') : messages}`)
                .join('; ');
            }
          } else if (error.request) {
            // The request was made but no response was received
            console.error('No response received:', error.request);
            errorMsg = 'No response from server. Please check your connection and try again.';
          } else if (error.message) {
            // Something happened in setting up the request
            console.error('Request setup error:', error.message);
            errorMsg = `Request error: ${error.message}`;
          }
          
          // Show the error message to the user
          showError(errorMsg, { 
            duration: 5000, // Show for 5 seconds
            dismissible: true // Allow user to dismiss
          });
          
          // Restore button state
          button.innerHTML = originalText;
          button.disabled = false;
        }
      });
    }
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
      console.error('Error adding team member:', error);
      showError(error.message || 'Failed to add team member');
    } finally {
      button.disabled = false;
    }
  }
});

document.addEventListener('DOMContentLoaded', () => {
  const toggleInfo = document.getElementById('toggleInfo');
  const infoContent = document.getElementById('infoContent');
  const infoBox = document.querySelector('.info-box');

  if (toggleInfo && infoBox) {
    toggleInfo.addEventListener('click', () => {
      const isExpanded = toggleInfo.getAttribute('aria-expanded') === 'true';
      toggleInfo.setAttribute('aria-expanded', !isExpanded);
      infoContent.setAttribute('aria-hidden', isExpanded);
      infoBox.classList.toggle('collapsed', isExpanded);

      // Save the collapsed state to localStorage
      localStorage.setItem('infoBoxCollapsed', isExpanded.toString());
    });

    // Load the collapsed state from localStorage
    const isCollapsed = localStorage.getItem('infoBoxCollapsed') === 'true';
    if (isCollapsed) {
      toggleInfo.setAttribute('aria-expanded', 'false');
      infoContent.setAttribute('aria-hidden', 'true');
      infoBox.classList.add('collapsed');
    }
  }

  // Initialize context and load profiles
  initializePageContext();
  loadProfiles();
});