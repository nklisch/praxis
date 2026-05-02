import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { _resetCliCommand, _setCliCommand, authLogin, authStatus } from "../auth.js";
import { CLINotFoundError } from "../errors.js";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// We test by pointing _cliCommand at tiny Node scripts that mimic the CLI.
// This avoids any dependency on a real `claude` binary.

async function makeFakeCli(script: string): Promise<{ binDir: string; cleanup: () => Promise<void> }> {
  const binDir = await mkdtemp(join(tmpdir(), "praxis-auth-test-"));
  const scriptPath = join(binDir, "claude");
  // Write a node shebang script
  const content = `#!/usr/bin/env node\n${script}`;
  await writeFile(scriptPath, content, { mode: 0o755 });
  return {
    binDir,
    cleanup: () => rm(binDir, { recursive: true, force: true }),
  };
}

describe("authStatus()", () => {
  let cleanup: (() => Promise<void>) | null = null;

  afterEach(async () => {
    _resetCliCommand();
    if (cleanup) {
      await cleanup();
      cleanup = null;
    }
  });

  it("returns { loggedIn: true, ... } when CLI exits 0 with valid JSON", async () => {
    const payload = JSON.stringify({
      loggedIn: true,
      email: "test@example.com",
      authMethod: "claude.ai",
    });
    const { binDir, cleanup: c } = await makeFakeCli(`
      const args = process.argv.slice(2);
      if (args[0] === 'auth' && args[1] === 'status' && args[2] === '--json') {
        process.stdout.write(${JSON.stringify(payload)});
        process.exit(0);
      }
      process.exit(1);
    `);
    cleanup = c;
    _setCliCommand(join(binDir, "claude"));

    const result = await authStatus();
    expect(result.loggedIn).toBe(true);
    expect(result.email).toBe("test@example.com");
    expect(result.authMethod).toBe("claude.ai");
  });

  it("returns { loggedIn: false, error } on non-zero exit — does not throw", async () => {
    const { binDir, cleanup: c } = await makeFakeCli(`
      const args = process.argv.slice(2);
      if (args[0] === 'auth' && args[1] === 'status') {
        process.stderr.write('Not authenticated');
        process.exit(1);
      }
      process.exit(1);
    `);
    cleanup = c;
    _setCliCommand(join(binDir, "claude"));

    const result = await authStatus();
    expect(result.loggedIn).toBe(false);
    expect(result.error).toBe("Not authenticated");
  });

  it("throws CLINotFoundError when the binary is missing", async () => {
    _setCliCommand("/nonexistent/path/claude");

    await expect(authStatus()).rejects.toThrow(CLINotFoundError);
  });

  it("returns { loggedIn: false } on malformed JSON output", async () => {
    const { binDir, cleanup: c } = await makeFakeCli(`
      process.stdout.write('not-valid-json');
      process.exit(0);
    `);
    cleanup = c;
    _setCliCommand(join(binDir, "claude"));

    const result = await authStatus();
    expect(result.loggedIn).toBe(false);
    expect(result.error).toMatch(/Failed to parse/);
  });
});

