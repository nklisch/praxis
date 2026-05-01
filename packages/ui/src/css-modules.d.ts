/**
 * CSS Module type declarations for Vite/TSC compatibility.
 * Declares all *.module.css files as modules exporting a string-indexed record.
 */
declare module "*.module.css" {
  const styles: Record<string, string>;
  export default styles;
}

/**
 * Plain CSS side-effect imports — Vite handles bundling; this just satisfies
 * the typechecker. Used for global stylesheets and third-party CSS like
 * `@xyflow/react/dist/style.css`.
 */
declare module "*.css";
