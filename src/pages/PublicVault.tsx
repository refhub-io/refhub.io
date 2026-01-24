import { useParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Globe } from 'lucide-react';

export default function PublicVault() {
  const { slug } = useParams();
  
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-6 p-8">
        <div className="w-20 h-20 rounded-2xl bg-muted flex items-center justify-center mx-auto">
          <Globe className="w-10 h-10 text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold mb-2 font-mono">route_moved</h1>
          <p className="text-muted-foreground font-mono text-sm mb-4">
            // public_vaults_are_now_accessed_via_/public/slug
          </p>
          <Link to={`/public/${slug}`}>
            <Button className="font-mono">
              go_to_public_vault
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}