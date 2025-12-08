import axios from 'axios';
import authService from './authService';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const notificationService = {
  // Get all notifications
  getNotifications: async (page = 1, limit = 20) => {
    const token = authService.getToken();
    const response = await axios.get(`${API_URL}/notifications`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { page, limit }
    });
    return response.data;
  },

  // Get unread notifications count
  getUnreadCount: async () => {
    const token = authService.getToken();
    const response = await axios.get(`${API_URL}/notifications/unread-count`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  // Mark notification as read
  markAsRead: async (notificationId) => {
    const token = authService.getToken();
    const response = await axios.patch(`${API_URL}/notifications/${notificationId}/read`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  // Mark all as read
  markAllAsRead: async () => {
    const token = authService.getToken();
    const response = await axios.patch(`${API_URL}/notifications/mark-all-read`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  // Delete notification
  deleteNotification: async (notificationId) => {
    const token = authService.getToken();
    const response = await axios.delete(`${API_URL}/notifications/${notificationId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  // Clear all notifications
  clearAllNotifications: async () => {
    const token = authService.getToken();
    const response = await axios.delete(`${API_URL}/notifications/clear-all`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  // Get notification settings
  getNotificationSettings: async () => {
    const token = authService.getToken();
    const response = await axios.get(`${API_URL}/notifications/settings`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  // Update notification settings
  updateNotificationSettings: async (settings) => {
    const token = authService.getToken();
    const response = await axios.put(`${API_URL}/notifications/settings`, settings, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  // Create notification (admin only)
  createNotification: async (notificationData) => {
    const token = authService.getToken();
    const response = await axios.post(`${API_URL}/notifications`, notificationData, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  // Subscribe to push notifications
  subscribeToPush: async (subscription) => {
    const token = authService.getToken();
    const response = await axios.post(`${API_URL}/notifications/subscribe`, subscription, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  // Unsubscribe from push notifications
  unsubscribeFromPush: async () => {
    const token = authService.getToken();
    const response = await axios.post(`${API_URL}/notifications/unsubscribe`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  }
};

export default notificationService;