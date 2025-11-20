import { projectsAPI } from '../src/api/projects.js';
import { groupsAPI } from '../src/api/groups.js';
import profilesAPI from '../src/api/profiles.js';
import { showError as showErrorUtil, handleAPIError } from '../src/utils/errorHandler.js';

// DOM elements
const searchInput = document.getElementById('searchInput');
const groupsResults = document.getElementById('groupsResults');
const projectsResults = document.getElementById('projectsResults');
const groupsEmptyState = document.getElementById('groupsEmptyState');
const projectsEmptyState = document.getElementById('projectsEmptyState');
const groupCardTemplate = document.getElementById('groupCardTemplate');
const projectCardTemplate = document.getElementById('projectCardTemplate');
const profilesResults = document.getElementById('profilesResults');
const profilesEmptyState = document.getElementById('profilesEmptyState');
const profileCardTemplate = document.getElementById('profileCardTemplate');

// Data storage
let allProjects = [];
let allGroups = [];
let allProfiles = [];

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await loadAllData();
    setupEventListeners();
  } catch (error) {
    console.error('Failed to initialize search page:', error);
    showError('Failed to load data. Please refresh the page.');
  }
});

// Load all projects, study groups, and profiles
async function loadAllData() {
  try {
    // Load projects
    try {
      allProjects = await projectsAPI.getAllProjects();
    } catch (error) {
      console.warn('getAllProjects endpoint not available, using getUserProjects:', error);
      try {
        allProjects = await projectsAPI.getUserProjects();
      } catch (fallbackError) {
        console.error('Error getting user projects:', fallbackError);
        allProjects = [];
      }
    }

    // Load groups
    try {
      allGroups = await groupsAPI.getAllGroups();
      console.log('Loaded groups:', allGroups);
    } catch (error) {
      console.error('Error loading study groups:', error);
      allGroups = [];
    }

    // Load profiles
    try {
      allProfiles = await profilesAPI.getAllProfiles();
      console.log('Loaded profiles:', allProfiles);
    } catch (error) {
      console.error('Error loading profiles:', error);
      allProfiles = [];
    }

    // Initial render
    performSearch('');
  } catch (error) {
    console.error('Unexpected error in loadAllData:', error);
    showError('Failed to load data. Please try again later.');
    performSearch('');
  }
}

// Setup event listeners
function setupEventListeners() {
  // Search input with debounce
  let searchTimeout;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      performSearch(e.target.value);
    }, 300);
  });

  // Enter key on search input
  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(searchTimeout);
      performSearch(e.target.value);
    }
  });
}

// Perform search
function performSearch(query) {
  const keywords = query.toLowerCase().split(/\s+/).filter(Boolean);
  
  if (keywords.length === 0) {
    renderGroups(allGroups);
    renderProjects(allProjects);
    renderProfiles(allProfiles);
    return;
  }

  const filteredGroups = allGroups.filter(group => matchesSearch(group, keywords));
  const filteredProjects = allProjects.filter(project => matchesSearch(project, keywords));
  const filteredProfiles = allProfiles.filter(profile => matchesProfileSearch(profile, keywords));
  
  renderGroups(filteredGroups);
  renderProjects(filteredProjects);
  renderProfiles(filteredProfiles);
}