describe("authLogin()", () => {
  let cleanup: (() => Promise<void>) | null = null;

  afterEach(async () => {
    _resetCliCommand();
    if (cleanup) {
      await cleanup();
      cleanup = null;
    }
  });

  it("yields 'started' as the first event", async () => {
    // CLI that immediately exits 0
    const statusPayload = JSON.stringify({ loggedIn: true });
    const { binDir, cleanup: c } = await makeFakeCli(`
      const args = process.argv.slice(2);
      if (args[0] === 'auth' && args[1] === 'login') {
        process.stdout.write('Logging in...\\n');
        process.exit(0);
      }
      if (args[0] === 'auth' && args[1] === 'status') {
        process.stdout.write(${JSON.stringify(statusPayload)});
        process.exit(0);
      }
      process.exit(1);
    `);
    cleanup = c;
    _setCliCommand(join(binDir, "claude"));

    const events = [];
    for await (const event of authLogin()) {
      events.push(event);
    }
    expect(events[0]).toEqual({ kind: "started" });
  });

  it("yields a 'url' event the first time an https URL appears in stdout", async () => {
    const statusPayload = JSON.stringify({ loggedIn: true });
    const { binDir, cleanup: c } = await makeFakeCli(`
      const args = process.argv.slice(2);
      if (args[0] === 'auth' && args[1] === 'login') {
        process.stdout.write('Visit https://claude.ai/login?token=abc123 to sign in\\n');
        process.exit(0);
      }
      if (args[0] === 'auth' && args[1] === 'status') {
        process.stdout.write(${JSON.stringify(statusPayload)});
        process.exit(0);
      }
      process.exit(1);
    `);
    cleanup = c;
    _setCliCommand(join(binDir, "claude"));

    const events = [];
    for await (const event of authLogin()) {
      events.push(event);
    }

    const urlEvent = events.find((e) => e.kind === "url");
    expect(urlEvent).toBeDefined();
    if (urlEvent?.kind === "url") {
      expect(urlEvent.url).toBe("https://claude.ai/login?token=abc123");
    }
  });

  it("URL stripping removes trailing punctuation (., ))", async () => {
    const statusPayload = JSON.stringify({ loggedIn: true });
    const { binDir, cleanup: c } = await makeFakeCli(`
      const args = process.argv.slice(2);
      if (args[0] === 'auth' && args[1] === 'login') {
        process.stdout.write('Open (https://claude.ai/login).\\n');
        process.exit(0);
      }
      if (args[0] === 'auth' && args[1] === 'status') {
        process.stdout.write(${JSON.stringify(statusPayload)});
        process.exit(0);
      }
      process.exit(1);
    `);
    cleanup = c;
    _setCliCommand(join(binDir, "claude"));

    const events = [];
    for await (const event of authLogin()) {
      events.push(event);
    }

    const urlEvent = events.find((e) => e.kind === "url");
    if (urlEvent?.kind === "url") {
      expect(urlEvent.url).not.toMatch(/[.,)]+$/);
    }
  });

  it("yields 'succeeded' with status on exit code 0", async () => {
    const statusPayload = JSON.stringify({ loggedIn: true, email: "user@example.com" });
    const { binDir, cleanup: c } = await makeFakeCli(`
      const args = process.argv.slice(2);
      if (args[0] === 'auth' && args[1] === 'login') {
        process.exit(0);
      }
      if (args[0] === 'auth' && args[1] === 'status') {
        process.stdout.write(${JSON.stringify(statusPayload)});
        process.exit(0);
      }
      process.exit(1);
    `);
    cleanup = c;
    _setCliCommand(join(binDir, "claude"));

    const events = [];
    for await (const event of authLogin()) {
      events.push(event);
    }

    const succeeded = events.find((e) => e.kind === "succeeded");
    expect(succeeded).toBeDefined();
    if (succeeded?.kind === "succeeded") {
      expect(succeeded.status.loggedIn).toBe(true);
      expect(succeeded.status.email).toBe("user@example.com");
    }
  });

  it("yields 'failed' with stderr message on non-zero exit", async () => {
    const { binDir, cleanup: c } = await makeFakeCli(`
      const args = process.argv.slice(2);
      if (args[0] === 'auth' && args[1] === 'login') {
        process.stderr.write('Authentication failed: invalid token\\n');
        process.exit(1);
      }
      process.exit(1);
    `);
    cleanup = c;
    _setCliCommand(join(binDir, "claude"));

    const events = [];
    for await (const event of authLogin()) {
      events.push(event);
    }

    const failed = events.find((e) => e.kind === "failed");
    expect(failed).toBeDefined();
    if (failed?.kind === "failed") {
      expect(failed.message).toContain("Authentication failed: invalid token");
    }
  });

  it("SIGTERMs the child and stops yielding when AbortSignal fires", async () => {
    // CLI that hangs until killed
    const { binDir, cleanup: c } = await makeFakeCli(`
      const args = process.argv.slice(2);
      if (args[0] === 'auth' && args[1] === 'login') {
        process.stdout.write('Waiting for browser...\\n');
        // Hang indefinitely
        setTimeout(() => {}, 999999);
      } else {
        process.exit(1);
      }
    `);
    cleanup = c;
    _setCliCommand(join(binDir, "claude"));

    const controller = new AbortController();
    const events: Array<{ kind: string }> = [];

    // Abort after collecting the first event (started)
    const gen = authLogin({ signal: controller.signal });
    for await (const event of gen) {
      events.push(event);
      if (event.kind === "started") {
        // Let stdout events arrive, then abort
        controller.abort();
      }
      // After abort, loop should exit cleanly
      if (events.length > 5) break; // safety valve
    }

    // Must have gotten at least "started"
    expect(events.some((e) => e.kind === "started")).toBe(true);
    // Must NOT have gotten "succeeded" (process was killed)
    expect(events.some((e) => e.kind === "succeeded")).toBe(false);
  }, 10_000);

  it("URL detection works from stderr too", async () => {
    const statusPayload = JSON.stringify({ loggedIn: true });
    const { binDir, cleanup: c } = await makeFakeCli(`
      const args = process.argv.slice(2);
      if (args[0] === 'auth' && args[1] === 'login') {
        process.stderr.write('Opening https://claude.ai/auth-callback?code=xyz\\n');
        process.exit(0);
      }
      if (args[0] === 'auth' && args[1] === 'status') {
        process.stdout.write(${JSON.stringify(statusPayload)});
        process.exit(0);
      }
      process.exit(1);
    `);
    cleanup = c;
    _setCliCommand(join(binDir, "claude"));

    const events = [];
    for await (const event of authLogin()) {
      events.push(event);
    }

    const urlEvent = events.find((e) => e.kind === "url");
    expect(urlEvent).toBeDefined();
    if (urlEvent?.kind === "url") {
      expect(urlEvent.url).toContain("https://claude.ai/auth-callback");
    }
  });
});
