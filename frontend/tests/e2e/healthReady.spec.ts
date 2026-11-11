import { test, expect } from "@playwright/test";
import { API } from "./support";

test("readiness reports the database and Redis, liveness stays simple", async ({ request }) => {
  expect(((await (await request.get(`${API}/health`)).json()) as { status: string }).status).toBe("ok");
  const ready = await request.get(`${API}/health/ready`);
  expect(ready.status()).toBe(200);
  const body = (await ready.json()) as { status: string; database: { ok: boolean }; cache: { ok: boolean } };
  expect(body.status).toBe("ready");
  expect(body.database.ok).toBe(true);
  expect(body.cache.ok).toBe(true);
});
