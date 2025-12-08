import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const searchService = {
  // Search donors by criteria
  searchDonors: async (filters) => {
    const response = await axios.get(`${API_URL}/search/donors`, {
      params: filters
    });
    return response.data;
  },

  // Search donation requests
  searchDonationRequests: async (filters) => {
    const response = await axios.get(`${API_URL}/search/donation-requests`, {
      params: filters
    });
    return response.data;
  },

  // Get search suggestions
  getSearchSuggestions: async (query, type = 'donors') => {
    const response = await axios.get(`${API_URL}/search/suggestions`, {
      params: { query, type }
    });
    return response.data;
  },

  // Get available blood groups
  getAvailableBloodGroups: async () => {
    const response = await axios.get(`${API_URL}/search/blood-groups`);
    return response.data;
  },

  // Get locations with donor count
  getLocationsWithDonors: async () => {
    const response = await axios.get(`${API_URL}/search/locations`);
    return response.data;
  },

  // Get urgent requests
  getUrgentRequests: async (limit = 5) => {
    const response = await axios.get(`${API_URL}/search/urgent-requests`, {
      params: { limit }
    });
    return response.data;
  },

  // Export search results
  exportSearchResults: async (filters, format = 'pdf') => {
    const response = await axios.get(`${API_URL}/search/export`, {
      params: { ...filters, format },
      responseType: 'blob'
    });
    return response.data;
  },

  // Get nearby donors
  getNearbyDonors: async (latitude, longitude, radius = 10) => {
    const response = await axios.get(`${API_URL}/search/nearby-donors`, {
      params: { latitude, longitude, radius }
    });
    return response.data;
  },

  // Get search statistics
  getSearchStatistics: async () => {
    const response = await axios.get(`${API_URL}/search/statistics`);
    return response.data;
  }
};

export default searchService;