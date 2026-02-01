import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface Notification {
  id: string;
  user_id: string;
  type: 'vault_shared' | 'vault_forked' | 'vault_favorited' | 'publication_updated';
  title: string;
  message: string | null;
  data: Record<string, unknown> | null;
  read: boolean;
  created_at: string;
}

export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      setNotifications(data as Notification[]);
      setUnreadCount(data?.filter(n => !n.read).length || 0);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Subscribe to realtime notifications
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('notifications-channel')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newNotification = payload.new as Notification;
          setNotifications((prev) => [newNotification, ...prev]);
          setUnreadCount((prev) => prev + 1);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const updatedNotification = payload.new as Notification;
          setNotifications((prev) => {
            const oldNotification = prev.find(n => n.id === updatedNotification.id);
            const newNotifications = prev.map((n) => (n.id === updatedNotification.id ? updatedNotification : n));

            // Update unread count based on the change
            if (oldNotification && !oldNotification.read && updatedNotification.read) {
              setUnreadCount(prevCount => Math.max(0, prevCount - 1));
            } else if (oldNotification && oldNotification.read && !updatedNotification.read) {
              setUnreadCount(prevCount => prevCount + 1);
            }

            return newNotifications;
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const deletedNotification = payload.old as Notification;
          setNotifications((prev) => {
            const newNotifications = prev.filter((n) => n.id !== deletedNotification.id);
            if (!deletedNotification.read) {
              setUnreadCount(prevCount => Math.max(0, prevCount - 1));
            }
            return newNotifications;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const markAsRead = async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notificationId);

      if (error) throw error;

      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', user.id)
        .eq('read', false);

      if (error) throw error;

      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  const deleteNotification = async (notificationId: string) => {
    try {
      const notification = notifications.find((n) => n.id === notificationId);

      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId);

      if (error) throw error;

      setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
      if (notification && !notification.read) {
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  };

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    refetch: fetchNotifications,
  };
}

// Hook to subscribe to publication changes in vaults the user has access to
export function usePublicationChangeNotifications() {
  const { user } = useAuth();
  const { refetch } = useNotifications(); // To trigger notification refresh

  useEffect(() => {
    if (!user) return;

    // Subscribe to changes in vault_publications for publications in vaults the user has access to
    const channel = supabase
      .channel(`publication-changes-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'vault_publications',
          // Listen to all vault_publications changes - we'll filter on the client side
        },
        async (payload) => {
          const updatedPublication = payload.new;
          const oldPublication = payload.old;

          // Check if the current user has access to this vault
          const { data: vault } = await supabase
            .from('vaults')
            .select('user_id, visibility')
            .eq('id', updatedPublication.vault_id)
            .single();

          if (!vault) return; // Vault doesn't exist

          // Check if user has access to this vault (owner, shared, or public)
          const hasAccess =
            vault.user_id === user.id || // Owner
            vault.visibility === 'public' || // Public vault
            (await supabase
              .from('vault_shares')
              .select('id')
              .or(`shared_with_user_id.eq.${user.id},shared_with_email.eq.${user.email}`)
              .eq('vault_id', updatedPublication.vault_id)
              .maybeSingle()).data; // Shared with user

          if (!hasAccess) return; // User doesn't have access to this vault

          // Check what changed to customize the notification
          let changeType = 'updated';
          if (oldPublication.notes !== updatedPublication.notes) {
            changeType = 'notes updated';
          } else if (oldPublication.title !== updatedPublication.title) {
            changeType = 'title updated';
          } else if (oldPublication.abstract !== updatedPublication.abstract) {
            changeType = 'abstract updated';
          } else if (JSON.stringify(oldPublication.authors) !== JSON.stringify(updatedPublication.authors)) {
            changeType = 'authors updated';
          }

          // Get the vault name
          const { data: vaultInfo } = await supabase
            .from('vaults')
            .select('name')
            .eq('id', updatedPublication.vault_id)
            .single();

          // Get the user who made the change
          const { data: profile } = await supabase
            .from('profiles')
            .select('display_name, username')
            .eq('user_id', updatedPublication.created_by)
            .single();

          const changedBy = profile?.display_name || profile?.username || 'Someone';

          // Create notification for the current user
          await supabase.from('notifications').insert({
            user_id: user.id,
            type: 'publication_updated',
            title: 'Publication updated',
            message: `${changedBy} ${changeType} "${updatedPublication.title}" in "${vaultInfo?.name}"`,
            data: {
              vault_id: updatedPublication.vault_id,
              vault_name: vaultInfo?.name,
              publication_id: updatedPublication.id,
              publication_title: updatedPublication.title,
              changed_by: changedBy,
              change_type: changeType
            },
            read: false
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, refetch]);
}
