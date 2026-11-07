import { expect, it } from "vitest";
import { oauthReturnPath } from "./oauth-return-path";
it("preserves the complete consent return path", () => {
  expect(oauthReturnPath("/.lovable/oauth/consent?authorization_id=123#consent")).toBe("/.lovable/oauth/consent?authorization_id=123#consent");
});
it.each(["//evil.invalid", "/\\evil.invalid", "https://evil.invalid", "/\n/evil.invalid"])("rejects unsafe return path %s", (path) => {
  expect(oauthReturnPath(path)).toBe("/wallet");
});