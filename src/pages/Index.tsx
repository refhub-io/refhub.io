
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import Dashboard from './Dashboard';
import Auth from './Auth';
import ProfileEdit from './ProfileEdit';
import { FullScreenLoader } from '@/components/ui/loading';

const Index = () => {
  const { user, loading } = useAuth();
  const { profile, loading: profileLoading } = useProfile();

  if (loading || profileLoading) {
    return <FullScreenLoader message="initializing_application" variant="minimal" />;
  }

  if (!user) {
    return <Auth />;
  }


  // Show profile setup if user has not completed setup (is_setup === false)
  if (profile && profile.is_setup === false) {
    return <ProfileEdit />;
  }

  // If profile is missing, fallback to loading spinner (should not happen, but safe)
  if (!profile) {
    return <FullScreenLoader message="loading_profile" variant="minimal" />;
  }

  // Otherwise, show Dashboard
  return <Dashboard />;
};

export default Index;
