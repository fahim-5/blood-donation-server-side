import axios from 'axios';
import authService from './authService';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const donationService = {
  // Create donation request
  createDonationRequest: async (donationData) => {
    const token = authService.getToken();
    const response = await axios.post(`${API_URL}/donations`, donationData, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  // Get all donation requests (for donor)
  getMyDonationRequests: async (page = 1, limit = 10, status = '') => {
    const token = authService.getToken();
    const response = await axios.get(`${API_URL}/donations/my-requests`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { page, limit, status }
    });
    return response.data;
  },

  // Get donation request by ID
  getDonationRequestById: async (id) => {
    const token = authService.getToken();
    const response = await axios.get(`${API_URL}/donations/${id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  // Update donation request
  updateDonationRequest: async (id, donationData) => {
    const token = authService.getToken();
    const response = await axios.put(`${API_URL}/donations/${id}`, donationData, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  // Delete donation request
  deleteDonationRequest: async (id) => {
    const token = authService.getToken();
    const response = await axios.delete(`${API_URL}/donations/${id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  // Update donation status
  updateDonationStatus: async (id, statusData) => {
    const token = authService.getToken();
    const response = await axios.patch(`${API_URL}/donations/${id}/status`, statusData, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  // Donate to a request
  donateToRequest: async (id, donorData) => {
    const token = authService.getToken();
    const response = await axios.post(`${API_URL}/donations/${id}/donate`, donorData, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  // Get pending donation requests (public)
  getPendingDonationRequests: async (page = 1, limit = 10) => {
    const response = await axios.get(`${API_URL}/donations/pending`, {
      params: { page, limit }
    });
    return response.data;
  },

  // Get recent donation requests for dashboard
  getRecentDonationRequests: async (limit = 3) => {
    const token = authService.getToken();
    const response = await axios.get(`${API_URL}/donations/recent`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { limit }
    });
    return response.data;
  },

  // Get donation statistics
  getDonationStatistics: async () => {
    const token = authService.getToken();
    const response = await axios.get(`${API_URL}/donations/statistics`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  }
};

export default donationService;