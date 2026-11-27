import { Github, Linkedin } from 'lucide-react';
import { Bluesky } from '@/components/icons/Bluesky';
import { getValidHttpUrl } from '@/lib/safeUrl';

interface ProfileLinksProps {
  profile: {
    github_url?: string | null;
    linkedin_url?: string | null;
    bluesky_url?: string | null;
  };
  /** Keeps a click on a link from also reaching a clickable parent, such as a researcher card. */
  stopPropagation?: boolean;
}

const LINKS = [
  { key: 'github_url', title: 'GitHub', Icon: Github },
  { key: 'linkedin_url', title: 'LinkedIn', Icon: Linkedin },
  { key: 'bluesky_url', title: 'Bluesky', Icon: Bluesky },
] as const;

/** A profile's GitHub, LinkedIn and Bluesky links. Only http(s) URLs become links. */
export function ProfileLinks({ profile, stopPropagation = false }: ProfileLinksProps) {
  return (
    <>
      {LINKS.map(({ key, title, Icon }) => {
        const href = getValidHttpUrl(profile[key]);
        if (!href) return null;
        return (
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
            className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
            title={title}
          >
            <Icon className="w-4 h-4" />
          </a>
        );
      })}
    </>
  );
}
