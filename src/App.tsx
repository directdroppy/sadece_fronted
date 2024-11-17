import { AppProvider } from '@/components/providers/AppProvider';
import { AppRoutes } from '@/routes';
import { ErrorBoundary } from '@/components/error/ErrorBoundary';
import { InstallPrompt } from '@/components/ui/install-prompt';
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();

  useEffect(() => {
    const handleNavigation = () => {
      const publicPaths = ['/login'];
      const currentPath = location.pathname;
      const isPublicPath = publicPaths.some(path => currentPath.startsWith(path));

      // Giriş yapmamış kullanıcıları login sayfasına yönlendir
      if (!isAuthenticated && !isPublicPath) {
        navigate('/login', { 
          replace: true, 
          state: { from: location } 
        });
        return;
      }

      // Giriş yapmış kullanıcıları yönlendir
      if (isAuthenticated && user) {
        const isAdmin = user.role === 'admin';
        const isAdminPath = currentPath.startsWith('/admin');

        // Ana sayfa veya login sayfasındaysa doğru panele yönlendir
        if (isPublicPath || currentPath === '/') {
          navigate(isAdmin ? '/admin' : '/dashboard', { replace: true });
          return;
        }

        // Admin kullanıcısı admin paneli dışında bir yere erişmeye çalışıyorsa
        if (isAdmin && !isAdminPath) {
          navigate('/admin', { replace: true });
          return;
        }

        // Normal kullanıcı admin paneline erişmeye çalışıyorsa
        if (!isAdmin && isAdminPath) {
          navigate('/dashboard', { replace: true });
          return;
        }
      }
    };

    handleNavigation();
  }, [isAuthenticated, location, navigate, user]);

  return (
    <ErrorBoundary>
      <AppProvider>
        <InstallPrompt />
        <AppRoutes />
      </AppProvider>
    </ErrorBoundary>
  );
}

export default App;