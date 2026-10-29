import { describe, expect, it } from "vitest";
import { BLOB_BASE, dlPath, macPkgPath, megabytes } from "../src/lib/site";

describe("homepage downloads", () => {
  it("links manifest URLs through /dl/, from either host", () => {
    expect(dlPath("https://yec.askheadline.com/dl/windows/0.2.5/YoudaoCopilotSetup-0.2.5.exe"))
      .toBe("/dl/windows/0.2.5/YoudaoCopilotSetup-0.2.5.exe");
    expect(dlPath(`${BLOB_BASE}/windows/0.2.5/YoudaoCopilotSetup-0.2.5.exe`)).toBe("/dl/windows/0.2.5/YoudaoCopilotSetup-0.2.5.exe");
    expect(dlPath("https://example.com/setup.exe")).toBeNull();
    expect(dlPath("not a url")).toBeNull();
  });

  it("finds the Mac installer next to the updater's zip", () => {
    expect(macPkgPath("0.2.6")).toBe("mac/0.2.6/YoudaoCopilotIME-0.2.6.pkg");
    expect(macPkgPath("0.2.8")).toBe("mac/0.2.8/KeyLingo-Mac-0.2.8.pkg");
  });

  it("rounds sizes to MB and shows nothing when unknown", () => {
    expect(megabytes(87_697_036)).toBe("88 MB");
    expect(megabytes(null)).toBe("");
  });
});
