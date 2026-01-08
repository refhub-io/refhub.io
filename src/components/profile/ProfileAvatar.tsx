import Avatar from 'boring-avatars';
import { cn } from '@/lib/utils';

interface ProfileAvatarProps {
  name: string;
  avatarUrl?: string | null;
  size?: number;
  className?: string;
}

const AVATAR_COLORS = [
  '#a855f7', // purple
  '#ec4899', // pink
  '#f43f5e', // red
  '#22c55e', // green
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#f97316', // orange
];

export function ProfileAvatar({ name, avatarUrl, size = 40, className }: ProfileAvatarProps) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={cn('rounded-xl object-cover', className)}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div className={cn('rounded-xl overflow-hidden', className)} style={{ width: size, height: size }}>
      <Avatar
        size={size}
        name={name}
        variant="beam"
        colors={AVATAR_COLORS}
      />
    </div>
  );
}
