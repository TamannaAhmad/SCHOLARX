// Base URL for API requests
const API_BASE_URL = 'http://127.0.0.1:8000/api';

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

  // Ensure CSRF token for non-GET requests
  if (options.method && options.method !== 'GET') {
    const csrftoken = document.querySelector('[name=csrfmiddlewaretoken]')?.value ||
                     document.cookie.match(/csrftoken=([^;]+)/)?.[1];
    if (csrftoken) {
      headers['X-CSRFToken'] = csrftoken;
    }
  }

  const config = {
    ...options,
    headers,
    credentials: 'include',  // Include cookies for CSRF
  };

  try {
    console.log('Fetching:', url);
    const response = await fetch(url, config);
    
    // Log response status and headers for debugging
    console.log('Response status:', response.status, response.statusText);
    
    // Get response text first to handle potential non-JSON responses
    const responseText = await response.text();
    let data;
    
    try {
      data = responseText ? JSON.parse(responseText) : null;
    } catch (e) {
      console.error('Failed to parse JSON response:', e);
      console.error('Response text:', responseText);
      const error = new Error('Invalid JSON response from server');
      error.responseText = responseText;
      error.status = response.status;
      throw error;
    }
    
    if (!response.ok) {
      const error = new Error(data?.detail || data?.message || 'Something went wrong');
      error.status = response.status;
      error.response = data;
      throw error;
    }

    return data;
  } catch (error) {
    console.error('API request failed:', error);
    throw error;
  }
}

// Get all user profiles
export async function getAllProfiles() {
  try {
    const token = localStorage.getItem('authToken');
    if (!token) {
      console.warn('No auth token found. User may need to log in.');
      return [];
    }
    
    const response = await fetch('http://127.0.0.1:8000/api/auth/users/', {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${token}`
      },
      credentials: 'include'
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Failed to fetch profiles:', response.status, error);
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const profiles = await response.json();
    // Filter out staff members (superusers, admins, etc.)
    return Array.isArray(profiles) ? profiles.filter(profile => !profile.is_staff) : [];
  } catch (error) {
    console.error('Error in getAllProfiles:', error);
    throw error;
  }
}

// Get a single user profile by USN
export async function getProfileByUsn(usn) {
  try {
    const data = await fetchAPI(`/accounts/profile/${usn}/`);
    return data || null;
  } catch (error) {
    console.error(`Failed to fetch profile for USN ${usn}:`, error);
    throw error;
  }
}

const profilesAPI = {
  getAllProfiles,
  getProfileByUsn,
};

export default profilesAPI;
