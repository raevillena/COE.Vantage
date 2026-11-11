import { test, expect } from "@playwright/test";
import { API, PASSWORD, login } from "./support";

test.describe("login security", () => {
  test("a correct sign-in clears earlier wrong tries; five wrong tries lock that email for this address", async ({ request }) => {
    // two wrong tries on a real account, then a correct sign-in clears them (never reaches the limit)
    for (let i = 0; i < 2; i++) expect((await request.post(`${API}/auth/login`, { data: { email: "faculty1@coe.vantage", password: "nope-" + i } })).status()).toBe(401);
    expect((await request.post(`${API}/auth/login`, { data: { email: "faculty1@coe.vantage", password: PASSWORD } })).status()).toBe(200);
    // an address nobody owns is locked the same way (the lock also hides whether an account exists); real accounts are untouched
    const email = `qa-lock-${Date.now()}@example.com`;
    for (let i = 0; i < 5; i++) expect((await request.post(`${API}/auth/login`, { data: { email, password: "bad-" + i } })).status()).toBe(401);
    const locked = await request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } });
    expect(locked.status()).toBe(429);
    expect(((await locked.json()) as { message: string }).message).toMatch(/Too many failed sign-in attempts/);
    expect((await request.post(`${API}/auth/login`, { data: { email: "faculty1@coe.vantage", password: PASSWORD } })).status()).toBe(200);
  });

  test("sessions are listed, one can be signed out, and its refresh token stops working", async ({ playwright }) => {
    const signIn = async () => {
      const ctx = await playwright.request.newContext({ baseURL: API });
      const res = await ctx.post("/auth/login", { data: { email: "faculty1@coe.vantage", password: PASSWORD } });
      expect(res.status()).toBe(200);
      return { ctx, token: ((await res.json()) as { accessToken: string }).accessToken };
    };
    const a = await signIn();
    const b = await signIn();
    try {
      const headers = (t: string) => ({ Authorization: `Bearer ${t}` });
      const sessions = (await (await a.ctx.get("/auth/me/sessions", { headers: headers(a.token) })).json()) as { id: string; current: boolean }[];
      expect(sessions.length).toBeGreaterThanOrEqual(2);
      expect(sessions.filter((s) => s.current)).toHaveLength(1);
      const other = sessions.find((s) => !s.current)!;

      // sign out everything but this browser: b's cookie can no longer refresh
      const ended = (await (await a.ctx.post("/auth/me/sessions/revoke-others", { headers: headers(a.token) })).json()) as { ended: number };
      expect(ended.ended).toBeGreaterThanOrEqual(1);
      expect((await b.ctx.post("/auth/refresh")).status()).toBe(401);
      expect((await a.ctx.post("/auth/refresh")).status()).toBe(200); // this one carries on
      expect((await a.ctx.delete(`/auth/me/sessions/${other.id}`, { headers: headers(a.token) })).status()).toBe(404); // already gone

      const history = (await (await a.ctx.get("/auth/me/login-history", { headers: headers(a.token) })).json()) as { success: boolean }[];
      expect(history.some((h) => h.success)).toBe(true);
    } finally {
      await a.ctx.dispose();
      await b.ctx.dispose();
    }
  });

  test("the Profile page shows where you are signed in, recent sign-ins and the email digest switch", async ({ page, request }) => {
    const auth = await request.post(`${API}/auth/login`, { data: { email: "faculty1@coe.vantage", password: PASSWORD } });
    const headers = { Authorization: `Bearer ${((await auth.json()) as { accessToken: string }).accessToken}` };
    const before = ((await (await request.get(`${API}/auth/me/email-digest`, { headers })).json()) as { enabled: boolean }).enabled;
    try {
      await login(page, "faculty1@coe.vantage");
      await page.goto("/profile");
      await expect(page.getByRole("heading", { name: "Where you are signed in" })).toBeVisible();
      await expect(page.getByText("This device")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Recent sign-ins" })).toBeVisible();
      const box = page.getByLabel(/Email me a digest of notifications/);
      await box.setChecked(!before);
      await expect.poll(async () => ((await (await request.get(`${API}/auth/me/email-digest`, { headers })).json()) as { enabled: boolean }).enabled).toBe(!before);
    } finally {
      await request.patch(`${API}/auth/me/email-digest`, { headers, data: { enabled: before } });
    }
  });

  test("email notifications can be turned off altogether or one kind at a time, and the bell is not affected", async ({ page, request }) => {
    const auth = await request.post(`${API}/auth/login`, { data: { email: "faculty1@coe.vantage", password: PASSWORD } });
    const headers = { Authorization: `Bearer ${((await auth.json()) as { accessToken: string }).accessToken}` };
    const prefs = async () => (await (await request.get(`${API}/auth/me/email-preferences`, { headers })).json()) as { digest: boolean; deadlines: boolean };
    const before = await prefs();
    try {
      await request.patch(`${API}/auth/me/email-preferences`, { headers, data: { digest: true, deadlines: true } });
      await login(page, "faculty1@coe.vantage");
      await page.goto("/profile");
      const master = page.getByRole("checkbox", { name: "Send me email notifications" });
      const deadlines = page.getByLabel(/Remind me by email about college deadlines/);
      const digest = page.getByLabel(/Email me a digest of notifications/);
      await expect(master).toBeChecked();

      // one kind off: the master stays on
      await deadlines.setChecked(false);
      await expect.poll(async () => (await prefs()).deadlines).toBe(false);
      expect((await prefs()).digest).toBe(true);
      await expect(master).toBeChecked();

      // everything off
      await master.setChecked(false);
      await expect.poll(async () => JSON.stringify(await prefs())).toBe(JSON.stringify({ digest: false, deadlines: false }));
      await expect(deadlines).not.toBeChecked();
      await expect(digest).not.toBeChecked();
      await expect(master).not.toBeChecked();
      // the bell is untouched: the page still lists notifications
      expect((await request.get(`${API}/notifications`, { headers })).status()).toBe(200);

      // back on, all together; turning a single kind on turns the master on
      await master.setChecked(true);
      await expect.poll(async () => JSON.stringify(await prefs())).toBe(JSON.stringify({ digest: true, deadlines: true }));
      await master.setChecked(false);
      await expect.poll(async () => (await prefs()).digest).toBe(false);
      await digest.setChecked(true);
      await expect.poll(async () => JSON.stringify(await prefs())).toBe(JSON.stringify({ digest: true, deadlines: false }));
      await expect(master).toBeChecked();

      // the API refuses an empty change
      expect((await request.patch(`${API}/auth/me/email-preferences`, { headers, data: {} })).status()).toBe(400);
    } finally {
      await request.patch(`${API}/auth/me/email-preferences`, { headers, data: before });
    }
  });
});
