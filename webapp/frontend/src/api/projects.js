const API_BASE_URL = 'http://localhost:8000/api/projects';

// Helper function to handle API requests
async function fetchAPI(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  
  // Set default headers
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // Add auth token if available
  const token = localStorage.getItem('authToken');
  if (token) {
    headers['Authorization'] = `Token ${token}`;
  }

  // Ensure CSRF token
  const csrftoken = document.querySelector('[name=csrfmiddlewaretoken]')?.value ||
                    localStorage.getItem('csrftoken');
  if (csrftoken) {
    headers['X-CSRFToken'] = csrftoken;
  }

  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include',
    });
  } catch (networkError) {
    throw new Error('Unable to connect to server. Please check your internet connection.');
  }

  // Handle 401 Unauthorized
  if (response.status === 401) {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    window.location.href = '/login.html';
    throw new Error('Your session has expired. Please log in again.');
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    // Handle different error scenarios with specific messages
    let errorMessage = 'Something went wrong';
    
    if (data) {
      if (data.detail) {
        errorMessage = data.detail;
      } else if (data.message) {
        errorMessage = data.message;
      } else if (data.error) {
        errorMessage = data.error;
      } else if (data.non_field_errors && Array.isArray(data.non_field_errors)) {
        errorMessage = data.non_field_errors[0];
      } else {
        // Extract field-specific errors
        const fieldErrors = Object.entries(data)
          .filter(([key, value]) => Array.isArray(value) && value.length > 0)
          .map(([key, value]) => `${key}: ${value[0]}`);
        
        if (fieldErrors.length > 0) {
          errorMessage = fieldErrors.join(', ');
        }
      }
    }
    
    const err = new Error(errorMessage);
    err.data = data;
    throw err;
  }

  return data;
}

// Projects API
export const projectsAPI = {
  // Fetch available skills
  async fetchSkills(departmentId = null) {
    try {
      // Skills are fetched from auth API, not projects API
      const authAPIBase = 'http://localhost:8000/api/auth';
      const token = localStorage.getItem('authToken');
      const headers = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Token ${token}`;
      }

      let endpoint = `${authAPIBase}/skills/`;
      if (departmentId) {
        endpoint += `?department_id=${departmentId}`;
      }

      const response = await fetch(endpoint, {
        method: 'GET',
        headers,
        credentials: 'include',
      });

      if (response.status === 401) {
        window.location.href = '/login.html';
        throw new Error('Unauthorized');
      }

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail || data.error || 'Failed to fetch skills');
      }

      return data;
    } catch (error) {
      console.error('Skill fetching error:', error);
      throw error;
    }
  },

  // Create a new project
  async createProject(projectData) {
    return fetchAPI('/create/', {
      method: 'POST',
      body: JSON.stringify(projectData)
    });
  },

  // Save project as draft
  async saveDraftProject(projectData) {
    return fetchAPI('/draft/', {
      method: 'POST',
      body: JSON.stringify({
        ...projectData,
        isDraft: true
      })
    });
  },

  // Get user's projects
  async getUserProjects() {
    return fetchAPI('/my-projects/');
  },

  // Get all projects (for search)
  async getAllProjects() {
    return fetchAPI('/all/');
  },

  // Get project details by ID
  async getProjectDetails(projectId) {
    return fetchAPI(`/${projectId}/`);
  },

  // Discover update schema/choices via HTTP OPTIONS
  async getProjectUpdateOptions(projectId) {
    return fetchAPI(`/${projectId}/update/`, {
      method: 'OPTIONS'
    });
  },

  // Update an existing project
  async updateProject(projectId, projectData) {
    // Try multiple encodings for status to satisfy backend choices when OPTIONS is unavailable
    const original = { ...projectData };
    const label = String(original.status || '');
    const lower = label.toLowerCase();
    const title = lower ? lower.charAt(0).toUpperCase() + lower.slice(1) : label;
    const upper = label.toUpperCase();
    const shortMap = {
      planning: ['P', 'PL', 'PLAN', 'PLANNING'],
      active: ['A', 'AC', 'ACT', 'ACTIVE'],
      completed: ['C', 'CO', 'COMP', 'COMPLETED']
    };
    const numericMap = {
      planning: [1, '1', 0, '0'],
      active: [2, '2', 1, '1'],
      completed: [3, '3', 2, '2']
    };
    const guesses = [];
    // Start with what caller provided
    if (label) guesses.push(label);
    // Common casings
    if (title && !guesses.includes(title)) guesses.push(title);
    if (lower && !guesses.includes(lower)) guesses.push(lower);
    if (upper && !guesses.includes(upper)) guesses.push(upper);
    // Short codes
    const bucket = shortMap[lower];
    if (bucket) {
      bucket.forEach(v => { if (!guesses.includes(v)) guesses.push(v); });
    }
    // Numeric codes (common enum patterns)
    const nums = numericMap[lower];
    if (nums) {
      nums.forEach(v => { if (!guesses.includes(v)) guesses.push(v); });
    }

    let lastError;
    for (const candidate of guesses) {
      const attempt = { ...original, status: candidate };
      try {
        return await fetchAPI(`/${projectId}/update/`, {
          method: 'PUT',
          body: JSON.stringify(attempt)
        });
      } catch (e) {
        lastError = e;
        // If it's clearly an invalid choice error, continue trying; else rethrow
        const msg = String(e?.message || '').toLowerCase();
        if (!(msg.includes('not a valid choice') || msg.includes('must be one of'))) {
          throw e;
        }
        // Debug info to help diagnose which values fail
        try {
          console.warn('Status candidate rejected:', candidate, '| server says:', e.message);
        } catch (_) { /* no-op */ }
      }
    }
    throw lastError || new Error('Failed to update project status with any known encoding');
  },
  
  async joinProject(projectId, message = '') {
    return fetchAPI(`/${projectId}/join/`, {
      method: 'POST',
      body: JSON.stringify({ message: message }),
    });
  },
  
  async leaveProject(projectId, message = '') {
    return fetchAPI(`/${projectId}/leave/`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
  },

  async addTeamMember(projectId, userUsn) {
    return fetchAPI(`/${projectId}/add-member/`, {
      method: 'POST',
      body: JSON.stringify({ user_usn: userUsn }),
    });
  },

  async inviteToProject(projectId, userUsn, message = '') {
    return fetchAPI(`/${projectId}/invite/`, {
      method: 'POST',
      body: JSON.stringify({ user_usn: userUsn, message: message }),
    });
  },
};

export default projectsAPI;