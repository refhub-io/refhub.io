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
  const [gradientColor, setGradientColor] = useState('#8b5cf6');
  const qrRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const isPrivate = !vault.is_public && !vault.is_shared;
  const canShare = vault.is_public || vault.is_shared;

  // Generate random aesthetic gradient color
  const generateRandomColor = () => {
    const hue = Math.random() * 360;
    const saturation = 70 + Math.random() * 20; // 70-90%
    const lightness = 55 + Math.random() * 15; // 55-70%
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
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
        // Generate new random color each time dialog opens
        setGradientColor(generateRandomColor());
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

  const downloadQR = () => {
    const canvas = qrRef.current?.querySelector('canvas');
    if (!canvas) return;
    
    const link = document.createElement('a');
    link.download = `${vault.name || 'vault'}-qr.png`;
    link.href = canvas.toDataURL('image/png');
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
              {/* QR Code with gradient effect */}
              <div className="p-6 bg-gradient-to-br from-background via-background/95 to-sidebar-accent rounded-2xl shadow-xl border-2 border-border/50 glow-purple">
                <div className="p-4 bg-white rounded-xl relative">
                  <div 
                    ref={qrRef}
                    className="relative"
                    style={{
                      filter: `drop-shadow(0 0 8px ${gradientColor}40)`,
                    }}
                  >
                    <QRCodeCanvas
                      value={shareUrl}
                      size={200}
                      level="H"
                      marginSize={2}
                      bgColor="#ffffff"
                      fgColor={gradientColor}
                    />
                  </div>
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
              upgrade_to_protected
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
