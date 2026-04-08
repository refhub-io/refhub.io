# Google Drive PDF Links — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface Google Drive PDF links in the refhub.io frontend — fetch them asynchronously per vault, display them as a Drive icon badge on cards/tables/view dialogs, and allow owners to edit them in the add/edit publication forms.

**Architecture:** `VaultContentContext` gains a parallel async fetch of `publication_pdf_assets` (owner-only via RLS) that populates `pdfAssetsMap` keyed by `vault_publication_id`. Components receive `driveUrl`/`driveLoading` props; `VaultDetail` wires everything. Drive URL edits upsert directly to `publication_pdf_assets` via Supabase client.

**Tech Stack:** React 18 + TypeScript, Supabase client (`@/integrations/supabase/client`), shadcn/ui, Lucide React, Tailwind CSS.

---

## File Map

| Action | File |
|--------|------|
| Create | `src/components/ui/GoogleDriveIcon.tsx` |
| Modify | `src/contexts/VaultContentContext.tsx` |
| Modify | `src/components/publications/PublicationCard.tsx` |
| Modify | `src/components/publications/PublicationTable.tsx` |
| Modify | `src/components/publications/PublicationViewDialog.tsx` |
| Modify | `src/components/publications/PublicationDialog.tsx` |
| Modify | `src/components/publications/AddImportDialog.tsx` |
| Modify | `src/pages/VaultDetail.tsx` |

---

## Task 1: GoogleDriveIcon component

**Files:**
- Create: `src/components/ui/GoogleDriveIcon.tsx`

- [ ] **Step 1: Create the icon component**

```tsx
// src/components/ui/GoogleDriveIcon.tsx
interface GoogleDriveIconProps {
  className?: string;
}

export function GoogleDriveIcon({ className }: GoogleDriveIconProps) {
  return (
    <svg
      viewBox="0 0 87.3 78"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z"
        fill="#0066da"
      />
      <path
        d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z"
        fill="#00ac47"
      />
      <path
        d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z"
        fill="#ea4335"
      />
      <path
        d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z"
        fill="#00832d"
      />
      <path
        d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z"
        fill="#2684fc"
      />
      <path
        d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 27h27.45c0-1.55-.4-3.1-1.2-4.5z"
        fill="#ffba00"
      />
    </svg>
  );
}
```

- [ ] **Step 2: Verify the file exists and renders correctly**

