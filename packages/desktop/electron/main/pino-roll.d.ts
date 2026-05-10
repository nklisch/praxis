// pino-roll@3.x ships without TypeScript declarations. We use it as an
// in-process file destination (calling its default-exported `build()` and
// passing the returned SonicBoom stream to `pino.multistream`), so the
// minimum shape we need is: a function returning something pino's
// DestinationStream + an event-emitter contract.

declare module "pino-roll" {
  interface SonicBoomLike {
    write(msg: string): void;
    flushSync?: () => void;
    end?: () => void;
    once?: (event: string, cb: () => void) => unknown;
    on?: (event: string, cb: (...args: unknown[]) => void) => unknown;
  }

  interface PinoRollOptions {
    file: string;
    size?: string | number;
    frequency?: string | number;
    extension?: string;
    symlink?: boolean;
    limit?: { count?: number; removeOtherLogFiles?: boolean };
    mkdir?: boolean;
    dateFormat?: string;
  }

  /** Returns a SonicBoom stream wired with rotation. */
  function build(opts: PinoRollOptions): Promise<SonicBoomLike>;

  export default build;
}
