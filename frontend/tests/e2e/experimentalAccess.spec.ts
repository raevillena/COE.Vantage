import { test, expect, request as pwRequest } from "@playwright/test";
import { API, PASSWORD, login } from "./support";

const COE = "00000000-0000-0000-0000-0000000000a2";

test.describe("admin grants experimental access", () => {
  test("a user only sees the experiments an admin granted", async ({ page, browser, request }) => {
    test.setTimeout(90_000);
    page.setDefaultTimeout(10_000);
    const auth = await request.post(`${API}/auth/login`, { data: { email: "admin@coe.vantage", password: PASSWORD } });
    const headers = { Authorization: `Bearer ${((await auth.json()) as { accessToken: string }).accessToken}` };
    const email = `qa.exp.${Date.now()}@coe.vantage`;
    const created = await request.post(`${API}/users`, { headers, data: { email, password: PASSWORD, name: "QA Experimental", role: "FACULTY", collegeId: COE } });
    expect(created.status(), await created.text()).toBe(201);
    const id = ((await created.json()) as { id: string }).id;
    try {
      // Before any grant the user has nothing to switch on.
      const userAuth = await request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } });
      const userHeaders = { Authorization: `Bearer ${((await userAuth.json()) as { accessToken: string }).accessToken}` };
      const denied = await request.patch(`${API}/auth/me/experimental-features`, { headers: userHeaders, data: { enabled: true, features: ["gradeModule"] } });
      expect(await denied.json()).toMatchObject({ enabled: true, features: [], granted: [] });

      // Admin: Users page > Experimental access.
      await login(page, "admin@coe.vantage");
      await page.goto("/users");
      await page.getByLabel("Search users").fill(email);
      await page.getByRole("button", { name: "Actions for QA Experimental" }).click();
      await page.getByRole("menuitem", { name: "Experimental access" }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByRole("checkbox", { name: /Grade Module/ })).not.toBeChecked();
      await dialog.getByRole("checkbox", { name: /Grade Module/ }).check();
      await dialog.getByRole("button", { name: "Save" }).click();
      await expect(dialog).toHaveCount(0);
      const stored = await (await request.get(`${API}/users/${id}/experimental-features`, { headers })).json();
      expect(stored.granted).toEqual(["gradeModule"]);

      // The user can now switch Grade Module on, but not Portal Insert Grade.
      const ok = await request.patch(`${API}/auth/me/experimental-features`, { headers: userHeaders, data: { enabled: true, features: ["gradeModule", "mmsuGradePush"] } });
      expect(await ok.json()).toMatchObject({ enabled: true, features: ["gradeModule"], granted: ["gradeModule"] });

      // Profile page shows only the granted experiment.
      const context = await browser.newContext();
      const userPage = await context.newPage();
      userPage.setDefaultTimeout(10_000);
      await login(userPage, email);
      await userPage.goto("/profile");
      await expect(userPage.getByText("Grade Module")).toBeVisible();
      await expect(userPage.getByText("Portal Insert Grade")).toHaveCount(0);
      await context.close();

      // The browser extension asks the server with the login cookie only.
      const asUser = await pwRequest.newContext();
      const anonymous = await pwRequest.newContext();
      try {
        const answer = async (ctx: typeof asUser) => (await (await ctx.get(`${API}/auth/extension-access/mmsu-grade-push`)).json()) as { allowed: boolean; reason?: string };
        expect(await answer(anonymous)).toMatchObject({ allowed: false, reason: "signed_out" });
        await asUser.post(`${API}/auth/login`, { data: { email, password: PASSWORD } });
        // Only Grade Module is granted so far: Grade Push is refused until an administrator allows it, then until it is switched on.
        expect(await answer(asUser)).toMatchObject({ allowed: false, reason: "not_granted" });
        await request.put(`${API}/users/${id}/experimental-features`, { headers, data: { granted: ["gradeModule", "mmsuGradePush"] } });
        expect(await answer(asUser)).toMatchObject({ allowed: false, reason: "not_enabled" });
        await request.patch(`${API}/auth/me/experimental-features`, { headers: userHeaders, data: { enabled: true, features: ["gradeModule", "mmsuGradePush"] } });
        expect(await answer(asUser)).toMatchObject({ allowed: true });
        // Asking does not log the web app out (the cookie is not rotated).
        expect((await asUser.post(`${API}/auth/refresh`)).status()).toBe(200);
        await request.put(`${API}/users/${id}/experimental-features`, { headers, data: { granted: ["gradeModule"] } });
        expect(await answer(asUser)).toMatchObject({ allowed: false, reason: "not_granted" });
      } finally {
        await asUser.dispose();
        await anonymous.dispose();
      }

      // Revoking removes what they had switched on.
      await request.put(`${API}/users/${id}/experimental-features`, { headers, data: { granted: [] } });
      const after = await (await request.get(`${API}/auth/me/experimental-features`, { headers: userHeaders })).json();
      expect(after).toMatchObject({ features: [], granted: [] });

      // An admin always has everything.
      const adminPrefs = await (await request.get(`${API}/auth/me/experimental-features`, { headers })).json();
      expect(adminPrefs.granted).toEqual(["gradeModule", "mmsuGradePush"]);
    } finally {
      await request.delete(`${API}/users/${id}`, { headers });
      await request.delete(`${API}/users/trash/${id}`, { headers });
    }
  });
});
