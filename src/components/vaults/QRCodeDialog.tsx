import { useEffect, useRef, useState } from 'react';
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
import { useToast } from '@/hooks/use-toast';
import { Vault } from '@/types/database';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

const CUSTOM_QR_ENDPOINT = 'https://refhub-qr.netlify.app/api/generate-qr';
const CUSTOM_QR_FREEDOM = 0;

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
  const [customQrSvg, setCustomQrSvg] = useState<string | null>(null);
  const [customQrUrl, setCustomQrUrl] = useState<string | null>(null);
  const [customQrLoading, setCustomQrLoading] = useState(false);
  const [customQrError, setCustomQrError] = useState<string | null>(null);
  const qrRef = useRef<HTMLDivElement>(null);
  const fallbackQrSize = typeof window !== 'undefined' && window.innerWidth < 640 ? 220 : 360;
  const { toast } = useToast();

  const isPrivate = vault.visibility === 'private';
  const canShare = vault.visibility !== 'private';

  // Generate random aesthetic gradient color for the fallback QR.
  const generateRandomColor = () => {
    const hue = Math.random() * 360;
    const saturation = 70 + Math.random() * 20; // 70-90%
    const lightness = 55 + Math.random() * 15; // 55-70%
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  };

  // Only use public slug URL for public vaults, always use /vault/{id} for protected
  const shareUrl = vault.visibility === 'public' && vault.public_slug
    ? `${window.location.origin}/public/${vault.public_slug}`
    : `${window.location.origin}/vault/${vault.id}`;

  useEffect(() => {
    if (!open || !canShare) {
      setCustomQrSvg(null);
      setCustomQrError(null);
      setCustomQrLoading(false);
      return;
    }

    let isCurrent = true;
    const controller = new AbortController();

    const generateCustomQr = async () => {
      setCustomQrLoading(true);
      setCustomQrError(null);
      setCustomQrSvg(null);

      try {
        const response = await fetch(CUSTOM_QR_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: shareUrl, freedom: CUSTOM_QR_FREEDOM }),
          signal: controller.signal,
        });

        const contentType = response.headers.get('content-type') ?? '';
        if (!response.ok || !contentType.includes('image/svg+xml')) {
          throw new Error('custom QR generator returned an invalid response');
        }

        const svg = await response.text();
        if (!svg.trimStart().startsWith('<svg')) {
          throw new Error('custom QR generator returned non-SVG content');
        }

        if (isCurrent) {
          setCustomQrSvg(svg);
        }
      } catch (error) {
        if ((error as DOMException).name === 'AbortError' || !isCurrent) return;
        setCustomQrError((error as Error).message);
      } finally {
        if (!controller.signal.aborted && isCurrent) {
          setCustomQrLoading(false);
        }
      }
    };

    generateCustomQr();

    return () => {
      isCurrent = false;
      controller.abort();
    };
  }, [canShare, open, shareUrl]);

  useEffect(() => {
    if (!customQrSvg) {
      setCustomQrUrl(null);
      return;
    }

    const blobUrl = URL.createObjectURL(new Blob([customQrSvg], { type: 'image/svg+xml' }));
    setCustomQrUrl(blobUrl);

    return () => URL.revokeObjectURL(blobUrl);
  }, [customQrSvg]);

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

  const downloadQR = () => {
    const link = document.createElement('a');

    if (customQrSvg) {
      const blobUrl = URL.createObjectURL(new Blob([customQrSvg], { type: 'image/svg+xml' }));
      link.download = `${vault.name || 'vault'}-qr.svg`;
      link.href = blobUrl;
      link.click();
      URL.revokeObjectURL(blobUrl);
      toast({ title: 'qr_code_downloaded' });
      return;
    }

    const canvas = qrRef.current?.querySelector('canvas');
    if (!canvas) return;

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
          <DialogContent className="dialog-mobile w-[100vw] max-w-[100vw] gap-3 overflow-y-auto p-4 sm:rounded-2xl sm:w-[95vw] sm:max-w-xl sm:max-h-[90vh] sm:gap-4 sm:p-6">
            <DialogHeader className="px-1 sm:px-0">
              <DialogTitle className="text-lg sm:text-2xl font-bold font-mono break-words">
                // share "{vault.name}"
              </DialogTitle>
            </DialogHeader>
            <div className="flex flex-col items-center gap-3 sm:gap-6 py-2 sm:py-5">
              <div className="w-full max-w-[276px] sm:max-w-[456px] p-0 rounded-2xl sm:rounded-3xl shadow-xl glow-purple">
                <div className="p-0 bg-transparent rounded-xl sm:rounded-2xl relative overflow-hidden">
                  <div 
                    ref={qrRef}
                    className={cn(
                      "relative flex items-center justify-center rounded-xl sm:rounded-2xl",
                      customQrLoading && !customQrError && "min-h-[220px] sm:min-h-[360px]"
                    )}
                    style={{
                      filter: customQrError ? `drop-shadow(0 0 8px ${gradientColor}40)` : undefined,
                    }}
                  >
                    {customQrUrl ? (
                      <img
                        src={customQrUrl}
                        alt={`QR code for ${vault.name || 'vault'}`}
                        className="block h-auto w-full max-w-[236px] object-contain sm:max-w-[390px]"
                      />
                    ) : customQrLoading && !customQrError ? (
                      <div className="flex flex-col items-center justify-center gap-3 text-center font-mono text-sm text-muted-foreground">
                        <span className="tracking-[0.25em] text-primary">qr-coding</span>
                        <span className="flex gap-1" aria-hidden="true">
                          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
                          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
                          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" />
                        </span>
                      </div>
                    ) : (
                      <QRCodeCanvas
                        value={shareUrl}
                        size={fallbackQrSize}
                        level="H"
                        marginSize={2}
                        bgColor="#ffffff"
                        fgColor={gradientColor}
                      />
                    )}
                  </div>
                </div>
              </div>
              {customQrError && (
                <p className="-mt-2 text-center text-[11px] text-muted-foreground font-mono">
                  // custom_qr_unavailable_using_fallback
                </p>
              )}
              
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
