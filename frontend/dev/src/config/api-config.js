// Configuration file for API endpoints

// Base URLs for different services
// 34.87.18.15
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://34.87.18.15:8000';
const SOCKET_BASE_URL = process.env.REACT_APP_SOCKET_BASE_URL || 'http://34.87.18.15:5001';

// API endpoints
const API_ENDPOINTS = {
  // Auth endpoints
  login: `${API_BASE_URL}/login`,
  register: `${API_BASE_URL}/register`,
  
  // Notebook endpoints
  notebooks: `${API_BASE_URL}/notebooks`,
  notebooksByUser: (userId) => `${API_BASE_URL}/notebooks/${userId}`,
  deleteNotebook: (notebookId) => `${API_BASE_URL}/notebooks/${notebookId}`,
  
  // Socket connection
  socketConnection: SOCKET_BASE_URL
};

export default API_ENDPOINTS;
