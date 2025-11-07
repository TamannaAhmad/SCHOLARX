import { projectsAPI } from '../src/api/projects.js';
import { groupsAPI } from '../src/api/groups.js';
import { showError as showErrorUtil, handleAPIError } from '../src/utils/errorHandler.js';

// DOM elements
const searchInput = document.getElementById('searchInput');
const groupsResults = document.getElementById('groupsResults');
const projectsResults = document.getElementById('projectsResults');
const groupsEmptyState = document.getElementById('groupsEmptyState');
const projectsEmptyState = document.getElementById('projectsEmptyState');
const groupCardTemplate = document.getElementById('groupCardTemplate');
const projectCardTemplate = document.getElementById('projectCardTemplate');

// Data storage
let allProjects = [];
let allGroups = [];

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

// Load all projects and study groups
async function loadAllData() {
  try {
    // Try to fetch all projects and groups
    // If these endpoints don't exist, they'll fall back to user's own items
    try {
      allProjects = await projectsAPI.getAllProjects();
    } catch (error) {
      console.warn('getAllProjects endpoint not available, using getUserProjects:', error);
      try {
        // Fallback to user's projects if endpoint doesn't exist
        allProjects = await projectsAPI.getUserProjects();
      } catch (fallbackError) {
        const errorMsg = handleAPIError(fallbackError, 'Failed to load projects. Please refresh the page.');
        showError(errorMsg);
        allProjects = [];
      }
    }

    try {
      allGroups = await groupsAPI.getAllGroups();
    } catch (error) {
      console.warn('getAllGroups endpoint not available, using listMyGroups:', error);
      try {
        // Fallback to user's groups if endpoint doesn't exist
        allGroups = await groupsAPI.listMyGroups();
      } catch (fallbackError) {
        const errorMsg = handleAPIError(fallbackError, 'Failed to load study groups. Please refresh the page.');
        showError(errorMsg);
        allGroups = [];
      }
    }

    // Initial render with all data
    performSearch('');
  } catch (error) {
    console.error('Error loading data:', error);
    const errorMsg = handleAPIError(error, 'Failed to load search data. Please refresh the page.');
    showError(errorMsg);
    // Initialize with empty arrays to prevent further errors
    allProjects = allProjects || [];
    allGroups = allGroups || [];
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
  const keywords = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  
  if (keywords.length === 0) {
    renderGroups(allGroups);
    renderProjects(allProjects);
    return;
  }

  // Filter groups and projects based on search query
  const filteredGroups = allGroups.filter(group => 
    matchesSearch(group, keywords)
  );

  const filteredProjects = allProjects.filter(project => 
    matchesSearch(project, keywords)
  );

  renderGroups(filteredGroups);
  renderProjects(filteredProjects);
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
    console.log('Processing group:', { 
      name: item.name, 
      topics: item.topics, 
      topicsType: typeof item.topics,
      topicsDisplay: item.topics_display
    });

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
      
      // Log the raw topics value before processing
      console.log('Raw topics value:', topicsSource);
      
      // Handle different possible formats of topics
      if (Array.isArray(topicsSource)) {
        topics = [...topicsSource]; // Create a copy of the array
        console.log('Topics is an array');
      } else if (typeof topicsSource === 'string') {
        console.log('Topics is a string, splitting by comma');
        // Handle case where topics is a comma-separated string
        topics = topicsSource.split(',').map(t => t.trim()).filter(t => t);
      } else {
        console.log('Using fallback topics processing');
        // Fallback for any other format
        topics = String(topicsSource).split(',').map(t => t.trim()).filter(t => t);
      }
      
      // Debug log to see the processed topics
      console.log('Processed topics array:', topics);
      
      // Check each topic individually
      topics.forEach((topic, index) => {
        if (topic) {  // Ensure topic is not empty
          console.log(`Processing topic ${index + 1}:`, topic);
          const topicScore = checkField(topic, fieldWeights.topics);
          console.log(`Topic "${topic}" match score:`, topicScore);
          matchScore += topicScore;
          
          // Also check for partial matches within each topic
          if (topic.includes(' ')) {
            topic.split(' ').forEach(word => {
              if (word.length > 2) {  // Only check words longer than 2 characters
                const wordScore = checkField(word, fieldWeights.topics * 0.7);
                if (wordScore > 0) {
                  console.log(`  Found match in word "${word}":`, wordScore);
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
    const topicsMeta = card.querySelector('[data-field="topics"]');

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

    // Set group size
    console.log('Group members data:', {
      groupId: group.group_id,
      max_members: group.max_members,
      max_size: group.max_size,
      members: group.members,
      membersLength: group.members ? group.members.length : 0
    });
    
    const currentMembers = group.members ? group.members.length : 1; // At least 1 for the creator
    const maxMembers = group.max_members ?? group.max_size; // Use max_members or fall back to max_size
    
    if (maxMembers !== undefined && maxMembers !== null) {
      groupSizeMeta.textContent = `Members: ${currentMembers}/${maxMembers}`;
    } else {
      // If neither max_members nor max_size is available, just show the current member count
      groupSizeMeta.textContent = `Members: ${currentMembers}`;
    }
    groupSizeMeta.hidden = false;

    // Set topics
    if (group.topics || group.topics_display) {
      const topics = Array.isArray(group.topics) 
        ? group.topics 
        : (group.topics_display || (group.topics ? group.topics.split(',').map(t => t.trim()).filter(t => t) : []));
      
      if (topics && topics.length > 0) {
        topicsMeta.textContent = `Topics: ${topics.slice(0, 3).join(', ')}${topics.length > 3 ? '...' : ''}`;
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
  
  console.log('Rendering projects:', projects);

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

    // Set team size for projects
    console.log('Project team data:', {
      projectId: project.project_id,
      max_team_size: project.max_team_size,
      max_members: project.max_members,
      members: project.members,
      membersLength: project.members ? project.members.length : 0
    });
    
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

// Show error message wrapper
function showError(message) {
  showErrorUtil(message, { duration: 5000 });
}


