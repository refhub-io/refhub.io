import { useProfile } from '@/hooks/useProfile';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError, showWarning } from '@/lib/toast';
import { Loader2, User, Lock, Mail, ArrowLeft } from 'lucide-react';

export default function ProfileEdit() {
  const { profile, updateProfile, refetch } = useProfile();
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // Profile state
  const [userName, setUserName] = useState(profile?.username || '');
  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [saving, setSaving] = useState(false);
  
  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  
  // Email change state
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [changingEmail, setChangingEmail] = useState(false);

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await updateProfile({ 
        username: userName, 
        display_name: displayName,
        bio, 
        is_setup: true 
      });
      await refetch();
      showSuccess('Profile updated');
    } catch (error) {
      showError('Failed to update profile', (error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    // Validation
    if (!currentPassword) {
      showWarning('Current password required');
      return;
    }
    if (!newPassword || newPassword.length < 8) {
      showWarning('New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      showError('Passwords do not match');
      return;
    }
    
    setChangingPassword(true);
    try {
      // Re-authenticate with current password first
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user?.email || '',
        password: currentPassword,
      });
      
      if (signInError) {
        showError('Current password is incorrect');
        return;
      }
      
      // Update to new password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      
      if (updateError) {
        showError('Failed to update password', updateError.message);
        return;
      }
      
      showSuccess('Password updated successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      showError('Failed to change password', (error as Error).message);
    } finally {
      setChangingPassword(false);
    }
  };

  const handleChangeEmail = async () => {
    // Validation
    if (!newEmail || !newEmail.includes('@')) {
      showWarning('Please enter a valid email address');
      return;
    }
    if (!emailPassword) {
      showWarning('Password required to change email');
      return;
    }
    
    setChangingEmail(true);
    try {
      // Re-authenticate with current password first
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user?.email || '',
        password: emailPassword,
      });
      
      if (signInError) {
        showError('Password is incorrect');
        return;
      }
      
      // Request email change (will send verification to new email)
      const { error: updateError } = await supabase.auth.updateUser({
        email: newEmail,
      });
      
      if (updateError) {
        showError('Failed to update email', updateError.message);
        return;
      }
      
      showSuccess('Verification email sent', 'Please check your new email to confirm the change.');
      setNewEmail('');
      setEmailPassword('');
    } catch (error) {
      showError('Failed to change email', (error as Error).message);
    } finally {
      setChangingEmail(false);
    }
  };

  const handleBack = () => {
    // Check if there's a redirect URL stored in localStorage
    const redirectAfterLogin = localStorage.getItem('redirectAfterLogin');
    if (redirectAfterLogin) {
      localStorage.removeItem('redirectAfterLogin');
      navigate(redirectAfterLogin);
    } else {
      navigate('/dashboard');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto p-4 sm:p-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" onClick={handleBack}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold font-mono">account_<span className="text-gradient">settings</span></h1>
            <p className="text-sm text-muted-foreground font-mono">// manage your profile and security</p>
          </div>
        </div>

        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 font-mono">
            <TabsTrigger value="profile" className="gap-2">
              <User className="w-4 h-4" />
              <span className="hidden sm:inline">profile</span>
            </TabsTrigger>
            <TabsTrigger value="password" className="gap-2">
              <Lock className="w-4 h-4" />
              <span className="hidden sm:inline">password</span>
            </TabsTrigger>
            <TabsTrigger value="email" className="gap-2">
              <Mail className="w-4 h-4" />
              <span className="hidden sm:inline">email</span>
            </TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile" className="space-y-6">
            <div className="bg-card border-2 border-border rounded-xl p-6 space-y-4">
              <div>
                <Label htmlFor="displayName" className="font-mono">display_name</Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your Name"
                  className="mt-1 font-mono"
                />
              </div>
              
              <div>
                <Label htmlFor="userName" className="font-mono">username</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">@</span>
                  <Input
                    id="userName"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value.replace(/^@+/, '').replace(/@/g, ''))}
                    placeholder="your_username"
                    className="mt-1 font-mono pl-7"
                  />
                </div>
              </div>
              
              <div>
                <Label htmlFor="bio" className="font-mono">bio</Label>
                <Input
                  id="bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="A short bio about yourself"
                  className="mt-1 font-mono"
                />
              </div>
              
              <Button 
                variant="glow" 
                className="w-full font-mono" 
                onClick={handleSaveProfile}
                disabled={saving}
              >
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                save_profile
              </Button>
            </div>
          </TabsContent>

          {/* Password Tab */}
          <TabsContent value="password" className="space-y-6">
            <div className="bg-card border-2 border-border rounded-xl p-6 space-y-4">
              <p className="text-sm text-muted-foreground font-mono mb-4">
                // enter your current password to set a new one
              </p>
              
              <div>
                <Label htmlFor="currentPassword" className="font-mono">current_password</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  className="mt-1 font-mono"
                />
              </div>
              
              <div>
                <Label htmlFor="newPassword" className="font-mono">new_password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="mt-1 font-mono"
                />
                <p className="text-xs text-muted-foreground mt-1 font-mono">// minimum 8 characters</p>
              </div>
              
              <div>
                <Label htmlFor="confirmPassword" className="font-mono">confirm_password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="mt-1 font-mono"
                />
              </div>
              
              <Button 
                variant="glow" 
                className="w-full font-mono" 
                onClick={handleChangePassword}
                disabled={changingPassword}
              >
                {changingPassword && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                change_password
              </Button>
            </div>
          </TabsContent>

          {/* Email Tab */}
          <TabsContent value="email" className="space-y-6">
            <div className="bg-card border-2 border-border rounded-xl p-6 space-y-4">
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-sm font-mono">
                  <span className="text-muted-foreground">current_email:</span>{' '}
                  <span className="text-foreground">{user?.email}</span>
                </p>
              </div>
              
              <p className="text-sm text-muted-foreground font-mono">
                // a verification email will be sent to your new address
              </p>
              
              <div>
                <Label htmlFor="newEmail" className="font-mono">new_email</Label>
                <Input
                  id="newEmail"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="new@email.com"
                  className="mt-1 font-mono"
                />
              </div>
              
              <div>
                <Label htmlFor="emailPassword" className="font-mono">confirm_password</Label>
                <Input
                  id="emailPassword"
                  type="password"
                  value={emailPassword}
                  onChange={(e) => setEmailPassword(e.target.value)}
                  placeholder="••••••••"
                  className="mt-1 font-mono"
                />
              </div>
              
              <Button 
                variant="glow" 
                className="w-full font-mono" 
                onClick={handleChangeEmail}
                disabled={changingEmail}
              >
                {changingEmail && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                change_email
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
