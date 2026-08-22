import { useProfile } from '@/hooks/useProfile';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess, showToast } from '@/lib/toast';
import { ApiKeyManagementPanel } from '@/components/profile/ApiKeyManagementPanel';
import { GoogleDriveSettingsPanel } from '@/components/profile/GoogleDriveSettingsPanel';
import { Loader2, User, Lock, Mail, ArrowLeft, KeyRound, HardDrive } from 'lucide-react';
import { resolvePostAuthRedirect } from '@/lib/authRedirect';
import { getAuthProviderLabel, getLastLoginProvider, hasPasswordIdentity } from '@/lib/authProviders';

const SETTINGS_TABS = ['profile', 'password', 'email', 'api-keys', 'storage'] as const;
type SettingsTab = (typeof SETTINGS_TABS)[number];

export default function ProfileEdit() {
  const { profile, updateProfile, refetch } = useProfile();
  const { user, session } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const oauthProvider = getLastLoginProvider(user);
  const canUsePasswordSecurity = hasPasswordIdentity(user);
  const requestedTab = searchParams.get('tab');
  const initialTab = SETTINGS_TABS.includes((requestedTab || '') as SettingsTab)
    ? (requestedTab as SettingsTab)
    : 'profile';
  
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
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [currentEmail, setCurrentEmail] = useState(user?.email || '');
  const accountFeedbackRef = useRef<HTMLDivElement>(null);
  const profileFeedbackRef = useRef<HTMLDivElement>(null);
  const passwordFeedbackRef = useRef<HTMLDivElement>(null);
  const emailFeedbackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setUserName(profile?.username || '');
    setDisplayName(profile?.display_name || '');
    setBio(profile?.bio || '');
  }, [profile?.bio, profile?.display_name, profile?.username]);

  useEffect(() => {
    if (SETTINGS_TABS.includes((requestedTab || '') as SettingsTab)) {
      setActiveTab(requestedTab as SettingsTab);
    }
  }, [requestedTab]);

  useEffect(() => {
    setCurrentEmail(user?.email || '');
  }, [user?.email]);

  useEffect(() => {
    let cancelled = false;

    const refreshCurrentEmail = async () => {
      const { data: refreshedSession } = await supabase.auth.refreshSession();
      const refreshedUser = refreshedSession.user;

      if (!cancelled) {
        setCurrentEmail(refreshedUser?.email || user?.email || '');
      }
    };

    refreshCurrentEmail();
    window.addEventListener('focus', refreshCurrentEmail);

    return () => {
      cancelled = true;
      window.removeEventListener('focus', refreshCurrentEmail);
    };
  }, [user?.email]);

  useEffect(() => {
    const driveState = searchParams.get('gdrive');
    const rawDriveMessage = searchParams.get('gdrive_message');
    if (!driveState) {
      return;
    }

    // Whitelist allowed gdrive_message values to prevent rendering arbitrary user-controlled strings.
    const ALLOWED_GDRIVE_MESSAGES: Record<string, string> = {
      'connected': 'refhub can now store saved pdfs in your managed drive folder.',
      'already_linked': 'google drive is already linked to your account.',
      'folder_created': 'your refhub folder was created in google drive.',
      'oauth_error': 'the google drive oauth flow did not complete.',
      'access_denied': 'google drive access was denied.',
      'token_error': 'there was a problem exchanging the google oauth token.',
    };
    const driveMessage = (rawDriveMessage && ALLOWED_GDRIVE_MESSAGES[rawDriveMessage]) || null;

    if (driveState === 'connected') {
      showSuccess('google drive connected', driveMessage || 'refhub can now store saved pdfs in your managed drive folder.', { source: accountFeedbackRef });
    } else if (driveState === 'error') {
      showError('google drive link failed', driveMessage || 'the google drive oauth flow did not complete.', { source: accountFeedbackRef });
    }

    const next = new URLSearchParams(searchParams);
    next.delete('gdrive');
    next.delete('gdrive_message');
    next.delete('gdrive_folder');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const { error } = await updateProfile({
        username: userName, 
        display_name: displayName,
        bio, 
        is_setup: true 
      }, { source: profileFeedbackRef });
      if (error) return;
      await refetch();
    } catch (error) {
      showError('Failed to update profile', (error as Error).message, { source: profileFeedbackRef });
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    // Validation
    if (!currentPassword) {
      showToast({ title: 'Current password required', severity: 'warning', source: passwordFeedbackRef });
      return;
    }
    if (!newPassword || newPassword.length < 8) {
      showToast({ title: 'New password must be at least 8 characters', severity: 'warning', source: passwordFeedbackRef });
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast({ title: 'Passwords do not match', severity: 'error', source: passwordFeedbackRef });
      return;
    }
    
    setChangingPassword(true);
    try {
      // Re-authenticate with current password first
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: currentEmail || user?.email || '',
        password: currentPassword,
      });
      
      if (signInError) {
        showToast({ title: 'Current password is incorrect', severity: 'error', source: passwordFeedbackRef });
        return;
      }
      
      // Update to new password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      
      if (updateError) {
        showToast({ title: 'Failed to update password', description: updateError.message, severity: 'error', source: passwordFeedbackRef });
        return;
      }
      
      showToast({ title: 'Password updated successfully', source: passwordFeedbackRef });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      showToast({ title: 'Failed to change password', description: (error as Error).message, severity: 'error', source: passwordFeedbackRef });
    } finally {
      setChangingPassword(false);
    }
  };

  const handleChangeEmail = async () => {
    // Validation
    if (!newEmail || !newEmail.includes('@')) {
      showToast({ title: 'Please enter a valid email address', severity: 'warning', source: emailFeedbackRef });
      return;
    }
    if (!emailPassword) {
      showToast({ title: 'Password required to change email', severity: 'warning', source: emailFeedbackRef });
      return;
    }
    
    setChangingEmail(true);
    try {
      // Re-authenticate with current password first
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: currentEmail || user?.email || '',
        password: emailPassword,
      });
      
      if (signInError) {
        showToast({ title: 'Password is incorrect', severity: 'error', source: emailFeedbackRef });
        return;
      }
      
      // Request email change (will send verification to new email)
      const { error: updateError } = await supabase.auth.updateUser({
        email: newEmail,
      });
      
      if (updateError) {
        showToast({ title: 'Failed to update email', description: updateError.message, severity: 'error', source: emailFeedbackRef });
        return;
      }
      
      await supabase.auth.refreshSession();
      showToast({
        title: 'Verification email sent',
        description: 'Please check your new email to confirm the change.',
        source: emailFeedbackRef,
      });
      setNewEmail('');
      setEmailPassword('');
    } catch (error) {
      showToast({ title: 'Failed to change email', description: (error as Error).message, severity: 'error', source: emailFeedbackRef });
    } finally {
      setChangingEmail(false);
    }
  };

  const handleBack = () => {
    const target = resolvePostAuthRedirect(
      profile ? { ...profile, is_setup: true } : profile,
      { fallbackPath: '/dashboard' }
    );
    navigate(target);
  };

  const handleTabChange = (value: string) => {
    const nextValue = SETTINGS_TABS.includes(value as SettingsTab) ? (value as SettingsTab) : 'profile';
    setActiveTab(nextValue);
    const next = new URLSearchParams(searchParams);
    next.set('tab', nextValue);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl p-4 sm:p-8">
        {/* Header */}
        <div className="mb-8 flex flex-wrap items-start gap-3 sm:items-center sm:gap-4">
          <Button variant="ghost" size="icon" onClick={handleBack} className="shrink-0" aria-label="Back to app">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold font-mono sm:text-2xl">// account_<span className="text-gradient">settings</span></h1>
            <p className="text-xs text-muted-foreground font-mono sm:text-sm">// manage your profile, security, API access, and linked storage</p>
          </div>
        </div>
        <div ref={accountFeedbackRef} data-quoterm-anchor="account-settings" className="mx-auto mb-4 w-full max-w-xl" />

        <Tabs value={activeTab} onValueChange={handleTabChange} className="min-w-0 space-y-6">
          <TabsList className="grid h-auto w-full grid-cols-5 gap-1 rounded-2xl border border-border/70 bg-muted/60 p-1 font-mono dark:border-white/8 dark:bg-[#1a1722]">
            <TabsTrigger
              value="profile"
              aria-label="Profile settings"
              className="min-h-10 min-w-0 justify-center gap-2 rounded-xl px-2 text-center text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md sm:min-h-11 sm:px-3 sm:text-sm"
            >
              <User className="w-4 h-4 shrink-0" />
              <span className="hidden truncate sm:inline">profile</span>
            </TabsTrigger>
            <TabsTrigger
              value="password"
              aria-label="Password settings"
              className="min-h-10 min-w-0 justify-center gap-2 rounded-xl px-2 text-center text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md sm:min-h-11 sm:px-3 sm:text-sm"
            >
              <Lock className="w-4 h-4 shrink-0" />
              <span className="hidden truncate sm:inline">password</span>
            </TabsTrigger>
            <TabsTrigger
              value="email"
              aria-label="Email settings"
              className="min-h-10 min-w-0 justify-center gap-2 rounded-xl px-2 text-center text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md sm:min-h-11 sm:px-3 sm:text-sm"
            >
              <Mail className="w-4 h-4 shrink-0" />
              <span className="hidden truncate sm:inline">email</span>
            </TabsTrigger>
            <TabsTrigger
              value="api-keys"
              aria-label="API key settings"
              className="min-h-10 min-w-0 justify-center gap-2 rounded-xl px-2 text-center text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md sm:min-h-11 sm:px-3 sm:text-sm"
            >
              <KeyRound className="w-4 h-4 shrink-0" />
              <span className="hidden truncate sm:inline">api_keys</span>
            </TabsTrigger>
            <TabsTrigger
              value="storage"
              aria-label="Storage settings"
              className="min-h-10 min-w-0 justify-center gap-2 rounded-xl px-2 text-center text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md sm:min-h-11 sm:px-3 sm:text-sm"
            >
              <HardDrive className="w-4 h-4 shrink-0" />
              <span className="hidden truncate sm:inline">storage</span>
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
              
              <div ref={profileFeedbackRef} data-quoterm-anchor="account-profile" className="flex flex-col gap-2">
                <Button
                  variant="glow"
                  className="w-full min-h-11 font-mono text-xs sm:text-sm"
                  onClick={handleSaveProfile}
                  disabled={saving}
                >
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  save_profile
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* Password Tab */}
          <TabsContent value="password" className="space-y-6">
            <div className="bg-card border-2 border-border rounded-xl p-6 space-y-4">
              {canUsePasswordSecurity ? (
                <>
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
                  
                  <div ref={passwordFeedbackRef} data-quoterm-anchor="account-password" className="flex flex-col gap-2">
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
                </>
              ) : (
                <div className="rounded-xl border border-fuchsia-500/20 bg-fuchsia-500/5 p-4">
                  <p className="text-sm text-foreground font-mono">security_managed_by_provider</p>
                  <p className="mt-2 text-sm text-muted-foreground font-mono">
                    // password changes for this account are handled by {oauthProvider ? getAuthProviderLabel(oauthProvider) : 'your provider'}
                  </p>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Email Tab */}
          <TabsContent value="email" className="space-y-6">
            <div className="bg-card border-2 border-border rounded-xl p-6 space-y-4">
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-sm font-mono">
                  <span className="text-muted-foreground">current_email:</span>{' '}
                  <span className="text-foreground">{currentEmail || user?.email}</span>
                </p>
              </div>
              
              {canUsePasswordSecurity ? (
                <>
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
                  
                  <div ref={emailFeedbackRef} data-quoterm-anchor="account-email" className="flex flex-col gap-2">
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
                </>
              ) : (
                <div className="rounded-xl border border-pink-500/20 bg-pink-500/5 p-4">
                  <p className="text-sm text-foreground font-mono">email_managed_by_provider</p>
                  <p className="mt-2 text-sm text-muted-foreground font-mono">
                    // update your email with {oauthProvider ? getAuthProviderLabel(oauthProvider) : 'your provider'} and sign in again to sync it here
                  </p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="api-keys" className="space-y-6">
            <ApiKeyManagementPanel
              userId={user?.id}
              userEmail={user?.email}
              accessToken={session?.access_token}
            />
          </TabsContent>

          <TabsContent value="storage" className="space-y-6">
            <GoogleDriveSettingsPanel accessToken={session?.access_token} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
