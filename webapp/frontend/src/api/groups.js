import { authAPI } from './auth.js';

// Study group endpoints live under the projects app: /api/projects
const API_BASE_URL = 'http://localhost:8000/api/projects';

async function fetchAPI(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const token = localStorage.getItem('authToken');
  if (token) {
    headers['Authorization'] = `Token ${token}`;
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
    
    console.error('API Error:', errorMessage);
    throw new Error(errorMessage);
  }
  return data;
}

export const groupsAPI = {
  async createGroup(groupData) {
    // Convert topics to comma-separated string if it's an array
    if (Array.isArray(groupData.topics)) {
      groupData.topics = groupData.topics.join(',');
    }
    return fetchAPI('/groups/create/', {
      method: 'POST',
      body: JSON.stringify(groupData),
    });
  },
  async listMyGroups() {
    return fetchAPI('/groups/my-groups/');
  },
  async getAllGroups() {
    return fetchAPI('/groups/all/');
  },
  async getGroup(groupId) {
    console.log(`Fetching group details for group ID: ${groupId}`);
    
    try {
      const group = await fetchAPI(`/groups/${groupId}/`);
      
      console.log('Fetched group details:', group);
      
      // Convert topics from comma-separated string to array if exists
      if (group.topics) {
        group.topics_display = group.topics.split(',').filter(topic => topic.trim() !== '');
      }
      
      // Ensure members are processed
      if (group.members) {
        group.members = group.members.map(member => {
          // If user_details exists, use it to enhance member information
          if (member.user_details) {
            return {
              ...member,
              user: member.user_details.usn || member.user,
              displayName: member.user_details.full_name || member.user
            };
          }
          return member;
        });
        
        console.log('Processed group members:', group.members);
      }
      
      return group;
    } catch (error) {
      console.error('Error fetching group details:', error);
      throw error;
    }
  },
  async updateGroup(groupId, groupData) {
    // Ensure topics is always a list
    if (typeof groupData.topics === 'string') {
      groupData.topics = groupData.topics.split(',').map(topic => topic.trim()).filter(topic => topic !== '');
    } else if (!Array.isArray(groupData.topics)) {
      groupData.topics = [];
    }

    return fetchAPI(`/groups/${groupId}/update/`, {
      method: 'PUT',
      body: JSON.stringify(groupData),
    });
  },
  
  async joinGroup(groupId, message = '') {
    return fetchAPI(`/groups/${groupId}/join/`, {
      method: 'POST',
      body: JSON.stringify({ message: message }),
    });
  },
  
  async leaveGroup(groupId) {
    return fetchAPI(`/groups/${groupId}/leave/`, {
      method: 'POST',
    });
  },
};

export default groupsAPI;