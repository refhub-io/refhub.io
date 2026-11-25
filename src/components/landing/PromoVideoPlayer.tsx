import { useEffect, useRef, useState } from 'react';
import { Maximize, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PromoVideoPlayerProps {
  src: string;
  poster: string;
  className?: string;
}

const formatTime = (seconds: number): string => {
  if (!Number.isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

// a minimal custom player so the promo video reads as a designed piece of the
// page rather than a plain <video controls> element dropped onto it (which
// pulls in the browser's own black control bar + native play button). starts
// paused and muted; the surrounding page never autoplays audio.
export function PromoVideoPlayer({ src, poster, className }: PromoVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [progress, setProgress] = useState(0); // 0-1
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  const toggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void container.requestFullscreen();
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    if (!video || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    video.currentTime = ratio * duration;
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      setProgress(video.duration ? video.currentTime / video.duration : 0);
    };
    const onLoadedMetadata = () => setDuration(video.duration);
    const onEnded = () => setIsPlaying(false);

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('ended', onEnded);
    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('ended', onEnded);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn('group relative overflow-hidden bg-black', className)}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        muted
        playsInline
        preload="metadata"
        onClick={togglePlay}
        className="h-full w-full cursor-pointer object-cover"
      />

      {/* centered play button - visible until first played, fades on hover once playing */}
      <button
        type="button"
        onClick={togglePlay}
        aria-label={isPlaying ? 'pause' : 'play'}
        className={cn(
          'absolute inset-0 flex items-center justify-center transition-opacity',
          isPlaying ? 'opacity-0 group-hover:opacity-100' : 'opacity-100',
        )}
      >
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90 text-black shadow-xl backdrop-blur transition-transform group-hover:scale-105">
          {isPlaying ? <Pause className="h-6 w-6" fill="currentColor" /> : <Play className="ml-1 h-6 w-6" fill="currentColor" />}
        </span>
      </button>

      {/* bottom control strip */}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-t from-black/80 to-transparent px-4 pb-3 pt-8 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <button type="button" onClick={togglePlay} aria-label={isPlaying ? 'pause' : 'play'} className="text-white/90 hover:text-white">
          {isPlaying ? <Pause className="h-4 w-4" fill="currentColor" /> : <Play className="h-4 w-4" fill="currentColor" />}
        </button>

        <div
          onClick={seek}
          className="group/bar relative h-1.5 flex-1 cursor-pointer rounded-full bg-white/25"
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-primary"
            style={{ width: `${progress * 100}%` }}
          />
        </div>

        <span className="font-mono text-xs tabular-nums text-white/80">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>

        <button type="button" onClick={toggleMute} aria-label={isMuted ? 'unmute' : 'mute'} className="text-white/90 hover:text-white">
          {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>

        <button type="button" onClick={toggleFullscreen} aria-label="fullscreen" className="text-white/90 hover:text-white">
          <Maximize className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