Open `src/components/ui/GoogleDriveIcon.tsx` and confirm it exports `GoogleDriveIcon`. No runtime check needed yet — it will be exercised in Task 4.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/GoogleDriveIcon.tsx
git commit -m "feat: add GoogleDriveIcon SVG component"
```

---

## Task 2: VaultContentContext — pdf assets state + fetch

**Files:**
- Modify: `src/contexts/VaultContentContext.tsx`

- [ ] **Step 1: Add new state and update the context interface**

At the top of the file, find the `VaultContentContextType` interface (~line 30) and add three new members:

```ts
// Add inside VaultContentContextType interface:
pdfAssetsMap: Record<string, string | null>;
pdfAssetsLoading: boolean;
updatePdfAsset: (vaultPublicationId: string, url: string | null) => Promise<void>;
```

Inside `VaultContentProvider`, find where the other state is declared (~line 61) and add:

```ts
const [pdfAssetsMap, setPdfAssetsMap] = useState<Record<string, string | null>>({});
const [pdfAssetsLoading, setPdfAssetsLoading] = useState(false);
```

- [ ] **Step 2: Add the fetchPdfAssets helper inside VaultContentProvider**

Add this function directly before the `fetchVaultContent` callback (before ~line 208):

```ts
const fetchPdfAssets = useCallback(async (vaultPublicationIds: string[]) => {
  if (vaultPublicationIds.length === 0) {
    setPdfAssetsMap({});
    setPdfAssetsLoading(false);
    return;
  }
  try {
    const { data, error } = await supabase
      .from('publication_pdf_assets')
      .select('vault_publication_id, stored_pdf_url')
      .in('vault_publication_id', vaultPublicationIds)
      .eq('storage_provider', 'google_drive')
      .eq('status', 'stored');

    if (error) throw error;

    const map: Record<string, string | null> = {};
    for (const row of data ?? []) {
      map[row.vault_publication_id] = row.stored_pdf_url ?? null;
    }
    setPdfAssetsMap(map);
  } catch (err) {
    // Non-fatal — Drive links simply won't show
    debug('VaultContentContext', 'pdf assets fetch failed (non-fatal):', err);
    setPdfAssetsMap({});
  } finally {
    setPdfAssetsLoading(false);
  }
}, []);
```

- [ ] **Step 3: Fire the async fetch after publications are set in fetchVaultContent**

Find the block inside `fetchVaultContent` where `setPublications` is called (~line 322):

```ts
setPublications(formattedVaultPublications);
```

Immediately after that line, add:

```ts
// Fire pdf assets fetch async — does not block publication rendering
setPdfAssetsLoading(true);
fetchPdfAssets(vaultPublicationIds);
```

- [ ] **Step 4: Expose the new values in the context Provider value**

Find the `<VaultContentContext.Provider value={{` block (near the bottom of the file) and add the three new entries:

```ts
pdfAssetsMap,
pdfAssetsLoading,
updatePdfAsset,   // defined in Task 3
```

- [ ] **Step 5: Commit**

```bash
git add src/contexts/VaultContentContext.tsx
git commit -m "feat(context): add pdfAssetsMap and async pdf assets fetch"
```

---

## Task 3: VaultContentContext — updatePdfAsset mutation

**Files:**
- Modify: `src/contexts/VaultContentContext.tsx`

- [ ] **Step 1: Add updatePdfAsset after fetchPdfAssets**

Add this function directly after `fetchPdfAssets` (before `fetchVaultContent`):

```ts
const updatePdfAsset = useCallback(async (vaultPublicationId: string, url: string | null) => {
  if (!user) return;

  // Optimistic update
  setPdfAssetsMap(prev => ({ ...prev, [vaultPublicationId]: url || null }));

  const record = {
    user_id: user.id,
    vault_publication_id: vaultPublicationId,
    storage_provider: 'google_drive' as const,
    stored_pdf_url: url || null,
    stored_file_id: null as string | null,
    status: url ? 'stored' : 'removed',
    error_message: null as string | null,
  };

  const { error } = await supabase
    .from('publication_pdf_assets')
    .upsert(record, { onConflict: 'vault_publication_id,storage_provider' });

  if (error) {
    // Roll back optimistic update
    setPdfAssetsMap(prev => {
      const next = { ...prev };
      delete next[vaultPublicationId];
      return next;
    });
    throw error;
  }
}, [user]);
```

- [ ] **Step 2: Add user to fetchPdfAssets dependency array if needed**

`fetchPdfAssets` only uses `supabase` (stable ref) and `setPdfAssetsMap`/`setPdfAssetsLoading` (stable setters), so its `useCallback` deps array stays `[]`. `updatePdfAsset` depends on `user`, so its array is `[user]`.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /home/velitchko/Documents/Projects/refhub/refhub.io && bun run tsc --noEmit 2>&1 | head -30
```

Expected: no errors related to `VaultContentContext`.

- [ ] **Step 4: Commit**

```bash
git add src/contexts/VaultContentContext.tsx
git commit -m "feat(context): add updatePdfAsset mutation with optimistic update"
```

---

## Task 4: PublicationCard — Drive badge + rename label

**Files:**
- Modify: `src/components/publications/PublicationCard.tsx`

- [ ] **Step 1: Add imports and new props**

Add the import at the top of the file alongside the existing imports:

```tsx
import { Loader2 } from 'lucide-react';
import { GoogleDriveIcon } from '@/components/ui/GoogleDriveIcon';
```

In the `PublicationCardProps` interface (around line 28), add after `onExportBibtex`:

```ts
driveUrl?: string | null;
driveLoading?: boolean;
```

In the destructured function parameters, add:

```ts
driveUrl,
driveLoading = false,
```

- [ ] **Step 2: Update the pdf link label and add Drive badge**

Find the existing pdf link block (~line 146–157):

```tsx
{show.pdf && publication.pdf_url && (
  <a
    href={publication.pdf_url}
    target="_blank"
    rel="noopener noreferrer"
    onClick={(e) => e.stopPropagation()}
    className="flex items-center gap-1 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors px-1.5 py-1 rounded-md hover:bg-muted"
  >
    pdf
    <ExternalLink className="w-3 h-3" />
  </a>
)}
```

Replace it with:

```tsx
{show.pdf && publication.pdf_url && (
  <a
    href={publication.pdf_url}
    target="_blank"
    rel="noopener noreferrer"
    onClick={(e) => e.stopPropagation()}
    className="flex items-center gap-1 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors px-1.5 py-1 rounded-md hover:bg-muted"
  >
    publisher_pdf
    <ExternalLink className="w-3 h-3" />
  </a>
)}
{driveLoading && (
  <span className="flex items-center px-1.5 py-1">
    <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
  </span>
)}
{!driveLoading && driveUrl && (
  <a
    href={driveUrl}
    target="_blank"
    rel="noopener noreferrer"
    onClick={(e) => e.stopPropagation()}
    title="open_in_drive"
    className="flex items-center px-1.5 py-1 rounded-md hover:bg-muted transition-colors"
  >
    <GoogleDriveIcon className="w-3.5 h-3.5" />
  </a>
)}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /home/velitchko/Documents/Projects/refhub/refhub.io && bun run tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/publications/PublicationCard.tsx src/components/ui/GoogleDriveIcon.tsx
git commit -m "feat(card): add Drive badge and rename pdf label to publisher_pdf"
```

---

## Task 5: PublicationTable — Drive indicator + rename header

**Files:**
- Modify: `src/components/publications/PublicationTable.tsx`

- [ ] **Step 1: Add imports and new props**

Add at the top alongside existing imports:

```tsx
import { Loader2 } from 'lucide-react';
import { GoogleDriveIcon } from '@/components/ui/GoogleDriveIcon';
```

In `PublicationTableProps` interface (around line 36), add after `onExportBibtex`:

```ts
driveUrlsMap?: Record<string, string | null>;
driveLoading?: boolean;
```

In the destructured parameters of `PublicationTable`, add:

```ts
driveUrlsMap = {},
driveLoading = false,
```

- [ ] **Step 2: Update the PDF column header**

Find (~line 161):

```tsx
{visibleColumns.pdf && (
  <TableHead className="font-mono text-xs w-16 text-center">PDF</TableHead>
)}
```

Replace with:

```tsx
{visibleColumns.pdf && (
  <TableHead className="font-mono text-xs w-24 text-center">pdf</TableHead>
)}
```

- [ ] **Step 3: Update the PDF cell to show both links**

Find the PDF cell block (~line 334–350):

```tsx
{visibleColumns.pdf && (
  <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
    {pub.pdf_url ? (
      <a
        href={pub.pdf_url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-muted-foreground hover:text-hot-pink transition-colors"
        title="View PDF"
      >
        <FileText className="w-4 h-4 mx-auto" />
      </a>
    ) : (
      <span className="text-muted-foreground text-xs">—</span>
    )}
  </TableCell>
)}
```

Replace with:

```tsx
{visibleColumns.pdf && (
  <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
    <div className="flex items-center justify-center gap-1.5">
      {pub.pdf_url ? (
        <a
          href={pub.pdf_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-hot-pink transition-colors"
          title="publisher_pdf"
        >
          <FileText className="w-4 h-4" />
        </a>
      ) : null}
      {driveLoading ? (
        <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
      ) : driveUrlsMap[pub.id] ? (
        <a
          href={driveUrlsMap[pub.id]!}
          target="_blank"
          rel="noopener noreferrer"
          title="open_in_drive"
          className="transition-colors hover:opacity-80"
        >
          <GoogleDriveIcon className="w-4 h-4" />
        </a>
      ) : null}
      {!pub.pdf_url && !driveLoading && !driveUrlsMap[pub.id] && (
        <span className="text-muted-foreground text-xs">—</span>
      )}
    </div>
  </TableCell>
)}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /home/velitchko/Documents/Projects/refhub/refhub.io && bun run tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 5: Commit**

```bash
git add src/components/publications/PublicationTable.tsx
git commit -m "feat(table): add Drive badge column and rename pdf header"
```

---

## Task 6: PublicationViewDialog — Drive button + rename pdf button

**Files:**
- Modify: `src/components/publications/PublicationViewDialog.tsx`

- [ ] **Step 1: Add imports and new props**

Add at the top:

```tsx
import { Loader2 } from 'lucide-react';
import { GoogleDriveIcon } from '@/components/ui/GoogleDriveIcon';
```

In `PublicationViewDialogProps` interface (around line 17), add:

```ts
driveUrl?: string | null;
driveLoading?: boolean;
```

In the destructured parameters of `PublicationViewDialog`, add:

```ts
driveUrl,
driveLoading = false,
```

- [ ] **Step 2: Update the links area — rename pdf button and add Drive button**

Find the links section (~line 89–120):

```tsx
{(publication.doi || publication.url || publication.pdf_url) && (
  <div className="flex flex-wrap gap-2">
    ...
    {publication.pdf_url && (
      <Button asChild variant="outline" size="sm" className="font-mono">
        <a href={publication.pdf_url} target="_blank" rel="noopener noreferrer">
          <FileText className="w-4 h-4 mr-2" />
          pdf
        </a>
      </Button>
    )}
  </div>
)}
```

Replace the entire links section with:

```tsx
{(publication.doi || publication.url || publication.pdf_url || driveLoading || driveUrl) && (
  <div className="flex flex-wrap gap-2">
    {publication.doi && (
      <Button asChild variant="outline" size="sm" className="font-mono">
        <a
          href={`https://doi.org/${encodeURIComponent(publication.doi)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink className="w-4 h-4 mr-2" />
          doi
        </a>
      </Button>
    )}
    {publication.url && (
      <Button asChild variant="outline" size="sm" className="font-mono">
        <a href={publication.url} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="w-4 h-4 mr-2" />
          link
        </a>
      </Button>
    )}
    {publication.pdf_url && (
      <Button asChild variant="outline" size="sm" className="font-mono">
        <a href={publication.pdf_url} target="_blank" rel="noopener noreferrer">
          <FileText className="w-4 h-4 mr-2" />
          publisher_pdf
        </a>
      </Button>
    )}
    {driveLoading && (
      <Button variant="outline" size="sm" className="font-mono" disabled>
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        drive_pdf
      </Button>
    )}
    {!driveLoading && driveUrl && (
      <Button asChild variant="outline" size="sm" className="font-mono">
        <a href={driveUrl} target="_blank" rel="noopener noreferrer">
          <GoogleDriveIcon className="w-4 h-4 mr-2" />
          drive_pdf
        </a>
      </Button>
    )}
  </div>
)}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /home/velitchko/Documents/Projects/refhub/refhub.io && bun run tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 4: Commit**

```bash
git add src/components/publications/PublicationViewDialog.tsx
git commit -m "feat(view-dialog): add drive_pdf button and rename pdf to publisher_pdf"
```

---

## Task 7: PublicationDialog — rename label + add drive_pdf field + extend onSave

**Files:**
- Modify: `src/components/publications/PublicationDialog.tsx`

- [ ] **Step 1: Update the props interface and function signature**

In `PublicationDialogProps` (~line 35), find:

```ts
onSave: (data: Partial<Publication>, tagIds: string[], vaultIds?: string[], isAutoSave?: boolean) => Promise<void>;
```

Replace with:

```ts
onSave: (data: Partial<Publication>, tagIds: string[], vaultIds?: string[], isAutoSave?: boolean, driveUrl?: string | null) => Promise<void>;
driveUrl?: string | null;
```

In the destructured parameters of `PublicationDialog`, add `driveUrl` alongside the other props.

- [ ] **Step 2: Add local drivePdfInput state**

After the existing `useState` declarations (around line 109), add:

```ts
const [drivePdfInput, setDrivePdfInput] = useState<string>(driveUrl ?? '');
```

Also add a `useEffect` to sync when `driveUrl` prop changes (e.g. when a different publication is opened):

```ts
useEffect(() => {
  setDrivePdfInput(driveUrl ?? '');
}, [driveUrl]);
```

- [ ] **Step 3: Rename the pdf_url field label (line ~979)**

Find:

```tsx
<Label htmlFor="pdf_url" className="font-semibold font-mono text-sm block">pdf_url</Label>
```

Replace with:

```tsx
<Label htmlFor="pdf_url" className="font-semibold font-mono text-sm block">publisher_pdf</Label>
```

- [ ] **Step 4: Add drive_pdf field immediately after the pdf_url field block (~line 990)**

After the closing `</div>` of the `{/* PDF URL */}` block, add:

```tsx
{/* Drive PDF */}
<div className="space-y-1 sm:space-y-2 w-full box-border overflow-hidden">
  <Label htmlFor="drive_pdf" className="font-semibold font-mono text-sm block">drive_pdf</Label>
  <Input
    id="drive_pdf"
    value={drivePdfInput}
    onChange={(e) => setDrivePdfInput(e.target.value)}
    placeholder="https://drive.google.com/file/d/..."
    className="font-mono text-xs sm:text-sm w-full break-all h-9 sm:h-10 box-border"
  />
</div>
```

- [ ] **Step 5: Pass driveUrl to all four onSave call sites**

There are 4 places where `onSave` is called in this file. Find each and add `drivePdfInput` (or `drivePdfInputRef.current` for ref-based calls) as the 5th argument.

**Call site 1** (Ctrl+S auto-save shortcut, ~line 174):
```ts
await onSave(
  { ...formDataRef.current, authors, editor, keywords: kw },
  selectedTagsRef.current,
  publication ? undefined : selectedVaultIds,
  true, // isAutoSave
  // Drive URL intentionally omitted from auto-save — only save on explicit save
);
```
Leave this one unchanged (auto-save should not trigger Drive URL write).

**Call site 2** (second auto-save variant, ~line 239) — same, leave unchanged.

**Call site 3** (main manual save, ~line 549):
```ts
await onSave(
  { ...formData, authors, editor, keywords },
  selectedTags,
  publication ? undefined : selectedVaultIds,
  undefined,
  drivePdfInput || null,
);
```

**Call site 4** (save before close, ~line 624):
```ts
await onSave(
  { ...formData, authors, editor, keywords },
  selectedTags,
  publication ? undefined : selectedVaultIds,
  undefined,
  drivePdfInput || null,
);
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd /home/velitchko/Documents/Projects/refhub/refhub.io && bun run tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 7: Commit**

```bash
git add src/components/publications/PublicationDialog.tsx
git commit -m "feat(dialog): add drive_pdf field and rename publisher_pdf label"
```

---

## Task 8: AddImportDialog — drive_pdf in manual tab

**Files:**
- Modify: `src/components/publications/AddImportDialog.tsx`

- [ ] **Step 1: Add updatePdfAsset to the props interface and destructuring**

In `AddImportDialogProps` (~line 36), add:

```ts
updatePdfAsset?: (vaultPublicationId: string, url: string | null) => Promise<void>;
```

In the destructured parameters:

```ts
updatePdfAsset,
```

- [ ] **Step 2: Add manualDrivePdf state**

After the existing manual entry state declarations (~line 107), add:

```ts
const [manualDrivePdf, setManualDrivePdf] = useState('');
```

- [ ] **Step 3: Capture return value of onManualCreate and call updatePdfAsset**

Find `handleManualCreate` (~line 267). The current block:

```ts
if (onManualCreate) {
  await onManualCreate(pub, targetVaultId);
} else if (onImport) {
  await onImport([pub], targetVaultId);
}
toast({ title: 'paper_created ✨', description: manualForm.title });
setManualForm({ ... });
setManualAuthorsInput('');
setManualEditorInput('');
setManualKeywordsInput('');
```

Replace with:

```ts
let newId: string | null = null;
if (onManualCreate) {
  newId = await onManualCreate(pub, targetVaultId);
} else if (onImport) {
  const ids = await onImport([pub], targetVaultId);
  newId = ids?.[0] ?? null;
}

if (newId && manualDrivePdf.trim() && updatePdfAsset) {
  await updatePdfAsset(newId, manualDrivePdf.trim());
}

toast({ title: 'paper_created ✨', description: manualForm.title });
setManualForm({ title: '', authors: [], year: null, journal: '', doi: '', url: '', pdf_url: '', abstract: '', publication_type: 'article', notes: '', volume: '', issue: '', pages: '', booktitle: '', chapter: '', edition: '', editor: [], howpublished: '', institution: '', number: '', organization: '', publisher: '', school: '', series: '', type: '', eid: '', isbn: '', issn: '', keywords: [] });
setManualAuthorsInput('');
setManualEditorInput('');
setManualKeywordsInput('');
setManualDrivePdf('');
```

- [ ] **Step 4: Add drive_pdf field to the manual form UI**

Find the `{/* PDF URL */}` block in the manual tab (~line 467):

```tsx
{/* PDF URL */}
<div className="space-y-2">
  <Label className="font-semibold font-mono">pdf_url</Label>
  <Input value={manualForm.pdf_url || ''} onChange={(e) => setManualForm(f => ({ ...f, pdf_url: e.target.value }))}
    placeholder="link_to_pdf" className="font-mono text-sm" />
</div>
```

Replace with:

```tsx
{/* Publisher PDF */}
<div className="space-y-2">
  <Label className="font-semibold font-mono">publisher_pdf</Label>
  <Input
    value={manualForm.pdf_url || ''}
    onChange={(e) => setManualForm(f => ({ ...f, pdf_url: e.target.value }))}
    placeholder="link_to_pdf"
    className="font-mono text-sm"
  />
</div>
{/* Drive PDF */}
<div className="space-y-2">
  <Label className="font-semibold font-mono">drive_pdf</Label>
  <Input
    value={manualDrivePdf}
    onChange={(e) => setManualDrivePdf(e.target.value)}
    placeholder="https://drive.google.com/file/d/..."
    className="font-mono text-sm"
  />
</div>
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd /home/velitchko/Documents/Projects/refhub/refhub.io && bun run tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 6: Commit**

```bash
git add src/components/publications/AddImportDialog.tsx
git commit -m "feat(import-dialog): add drive_pdf field to manual entry tab"
```

---

## Task 9: VaultDetail — wire everything together

**Files:**
- Modify: `src/pages/VaultDetail.tsx`

- [ ] **Step 1: Destructure new context values**

Find the `useVaultContent()` destructuring (~line 66):

```ts
const {
  currentVault,
  publications,
  tags,
  publicationTags,
  publicationRelations,
  vaultShares,
  loading: contentLoading,
  error: contentError,
  setCurrentVaultId,
  setPublications,
  setTags,
  setPublicationTags,
  setPublicationRelations,
  setVaultShares,
  refreshVaultContent,
  isRealtimeConnected,
  lastActivity,
  updateLastActivity,
} = useVaultContent();
```

Add `pdfAssetsMap`, `pdfAssetsLoading`, `updatePdfAsset` to the destructure:

```ts
const {
  currentVault,
  publications,
  tags,
  publicationTags,
  publicationRelations,
  vaultShares,
  loading: contentLoading,
  error: contentError,
  setCurrentVaultId,
  setPublications,
  setTags,
  setPublicationTags,
  setPublicationRelations,
  setVaultShares,
  refreshVaultContent,
  isRealtimeConnected,
  lastActivity,
  updateLastActivity,
  pdfAssetsMap,
  pdfAssetsLoading,
  updatePdfAsset,
} = useVaultContent();
```

- [ ] **Step 2: Update handleSavePublication signature to accept driveUrl**

Find the function signature (~line 556):

```ts
const handleSavePublication = async (data: Partial<Publication>, tagIds: string[], vaultIds?: string[], isAutoSave = false) => {
```

Replace with:

```ts
const handleSavePublication = async (data: Partial<Publication>, tagIds: string[], vaultIds?: string[], isAutoSave = false, driveUrl?: string | null) => {
```

- [ ] **Step 3: Save Drive URL for edits in handleSavePublication**

Inside the `if (editingPublication)` branch, after the tags update and before the `if (!isAutoSave)` block (~line 596), add:

```ts
// Save Drive URL if changed (skip on auto-save to avoid excessive writes)
if (!isAutoSave && driveUrl !== undefined) {
  const currentDriveUrl = pdfAssetsMap[editingPublication.id] ?? null;
  const newDriveUrl = driveUrl || null;
  if (newDriveUrl !== currentDriveUrl) {
    try {
      await updatePdfAsset(editingPublication.id, newDriveUrl);
    } catch (err) {
      logger.error('VaultDetail', 'Error saving drive url:', err);
      // Non-fatal — publication was already saved
    }
  }
}
```

- [ ] **Step 4: Save Drive URL for creates in handleSavePublication**

Inside the `else` (create) branch, after `result.publication.id` is used to add to other vaults (~line 629–638), add:

```ts
// Save Drive URL for new publication if provided
if (driveUrl && result.publication) {
  try {
    await updatePdfAsset(result.publication.id, driveUrl);
  } catch (err) {
    logger.error('VaultDetail', 'Error saving drive url for new publication:', err);
    // Non-fatal
  }
}
```

- [ ] **Step 5: Add handleManualCreate for AddImportDialog**

Add this function near `handleSavePublication` (after it, around line 656):

```ts
const handleManualCreate = async (pub: Partial<Publication>, targetVaultId?: string | null): Promise<string | null> => {
  if (!user || !canEdit) return null;
  try {
    const dataToSave = {
      ...pub,
      bibtex_key: pub.bibtex_key || generateBibtexKey(pub as Publication),
    };
    const result = await sharedVaultOps.createVaultPublication(dataToSave, []);
    if (result.success && result.publication) {
      updateLastActivity('publication_added', user.id);
      return result.publication.id;
    }
    return null;
  } catch (err) {
    logger.error('VaultDetail', 'Error creating publication manually:', err);
    return null;
  }
};
```

- [ ] **Step 6: Wire driveUrl + driveLoading into PublicationCard/PublicationList**

Find where `PublicationList` is rendered (~line 1652). `PublicationList` wraps both `PublicationCard` and `PublicationTable`. Check `PublicationList`'s props — if it doesn't forward `driveUrlsMap`/`driveLoading`, you'll need to add those props too.

Find `src/components/publications/PublicationList.tsx` and check its interface. Add the following props if not already present:

```ts
driveUrlsMap?: Record<string, string | null>;
driveLoading?: boolean;
```

Then pass them through to `PublicationCard` and `PublicationTable` inside `PublicationList`.

Back in `VaultDetail`, pass to `PublicationList`:

```tsx
driveUrlsMap={pdfAssetsMap}
driveLoading={pdfAssetsLoading}
```

- [ ] **Step 7: Wire driveUrl + driveLoading into PublicationViewDialog**

Find the `<PublicationViewDialog` block (~line 1701) and add:

```tsx
driveUrl={viewingPublication ? (pdfAssetsMap[viewingPublication.id] ?? null) : null}
driveLoading={pdfAssetsLoading}
```

- [ ] **Step 8: Wire driveUrl and updatePdfAsset into PublicationDialog**

Find the `<PublicationDialog` block (~line 1678) and add:

```tsx
driveUrl={editingPublication ? (pdfAssetsMap[editingPublication.id] ?? null) : null}
```

`onSave` already points to `handleSavePublication` which now handles `driveUrl` — no extra prop needed.

- [ ] **Step 9: Wire updatePdfAsset and onManualCreate into AddImportDialog**

Find the `<AddImportDialog` block (~line 1721) and add:

```tsx
onManualCreate={canEdit ? handleManualCreate : undefined}
updatePdfAsset={canEdit ? updatePdfAsset : undefined}
```

- [ ] **Step 10: Verify TypeScript compiles cleanly**

```bash
cd /home/velitchko/Documents/Projects/refhub/refhub.io && bun run tsc --noEmit 2>&1
```

Expected: zero errors. Fix any type mismatches before proceeding.

- [ ] **Step 11: Start the dev server and manually verify**

```bash
cd /home/velitchko/Documents/Projects/refhub/refhub.io && bun run dev
```

Verify in the browser:
1. Open a vault where you are the owner and have Drive-linked PDFs — Drive icons appear on cards/table rows
2. Open a publication in the view dialog — `publisher_pdf` and `drive_pdf` buttons shown
3. Open a publication in the edit dialog — `publisher_pdf` and `drive_pdf` fields present, current Drive URL pre-filled
4. Edit the Drive URL and save — icon updates on card without page refresh
5. Open AddImportDialog → manual tab — `publisher_pdf` and `drive_pdf` fields present
6. Open a vault where you are NOT the owner — no Drive icons (RLS silently returns 0 rows)

- [ ] **Step 12: Commit**

```bash
git add src/pages/VaultDetail.tsx src/components/publications/PublicationList.tsx
git commit -m "feat(vault-detail): wire Drive PDF links across all publication components"
```

---

## Self-Review

**Spec coverage:**
- ✅ `pdfAssetsMap` + `pdfAssetsLoading` + `updatePdfAsset` in context (Tasks 2–3)
- ✅ Async fetch after publications load, non-blocking (Task 2)
- ✅ Spinner while loading, Drive icon when loaded (Tasks 4–6)
- ✅ `publisher_pdf` rename in card, table, view dialog, edit dialog, add dialog (Tasks 4–8)
- ✅ `drive_pdf` editable field in `PublicationDialog` (Task 7)
- ✅ `drive_pdf` field in `AddImportDialog` manual tab with post-create upsert (Task 8)
- ✅ `updatePdfAsset` upsert with optimistic update + rollback (Task 3)
- ✅ Owner-only via RLS — no frontend guard needed (Task 2 fetch silently returns 0 rows for non-owners)
- ✅ DOI/BibTeX import out of scope — edit dialog handles it after import
- ✅ No schema migration needed

**Placeholder scan:** None found — all steps contain actual code.

**Type consistency:**
- `pdfAssetsMap: Record<string, string | null>` — used consistently as `pdfAssetsMap[publication.id]` (vault_publication_id)
- `driveUrl?: string | null` — prop name consistent across Card, ViewDialog, Dialog
- `driveUrlsMap?: Record<string, string | null>` — prop name for Table and PublicationList (map not single value)
- `updatePdfAsset(vaultPublicationId: string, url: string | null)` — signature consistent across all callers
- `onSave` 5th param `driveUrl?: string | null` — added only at explicit save call sites (not auto-save)
