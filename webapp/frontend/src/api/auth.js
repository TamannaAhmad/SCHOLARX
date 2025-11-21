// Get API base URL from config (or use fallback)
const getAPIBaseURL = () => {
  const hostname = window.location.hostname;
  const protocol = window.location.protocol;
  
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:8000/api/auth';
  }
  
  return `${protocol}//${hostname}/api/auth`;
};

const API_BASE_URL = getAPIBaseURL();

// Helper function to handle API requests
async function fetchAPI(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  
  // Set default headers
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // Note: Auth token is now stored in httpOnly cookie by backend
  // No need to manually add Authorization header - cookies are sent automatically with credentials: 'include'

  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include', // Important for cookies/session
    });
  } catch (networkError) {
    // Network error - server not reachable
    throw new Error('Unable to connect to server. Please check your internet connection.');
  }

  // Handle 401 Unauthorized
  if (response.status === 401) {
    // Session expired - redirect to login
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
    
    throw new Error(errorMessage);
  }

  return data;
}

// Knox doesn't use refresh tokens, so no token management needed

// Auth API
export const authAPI = {
  // Register new user
  async register(userData) {
    // The userData object already has the correct structure from the form
    return fetchAPI('/register/', {
      method: 'POST',
      body: JSON.stringify(userData)
    });
  },

  // Login user
  async login(email, password) {
    const response = await fetchAPI('/login/', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    
    // Token is now stored in httpOnly cookie by backend
    // No need to manually save to localStorage
    
    return response;
  },

  // Logout user
  logout() {
    // Token is cleared by backend when logout endpoint is called
    return fetchAPI('/logout/', { method: 'POST' });
  },

  // Get current user profile
  async getProfile() {
    return fetchAPI('/profile/');
  },

  // Update user profile
  async updateProfile(profileData) {
    return fetchAPI('/profile/', {
      method: 'PUT',
      body: JSON.stringify(profileData)
    });
  },

  // Get current user's skill assignments
  async getUserSkills() {
    return fetchAPI('/user/skills/');
  },

  // Get skills list with optional search
  async getSkills(search = '') {
    return fetchAPI(`/skills/${search ? `?q=${encodeURIComponent(search)}` : ''}`);
  },

  // Check if email exists
  async checkEmail(email) {
    return fetchAPI(`/check-email/?email=${encodeURIComponent(email)}`);
  },

  // Check if USN exists
  async checkUSN(usn) {
    return fetchAPI(`/check-usn/?usn=${encodeURIComponent(usn)}`);
  },

  // Get all users for teammates (excludes current user)
  async getAllUsers() {
    return fetchAPI('/users/');
  }
};

export default authAPI;
