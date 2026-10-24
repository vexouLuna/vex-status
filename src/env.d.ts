/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** vex-auth's URL (the shared sign-in); empty turns it off. See .env.example. */
  readonly VITE_AUTH_BASE?: string
  /** `off`: a plain title in the header instead of the vexoul.net site switcher. See .env.example. */
  readonly VITE_STATUS_SWITCHER?: string
  /** Gatus groups in page order, comma-separated. See .env.example. */
  readonly VITE_STATUS_GROUPS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** The commit this build comes from (vite.config.ts). */
declare const __COMMIT__: string
/** The page's name (vite.config.ts, from VITE_STATUS_TITLE). */
declare const __TITLE__: string
