// API Configuration
// Automatically detects environment and sets the correct API base URL

const getAPIBaseURL = () => {
  const hostname = window.location.hostname;
  const protocol = window.location.protocol;
  
  // Development environments
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:8000/api';
  }
  
  // Production - use same domain
  return `${protocol}//${hostname}/api`;
};

const API_BASE_URL = getAPIBaseURL();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { API_BASE_URL };
}
