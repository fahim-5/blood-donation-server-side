import axios from 'axios';
import authService from './authService';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const userService = {
  // Get all users (admin only)
  getAllUsers: async (page = 1, limit = 10, status = '') => {
    const token = authService.getToken();
    const response = await axios.get(`${API_URL}/users`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { page, limit, status }
    });
    return response.data;
  },

  // Get user by ID
  getUserById: async (id) => {
    const token = authService.getToken();
    const response = await axios.get(`${API_URL}/users/${id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  // Update user status (block/unblock)
  updateUserStatus: async (id, statusData) => {
    const token = authService.getToken();
    const response = await axios.patch(`${API_URL}/users/${id}/status`, statusData, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  // Update user role
  updateUserRole: async (id, roleData) => {
    const token = authService.getToken();
    const response = await axios.patch(`${API_URL}/users/${id}/role`, roleData, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  // Search donors
  searchDonors: async (searchParams) => {
    const response = await axios.get(`${API_URL}/users/search/donors`, {
      params: searchParams
    });
    return response.data;
  },

  // Get user statistics
  getUserStatistics: async () => {
    const token = authService.getToken();
    const response = await axios.get(`${API_URL}/users/statistics`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  // Get user activity
  getUserActivity: async (userId) => {
    const token = authService.getToken();
    const response = await axios.get(`${API_URL}/users/${userId}/activity`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  // Delete user (admin only)
  deleteUser: async (id) => {
    const token = authService.getToken();
    const response = await axios.delete(`${API_URL}/users/${id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  // Update user profile (admin can update any user)
  updateUserProfile: async (id, userData) => {
    const token = authService.getToken();
    const response = await axios.put(`${API_URL}/users/${id}/profile`, userData, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  // Get top donors
  getTopDonors: async (limit = 5) => {
    const response = await axios.get(`${API_URL}/users/top-donors`, {
      params: { limit }
    });
    return response.data;
  }
};

export default userService;