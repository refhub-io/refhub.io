# Environment Variables Setup

## 🔐 Security First

**IMPORTANT:** Never commit `.env` files to git! They contain sensitive credentials that should remain private.

## Local Development Setup

### 1. Create your local `.env.local` file

This file is used for local development only and is automatically ignored by git:

```bash
cp .env.example .env.local
```

### 2. Get your Supabase credentials

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Navigate to **Settings → API**
4. Copy the following values:

- **Project URL** → `VITE_SUPABASE_URL`
- **Project ID** (from URL) → `VITE_SUPABASE_PROJECT_ID`
- **anon/public key** → `VITE_SUPABASE_PUBLISHABLE_KEY`

⚠️ **Use the `anon` key, NOT the `service_role` key!**

### 3. Update your `.env.local` file

```env
VITE_SUPABASE_PROJECT_ID="lngnmpblgybzwfyecbwu"
VITE_SUPABASE_PUBLISHABLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
VITE_SUPABASE_URL="https://lngnmpblgybzwfyecbwu.supabase.co"
```

### 4. Start your dev server

```bash
npm run dev
```

Vite will automatically load variables from `.env.local` for local development.

## GitHub Pages Deployment

### Setting up GitHub Secrets

For GitHub Pages deployment to work, you need to add your environment variables as repository secrets:

1. Go to your GitHub repository
2. Navigate to **Settings → Secrets and variables → Actions**
3. Click **New repository secret**
4. Add the following secrets:

| Secret Name | Value |
|-------------|-------|
| `VITE_SUPABASE_PROJECT_ID` | Your Supabase project ID |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Your Supabase anon/public key |
| `VITE_SUPABASE_URL` | Your Supabase project URL |

### How it works

The GitHub Actions workflow (`.github/workflows/deploy.yml`) automatically injects these secrets during the build process:

```yaml
- name: Build
  run: bun run build
  env:
    VITE_SUPABASE_PROJECT_ID: ${{ secrets.VITE_SUPABASE_PROJECT_ID }}
    VITE_SUPABASE_PUBLISHABLE_KEY: ${{ secrets.VITE_SUPABASE_PUBLISHABLE_KEY }}
    VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
```

## Verification

### Local Development

After setting up your `.env.local` file, verify it's working:

```bash
# Start dev server
npm run dev

# In browser console:
console.log(import.meta.env.VITE_SUPABASE_URL)
```

You should see your local Supabase URL. Vite loads `.env.local` automatically for development.

### GitHub Deployment

After adding GitHub secrets, trigger a deployment:

```bash
git push origin main
```

Check the Actions tab to see if the build succeeds.

## Troubleshooting

### Problem: "Cannot connect to Supabase"

**Solution:** 
- Verify your `.env.local` file exists in the project root
- Check that variable names match exactly (case-sensitive)
- Restart your dev server after changes
- Make sure you're using `.env.local` for development (not `.env`)

### Problem: "GitHub deployment fails"

**Solution:**
- Go to Settings → Secrets and verify all three secrets exist
- Check that secret names match exactly with the workflow file
- Review the Actions log for specific errors

### Problem: "Supabase connection works locally but not on GitHub Pages"

**Solution:**
- Ensure GitHub secrets are set correctly (not just environment variables)
- Verify the workflow file has the correct secret names
- Check browser console for CORS errors (might need to add your domain to Supabase allowed origins)

## Files Overview
.local` - Your local environment variables for development (ignored by git)
- `.env.example` - Template file (committed to git)
- `.gitignore` - Ensures `.env.local` and other env files are never committed
- `.github/workflows/deploy.yml` - Deployment workflow that uses GitHub
- `.github/workflows/deploy.yml` - Deployment workflow that uses secrets

## Security Best Practices

✅ **DO:**
- Use `.env.local` for local development
- Use GitHub Secrets for production deployment
- Use the `anon/public` key in frontend code
- Keep `.env.local` in `.gitignore`
- Commit `.env.example` as a template

❌ **DON'T:**
- Commit `.env.local` or `.env` files to git
- Share your `.env.local` file publicly
- Use `service_role` key in frontend code
- Hardcode credentials in source code
- Push secrets to public repositories

## Environment Loading Priority

Vite loads environment variables in this order (later files override earlier ones):

1. `.env` - Shared defaults (can be committed if no secrets)
2. `.env.local` - Local overrides (always ignored by git) ← **Use this for development**
3. `.env.production` - Production-specific (if needed)
4. `.env.production.local` - Local production overrides

For this project:
- **Local development**: `.env.local` (contains your dev credentials)
- **GitHub Pages**: GitHub Secrets (configured in repository settings)

## Additional Resources

- [Vite Environment Variables](https://vitejs.dev/guide/env-and-mode.html)
- [GitHub Encrypted Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- [Supabase API Keys](https://supabase.com/docs/guides/api/api-keys)
