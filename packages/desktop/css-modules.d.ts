/**
 * CSS Module + plain CSS type declarations for Vite/TSC compatibility.
 * Mirrors packages/ui/src/css-modules.d.ts — desktop's tsconfig.electron.json
 * includes only `electron/**` so it doesn't pick up the UI ambient file when
 * resolving cross-package imports of UI source.
 */
declare module "*.module.css" {
  const styles: Record<string, string>;
  export default styles;
}

declare module "*.css";
