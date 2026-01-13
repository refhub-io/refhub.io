# Environment Variables Setup

## 🔐 Security First

**IMPORTANT:** Never commit `.env` files to git! They contain sensitive credentials that should remain private.

## Local Development Setup

### 1. Create your local `.env` file

Copy the example file and fill in your actual values:

```bash
cp .env.example .env
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

### 3. Update your `.env` file

```env
VITE_SUPABASE_PROJECT_ID="pgkxlykkbaecgqyfhzow"
VITE_SUPABASE_PUBLISHABLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
VITE_SUPABASE_URL="https://pgkxlykkbaecgqyfhzow.supabase.co"
```

### 4. Restart your dev server

```bash
bun run dev
```

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

After setting up your `.env` file, verify it's working:

```bash
# Check if environment variables are loaded
bun run dev

# In browser console:
console.log(import.meta.env.VITE_SUPABASE_URL)
```

### GitHub Deployment

After adding GitHub secrets, trigger a deployment:

```bash
git push origin main
```

Check the Actions tab to see if the build succeeds.

## Troubleshooting

### Problem: "Cannot connect to Supabase"

**Solution:** 
- Verify your `.env` file exists in the project root
- Check that variable names match exactly (case-sensitive)
- Restart your dev server after changes

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

- `.env` - Your local environment variables (ignored by git)
- `.env.example` - Template file (committed to git)
- `.gitignore` - Ensures `.env` is never committed
- `.github/workflows/deploy.yml` - Deployment workflow that uses secrets

## Security Best Practices

✅ **DO:**
- Use `.env` for local development
- Use GitHub Secrets for deployment
- Use the `anon/public` key in frontend code
- Keep `.env` in `.gitignore`
- Commit `.env.example` as a template

❌ **DON'T:**
- Commit `.env` files to git
- Share your `.env` file publicly
- Use `service_role` key in frontend code
- Hardcode credentials in source code
- Push secrets to public repositories

## Additional Resources

- [Vite Environment Variables](https://vitejs.dev/guide/env-and-mode.html)
- [GitHub Encrypted Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- [Supabase API Keys](https://supabase.com/docs/guides/api/api-keys)
