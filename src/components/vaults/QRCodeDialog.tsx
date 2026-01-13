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
import { QrCode, Download, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Vault } from '@/types/database';

interface QRCodeDialogProps {
  vault: Vault;
}

export function QRCodeDialog({ vault }: QRCodeDialogProps) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const shareUrl = vault.is_public && vault.public_slug
    ? `${window.location.origin}/public/${vault.public_slug}`
    : `${window.location.origin}/vault/${vault.id}`;

  const copyShareUrl = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: 'Link copied to clipboard' });
  };

  const downloadQR = () => {
    if (!qrRef.current) return;
    const canvas = qrRef.current.querySelector('canvas');
    if (!canvas) return;
    
    const link = document.createElement('a');
    link.download = `${vault.name || 'vault'}-qr.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    toast({ title: 'QR code downloaded' });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-primary shrink-0"
          title="Share via QR code"
        >
          <QrCode className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[95vw] max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-center font-mono">share "{vault.name}"</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-6 py-4">
          <div 
            ref={qrRef}
            className="p-4 bg-white rounded-xl shadow-md"
          >
            <QRCodeCanvas
              value={shareUrl}
              size={180}
              level="H"
              marginSize={2}
              bgColor="#ffffff"
              fgColor="#000000"
            />
          </div>
          <p className="text-xs text-muted-foreground font-mono text-center">
            // scan to access vault
          </p>
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
    </Dialog>
  );
}
