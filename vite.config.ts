import { execSync } from 'node:child_process'
import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv } from 'vite'

/** The commit this build comes from, shown in the footer (empty outside a git checkout). */
function commit(): string {
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return process.env.GITHUB_SHA ?? ''
  }
}

export default defineConfig(({ mode }) => {
  // Env files next to this config, not in process.cwd(): `vite <dir>` can be started from another folder.
  const env = loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), '')
  // The page's name, in the tab and over the services (VITE_STATUS_TITLE in .env.example).
  const title = env.VITE_STATUS_TITLE || 'vexoul.net status'
  return {
    define: { __COMMIT__: JSON.stringify(commit()), __TITLE__: JSON.stringify(title) },
    plugins: [vue(), { name: 'status-title', transformIndexHtml: (html) => html.replace('%STATUS_TITLE%', title) }],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port: 5177,
      // In production the site and Gatus share an origin (`/api`). In dev, forward /api to the public status page
      // so the same relative URLs work. Override with VITE_DEV_GATUS_TARGET.
      proxy: { '/api': { target: env.VITE_DEV_GATUS_TARGET || 'https://status.vexoul.net', changeOrigin: true } },
    },
    test: { include: ['tests/**/*.test.ts'] },
  }
})