// Check if an item matches the search keywords
function matchesSearch(item, keywords) {
  // Store field matches with weights
  const fieldWeights = {
    name: 3,        // Higher weight for name
    title: 3,       // Higher weight for title
    subject: 2,     // Medium weight for subject
    course_code: 2, // Medium weight for course code
    topics: 1.5,    // Slightly higher weight for topics
    skills: 1.5,    // Slightly higher weight for skills
    description: 1  // Lower weight for description
  };

  let matchScore = 0;
  const requiredMatches = keywords.length;
  let matchesFound = 0;

  // Helper function to check for matches in a field
  const checkField = (fieldValue, weight = 1) => {
    if (!fieldValue) return 0;
    
    const fieldStr = String(fieldValue).toLowerCase();
    let fieldScore = 0;
    
    keywords.forEach(keyword => {
      // Check for exact match first
      if (fieldStr === keyword) {
        fieldScore += 2 * weight;
      }
      // Check for partial match
      else if (fieldStr.includes(keyword)) {
        fieldScore += 1 * weight;
      }
    });
    
    return fieldScore;
  };

  // For study groups
  if (item.group_id !== undefined) {
    // Check name with higher weight
    if (item.name) matchScore += checkField(item.name, fieldWeights.name);
    
    // Check subject area with medium weight
    if (item.subject_area) matchScore += checkField(item.subject_area, fieldWeights.subject);
    
    // Check course code with medium weight
    if (item.course_code) matchScore += checkField(item.course_code, fieldWeights.course_code);
    
    // Check topics with slightly higher weight
    // Prefer topics_display if available, fall back to topics
    const topicsSource = item.topics_display || item.topics;
    
    if (topicsSource) {
      let topics = [];
      
      // Handle different possible formats of topics
      if (Array.isArray(topicsSource)) {
        topics = [...topicsSource]; // Create a copy of the array
      } else if (typeof topicsSource === 'string') {
        // Handle case where topics is a comma-separated string
        topics = topicsSource.split(',').map(t => t.trim()).filter(t => t);
      } else {
        console.log('Using fallback topics processing');
        // Fallback for any other format
        topics = String(topicsSource).split(',').map(t => t.trim()).filter(t => t);
      }
      
      // Check each topic individually
      topics.forEach((topic, index) => {
        if (topic) {  // Ensure topic is not empty
          const topicScore = checkField(topic, fieldWeights.topics);
          matchScore += topicScore;
          
          // Also check for partial matches within each topic
          if (topic.includes(' ')) {
            topic.split(' ').forEach(word => {
              if (word.length > 2) {  // Only check words longer than 2 characters
                const wordScore = checkField(word, fieldWeights.topics * 0.7);
                if (wordScore > 0) {
                  matchScore += wordScore;
                }
              }
            });
          }
        } else {
          console.log('Skipping empty topic');
        }
      });
      
      console.log('Total match score after topics:', matchScore);
    } else {
      console.log('No topics found in item');
    }
    
    // Check description with lower weight
    if (item.description) matchScore += checkField(item.description, fieldWeights.description);
  } 
  // For projects
  else if (item.project_id !== undefined) {
    // Check title with higher weight
    if (item.title) matchScore += checkField(item.title, fieldWeights.title);
    
    // Check skills with slightly higher weight
    if (item.skills && Array.isArray(item.skills)) {
      item.skills.forEach(skill => {
        const skillName = skill.skill_name || skill.skill?.name || skill.name || '';
        matchScore += checkField(skillName, fieldWeights.skills);
      });
    }
    
    // Check description with lower weight
    if (item.description) matchScore += checkField(item.description, fieldWeights.description);
  }

  // For profiles
  if (item.profile_id !== undefined) {
    // Check name with higher weight
    if (item.name) matchScore += checkField(item.name, fieldWeights.name);
    
    // Check department with medium weight
    if (item.department) matchScore += checkField(item.department, fieldWeights.department);
    
    // Check year with medium weight
    if (item.year) matchScore += checkField(item.year, fieldWeights.year);
    
    // Check skills with slightly higher weight
    if (item.skills && Array.isArray(item.skills)) {
      item.skills.forEach(skill => {
        const skillName = skill.skill_name || skill.skill?.name || skill.name || '';
        matchScore += checkField(skillName, fieldWeights.skills);
      });
    }
    const profileText = [
            item.name || '',
            item.department || '',
            item.year ? `year ${item.year}` : '',
            item.skills ? item.skills.map(s => typeof s === 'string' ? s : s.name || '').join(' ') : ''
        ].join(' ').toLowerCase();

        matchesFound = keywords.filter(keyword => profileText.includes(keyword)).length;
        return matchesFound >= Math.max(1, requiredMatches * 0.5) && matchScore > 0;
    }
    
    // If we get here, it's not a profile, so we need to reset matchesFound
    matchesFound = 0;

  // Count how many keywords were matched (at least partially)
  const fullText = [
    item.name || '',
    item.title || '',
    item.subject_area || '',
    item.course_code || '',
    // Include both topics and topics_display in the search
    item.topics_display ? (Array.isArray(item.topics_display) ? item.topics_display.join(' ') : String(item.topics_display)) : '',
    item.topics ? (Array.isArray(item.topics) ? item.topics.join(' ') : String(item.topics)) : '',
    item.description || '',
    item.skills ? item.skills.map(s => s.skill_name || s.skill?.name || s.name || '').join(' ') : ''
  ].join(' ').toLowerCase();

  matchesFound = keywords.filter(keyword => fullText.includes(keyword)).length;

  // Return true if all keywords are found and the match score is above threshold
  return matchesFound >= Math.max(1, requiredMatches * 0.5) && matchScore > 0;
}

