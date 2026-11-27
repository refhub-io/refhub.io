import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { readFileSync } from "node:fs";
import { componentTagger } from "lovable-tagger";
import { configDefaults } from "vitest/config";

const { version } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf-8"),
) as { version: string };

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    css: true,
    // jsdom component tests (VaultDialog, PublicationDialog, Inbox, KeyboardHelpOverlay)
    // take 1-2 s alone and several times that when the whole suite runs in parallel, so
    // vitest's 5 s default timed them out intermittently. One suite-wide limit replaces
    // the per-test overrides they used to carry; 15 s still catches a hung test.
    testTimeout: 15_000,
    // Agent worktrees under .claude/ hold stale copies of the test suite.
    exclude: [...configDefaults.exclude, ".claude/**"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'supabase': ['@supabase/supabase-js'],
          'ui-components': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-select',
            '@radix-ui/react-tabs',
            '@radix-ui/react-popover',
          ],
          'chart-libs': ['recharts'],
          'tanstack': ['@tanstack/react-query'],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
  base: "/",
}));
