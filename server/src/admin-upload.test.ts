import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

describe("admin video upload", () => {
  it("reads the Cloudflare offset after an interrupted PATCH before resuming", async () => {
    const script = readFileSync("admin/app.js", "utf8");
    const fetch = vi.fn()
      .mockRejectedValueOnce(new TypeError("connection lost after the first chunk reached Cloudflare"))
      .mockResolvedValueOnce(new Response(null, { headers: { "Upload-Offset": "52428800" } }))
      .mockResolvedValueOnce(new Response(null, { headers: { "Upload-Offset": "52428900" } }));
    const file = { size: 52_428_900, slice: vi.fn() };
    const progress = vi.fn();
    await runInNewContext(
      script + "\nsendTusChunks(file, 'https://upload.videodelivery.net/tus/test', 0, progress)",
      {
        document: { querySelectorAll: () => [], querySelector: () => null },
        window: { addEventListener: () => undefined, location: { pathname: "", hash: "" } },
        AbortSignal,
        setTimeout: (fn: () => void) => fn(),
        fetch,
        file,
        progress,
      },
    );
    expect(fetch.mock.calls.map(([, options]) => options.method)).toEqual(["PATCH", "HEAD", "PATCH"]);
    expect(fetch.mock.calls[2][1].headers["Upload-Offset"]).toBe("52428800");
    expect(file.slice).toHaveBeenLastCalledWith(52_428_800, 52_428_900);
    expect(progress).toHaveBeenLastCalledWith(100);
  });
});