// Check if a profile matches search keywords
function matchesProfileSearch(profile, keywords) {
  if (!profile) return false;

  const searchFields = [
    profile.first_name || '',
    profile.last_name || '',
    profile.email || '',
    profile.usn || '',
    profile.bio || '',
    profile.department ? (typeof profile.department === 'object' ? profile.department.name : profile.department) : '',
    profile.study_year || '',
    (profile.skills || []).map(skill => skill.skill?.name || skill.skill_name || skill.name || '').join(' '),
    (profile.user_skills || []).map(skill => skill.name).join(' ')
  ].join(' ').toLowerCase();

  return keywords.some(keyword => 
    searchFields.includes(keyword)
  );
}

// Render study groups
function renderGroups(groups) {
  groupsResults.innerHTML = '';
  
  if (groups.length === 0) {
    groupsEmptyState.hidden = false;
    return;
  }
  
  console.log('Rendering groups:', groups);

  groupsEmptyState.hidden = true;

  groups.forEach(group => {
    const card = groupCardTemplate.content.cloneNode(true);
    const cardElement = card.querySelector('.group-card');
    const titleLink = card.querySelector('.result-card-link');
    const description = card.querySelector('.result-card-description');
    const subjectMeta = card.querySelector('[data-field="subject"]');
    const courseCodeMeta = card.querySelector('[data-field="course_code"]');
    const groupSizeMeta = card.querySelector('[data-field="group_size"]');
    const skillsMeta = card.querySelector('[data-field="skills"]');

    // Set title and link
    titleLink.textContent = group.name || 'Unnamed Group';
    titleLink.href = `study-group-view.html?id=${group.group_id}`;
    titleLink.setAttribute('data-group-id', group.group_id);

    // Set description
    description.textContent = group.description || 'No description available.';

    // Set subject
    if (group.subject_area) {
      subjectMeta.textContent = `Subject: ${group.subject_area}`;
      subjectMeta.hidden = false;
    } else {
      subjectMeta.hidden = true;
    }

    // Set course code
    if (group.course_code) {
      courseCodeMeta.textContent = `Course: ${group.course_code}`;
      courseCodeMeta.hidden = false;
    } else {
      courseCodeMeta.hidden = true;
    }
    
    const currentMembers = group.members ? group.members.length : 1; // At least 1 for the creator
    const maxMembers = group.max_members ?? group.max_size; // Use max_members or fall back to max_size
    
    if (maxMembers !== undefined && maxMembers !== null) {
      groupSizeMeta.textContent = `Members: ${currentMembers}/${maxMembers}`;
    } else {
      // If neither max_members nor max_size is available, just show the current member count
      groupSizeMeta.textContent = `Members: ${currentMembers}`;
    }
    groupSizeMeta.hidden = false;

    // Set skills (using topics meta item since that's what's in the template)
    const topicsMeta = card.querySelector('[data-field="topics"]');
    
    // Check both skills and studygroupskill_set for backward compatibility
    const skills = group.skills || group.studygroupskill_set || [];
    
    if (skills.length > 0) {
      const skillsText = skills
        .map(skill => {
          // Handle both direct skill object and nested studygroupskill_set structure
          if (skill.skill) {
            return skill.skill.name || 'None';
          }
          return skill.name || 'None';
        })
        .filter(skillName => skillName) // Remove empty strings
        .join(', ');
        
      if (skillsText) {
        topicsMeta.textContent = `Skills: ${skillsText}`;
        topicsMeta.hidden = false;
      } else {
        topicsMeta.hidden = true;
      }
    } else {
      topicsMeta.hidden = true;
    }

    groupsResults.appendChild(card);
  });
}

