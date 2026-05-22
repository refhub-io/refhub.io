import { useRef } from 'react';
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
import { LoadingSpinner } from '@/components/ui/loading';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Vault } from '@/types/database';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

const REFHUB_QR_DARK = '#4c1d95';
const REFHUB_QR_PURPLE = '#a855f7';
const REFHUB_QR_PINK = '#ec4899';
const REFHUB_LOGO_SRC = '/logo_c.svg';

const drawRoundedRect = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) => {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
};

const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = reject;
  image.src = src;
});

interface QRCodeDialogProps {
  vault: Vault;
  onVaultUpdate?: () => void;
}

export function QRCodeDialog({ vault, onVaultUpdate }: QRCodeDialogProps) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const isPrivate = vault.visibility === 'private';
  const canShare = vault.visibility !== 'private';

  // Only use public slug URL for public vaults, always use /vault/{id} for protected
  const shareUrl = vault.visibility === 'public' && vault.public_slug
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
    }
  };

  const handleUpgradeToProtected = async () => {
    setUpgrading(true);
    try {
      const { error } = await supabase
        .from('vaults')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ visibility: 'protected' } as any)
        .eq('id', vault.id);

      if (error) throw error;

      toast({ title: 'vault_upgraded_to_protected ✨' });
      setShowUpgradeDialog(false);
      setOpen(true);
      onVaultUpdate?.();
    } catch (error) {
      toast({
        title: 'error_upgrading_vault',
        description: (error as Error).message,
        variant: 'destructive',
      });
    } finally {
      setUpgrading(false);
    }
  };

  const downloadQR = async () => {
    const canvas = qrRef.current?.querySelector('canvas');
    if (!canvas) return;

    try {
      const exportCanvas = document.createElement('canvas');
      const size = 720;
      const outerPadding = 44;
      const qrPadding = 42;
      const footerHeight = 96;
      const cardSize = size - outerPadding * 2;
      const qrSize = cardSize - qrPadding * 2;
      const context = exportCanvas.getContext('2d');
      if (!context) return;

      exportCanvas.width = size;
      exportCanvas.height = size + footerHeight;

      const background = context.createLinearGradient(0, 0, size, size + footerHeight);
      background.addColorStop(0, REFHUB_QR_PURPLE);
      background.addColorStop(0.58, '#7c3aed');
      background.addColorStop(1, REFHUB_QR_PINK);
      context.fillStyle = background;
      context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

      context.save();
      context.globalAlpha = 0.22;
      context.fillStyle = '#ffffff';
      context.beginPath();
      context.arc(94, 86, 84, 0, Math.PI * 2);
      context.arc(size - 74, size - 22, 118, 0, Math.PI * 2);
      context.fill();
      context.restore();

      context.fillStyle = '#ffffff';
      drawRoundedRect(context, outerPadding, outerPadding, cardSize, cardSize, 44);
      context.fill();

      context.drawImage(canvas, outerPadding + qrPadding, outerPadding + qrPadding, qrSize, qrSize);

      const logo = await loadImage(REFHUB_LOGO_SRC);
      const logoBackingSize = 132;
      const logoSize = 92;
      const logoBackingX = size / 2 - logoBackingSize / 2;
      const logoBackingY = outerPadding + cardSize / 2 - logoBackingSize / 2;

      context.fillStyle = '#ffffff';
      drawRoundedRect(context, logoBackingX, logoBackingY, logoBackingSize, logoBackingSize, 30);
      context.fill();
      context.strokeStyle = 'rgba(168, 85, 247, 0.24)';
      context.lineWidth = 6;
      context.stroke();
      context.drawImage(
        logo,
        size / 2 - logoSize / 2,
        outerPadding + cardSize / 2 - logoSize / 2,
        logoSize,
        logoSize,
      );

      context.fillStyle = '#ffffff';
      context.font = '700 30px ui-monospace, SFMono-Regular, Menlo, monospace';
      context.textAlign = 'center';
      context.fillText('refhub.io', size / 2, size + 42);
      context.font = '500 18px ui-monospace, SFMono-Regular, Menlo, monospace';
      context.globalAlpha = 0.82;
      context.fillText('scan_to_access_vault', size / 2, size + 72);

      const link = document.createElement('a');
      const fileName = (vault.name || 'vault').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'vault';
      link.download = `${fileName}-qr.png`;
      link.href = exportCanvas.toDataURL('image/png');
      link.click();
      toast({ title: 'qr_code_downloaded' });
    } catch (error) {
      toast({
        title: 'error_downloading_qr_code',
        description: (error as Error).message,
        variant: 'destructive',
      });
    }
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
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-xl sm:text-2xl font-bold font-mono">
                // share "{vault.name}"
              </DialogTitle>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4 sm:gap-6 py-2 sm:py-4">
              {/* Branded QR code; keep the QR itself high contrast with a quiet zone. */}
              <div className="p-4 sm:p-6 bg-gradient-to-br from-neon-purple/20 via-background to-neon-pink/20 rounded-2xl shadow-xl border-2 border-neon-purple/20 glow-purple">
                <div className="p-3 sm:p-4 bg-white rounded-[1.25rem] relative shadow-inner">
                  <div
                    ref={qrRef}
                    className="relative drop-shadow-[0_0_14px_rgba(168,85,247,0.22)]"
                  >
                    <QRCodeCanvas
                      value={shareUrl}
                      size={window.innerWidth < 640 ? 180 : 200}
                      level="H"
                      marginSize={2}
                      bgColor="#ffffff"
                      fgColor={REFHUB_QR_DARK}
                    />
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl bg-white shadow-lg ring-2 ring-neon-purple/20">
                        <img
                          src={REFHUB_LOGO_SRC}
                          alt="RefHub"
                          className="h-9 w-9 sm:h-10 sm:w-10"
                          draggable={false}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="text-center space-y-1">
                <p className="text-xs text-muted-foreground font-mono">
                  // scan_to_access_vault
                </p>
                <div className="flex items-center justify-center gap-2 text-xs">
                  {vault.visibility === 'public' ? (
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
              
              <div className="flex gap-2 sm:gap-3 w-full">
                <Button
                  variant="outline"
                  onClick={copyShareUrl}
                  className="flex-1 gap-1.5 sm:gap-2 font-mono text-xs sm:text-sm"
                >
                  {copied ? <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Copy className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                  <span className="hidden xs:inline">copy_link</span>
                  <span className="xs:hidden">copy</span>
                </Button>
                <Button
                  variant="glow"
                  onClick={downloadQR}
                  className="flex-1 gap-1.5 sm:gap-2 font-mono text-xs sm:text-sm"
                >
                  <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="hidden xs:inline">download</span>
                  <span className="xs:hidden">save</span>
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
                <LoadingSpinner size="xs" variant="inverted" />
              )}
              upgrade_to_protected
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
