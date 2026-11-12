import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { resolve } from "node:path";
import { createFixture } from "../server/delivery-fixture.ts";
import { openDeliveryRuntime } from "../server/delivery-runtime.ts";

test("local demo session is opt-in, scoped to its root, and retains CSRF and Origin checks", async () => {
  const root = resolve("tests/runtime/passwordless-" + Date.now());
  const fixture = await createFixture(root, true, true);
  let runtime = openDeliveryRuntime(root);
  let server = runtime.app.listen(0, "127.0.0.1");
  await once(server, "listening");
  let url = "http://127.0.0.1:" + (server.address() as any).port;
  const stop = async () => {
    await new Promise<void>((r) => server.close(() => r()));
    runtime.close();
  };
  const post = (
    path: string,
    body: unknown,
    headers: Record<string, string> = {},
  ) =>
    fetch(url + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  try {
    assert.equal((await post("/api/auth/local-session", {})).status, 404);
    assert.equal((await fetch(url + "/api/admin/intakes")).status, 401);
    await stop();
    runtime = openDeliveryRuntime(root, { passwordlessDemo: true });
    server = runtime.app.listen(0, "127.0.0.1");
    await once(server, "listening");
    url = "http://127.0.0.1:" + (server.address() as any).port;
    assert.equal(
      (await (await fetch(url + "/api/auth/me")).json()).localDemo,
      true,
    );
    assert.equal((await post("/api/auth/local-session", {})).status, 403);
    assert.equal(
      (
        await post(
          "/api/auth/local-session",
          {},
          { Origin: "https://example.invalid" },
        )
      ).status,
      403,
    );
    const res = await post("/api/auth/local-session", {}, { Origin: url });
    assert.equal(res.status, 200);
    const cookie = res.headers.get("set-cookie")!.split(";")[0];
    assert.ok(res.headers.get("set-cookie")!.includes("HttpOnly"));
    const session = await res.json();
    assert.equal(session.user.mustChange, false);
    assert.equal(
      (await fetch(url + "/api/admin/intakes", { headers: { Cookie: cookie } }))
        .status,
      200,
    );
    assert.equal(
      (
        await post(
          "/api/admin/intakes",
          { createKey: "a".repeat(43) },
          { Cookie: cookie },
        )
      ).status,
      403,
    );
    const stage = await fetch(
      url + "/api/admin/intakes/" + fixture.intakeId + "/stage",
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie,
          "X-CSRF-Token": session.csrf,
        },
        body: JSON.stringify({ stage: "待访谈" }),
      },
    );
    assert.equal(stage.status, 200);
    const repeat = await post(
      "/api/auth/local-session",
      {},
      { Cookie: cookie, Origin: url },
    );
    assert.equal((await repeat.json()).csrf, session.csrf);
    await stop();
    runtime = openDeliveryRuntime(root);
    server = runtime.app.listen(0, "127.0.0.1");
    await once(server, "listening");
    url = "http://127.0.0.1:" + (server.address() as any).port;
    assert.equal((await post("/api/auth/local-session", {})).status, 404);
    // The demo option did not alter the underlying account's first-change requirement.
    assert.equal(
      (await fetch(url + "/api/admin/intakes", { headers: { Cookie: cookie } }))
        .status,
      403,
    );
  } finally {
    await stop();
  }
});
