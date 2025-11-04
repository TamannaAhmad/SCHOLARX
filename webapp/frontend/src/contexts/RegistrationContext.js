import { createContext, useContext, useState, useCallback } from 'react';
import registrationService from '../services/registrationService';

const RegistrationContext = createContext();

export const useRegistration = () => {
  const context = useContext(RegistrationContext);
  if (!context) {
    throw new Error('useRegistration must be used within a RegistrationProvider');
  }
  return context;
};

export const RegistrationProvider = ({ children }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    // Step 1: Sign Up
    email: '',
    password: '',
    confirmPassword: '',
    
    // Step 2: Basic Info
    name: '',
    usn: '',
    department: '',
    studyYear: '',
    linkedin: '',
    github: '',
    
    // Step 3: Skills
    skills: [],
    
    // Step 4: Schedule
    availability: [],
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Handle input changes
  const handleChange = useCallback((e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  }, []);

  // Handle skill changes
  const handleSkillChange = useCallback((skills) => {
    setFormData(prev => ({
      ...prev,
      skills
    }));
  }, []);

  // Handle availability changes
  const handleAvailabilityChange = useCallback((availability) => {
    setFormData(prev => ({
      ...prev,
      availability
    }));
  }, []);

  // Validate current step
  const validateCurrentStep = useCallback(() => {
    const validation = registrationService.validateStep(currentStep, formData);
    if (!validation.isValid) {
      setError(validation.error);
      return false;
    }
    setError('');
    return true;
  }, [currentStep, formData]);

  // Go to next step
  const nextStep = useCallback(() => {
    if (validateCurrentStep()) {
      setCurrentStep(prev => Math.min(prev + 1, 5)); // 5 steps total (including success)
    }
  }, [validateCurrentStep]);

  // Go to previous step
  const prevStep = useCallback(() => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
    setError('');
  }, []);

  // Submit registration
  const submitRegistration = useCallback(async () => {
    if (!validateCurrentStep()) return;
    
    setIsSubmitting(true);
    setError('');
    
    try {
      const result = await registrationService.submitRegistration(formData);
      if (result.success) {
        setSuccess(true);
        setCurrentStep(5); // Go to success step
      } else {
        setError(result.error || 'Registration failed. Please try again.');
      }
    } catch (err) {
      setError(err.message || 'An error occurred during registration.');
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, validateCurrentStep]);

  // Check if email is available
  const checkEmailAvailability = useCallback(async (email) => {
    if (!email) return { isAvailable: false };
    return await registrationService.checkEmailAvailability(email);
  }, []);

  // Check if USN is available
  const checkUSNAvailability = useCallback(async (usn) => {
    if (!usn) return { isAvailable: false };
    return await registrationService.checkUSNAvailability(usn);
  }, []);

  // Search skills
  const searchSkills = useCallback(async (query) => {
    return await registrationService.searchSkills(query);
  }, []);

  // Reset form
  const resetForm = useCallback(() => {
    setFormData({
      email: '',
      password: '',
      confirmPassword: '',
      name: '',
      usn: '',
      department: '',
      studyYear: '',
      linkedin: '',
      github: '',
      skills: [],
      availability: [],
    });
    setCurrentStep(1);
    setError('');
    setSuccess(false);
  }, []);

  const value = {
    currentStep,
    formData,
    isSubmitting,
    error,
    success,
    handleChange,
    handleSkillChange,
    handleAvailabilityChange,
    nextStep,
    prevStep,
    submitRegistration,
    checkEmailAvailability,
    checkUSNAvailability,
    searchSkills,
    resetForm,
  };

  return (
    <RegistrationContext.Provider value={value}>
      {children}
    </RegistrationContext.Provider>
  );
};
