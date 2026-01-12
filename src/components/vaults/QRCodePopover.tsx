import { useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { QrCode, Download, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Vault } from '@/types/database';

interface QRCodePopoverProps {
  vault: Vault;
}

export function QRCodePopover({ vault }: QRCodePopoverProps) {
  const [copied, setCopied] = useState(false);
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
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-primary shrink-0"
          title="Share via QR code"
        >
          <QrCode className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-4" align="start">
        <div className="flex flex-col items-center gap-4">
          <p className="text-sm font-semibold text-center">Share "{vault.name}"</p>
          <div 
            ref={qrRef}
            className="p-3 bg-white rounded-xl shadow-md"
          >
            <QRCodeCanvas
              value={shareUrl}
              size={140}
              level="H"
              marginSize={2}
              bgColor="#ffffff"
              fgColor="#000000"
            />
          </div>
          <p className="text-xs text-muted-foreground font-mono text-center">
            // scan to access vault
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={copyShareUrl}
              className="gap-1.5 text-xs"
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              Copy
            </Button>
            <Button
              variant="glow"
              size="sm"
              onClick={downloadQR}
              className="gap-1.5 text-xs"
            >
              <Download className="w-3 h-3" />
              Download
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
