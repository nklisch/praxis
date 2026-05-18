/** Generic shell utility surface for the renderer. */
export interface ShellClient {
  openExternal(url: string): Promise<void>;
}
