import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import remarkFootnotes from 'remark-footnotes';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import rehypeHighlight from 'rehype-highlight';
import { cn } from '@/lib/utils';

// Custom sanitize schema that allows anchors, ids, names for footnotes
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    a: [...(defaultSchema.attributes?.a || []), 'id', 'name', 'className', 'ariaLabel'],
    h1: [...(defaultSchema.attributes?.h1 || []), 'id'],
    h2: [...(defaultSchema.attributes?.h2 || []), 'id'],
    h3: [...(defaultSchema.attributes?.h3 || []), 'id'],
    h4: [...(defaultSchema.attributes?.h4 || []), 'id'],
    h5: [...(defaultSchema.attributes?.h5 || []), 'id'],
    h6: [...(defaultSchema.attributes?.h6 || []), 'id'],
    sup: [...(defaultSchema.attributes?.sup || []), 'id'],
    li: [...(defaultSchema.attributes?.li || []), 'id'],
    section: [...(defaultSchema.attributes?.section || []), 'className', 'dataFootnotes'],
    span: [...(defaultSchema.attributes?.span || []), 'className', 'ariaHidden'],
    code: [...(defaultSchema.attributes?.code || []), 'className'],
  },
  tagNames: [...(defaultSchema.tagNames || []), 'section', 'sup'],
};

interface MarkdownRendererProps {
  children: string;
  className?: string;
  /** Use compact prose sizing (prose-sm) */
  compact?: boolean;
}

export function MarkdownRenderer({ children, className, compact = false }: MarkdownRendererProps) {
  return (
    <div
      className={cn(
        'prose dark:prose-invert max-w-none break-words',
        compact && 'prose-sm',
        // Spacing
        'prose-headings:font-bold prose-headings:tracking-tight',
        'prose-h1:text-xl prose-h1:mt-6 prose-h1:mb-3',
        'prose-h2:text-lg prose-h2:mt-5 prose-h2:mb-2',
        'prose-h3:text-base prose-h3:mt-4 prose-h3:mb-1',
        'prose-p:my-2 prose-p:leading-relaxed',
        // Lists
        'prose-ul:list-disc prose-ul:pl-6 prose-ul:space-y-1 prose-ul:my-2',
        'prose-ol:list-decimal prose-ol:pl-6 prose-ol:space-y-1 prose-ol:my-2',
        'prose-li:ml-0',
        // Code
        'prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:font-mono',
        'prose-pre:bg-muted prose-pre:p-4 prose-pre:rounded-lg prose-pre:overflow-x-auto',
        // Blockquotes
        'prose-blockquote:border-l-4 prose-blockquote:border-primary prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:my-3',
        // Tables
        'prose-table:border prose-table:border-border',
        'prose-th:border prose-th:border-border prose-th:p-2 prose-th:bg-muted/50 prose-th:font-semibold',
        'prose-td:border prose-td:border-border prose-td:p-2',
        // Links
        'prose-a:text-primary prose-a:underline prose-a:underline-offset-2 prose-a:decoration-primary/40 hover:prose-a:decoration-primary',
        // Images
        'prose-img:rounded-lg prose-img:my-4',
        // HR
        'prose-hr:border-border prose-hr:my-6',
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[
          remarkGfm,
          remarkBreaks,
          [remarkFootnotes, { inlineNotes: true }],
        ]}
        rehypePlugins={[
          rehypeRaw,
          [rehypeSanitize, sanitizeSchema],
          rehypeSlug,
          [rehypeAutolinkHeadings, {
            behavior: 'prepend',
            properties: {
              className: ['anchor-link'],
              ariaLabel: 'Link to this section',
              tabIndex: 0,
            },
            content: {
              type: 'element',
              tagName: 'span',
              properties: { ariaHidden: 'true', className: ['anchor-icon'] },
              children: [{ type: 'text', value: '#' }],
            },
          }],
          rehypeHighlight,
        ]}
        components={{
          a: ({ node, children, href, ...props }) => (
            <a
              href={href}
              target={href?.startsWith('#') ? undefined : '_blank'}
              rel={href?.startsWith('#') ? undefined : 'noopener noreferrer'}
              {...props}
            >
              {children}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
