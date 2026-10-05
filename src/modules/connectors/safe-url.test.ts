import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { httpsUrl } from "./safe-url";

describe("httpsUrl", () => {
  test("keeps a plain https address", () => {
    assert.equal(httpsUrl("https://www.tiktok.com/@lena/video/1"), "https://www.tiktok.com/@lena/video/1");
  });

  test("refuses every other scheme", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,<script>1</script>", "http://www.tiktok.com/x", "file:///etc/passwd", "ftp://x.example/a", "//x.example/a"]) {
      assert.equal(httpsUrl(bad), null, bad);
    }
  });

  test("refuses addresses with a login part", () => {
    assert.equal(httpsUrl("https://user:secret@example.com/a"), null);
  });

  test("refuses text that is not an address, and non-strings", () => {
    assert.equal(httpsUrl("u"), null);
    assert.equal(httpsUrl(""), null);
    assert.equal(httpsUrl(42), null);
    assert.equal(httpsUrl(null), null);
    assert.equal(httpsUrl(undefined), null);
  });

  test("refuses an absurdly long address", () => {
    assert.equal(httpsUrl(`https://example.com/${"a".repeat(3000)}`), null);
  });
});
