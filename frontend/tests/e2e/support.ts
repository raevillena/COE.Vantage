import type { Page } from "@playwright/test";

/** Shared by the e2e specs. They run against an already running stack (backend :4000, frontend :5173, seeded database). */
export const PASSWORD = process.env.E2E_PASSWORD ?? "Test123!";
export const API = process.env.E2E_API_URL ?? "http://localhost:4000";

export async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard");
}

/** The class the scheduler tests use. They create it themselves (in the curriculum of the seeded CE subjects) instead of
 *  depending on a hand-made class, which people may edit or move; it is removed again by `removeCeClass`. */
export const CE_CLASS = "QA CE 4A";
const COE_ID = "00000000-0000-0000-0000-0000000000a2";

export async function ensureCeClass(request: import("@playwright/test").APIRequestContext): Promise<{ id: string; name: string } | undefined> {
  const auth = await request.post(`${API}/auth/login`, { data: { email: "admin@coe.vantage", password: PASSWORD } });
  const headers = { Authorization: `Bearer ${((await auth.json()) as { accessToken: string }).accessToken}`, "X-College-Id": COE_ID };
  const subjects = (await (await request.get(`${API}/subjects`, { headers })).json()) as { code: string; curriculumId: string | null }[];
  const curriculumId = subjects.find((s) => s.code === "CE401")?.curriculumId;
  if (!curriculumId) return undefined;
  const classes = (await (await request.get(`${API}/student-classes`, { headers })).json()) as { id: string; name: string; curriculumId: string }[];
  const existing = classes.find((c) => c.name === CE_CLASS && c.curriculumId === curriculumId);
  if (existing) return { id: existing.id, name: existing.name };
  const created = await request.post(`${API}/student-classes`, { headers, data: { name: CE_CLASS, yearLevel: 4, curriculumId, studentCount: 30 } });
  if (created.status() !== 201) return undefined;
  const made = (await created.json()) as { id: string; name: string };
  return { id: made.id, name: made.name };
}

export async function removeCeClass(request: import("@playwright/test").APIRequestContext): Promise<void> {
  const auth = await request.post(`${API}/auth/login`, { data: { email: "admin@coe.vantage", password: PASSWORD } });
  const headers = { Authorization: `Bearer ${((await auth.json()) as { accessToken: string }).accessToken}`, "X-College-Id": COE_ID };
  const classes = (await (await request.get(`${API}/student-classes`, { headers })).json()) as { id: string; name: string }[];
  for (const c of classes.filter((x) => x.name === CE_CLASS)) {
    await request.delete(`${API}/student-classes/${c.id}`, { headers });
    await request.delete(`${API}/student-classes/trash/${c.id}`, { headers });
  }
}
