import { useRef, useEffect } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { QrCode, Download, Copy, Check, Lock, Globe, Users, AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Vault } from '@/types/database';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface QRCodeDialogProps {
  vault: Vault;
  onVaultUpdate?: () => void;
}

export function QRCodeDialog({ vault, onVaultUpdate }: QRCodeDialogProps) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [qrLoading, setQrLoading] = useState(true);
  const qrRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { toast } = useToast();

  const isPrivate = !vault.is_public && !vault.is_shared;
  const canShare = vault.is_public || vault.is_shared;

  // Generate random aesthetic gradient colors
  const generateGradientColors = () => {
    const hue1 = Math.random() * 360;
    const hue2 = (hue1 + 30 + Math.random() * 60) % 360; // 30-90 degrees apart
    const hue3 = (hue1 + 60 + Math.random() * 60) % 360; // 60-120 degrees apart
    
    const saturation = 70 + Math.random() * 25; // 70-95%
    const lightness = 55 + Math.random() * 15; // 55-70%
    
    return [
      `hsl(${hue1}, ${saturation}%, ${lightness}%)`,
      `hsl(${hue2}, ${saturation}%, ${lightness}%)`,
      `hsl(${hue3}, ${saturation}%, ${lightness}%)`,
    ];
  };

  const shareUrl = vault.is_public && vault.public_slug
    ? `${window.location.origin}/public/${vault.public_slug}`
    : `${window.location.origin}/vault/${vault.id}`;

  const copyShareUrl = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: 'link_copied_to_clipboard' });
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen && isPrivate) {
      setShowUpgradeDialog(true);
    } else {
      setOpen(newOpen);
      if (newOpen) {
        setQrLoading(true);
      }
    }
  };

  const handleUpgradeToProtected = async () => {
    setUpgrading(true);
    try {
      const { error } = await supabase
        .from('vaults')
        .update({ is_shared: true })
        .eq('id', vault.id);

      if (error) throw error;

      toast({ title: 'vault_upgraded_to_protected ✨' });
      setShowUpgradeDialog(false);
      setOpen(true);
      onVaultUpdate?.();
    } catch (error: any) {
      toast({
        title: 'error_upgrading_vault',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setUpgrading(false);
    }
  };

  // Apply gradient to QR code after render
  useEffect(() => {
    if (!open) return;

    const applyGradient = () => {
      const canvas = canvasRef.current;
      const qrCanvas = qrRef.current?.querySelector('canvas');
      
      if (!canvas || !qrCanvas) {
        return false;
      }

      // Check if QR canvas has content
      if (qrCanvas.width === 0 || qrCanvas.height === 0) {
        return false;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return false;

      // Set canvas size
      canvas.width = qrCanvas.width;
      canvas.height = qrCanvas.height;

      // Draw QR code
      ctx.drawImage(qrCanvas, 0, 0);

      // Apply gradient only to black pixels
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      // Create gradient with random aesthetic colors
      const colors = generateGradientColors();
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      gradient.addColorStop(0, colors[0]);
      gradient.addColorStop(0.5, colors[1]);
      gradient.addColorStop(1, colors[2]);

      ctx.fillStyle = gradient;

      // Replace black pixels with gradient
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        
        // If pixel is black (QR code module)
        if (r < 128 && g < 128 && b < 128) {
          const x = (i / 4) % canvas.width;
          const y = Math.floor((i / 4) / canvas.width);
          ctx.fillRect(x, y, 1, 1);
        }
      }

      return true;
    };

    let attempts = 0;
    const maxAttempts = 20;
    
    const tryApplyGradient = () => {
      const success = applyGradient();
      
      if (success) {
        setQrLoading(false);
      } else if (attempts < maxAttempts) {
        attempts++;
        setTimeout(tryApplyGradient, 100);
      } else {
        // Fallback: stop showing loading
        console.warn('QR gradient application timed out');
        setQrLoading(false);
      }
    };

    // Small initial delay to let DOM settle
    const initTimer = setTimeout(tryApplyGradient, 50);
    
    return () => clearTimeout(initTimer);
  }, [open]);

  const downloadQR = () => {
    if (!canvasRef.current) return;
    
    const link = document.createElement('a');
    link.download = `${vault.name || 'vault'}-qr.png`;
    link.href = canvasRef.current.toDataURL('image/png');
    link.click();
    toast({ title: 'qr_code_downloaded' });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-8 w-8 shrink-0",
              isPrivate 
                ? "text-muted-foreground/50 hover:text-muted-foreground" 
                : "text-muted-foreground hover:text-primary"
            )}
            title={isPrivate ? "upgrade vault to share" : "share via qr code"}
          >
            {isPrivate ? (
              <Lock className="w-4 h-4" />
            ) : (
              <QrCode className="w-4 h-4" />
            )}
          </Button>
        </DialogTrigger>
        {canShare && (
          <DialogContent className="w-[95vw] max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-center font-mono">
                share "{vault.name}"
              </DialogTitle>
            </DialogHeader>
            <div className="flex flex-col items-center gap-6 py-4">
              {/* Hidden QR code for rendering - completely hidden from view */}
              <div ref={qrRef} style={{ position: 'absolute', left: '-9999px', top: '-9999px', visibility: 'hidden' }}>
                <QRCodeCanvas
                  value={shareUrl}
                  size={200}
                  level="H"
                  marginSize={2}
                  bgColor="#ffffff"
                  fgColor="#000000"
                />
              </div>
              
              {/* Gradient QR code display */}
              <div className="p-6 bg-gradient-to-br from-background via-background/95 to-sidebar-accent rounded-2xl shadow-xl border-2 border-border/50 glow-purple">
                <div className="p-3 bg-white rounded-xl relative w-[200px] h-[200px] flex items-center justify-center overflow-hidden">
                  {qrLoading ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
                      <span className="text-xs text-muted-foreground font-mono">generating...</span>
                    </div>
                  ) : (
                    <canvas
                      ref={canvasRef}
                      width={200}
                      height={200}
                      style={{ 
                        width: '200px',
                        height: '200px'
                      }}
                    />
                  )}
                </div>
              </div>
              
              <div className="text-center space-y-1">
                <p className="text-xs text-muted-foreground font-mono">
                  // scan_to_access_vault
                </p>
                <div className="flex items-center justify-center gap-2 text-xs">
                  {vault.is_public ? (
                    <>
                      <Globe className="w-3 h-3 text-neon-green" />
                      <span className="text-neon-green font-mono">public</span>
                    </>
                  ) : (
                    <>
                      <Users className="w-3 h-3 text-neon-purple" />
                      <span className="text-neon-purple font-mono">protected</span>
                    </>
                  )}
                </div>
              </div>
              
              <div className="flex gap-3 w-full">
                <Button
                  variant="outline"
                  onClick={copyShareUrl}
                  className="flex-1 gap-2 font-mono"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  copy_link
                </Button>
                <Button
                  variant="glow"
                  onClick={downloadQR}
                  className="flex-1 gap-2 font-mono"
                >
                  <Download className="w-4 h-4" />
                  download
                </Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>

      {/* Upgrade Dialog */}
      <AlertDialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 font-mono">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
              private_vault
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3 font-mono text-sm">
              <p>
                // qr_code_sharing_requires_vault_to_be_protected_or_public
              </p>
              <div className="space-y-2 pt-2">
                <div className="flex items-start gap-3 p-3 bg-sidebar-accent rounded-lg">
                  <Lock className="w-4 h-4 text-muted-foreground mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-semibold text-foreground">private</p>
                    <p className="text-xs text-muted-foreground">only_you_can_access</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-neon-purple/10 border border-neon-purple/30 rounded-lg">
                  <Users className="w-4 h-4 text-neon-purple mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-semibold text-foreground">protected</p>
                    <p className="text-xs text-muted-foreground">share_with_specific_people</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-neon-green/10 border border-neon-green/30 rounded-lg">
                  <Globe className="w-4 h-4 text-neon-green mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-semibold text-foreground">public</p>
                    <p className="text-xs text-muted-foreground">listed_in_the_codex</p>
                  </div>
                </div>
              </div>
              <p className="text-xs pt-2">
                // upgrade_to_protected_to_enable_qr_sharing
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={upgrading} className="font-mono">
              cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleUpgradeToProtected}
              disabled={upgrading}
              className="font-mono bg-gradient-primary hover:opacity-90 gap-2"
            >
              {upgrading && (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              {upgrading ? 'upgrading...' : 'upgrade_to_protected'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
