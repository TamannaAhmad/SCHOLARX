import { authAPI } from './auth.js';

// Get API base URL from environment
const getAPIBaseURL = () => {
  const hostname = window.location.hostname;
  const protocol = window.location.protocol;
  
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:8000/api/projects';
  }
  
  return `${protocol}//${hostname}/api/projects`;
};

const API_BASE_URL = getAPIBaseURL();

async function fetchAPI(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // Token is now in httpOnly cookie, sent automatically with credentials: 'include'

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

  if (response.status === 401) {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    window.location.href = '/login.html';
    throw new Error('Your session has expired. Please log in again.');
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
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
        const fieldErrors = Object.entries(data)
          .filter(([key, value]) => Array.isArray(value) && value.length > 0)
          .map(([key, value]) => `${key}: ${value[0]}`);
        
        if (fieldErrors.length > 0) {
          errorMessage = fieldErrors.join(', ');
        }
      }
    }
    
    console.error('API Error:', errorMessage);
    throw new Error(errorMessage);
  }
  return data;
}

export const messagesAPI = {
  // Get all messages for the current user
  getMessages() {
    return fetchAPI('/messages/');
  },

  // Get incoming join requests (for owners)
  getIncomingRequests() {
    return fetchAPI('/messages/incoming/');
  },

  // Get outgoing join requests (for requesters)
  getOutgoingRequests() {
    return fetchAPI('/messages/outgoing/');
  },

  // Get incoming invitations (for invitees)
  getIncomingInvitations() {
    return fetchAPI('/invitations/');
  },

  // Get sent invitations (for inviters)
  getSentInvitations() {
    return fetchAPI('/invitations/sent/');
  },

  getLeaveRequests(){
    return fetchAPI('/leave-requests')
  },

  // Respond to an invitation (accept/decline)
  respondToInvitation(inviteId, accepted) {
    return fetchAPI(`/invitations/${inviteId}/respond/`, {
      method: 'POST',
      body: JSON.stringify({ action: accepted ? 'accept' : 'decline' }),
    });
  },

  // Approve a join request
  approveRequest(requestId) {
    return fetchAPI(`/messages/${requestId}/approve/`, {
      method: 'POST',
    });
  },

  // Reject a join request
  rejectRequest(requestId) {
    return fetchAPI(`/messages/${requestId}/reject/`, {
      method: 'POST',
      body: JSON.stringify({
        responded_at: new Date().toISOString()
      })
    });
  },

  // Mark message as read
  markAsRead(messageId) {
    return fetchAPI(`/messages/${messageId}/read/`, {
      method: 'POST',
    });
  },
};

export default messagesAPI;

