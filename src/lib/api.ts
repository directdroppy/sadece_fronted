import axios from 'axios';
import { toast } from '@/components/ui/use-toast';
import { logger } from './logger';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'https://panel.tefaiz.com/api',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  },
  timeout: 10000 // 10 second timeout
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth-token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    logger.info(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    logger.error('API Request error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => {
    logger.info(`API Response: ${response.status} ${response.config.url}`);
    return response.data;
  },
  (error) => {
    logger.error('API Response error:', error);
    
    const message = error.response?.data?.message || error.message;
    
    // Handle authentication errors
    if (error.response?.status === 401) {
      localStorage.removeItem('auth-token');
      window.location.href = '/login';
    }

    // Show error toast
    toast({
      title: "Hata",
      description: message,
      variant: "destructive"
    });

    return Promise.reject(error);
  }
);

export { api };