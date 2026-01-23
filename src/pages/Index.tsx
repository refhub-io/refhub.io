import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import Dashboard from './Dashboard';
import Auth from './Auth';

const Index = () => {
  const { user, loading } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  const navigate = useNavigate();

  // All hooks must be called unconditionally at the top
  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    } else if (!loading && user && !profileLoading && profile && profile.is_setup === false) {
      navigate('/profile-edit');
    } else if (!loading && user && !profileLoading && !profile) {
      navigate('/profile-edit');
    }
  }, [user, loading, profile, profileLoading, navigate]);

  if (loading || profileLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Auth />;
  }

  if (!profile) {
    return null;
  }

  return <Dashboard />;
};

export default Index;
