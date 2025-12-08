import axios from 'axios';
import authService from './authService';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const analyticsService = {
  // Get dashboard statistics
  getDashboardStats: async () => {
    const token = authService.getToken();
    const response = await axios.get(`${API_URL}/analytics/dashboard-stats`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  // Get donation trends
  getDonationTrends: async (period = 'monthly') => {
    const token = authService.getToken();
    const response = await axios.get(`${API_URL}/analytics/donation-trends`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { period }
    });
    return response.data;
  },

  // Get user growth
  getUserGrowth: async (period = 'monthly') => {
    const token = authService.getToken();
    const response = await axios.get(`${API_URL}/analytics/user-growth`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { period }
    });
    return response.data;
  },

  // Get blood group distribution
  getBloodGroupDistribution: async () => {
    const token = authService.getToken();
    const response = await axios.get(`${API_URL}/analytics/blood-group-distribution`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  // Get location analytics
  getLocationAnalytics: async () => {
    const token = authService.getToken();
    const response = await axios.get(`${API_URL}/analytics/location-analytics`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  // Get funding analytics
  getFundingAnalytics: async (period = 'monthly') => {
    const token = authService.getToken();
    const response = await axios.get(`${API_URL}/analytics/funding-analytics`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { period }
    });
    return response.data;
  },

  // Get request status analytics
  getRequestStatusAnalytics: async () => {
    const token = authService.getToken();
    const response = await axios.get(`${API_URL}/analytics/request-status-analytics`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  // Get top performing volunteers
  getTopVolunteers: async (limit = 10) => {
    const token = authService.getToken();
    const response = await axios.get(`${API_URL}/analytics/top-volunteers`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { limit }
    });
    return response.data;
  },

  // Get system performance metrics
  getSystemMetrics: async () => {
    const token = authService.getToken();
    const response = await axios.get(`${API_URL}/analytics/system-metrics`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  // Export analytics data
  exportAnalyticsData: async (type, format = 'csv') => {
    const token = authService.getToken();
    const response = await axios.get(`${API_URL}/analytics/export`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { type, format },
      responseType: 'blob'
    });
    return response.data;
  },

  // Get real-time analytics
  getRealTimeAnalytics: async () => {
    const token = authService.getToken();
    const response = await axios.get(`${API_URL}/analytics/realtime`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  }
};

export default analyticsService;