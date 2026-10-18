/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** vex-auth's URL (the shared sign-in); empty turns it off. See .env.example. */
  readonly VITE_AUTH_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** The commit this build comes from (vite.config.ts). */
declare const __COMMIT__: string
