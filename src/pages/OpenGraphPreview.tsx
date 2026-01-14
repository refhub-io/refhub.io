import { Sparkles, BookOpen, Users, Download, Tag, GitFork, Share2, Zap } from 'lucide-react';

export default function OpenGraphPreview() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-8">
      {/* OG Image Container - 1200x630px */}
      <div 
        className="relative overflow-hidden"
        style={{ width: '1200px', height: '630px' }}
      >
        {/* Background with gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-purple-950/20" />
        
        {/* Subtle grid pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0" style={{
            backgroundImage: `linear-gradient(rgba(168, 85, 247, 0.3) 1px, transparent 1px),
                             linear-gradient(90deg, rgba(168, 85, 247, 0.3) 1px, transparent 1px)`,
            backgroundSize: '50px 50px'
          }} />
        </div>

        {/* Content */}
        <div className="relative h-full flex flex-col items-center justify-center px-20">
          {/* Logo */}
          <div className="flex items-center gap-6 mb-12">
            <div className="w-28 h-28 rounded-3xl bg-gradient-to-br from-purple-500 via-pink-500 to-rose-500 flex items-center justify-center shadow-2xl">
              <Sparkles className="w-16 h-16 text-white" />
            </div>
            <div>
              <h1 className="text-8xl font-bold font-mono">
                <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-rose-500 bg-clip-text text-transparent">
                  refhub
                </span>
                <span className="text-foreground/60">.io</span>
              </h1>
            </div>
          </div>

          {/* Slogan */}
          <div className="text-center mb-16">
            <p className="text-5xl font-mono text-foreground/90 mb-4">
              // your_research_organized
            </p>
            <p className="text-3xl font-mono text-muted-foreground">
              organize • curate • share • cite
            </p>
          </div>

          {/* Feature Icons */}
          <div className="flex items-center justify-center gap-14">
            <div className="flex flex-col items-center gap-3">
              <div className="w-20 h-20 rounded-xl bg-purple-500/20 border-2 border-purple-500/30 flex items-center justify-center">
                <BookOpen className="w-10 h-10 text-purple-400" />
              </div>
              <span className="text-xl font-mono text-muted-foreground">collections</span>
            </div>
            
            <div className="flex flex-col items-center gap-3">
              <div className="w-20 h-20 rounded-xl bg-pink-500/20 border-2 border-pink-500/30 flex items-center justify-center">
                <Tag className="w-10 h-10 text-pink-400" />
              </div>
              <span className="text-xl font-mono text-muted-foreground">tags</span>
            </div>
            
            <div className="flex flex-col items-center gap-3">
              <div className="w-20 h-20 rounded-xl bg-rose-500/20 border-2 border-rose-500/30 flex items-center justify-center">
                <Share2 className="w-10 h-10 text-rose-400" />
              </div>
              <span className="text-xl font-mono text-muted-foreground">share</span>
            </div>
            
            <div className="flex flex-col items-center gap-3">
              <div className="w-20 h-20 rounded-xl bg-purple-500/20 border-2 border-purple-500/30 flex items-center justify-center">
                <Download className="w-10 h-10 text-purple-400" />
              </div>
              <span className="text-xl font-mono text-muted-foreground">export</span>
            </div>
            
            <div className="flex flex-col items-center gap-3">
              <div className="w-20 h-20 rounded-xl bg-pink-500/20 border-2 border-pink-500/30 flex items-center justify-center">
                <GitFork className="w-10 h-10 text-pink-400" />
              </div>
              <span className="text-xl font-mono text-muted-foreground">fork</span>
            </div>
            
            <div className="flex flex-col items-center gap-3">
              <div className="w-20 h-20 rounded-xl bg-rose-500/20 border-2 border-rose-500/30 flex items-center justify-center">
                <Zap className="w-10 h-10 text-rose-400" />
              </div>
              <span className="text-xl font-mono text-muted-foreground">cite</span>
            </div>
          </div>

          {/* Bottom tagline */}
          <div className="absolute bottom-12 text-center">
            <p className="text-2xl font-mono text-muted-foreground/70">
              // modern_reference_management_for_the_command_line_generation
            </p>
          </div>
        </div>

        {/* Corner accent */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-purple-500/10 to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-gradient-to-tr from-pink-500/10 to-transparent rounded-full blur-3xl" />
      </div>
    </div>
  );
}
