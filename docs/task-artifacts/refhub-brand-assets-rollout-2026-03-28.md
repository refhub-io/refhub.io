# RefHub Brand Assets Rollout

- Branch: `feat/refhub-brand-assets-rollout-2026-03-28`
- Base: `origin/main` @ `59690e8`
- Commit: `e0194b4`
- PR: `https://github.com/refhub-io/refhub.io/pull/68`
- Status: done

## Files

- `index.html`
- `public/site.webmanifest`
- `src/components/branding/BrandMark.tsx`
- `src/components/layout/LegalDocumentLayout.tsx`
- `src/components/layout/Sidebar.tsx`
- `src/components/layout/VaultLayout.tsx`
- `src/pages/Auth.tsx`
- `src/pages/AuthCallback.tsx`
- `src/pages/OpenGraphPreview.tsx`
- `src/pages/PublicVaultSimple.tsx`

## Verification

- `git diff --check`
- `./node_modules/.bin/eslint src/components/branding/BrandMark.tsx src/components/layout/VaultLayout.tsx src/components/layout/LegalDocumentLayout.tsx src/pages/Auth.tsx src/pages/AuthCallback.tsx src/pages/PublicVaultSimple.tsx src/pages/OpenGraphPreview.tsx`
- `./node_modules/.bin/eslint src/components/layout/Sidebar.tsx`
  - Fails on pre-existing `@typescript-eslint/no-explicit-any` violations at lines 309 and 311.

## Notes

- Swapped app branding surfaces from the old sparkles mark to the new square logo asset.
- Added favicon, PNG icon, apple-touch icon, and manifest links in `index.html`.
- Fixed `site.webmanifest` icon paths so they resolve correctly from the web root.
