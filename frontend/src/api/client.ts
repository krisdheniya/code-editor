import axios from 'axios';
import { ExecutionMode, Language, Job } from '../types';

// Use relative '/api' route so Nginx reverse proxies seamlessly to backend:3001
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach JWT token to requests if present
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('codesphere_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const api = {
  // Auth
  register: (email: string, password: string) =>
    apiClient.post('/auth/register', { email, password }),

  login: (email: string, password: string) =>
    apiClient.post('/auth/login', { email, password }),

  getMe: () => apiClient.get('/auth/me'),

  // Execution
  execute: (language: Language, code: string, mode: ExecutionMode) =>
    apiClient.post('/execute', { language, code, mode }),

  // Jobs
  getJob: (id: string) => apiClient.get<{ job: Job }>(`/jobs/${id}`),

  getJobHistory: (limit = 20, offset = 0) =>
    apiClient.get<{ jobs: Job[] }>(`/jobs?limit=${limit}&offset=${offset}`),
};