// Render projects
function renderProjects(projects) {
  projectsResults.innerHTML = '';
  
  if (projects.length === 0) {
    projectsEmptyState.hidden = false;
    return;
  }

  projectsEmptyState.hidden = true;

  projects.forEach(project => {
    const card = projectCardTemplate.content.cloneNode(true);
    const cardElement = card.querySelector('.project-card');
    const titleLink = card.querySelector('.result-card-link');
    const description = card.querySelector('.result-card-description');
    const statusMeta = card.querySelector('[data-field="status"]');
    const teamSizeMeta = card.querySelector('[data-field="team_size"]');
    const skillsMeta = card.querySelector('[data-field="skills"]');

    // Set title and link
    titleLink.textContent = project.title || 'Unnamed Project';
    titleLink.href = `project-view.html?id=${project.project_id}`;
    titleLink.setAttribute('data-project-id', project.project_id);

    // Set description
    description.textContent = project.description || 'No description available.';

    // Set status
    if (project.status) {
      statusMeta.textContent = `Status: ${project.status}`;
      statusMeta.hidden = false;
    } else {
      statusMeta.hidden = true;
    }
    
    const currentMembers = project.members ? project.members.length : 1; // At least 1 for the creator
    const maxTeamSize = project.max_team_size ?? project.max_members; // First check max_team_size, then fall back to max_members
    
    if (maxTeamSize !== undefined && maxTeamSize !== null) {
      teamSizeMeta.textContent = `Members: ${currentMembers}/${maxTeamSize}`;
    } else {
      // If neither max_team_size nor max_members is available, just show the current member count
      teamSizeMeta.textContent = `Members: ${currentMembers}`;
    }
    teamSizeMeta.hidden = false;

    // Set skills
    if (project.skills && Array.isArray(project.skills) && project.skills.length > 0) {
      const skillNames = project.skills
        .map(skill => skill.skill_name || skill.skill?.name || skill.name)
        .filter(name => name);
      
      if (skillNames.length > 0) {
        skillsMeta.textContent = `Skills: ${skillNames.slice(0, 3).join(', ')}${skillNames.length > 3 ? '...' : ''}`;
        skillsMeta.hidden = false;
      } else {
        skillsMeta.hidden = true;
      }
    } else {
      skillsMeta.hidden = true;
    }

    projectsResults.appendChild(card);
  });
}

// Render profiles
function renderProfiles(profiles) {
  const container = document.getElementById('profilesResults');
  const emptyState = document.getElementById('profilesEmptyState');
  const template = document.getElementById('profileCardTemplate');
  
  if (!container) return;
  
  container.innerHTML = '';
  
  if (!profiles || profiles.length === 0) {
    if (emptyState) {
      emptyState.hidden = false;
    }
    return;
  }
  
  if (emptyState) emptyState.hidden = true;
  
  profiles.forEach(profile => {
    const card = template.content.cloneNode(true);
    const profileLink = card.querySelector('.result-card-link');
    const profileUsn = card.querySelector('.profile-usn');
    const profileDepartment = card.querySelector('.profile-department');
    const skillsMeta = card.querySelector('#profileSkillsMeta');

    // Set profile data
    const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim() || 'User';
    const department = profile.department ? 
        (typeof profile.department === 'object' ? profile.department.name : profile.department) : '';
    const studyYear = profile.study_year ? `Year ${profile.study_year}` : '';
    
    // Set basic info
    if (profileLink) {
        profileLink.textContent = fullName;
        profileLink.href = `userprofile.html?usn=${encodeURIComponent(profile.usn || '')}`;
        profileLink.setAttribute('data-profile-id', profile.profile_id || '');
    }
    if (profileUsn) profileUsn.textContent = profile.usn || '';
    if (profileDepartment) {
        profileDepartment.textContent = [department, studyYear].filter(Boolean).join(' • ');
    }
    
    // Set skills as meta-items
    if (skillsMeta && profile.skills && profile.skills.length > 0) {
        profile.skills.forEach(skill => {
            const skillName = skill.skill?.name || skill.skill_name || 'Unknown Skill';
            const skillElement = document.createElement('span');
            skillElement.className = 'meta-item';
            skillElement.textContent = skillName;
            skillsMeta.appendChild(skillElement);
        });
    }
    
    container.appendChild(card);
  });
}

// Show error message wrapper
function showError(message) {
  showErrorUtil(message, { duration: 5000 });
}


