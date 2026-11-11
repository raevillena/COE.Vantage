import { test, expect } from "@playwright/test";
import { API, PASSWORD } from "./support";

test("blocks locked for a chairman (room closed by another department) are not locked for the admin or dean, who may change them", async ({ request }) => {
  const rows = async (email: string) => {
    const token = ((await (await request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } })).json()) as { accessToken: string }).accessToken;
    return (await (await request.get(`${API}/faculty-loads`, { headers: { Authorization: `Bearer ${token}` } })).json()) as { id: string; locked?: boolean }[];
  };
  const chair = await rows("chairman@coe.vantage");
  const lockedForChair = new Set(chair.filter((l) => l.locked).map((l) => l.id));
  test.skip(lockedForChair.size === 0, "needs a block in a room closed by another department");
  for (const email of ["admin@coe.vantage", "dean@coe.vantage"]) {
    const seen = (await rows(email)).filter((l) => lockedForChair.has(l.id));
    expect(seen.length, email).toBeGreaterThan(0);
    expect(seen.every((l) => l.locked === false), email).toBe(true);
  }
});
