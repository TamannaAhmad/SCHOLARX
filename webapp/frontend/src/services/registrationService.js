import { authAPI } from '../api/auth';

class RegistrationService {
  // Validate form data
  validateStep(step, data) {
    switch (step) {
      case 1: // Sign Up
        if (!data.email || !data.password || !data.confirmPassword) {
          return { isValid: false, error: 'All fields are required' };
        }
        if (data.password !== data.confirmPassword) {
          return { isValid: false, error: 'Passwords do not match' };
        }
        if (data.password.length < 8) {
          return { 
            isValid: false, 
            error: 'Password must be at least 8 characters long' 
          };
        }
        return { isValid: true };

      case 2: // Basic Info
        if (!data.name || !data.usn || !data.department || !data.studyYear) {
          return { isValid: false, error: 'All fields are required' };
        }
        // Validate USN format (e.g., 1RV20CS001)
        const usnRegex = /^\d{1}[A-Za-z]{2}\d{2}[A-Za-z]{2}\d{3}$/;
        if (!usnRegex.test(data.usn.toUpperCase())) {
          return { 
            isValid: false, 
            error: 'Please enter a valid USN (e.g., 1RV20CS001)' 
          };
        }
        return { isValid: true };

      case 3: // Skills
        if (!data.skills || data.skills.length === 0) {
          return { 
            isValid: false, 
            error: 'Please add at least one skill' 
          };
        }
        return { isValid: true };

      case 4: // Schedule
        if (!data.availability || data.availability.length === 0) {
          return { 
            isValid: false, 
            error: 'Please select at least one time slot when you are available' 
          };
        }
        return { isValid: true };

      default:
        return { isValid: true };
    }
  }

  // Format form data for API submission
  formatRegistrationData(formData) {
    // Split full name into first and last name
    const nameParts = formData.name.trim().split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

    return {
      email: formData.email,
      password: formData.password,
      first_name: firstName,
      last_name: lastName,
      profile: {
        usn: formData.usn.toUpperCase(),
        department: formData.department,
        study_year: parseInt(formData.studyYear, 10),
        linkedin_url: formData.linkedin || null,
        github_url: formData.github || null,
        skills: formData.skills || [],
        availability: formData.availability || []
      }
    };
  }

  // Submit registration data to the API
  async submitRegistration(formData) {
    try {
      const formattedData = this.formatRegistrationData(formData);
      const response = await authAPI.register(formattedData);
      return { success: true, data: response };
    } catch (error) {
      console.error('Registration error:', error);
      return { 
        success: false, 
        error: error.message || 'Registration failed. Please try again.' 
      };
    }
  }

  // Check if email is available
  async checkEmailAvailability(email) {
    try {
      const response = await authAPI.checkEmail(email);
      return { isAvailable: response.available };
    } catch (error) {
      console.error('Email check error:', error);
      return { isAvailable: false, error: error.message };
    }
  }

  // Check if USN is available
  async checkUSNAvailability(usn) {
    try {
      const response = await authAPI.checkUSN(usn);
      return { isAvailable: response.available };
    } catch (error) {
      console.error('USN check error:', error);
      return { isAvailable: false, error: error.message };
    }
  }

  // Get skills with optional search
  async searchSkills(query = '') {
    try {
      const response = await authAPI.getSkills(query);
      return { success: true, data: response };
    } catch (error) {
      console.error('Skills fetch error:', error);
      return { success: false, error: error.message };
    }
  }
}

export default new RegistrationService();
