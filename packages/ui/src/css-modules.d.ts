/**
 * CSS Module type declarations for Vite/TSC compatibility.
 * Declares all *.module.css files as modules exporting a string-indexed record.
 */
declare module "*.module.css" {
  const styles: Record<string, string>;
  export default styles;
}
