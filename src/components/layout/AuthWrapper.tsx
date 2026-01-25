import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { Link } from 'react-router-dom';

// Simple auth wrapper component that redirects to auth if not authenticated
// This ensures unauthenticated users can't access protected routes
const AuthWrapper = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  
  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-6 p-8">
          <div className="w-20 h-20 rounded-2xl bg-muted flex items-center justify-center mx-auto">
            <div className="w-10 h-10 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
          <p className="text-muted-foreground font-mono text-sm mb-4">
            // authentication_required
          </p>
          <p className="text-muted-foreground font-mono text-sm">
            // please_sign_in_to_access_this_content
          </p>
          <Link to="/auth">
            <Button className="font-mono">
              sign_in
            </Button>
          </Link>
        </div>
      </div>
    );
  }
  
  return <>{children}</>;
};

export default AuthWrapper; 