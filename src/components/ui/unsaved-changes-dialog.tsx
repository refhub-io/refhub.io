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
      <AlertDialogContent className="border-2">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-mono">
            // {title.toLowerCase().replace(/\s+/g, '_')}
          </AlertDialogTitle>
          <AlertDialogDescription className="font-mono text-sm">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <AlertDialogCancel 
            onClick={onCancel}
            className="font-mono"
          >
            cancel
          </AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={onDiscard}
            className="font-mono"
          >
            discard_changes
          </Button>
          {onSave && (
            <AlertDialogAction
              onClick={onSave}
              disabled={saving}
              className="font-mono"
            >
              {saving ? 'saving...' : 'save_changes'}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default UnsavedChangesDialog;
