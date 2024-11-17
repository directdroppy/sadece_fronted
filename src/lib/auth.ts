import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { toast } from '@/components/ui/use-toast';
import { api } from './api';
import { logger } from './logger';

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'employee';
  department: string;
  position: string;
  imageUrl?: string;
  status: 'active' | 'inactive';
}

interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  tokens: AuthTokens | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  checkAuth: () => Promise<boolean>;
  checkAdminAccess: () => boolean;
  refreshToken: () => Promise<boolean>;
}

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      tokens: null,

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null });
        
        try {
          logger.info('Attempting login', { email });
          
          const response = await fetch(`${import.meta.env.VITE_API_URL}/auth/login`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify({ email, password }),
            credentials: 'include'
          });

          const data = await response.json();
          
          if (!response.ok) {
            throw new Error(data.message || 'Giriş başarısız');
          }

          if (!data.success || !data.tokens || !data.user) {
            throw new Error('Sunucudan geçersiz yanıt alındı');
          }

          const { tokens, user } = data;

          // Check user status
          if (user.status !== 'active') {
            throw new Error('Hesabınız aktif değil');
          }

          // Save tokens
          localStorage.setItem('auth-token', tokens.access_token);
          localStorage.setItem('refresh-token', tokens.refresh_token);

          // Update state
          set({
            user,
            isAuthenticated: true,
            tokens,
            isLoading: false,
            error: null
          });

          // Set up token refresh timer
          const refreshTime = (tokens.expires_in - 300) * 1000; // 5 minutes before expiry
          setTimeout(() => {
            get().refreshToken();
          }, refreshTime);

          logger.info('Login successful', { userId: user.id, role: user.role });
          
          toast({
            title: "Giriş başarılı",
            description: "Hoş geldiniz, " + user.name
          });

          return true;

        } catch (error) {
          logger.error('Login error:', error);
          
          // Clear state
          set({ 
            isLoading: false, 
            error: error instanceof Error ? error.message : 'Giriş sırasında bir hata oluştu',
            isAuthenticated: false,
            user: null,
            tokens: null
          });
          
          // Notify user
          toast({
            title: "Giriş başarısız",
            description: error instanceof Error ? error.message : 'Giriş sırasında bir hata oluştu',
            variant: "destructive"
          });
          
          return false;
        }
      },

      refreshToken: async () => {
        try {
          const refreshToken = localStorage.getItem('refresh-token');
          if (!refreshToken) {
            throw new Error('No refresh token available');
          }

          const response = await fetch(`${import.meta.env.VITE_API_URL}/auth/refresh`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify({ refresh_token: refreshToken })
          });

          const data = await response.json();
          
          if (!response.ok || !data.tokens) {
            throw new Error('Token refresh failed');
          }

          // Update tokens
          localStorage.setItem('auth-token', data.tokens.access_token);
          localStorage.setItem('refresh-token', data.tokens.refresh_token);

          set({ tokens: data.tokens });

          // Set up next refresh
          const refreshTime = (data.tokens.expires_in - 300) * 1000;
          setTimeout(() => {
            get().refreshToken();
          }, refreshTime);

          return true;

        } catch (error) {
          logger.error('Token refresh error:', error);
          get().logout();
          return false;
        }
      },

      logout: () => {
        try {
          const refreshToken = localStorage.getItem('refresh-token');
          if (refreshToken) {
            // Revoke refresh token on server
            fetch(`${import.meta.env.VITE_API_URL}/auth/logout`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              body: JSON.stringify({ refresh_token: refreshToken })
            }).catch(error => {
              logger.error('Logout error:', error);
            });
          }

          // Clear storage
          localStorage.removeItem('auth-token');
          localStorage.removeItem('refresh-token');
          sessionStorage.clear();
          
          // Reset state
          set({
            user: null,
            isAuthenticated: false,
            tokens: null,
            isLoading: false,
            error: null
          });

          logger.info('User logged out');
          
          toast({
            title: "Çıkış yapıldı",
            description: "Güvenli bir şekilde çıkış yaptınız"
          });

        } catch (error) {
          logger.error('Logout error:', error);
          
          toast({
            title: "Hata",
            description: "Çıkış yapılırken bir hata oluştu",
            variant: "destructive"
          });
        }
      },

      checkAuth: async () => {
        const state = get();
        const token = localStorage.getItem('auth-token');

        if (!token) {
          set({ isAuthenticated: false, user: null });
          return false;
        }

        try {
          const response = await fetch(`${import.meta.env.VITE_API_URL}/auth/check`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/json'
            },
            credentials: 'include'
          });

          if (!response.ok) {
            // Try to refresh token
            const refreshSuccess = await state.refreshToken();
            if (!refreshSuccess) {
              throw new Error('Token geçersiz');
            }
            return state.checkAuth(); // Retry with new token
          }

          const data = await response.json();
          
          if (!data.user || data.user.status !== 'active') {
            throw new Error('Hesap aktif değil');
          }

          set({
            user: data.user,
            isAuthenticated: true,
            tokens: state.tokens
          });

          return true;

        } catch (error) {
          logger.error('Auth check error:', error);
          
          // Clear tokens
          localStorage.removeItem('auth-token');
          localStorage.removeItem('refresh-token');
          
          set({
            user: null,
            isAuthenticated: false,
            tokens: null,
            error: error instanceof Error ? error.message : 'Doğrulama hatası'
          });

          return false;
        }
      },

      checkAdminAccess: () => {
        const state = get();
        return state.isAuthenticated && state.user?.role === 'admin';
      }
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        tokens: state.tokens
      })
    }
  )
);