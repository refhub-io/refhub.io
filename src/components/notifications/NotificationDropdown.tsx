import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import {
  Bell,
  Check,
  CheckCheck,
  GitFork,
  Heart,
  Share2,
  Mail,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useNotifications, Notification } from '@/hooks/useNotifications';

const notificationIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  vault_shared: Share2,
  vault_forked: GitFork,
  vault_favorited: Heart,
  vault_access_requested: Mail,
};

const notificationColors: Record<string, string> = {
  vault_shared: 'text-blue-400',
  vault_forked: 'text-purple-400',
  vault_favorited: 'text-pink-400',
  vault_access_requested: 'text-yellow-400',
};

export function NotificationDropdown() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  } = useNotifications();

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.read) {
      await markAsRead(notification.id);
    }

    // Navigate based on notification type
    if (notification.data?.vault_id) {
      // For shared vaults, go to dashboard
      if (notification.type === 'vault_shared') {
        setOpen(false);
        navigate('/');
      }

      // For access requests, open the owner's dashboard and open the vault settings (show requests)
      if (notification.type === 'vault_access_requested') {
        setOpen(false);
        const vaultId = (notification.data as any).vault_id;
        const requestId = (notification.data as any).request_id;
        // Navigate to dashboard and open vault dialog for this vault + request
        navigate(`/dashboard?openVault=${vaultId}${requestId ? `&request=${requestId}` : ''}`);
      }
    }
  };

  // Get the last 5 notifications
  const displayedNotifications = notifications.slice(0, 5);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-accent"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full bg-primary text-[10px] font-bold flex items-center justify-center text-primary-foreground">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-0 border-2 bg-card/95 backdrop-blur-xl"
        align="end"
        sideOffset={8}
      >
        <div className="flex items-center justify-between p-3 border-b border-border">
          <h4 className="font-semibold font-mono">notifications</h4>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1 font-mono"
              onClick={markAllAsRead}
            >
              <CheckCheck className="w-3.5 h-3.5" />
              mark_all_read
            </Button>
          )}
        </div>

        <div className="max-h-80 overflow-y-auto">
          {displayedNotifications.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground font-mono">
              // no notifications yet
            </div>
          ) : (
            <div className="divide-y divide-border">
              {displayedNotifications.map((notification) => {
                const Icon = notificationIcons[notification.type] || Bell;
                const iconColor = notificationColors[notification.type] || 'text-muted-foreground';

                return (
                  <div
                    key={notification.id}
                    className={cn(
                      'flex gap-3 p-3 hover:bg-muted/50 cursor-pointer transition-colors group relative',
                      !notification.read && 'bg-primary/5'
                    )}
                    onClick={() => handleNotificationClick(notification)}
                  >
                    {/* Unread indicator dot */}
                    {!notification.read && (
                      <div className="absolute left-1.5 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-primary" />
                    )}
                    <div
                      className={cn(
                        'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ml-2',
                        notification.read ? 'bg-muted' : 'bg-primary/10'
                      )}
                    >
                      <Icon className={cn('w-4 h-4', iconColor)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className={cn(
                          'text-sm truncate',
                          !notification.read && 'font-medium'
                        )}
                      >
                        {notification.title}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {notification.message}
                      </p>
                      <p className="text-xs text-muted-foreground/60 mt-0.5 font-mono">
                        {formatDistanceToNow(new Date(notification.created_at), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {!notification.read && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            markAsRead(notification.id);
                          }}
                        >
                          <Check className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteNotification(notification.id);
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {notifications.length > 5 && (
          <div className="p-2 border-t border-border text-center">
            <span className="text-xs text-muted-foreground">
              +{notifications.length - 5} more notifications
            </span>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
