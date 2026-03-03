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
import { Button } from '@/components/ui/button';
import { X, Trash2, Save } from 'lucide-react';

interface UnsavedChangesDialogProps {
  open: boolean;
  onDiscard: () => void;
  onCancel: () => void;
  onSave?: () => Promise<void>;
  saving?: boolean;
  title?: string;
  description?: string;
}

export function UnsavedChangesDialog({
  open,
  onDiscard,
  onCancel,
  onSave,
  saving = false,
  title = 'Unsaved Changes',
  description = 'You have unsaved changes. Would you like to save them before leaving?',
}: UnsavedChangesDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <AlertDialogContent className="border-2 max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-mono">
            // {title.toLowerCase().replace(/\s+/g, '_')}
          </AlertDialogTitle>
          <AlertDialogDescription className="font-mono text-sm">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-row gap-2 sm:gap-2">
          <AlertDialogCancel 
            onClick={onCancel}
            className="font-mono text-xs sm:text-sm h-9"
          >
            <X className="w-3 h-3 mr-1.5 shrink-0" />
            cancel
          </AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={onDiscard}
            className="font-mono text-xs sm:text-sm h-9"
          >
            <Trash2 className="w-3 h-3 mr-1.5 shrink-0" />
            discard
          </Button>
          {onSave && (
            <AlertDialogAction
              onClick={onSave}
              disabled={saving}
              className="font-mono text-xs sm:text-sm h-9"
            >
              {saving ? 'saving...' : <><Save className="w-3 h-3 mr-1.5 shrink-0" />save</>}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default UnsavedChangesDialog;
