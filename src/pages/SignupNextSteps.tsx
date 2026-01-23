import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

export default function SignupNextSteps() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="max-w-md w-full bg-card/80 border-2 border-border/50 rounded-xl shadow-lg p-8 text-center animate-fade-in">
        <h1 className="text-2xl font-bold mb-4 text-gradient font-mono">next_steps();</h1>
        <p className="text-muted-foreground mb-6 font-mono text-sm">
          <span className="block text-lg font-bold mb-1">confirm_email</span>
          <span className="block text-base mb-1">a verification has been sent to your email</span>
          <span className="block text-base mb-1">click the activation link to continue</span>
          <br/>
          <span className="block text-xs text-muted-foreground font-mono" style={{ opacity: 0.7 }}>
            // can't find it? check your <span className="text-primary">spam folder</span>
          </span>
        </p>
        <Button variant="glow" className="w-full font-mono" onClick={() => navigate('/auth')}>return_to_login()</Button>
      </div>
    </div>
  );
}
