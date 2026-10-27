import { describe, expect, it } from "vitest";
import { cleanName, searchTerms, userCode } from "../src/lib/users";

describe("userCode", () => {
  it("is the first 8 hex digits of the device id, upper case, as XXXX-XXXX", () => {
    expect(userCode("0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d")).toBe("0A1B-2C3D");
    expect(userCode("FFFFFFFF-0000-4000-8000-000000000000")).toBe("FFFF-FFFF");
  });
});

describe("searchTerms", () => {
  it("reads a 用户码 with or without the dash, in any case, or its start", () => {
    expect(searchTerms("0A1B-2C3D").hexPrefix).toBe("0a1b2c3d");
    expect(searchTerms(" 0a1b2c3d ").hexPrefix).toBe("0a1b2c3d");
    expect(searchTerms("0a1b").hexPrefix).toBe("0a1b");
  });
  it("matches a full device id exactly", () => {
    expect(searchTerms("0A1B2C3D-4E5F-4A6B-8C7D-9E0F1A2B3C4D")).toEqual(
      { hexPrefix: null, deviceId: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", name: null });
  });
  it("searches names otherwise", () => {
    expect(searchTerms("张三")).toEqual({ hexPrefix: null, deviceId: null, name: "张三" });
    expect(searchTerms("")).toEqual({ hexPrefix: null, deviceId: null, name: null });
  });
});

describe("cleanName", () => {
  it("trims, allows clearing, and rejects long or control-character names", () => {
    expect(cleanName("  张三 ")).toBe("张三");
    expect(cleanName("")).toBe("");
    expect(cleanName("a".repeat(33))).toBeNull();
    expect(cleanName("a\nb")).toBeNull();
    expect(cleanName(null)).toBeNull();
  });
});
