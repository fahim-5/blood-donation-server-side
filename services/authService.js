import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const authService = {
  // Register user
  register: async (userData) => {
    const response = await axios.post(`${API_URL}/auth/register`, userData);
    if (response.data.token) {
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
    }
    return response.data;
  },

  // Login user
  login: async (credentials) => {
    const response = await axios.post(`${API_URL}/auth/login`, credentials);
    if (response.data.token) {
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
    }
    return response.data;
  },

  // Logout user
  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  },

  // Get current user
  getCurrentUser: () => {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  },

  // Get auth token
  getToken: () => {
    return localStorage.getItem('token');
  },

  // Check if user is authenticated
  isAuthenticated: () => {
    return !!localStorage.getItem('token');
  },

  // Update user profile
  updateProfile: async (userData) => {
    const token = localStorage.getItem('token');
    const response = await axios.put(`${API_URL}/auth/profile`, userData, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (response.data.user) {
      localStorage.setItem('user', JSON.stringify(response.data.user));
    }
    return response.data;
  },

  // Change password
  changePassword: async (passwordData) => {
    const token = localStorage.getItem('token');
    const response = await axios.put(`${API_URL}/auth/change-password`, passwordData, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  // Verify email (if implemented later)
  verifyEmail: async (verificationToken) => {
    const response = await axios.get(`${API_URL}/auth/verify-email/${verificationToken}`);
    return response.data;
  }
};

export default authService;