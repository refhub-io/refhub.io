import { useProfile } from '@/hooks/useProfile';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState } from 'react';

export default function ProfileEdit() {
  const { profile, updateProfile, refetch } = useProfile();
  const [userName, setUserName] = useState(profile?.username || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const navigate = useNavigate();

  const handleSave = async () => {
    await updateProfile({ username: userName, bio, is_setup: true });
    await refetch();
    navigate('/');
  };

  const handleSkip = async () => {
    await updateProfile({ is_setup: true });
    await refetch();
    navigate('/');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="max-w-md w-full bg-card/80 border-2 border-border/50 rounded-xl shadow-lg p-8 text-center animate-fade-in">
        <h1 className="text-2xl font-bold mb-4 text-gradient font-mono">set_up();</h1>
        <p className="text-muted-foreground mb-6 font-mono text-sm">
            <span className="block text-lg font-bold mb-1">welcome, human!</span>
            <span className="block text-base mb-1">setup your profile, or skip and remain mysterious.</span>
            <span className="block text-xs text-muted-foreground font-mono" style={{ opacity: 0.7 }}>// you can always update this later...</span>
        </p>
        <div className="space-y-4">
            <div>
            <Label htmlFor="userName" className="text-sm font-semibold font-mono">user_name</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono select-none pointer-events-none">@</span>
              <Input
                id="userName"
                type="text"
                value={userName}
                onChange={e => {
                  // Prevent @ in username
                  const val = e.target.value.replace(/^@+/, '').replace(/@/g, '');
                  setUserName(val);
                }}
                placeholder="your_alias_here"
                className="mt-1 font-mono pl-7"
                autoComplete="off"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="bio" className="text-sm font-semibold font-mono">bio</Label>
            <Input
              id="bio"
              type="text"
              value={bio}
              onChange={e => setBio(e.target.value)}
              placeholder="short bio, fun fact, or cryptic message"
              className="mt-1 font-mono"
            />
          </div>
        </div>
        <div className="flex gap-4 mt-8">
          <Button variant="glow" className="flex-1 font-mono" onClick={handleSave}>save_profile</Button>
          <Button variant="outline" className="flex-1 font-mono" onClick={handleSkip}>remain_mysterious</Button>
        </div>
        <p className="text-xs text-muted-foreground mt-6 font-mono">// built for researchers, by researchers ✨</p>
      </div>
    </div>
  );
}
