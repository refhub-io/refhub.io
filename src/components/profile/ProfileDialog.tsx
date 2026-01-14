import { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Github, Linkedin, AtSign, User, FileText, Camera, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { ProfileAvatar } from './ProfileAvatar';
import { useProfile, Profile } from '@/hooks/useProfile';
import { useAuth } from '@/hooks/useAuth';

const profileSchema = z.object({
  display_name: z.string().min(1, 'display_name_required').max(100),
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be at most 30 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Only letters, numbers, and underscores allowed')
    .optional()
    .or(z.literal('')),
  bio: z.string().max(500, 'Bio must be at most 500 characters').optional().or(z.literal('')),
  github_url: z.string().url('Invalid URL').optional().or(z.literal('')),
  linkedin_url: z.string().url('Invalid URL').optional().or(z.literal('')),
  bluesky_url: z.string().url('Invalid URL').optional().or(z.literal('')),
  avatar_url: z.string().url('Invalid URL').optional().or(z.literal('')),
});

type ProfileFormData = z.infer<typeof profileSchema>;

interface ProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProfileDialog({ open, onOpenChange }: ProfileDialogProps) {
  const { user, signOut } = useAuth();
  const { profile, updateProfile, checkUsernameAvailable } = useProfile();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      display_name: '',
      username: '',
      bio: '',
      github_url: '',
      linkedin_url: '',
      bluesky_url: '',
      avatar_url: '',
    },
  });

  useEffect(() => {
    isInitialLoadRef.current = true; // Reset on dialog open
    if (profile && open) {
      form.reset({
        display_name: profile.display_name || '',
        username: profile.username || '',
        bio: profile.bio || '',
        github_url: profile.github_url || '',
        linkedin_url: profile.linkedin_url || '',
        bluesky_url: profile.bluesky_url || '',
        avatar_url: profile.avatar_url || '',
      });
      setUsernameStatus('idle');
    }
  }, [profile, open, form]);

  const watchedUsername = form.watch('username');
  const watchedAvatarUrl = form.watch('avatar_url');
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialLoadRef = useRef(true);
  const profileRef = useRef(profile);
  const openRef = useRef(open);
  const formValues = form.watch();

  // Reset auto-save flag when dialog opens
  useEffect(() => {
    profileRef.current = profile;
    openRef.current = open;
    if (open && profile) {
      isInitialLoadRef.current = true;
    }
  }, [open, profile]);

  // Auto-save profile changes (debounced) - only triggers on form value changes
  useEffect(() => {
    if (!profileRef.current || !openRef.current) return;
    
    // Skip auto-save on initial load
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
      return;
    }
    
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    autoSaveTimeoutRef.current = setTimeout(async () => {
      if (form.formState.isDirty && !form.formState.errors.display_name) {
        const values = form.getValues();
        if (values.display_name) {
          setIsSubmitting(true);
          try {
            await updateProfile(values as Profile);
          } catch (error) {
            console.error('Auto-save failed:', error);
          } finally {
            setIsSubmitting(false);
          }
        }
      }
    }, 3000); // 3 second debounce

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formValues]);

  useEffect(() => {
    if (!watchedUsername || watchedUsername.length < 3) {
      setUsernameStatus('idle');
      return;
    }

    if (watchedUsername === profile?.username) {
      setUsernameStatus('available');
      return;
    }

    const timeoutId = setTimeout(async () => {
      setUsernameStatus('checking');
      const available = await checkUsernameAvailable(watchedUsername);
      setUsernameStatus(available ? 'available' : 'taken');
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [watchedUsername, profile?.username, checkUsernameAvailable]);

  const onSubmit = async (data: ProfileFormData) => {
    if (usernameStatus === 'taken') {
      form.setError('username', { message: 'Username is already taken' });
      return;
    }

    setIsSubmitting(true);
    try {
      const updates: Partial<Profile> = {
        display_name: data.display_name,
        username: data.username || null,
        bio: data.bio || null,
        github_url: data.github_url || null,
        linkedin_url: data.linkedin_url || null,
        bluesky_url: data.bluesky_url || null,
        avatar_url: data.avatar_url || null,
      };

      const { error } = await updateProfile(updates);
      if (!error) {
        onOpenChange(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    
    setIsDeleting(true);
    try {
      // Call the database function to delete user and all data
      const { error } = await supabase.rpc('delete_user');
      
      if (error) throw error;
      
      // Sign out and redirect
      await signOut();
      window.location.href = '/auth';
    } catch (error) {
      console.error('Error deleting account:', error);
      alert('Error deleting account: ' + (error as Error).message);
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const displayName = form.watch('display_name') || user?.email?.split('@')[0] || 'User';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full h-full sm:h-auto sm:w-[95vw] sm:max-w-xl sm:max-h-[90vh] border-2 bg-card/95 backdrop-blur-xl overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="text-2xl font-bold font-mono">edit_profile</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex-1 overflow-y-auto px-6">
            <div className="space-y-5 pb-6">
            {/* Avatar Section */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <ProfileAvatar
                name={displayName}
                avatarUrl={watchedAvatarUrl}
                size={80}
                className="shrink-0"
              />
              <FormField
                control={form.control}
                name="avatar_url"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel className="flex items-center gap-2 font-mono">
                      <Camera className="w-4 h-4" />
                      avatar_url
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="https://example.com/avatar.jpg"
                        {...field}
                        className="border-2 focus:border-primary font-mono"
                      />
                    </FormControl>
                    <FormDescription className="text-xs font-mono">
                      // leave_empty_for_generated_avatar
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Display Name */}
            <FormField
              control={form.control}
              name="display_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2 font-mono">
                    <User className="w-4 h-4" />
                    display_name
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="your_name"
                      {...field}
                      className="border-2 focus:border-primary font-mono"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Username */}
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2 font-mono">
                    <AtSign className="w-4 h-4" />
                    username
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        @
                      </span>
                      <Input
                        placeholder="username"
                        {...field}
                        className="border-2 focus:border-primary pl-8"
                      />
                      {usernameStatus !== 'idle' && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono">
                          {usernameStatus === 'checking' && (
                            <span className="text-muted-foreground">checking...</span>
                          )}
                          {usernameStatus === 'available' && (
                            <span className="text-green-500">available</span>
                          )}
                          {usernameStatus === 'taken' && (
                            <span className="text-destructive">taken</span>
                          )}
                        </span>
                      )}
                    </div>
                  </FormControl>
                  <FormDescription className="text-xs font-mono">
                    // letters, numbers, underscores only
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Bio */}
            <FormField
              control={form.control}
              name="bio"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2 font-mono">
                    <FileText className="w-4 h-4" />
                    bio
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="few_words_about_yourself..."
                      {...field}
                      className="border-2 focus:border-primary resize-none font-mono"
                      rows={3}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Social Links */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider font-mono">
                socials
              </h3>

              <FormField
                control={form.control}
                name="github_url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2 text-sm font-mono">
                      <Github className="w-4 h-4" />
                      github
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="https://github.com/username"
                        {...field}
                        className="border-2 focus:border-primary text-sm"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="linkedin_url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2 text-sm font-mono">
                      <Linkedin className="w-4 h-4" />
                      linkedin
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="https://linkedin.com/in/username"
                        {...field}
                        className="border-2 focus:border-primary text-sm"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="bluesky_url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2 text-sm font-mono">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z" />
                      </svg>
                      bluesky
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="https://bsky.app/profile/username"
                        {...field}
                        className="border-2 focus:border-primary text-sm"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-between gap-3 py-4 border-t border-border">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowDeleteConfirm(true)}
                className="text-destructive hover:text-destructive hover:bg-destructive/10 w-full sm:w-auto font-mono"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                delete_account
              </Button>
              <div className="flex flex-col-reverse sm:flex-row gap-3 w-full sm:w-auto">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  className="border-2 w-full sm:w-auto font-mono"
                >
                  cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting || usernameStatus === 'taken'}
                  className="bg-gradient-primary hover:opacity-90 w-full sm:w-auto font-mono"
                >
                  {isSubmitting ? 'saving...' : 'save_profile'}
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </DialogContent>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="border-2 bg-card/95 backdrop-blur-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold text-destructive font-mono">
              delete_account?
            </AlertDialogTitle>
            <AlertDialogDescription className="font-mono text-sm space-y-2">
              <p>// this_will_permanently_delete_your_account</p>
              <p>// all_your_vaults_papers_and_data_will_be_lost</p>
              <p className="text-destructive font-semibold">// this_action_cannot_be_undone</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting} className="font-mono">cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAccount}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-mono"
            >
              {isDeleting ? 'deleting...' : 'delete_account'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
