import { describeDenied, requestAccess, type Access } from "./access";
import { applyChanges, verifyJob, type Verification } from "./fill";
import { AUTO_VERIFY_MS, clearJob, loadJob, saveJob, type Job } from "./job";
import { detectMapping, extractRows, parseDelimited, type Detected, type Mapping } from "./paste";
import { buildPlan, type Plan, type PlanItem } from "./plan";
import { readAlerts, readSheet, type PortalSheet } from "./portal";

type Child = Node | string | null | false;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { cls?: string; text?: string; attrs?: Record<string, string>; on?: Record<string, (event: Event) => void> } = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.cls) el.className = props.cls;
  if (props.text !== undefined) el.textContent = props.text;
  for (const [name, value] of Object.entries(props.attrs ?? {})) el.setAttribute(name, value);
  for (const [name, handler] of Object.entries(props.on ?? {})) el.addEventListener(name, handler);
  for (const child of children) if (child) el.append(child);
  return el;
}

const STYLE = `
:host { all: initial; }
* { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
.pill { position: fixed; right: 0; top: 40%; z-index: 2147483000; background: #1d4ed8; color: #fff; border: 0; padding: 10px 8px;
  border-radius: 8px 0 0 8px; cursor: pointer; font-size: 12px; writing-mode: vertical-rl; letter-spacing: .03em; }
.panel { position: fixed; right: 12px; top: 12px; z-index: 2147483001; width: 520px; max-width: calc(100vw - 24px); max-height: calc(100vh - 24px);
  overflow: auto; background: #fff; color: #111827; border: 1px solid #9ca3af; border-radius: 10px; box-shadow: 0 8px 30px rgba(0,0,0,.25);
  font-size: 13px; line-height: 1.4; }
.hidden { display: none !important; }
header { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 10px 12px; background: #1e3a8a; color: #fff;
  position: sticky; top: 0; z-index: 1; }
header strong { font-size: 14px; }
section { padding: 10px 12px; border-top: 1px solid #e5e7eb; }
h3 { margin: 0 0 6px; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: #4b5563; }
textarea { width: 100%; min-height: 84px; font: 12px ui-monospace, Consolas, monospace; padding: 6px; border: 1px solid #9ca3af; border-radius: 6px; resize: vertical; }
select { max-width: 100%; padding: 3px; font-size: 12px; }
label.map { display: inline-flex; flex-direction: column; gap: 2px; margin-right: 10px; font-size: 12px; color: #374151; }
button { font-size: 13px; padding: 6px 10px; border-radius: 6px; border: 1px solid #6b7280; background: #f3f4f6; color: #111827; cursor: pointer; }
button.primary { background: #1d4ed8; border-color: #1d4ed8; color: #fff; }
button.danger { background: #b91c1c; border-color: #b91c1c; color: #fff; }
button:disabled { opacity: .5; cursor: not-allowed; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; }
.chip { padding: 2px 8px; border-radius: 99px; background: #e5e7eb; font-size: 12px; }
.chip.bad { background: #fee2e2; color: #7f1d1d; } .chip.good { background: #dcfce7; color: #14532d; } .chip.warn { background: #fef3c7; color: #78350f; }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
th, td { text-align: left; padding: 3px 5px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
th { position: sticky; top: 0; background: #f9fafb; }
.scroll { max-height: 280px; overflow: auto; border: 1px solid #e5e7eb; border-radius: 6px; }
.note { color: #4b5563; } .note.bad { color: #991b1b; } .note.warn { color: #92400e; }
.banner { padding: 8px 10px; border-radius: 6px; margin: 4px 0; }
.banner.ok { background: #dcfce7; color: #14532d; } .banner.bad { background: #fee2e2; color: #7f1d1d; } .banner.info { background: #dbeafe; color: #1e3a8a; }
.mono { font-family: ui-monospace, Consolas, monospace; }
`;

const STATUS_NOTE: Record<PlanItem["status"], string> = {
  change: "will change",
  same: "already set",
  blank: "empty cell — left alone",
  invalid: "",
  duplicate: "",
  "not-on-portal": "",
  locked: "",
};

class Panel {
  private readonly root: ShadowRoot;
  private readonly panel: HTMLElement;
  private readonly top: HTMLElement;
  private readonly below: HTMLElement;
  private readonly area: HTMLTextAreaElement;
  private readonly pill: HTMLButtonElement;
  private readonly pasteSection: HTMLElement;
  /** null until the Vantage server has answered; the panel does nothing but show this while access is not allowed. */
  private access: Access | null = null;
  private checkingAccess = false;

  private table: string[][] = [];
  private detected: Detected = { headerRow: -1, mapping: { id: -1, name: -1, grade: -1 }, columns: 0 };
  private plan: Plan | null = null;
  private ignored = 0;
  private checked = new Set<string>();
  private message: { kind: "ok" | "bad" | "info"; text: string } | null = null;
  private verification: { job: Job; result: Verification; alerts: string[] } | null = null;
  private pendingJob: Job | null = null;

  private readonly sheet: PortalSheet;

  constructor(sheet: PortalSheet) {
    this.sheet = sheet;
    const host = h("div", { attrs: { id: "vantage-mmsu-push" } });
    this.root = host.attachShadow({ mode: "open" });
    this.pill = h("button", { cls: "pill", text: "Portal Insert Grade", on: { click: () => this.toggle(true) } });
    // The paste box is created once: re-rendering it on every keystroke would drop the cursor.
    this.top = h("div");
    this.below = h("div");
    this.area = h("textarea", { attrs: { placeholder: "Copy the table from Excel or Google Sheets (with its header row) and paste it here", "aria-label": "Pasted table" } });
    this.area.addEventListener("input", () => this.onPaste(this.area.value));
    this.pasteSection = h("section", {}, h("h3", { text: "1. Paste your sheet" }), this.area);
    const close = h("button", { text: "Hide", on: { click: () => this.toggle(false) } });
    this.panel = h("div", { cls: "panel hidden", attrs: { role: "dialog", "aria-label": "Portal Insert Grade" } },
      h("header", {}, h("strong", { text: "Portal Insert Grade" }), close),
      this.top, this.pasteSection, this.below);
    this.root.append(h("style", { text: STYLE }), this.pill, this.panel);
    document.body.append(host);
  }

  private toggle(open: boolean) {
    this.panel.classList.toggle("hidden", !open);
    this.pill.classList.toggle("hidden", open);
  }

  /** Called once on load: shows a pending job's result if the page was just saved. */
  async start() {
    this.checkingAccess = true;
    this.render();
    this.access = await requestAccess();
    this.checkingAccess = false;
    if (!this.access.allowed) {
      this.render();
      return;
    }
    const job = await loadJob(this.sheet.sheetId);
    if (job?.stage === "saving" && Date.now() - job.createdAt <= AUTO_VERIFY_MS) {
      this.verification = { job, result: verifyJob(job, this.sheet), alerts: readAlerts(document) };
      this.toggle(true);
    } else if (job) {
      this.pendingJob = job;
    }
    this.render();
  }

  // ---- state changes -------------------------------------------------------------------------

  private onPaste(text: string) {
    this.message = null;
    this.table = parseDelimited(text);
    this.detected = detectMapping(this.table);
    this.recompute(true);
  }

  private setMapping(mapping: Mapping) {
    this.detected = { ...this.detected, mapping };
    this.recompute(true);
  }

  private recompute(resetChecks: boolean) {
    const { rows, ignored } = extractRows(this.table, this.detected.headerRow, this.detected.mapping);
    this.ignored = ignored;
    this.plan = rows.length > 0 ? buildPlan(rows, this.sheet.rows) : null;
    if (resetChecks && this.plan) {
      this.checked = new Set(this.plan.items.filter((i) => i.status === "change" && !i.nameWarning).map((i) => i.source.key));
    }
    this.render();
  }

  private async fill(save: boolean) {
    if (!this.plan) return;
    const selected = this.plan.items.filter((i) => i.status === "change" && this.checked.has(i.source.key));
    if (selected.length === 0) return;
    if (save && !window.confirm(`Set ${selected.length} grade${selected.length === 1 ? "" : "s"} and press "Save Gradesheet" on this page?`)) return;

    const before: Record<string, string> = {};
    for (const row of this.sheet.rows) before[row.key] = row.current;

    const { applied, failed } = applyChanges(selected);
    if (failed.length > 0) {
      this.message = { kind: "bad", text: `${failed.length} grade(s) could not be set (${failed.map((f) => f.source.studentNumber).join(", ")}). Nothing was saved.` };
      this.render();
      return;
    }

    const expected = this.plan.items
      .filter((i) => i.value !== undefined && (i.status === "same" || (i.status === "change" && this.checked.has(i.source.key))))
      .map((i) => ({ key: i.source.key, studentNumber: i.portal?.studentNumber ?? i.source.studentNumber, name: i.portal?.name ?? i.source.name, value: i.value! }));
    const job: Job = { sheetId: this.sheet.sheetId, createdAt: Date.now(), stage: save ? "saving" : "filled", expected, before };
    await saveJob(job);

    if (save) {
      this.message = { kind: "info", text: `Saving ${applied} grade(s)…` };
      this.render();
      this.sheet.saveButton.click();
      return;
    }
    this.message = { kind: "ok", text: `Filled ${applied} grade(s). Review them, then press the portal's "Save Gradesheet". After the page reloads, open this panel and press "Check the portal".` };
    this.render();
  }

  private checkPortal() {
    const job = this.pendingJob;
    if (!job) return;
    this.verification = { job, result: verifyJob(job, readSheet(document) ?? this.sheet), alerts: readAlerts(document) };
    this.pendingJob = null;
    this.render();
  }

  private async finish() {
    await clearJob(this.sheet.sheetId);
    this.verification = null;
    this.pendingJob = null;
    this.render();
  }

  // ---- rendering -----------------------------------------------------------------------------

  private async recheckAccess() {
    this.checkingAccess = true;
    this.render();
    this.access = await requestAccess(true);
    this.checkingAccess = false;
    if (this.access.allowed) await this.start();
    else this.render();
  }

  /** The gate: shown instead of the tool until the Vantage server says this person may use it. */
  private renderGate(): Node[] {
    const access = this.access;
    if (this.checkingAccess || !access) return [h("section", {}, h("div", { cls: "banner info", text: "Checking your Vantage access…" }))];
    if (access.allowed) return [];
    const { title, text } = describeDenied(access);
    return [h("section", {},
      h("div", { cls: "banner bad" }, h("strong", { text: title }), h("div", { text })),
      h("div", { cls: "actions" },
        h("button", { cls: "primary", text: "Check again", on: { click: () => void this.recheckAccess() } }),
        access.appUrl ? h("button", { text: "Open Vantage", on: { click: () => window.open(access.appUrl, "_blank", "noopener") } }) : null))];
  }

  private render() {
    const gated = !this.access?.allowed;
    this.pasteSection.classList.toggle("hidden", gated);
    if (gated) {
      this.top.replaceChildren(...this.renderGate());
      this.below.replaceChildren();
      return;
    }
    this.top.replaceChildren(
      h("section", {}, h("div", { cls: "note", text: `Signed in to Vantage as ${this.access?.allowed ? this.access.name : ""}` }), h("div", { text: `${this.sheet.course || "Gradesheet"} — ${this.sheet.title}` }), h("div", { cls: "note", text: `${this.sheet.rows.length} students on this portal gradesheet` })),
      ...[this.renderMessage(), this.renderVerification(), this.renderPending()].filter((n): n is Node => n !== null),
    );
    this.below.replaceChildren(...[this.renderMapping(), this.renderPreview()].filter((n): n is Node => n !== null));
  }

  private renderMessage(): Node | null {
    return this.message ? h("section", {}, h("div", { cls: `banner ${this.message.kind}`, text: this.message.text })) : null;
  }

  private renderPending(): Node | null {
    if (!this.pendingJob || this.verification) return null;
    return h("section", {}, h("div", { cls: "banner info", text: `Earlier you filled ${this.pendingJob.expected.length} grade(s) on this gradesheet.` }),
      h("div", { cls: "actions" },
        h("button", { cls: "primary", text: "Check the portal", on: { click: () => this.checkPortal() } }),
        h("button", { text: "Dismiss", on: { click: () => void this.finish() } })));
  }

  private renderVerification(): Node | null {
    if (!this.verification) return null;
    const { result, alerts } = this.verification;
    const total = result.items.length;
    const bad = result.items.filter((i) => i.status !== "match");
    const ok = bad.length === 0 && result.unexpected.length === 0;
    return h("section", {},
      h("h3", { text: "Portal vs your sheet" }),
      h("div", { cls: `banner ${ok ? "ok" : "bad"}`, text: ok
        ? `All ${total} grade${total === 1 ? "" : "s"} on the portal match your sheet.`
        : `${result.matched} of ${total} match. ${bad.length} differ or are missing${result.unexpected.length ? `, and ${result.unexpected.length} other grade(s) changed that you did not ask for` : ""}.` }),
      ...alerts.map((text) => h("div", { cls: "note", text: `Portal message: ${text}` })),
      bad.length > 0 ? h("div", { cls: "scroll" }, h("table", {},
        h("thead", {}, h("tr", {}, h("th", { text: "Student" }), h("th", { text: "Sheet" }), h("th", { text: "Portal" }))),
        h("tbody", {}, ...bad.map((i) => h("tr", {},
          h("td", {}, h("span", { cls: "mono", text: i.studentNumber }), ` ${i.name}`),
          h("td", { text: i.expected }),
          h("td", { cls: "note bad", text: i.status === "missing" ? "not on the portal" : i.actual || "---" })))))) : null,
      result.unexpected.length > 0 ? h("div", { cls: "scroll" }, h("table", {},
        h("thead", {}, h("tr", {}, h("th", { text: "Changed without being asked" }), h("th", { text: "Before" }), h("th", { text: "Now" }))),
        h("tbody", {}, ...result.unexpected.map((u) => h("tr", {},
          h("td", {}, h("span", { cls: "mono", text: u.studentNumber }), ` ${u.name}`),
          h("td", { text: u.before || "---" }), h("td", { text: u.after || "---" })))))) : null,
      h("div", { cls: "actions" }, h("button", { cls: "primary", text: "Done", on: { click: () => void this.finish() } })));
  }

  private renderMapping(): Node | null {
    if (this.table.length === 0) return null;
    const headers = this.detected.headerRow >= 0 ? this.table[this.detected.headerRow] : [];
    const select = (label: string, field: keyof Mapping, optional: boolean) => {
      const el = h("select", { attrs: { "aria-label": label } });
      el.append(h("option", { text: optional ? "(none)" : "— choose —", attrs: { value: "-1" } }));
      for (let c = 0; c < this.detected.columns; c++) {
        const sample = this.table[this.detected.headerRow + 1]?.[c] ?? "";
        el.append(h("option", { text: `${c + 1}: ${headers[c] || sample || "(empty)"}`.slice(0, 40), attrs: { value: String(c) } }));
      }
      el.value = String(this.detected.mapping[field]);
      el.addEventListener("change", () => this.setMapping({ ...this.detected.mapping, [field]: Number(el.value) }));
      return h("label", { cls: "map" }, label, el);
    };
    return h("section", {}, h("h3", { text: "2. Columns" }),
      select("Student number", "id", false), select("Name (optional)", "name", true), select("Final grade", "grade", false),
      this.detected.headerRow < 0 ? h("div", { cls: "note", text: "No header row found — columns were guessed from the cells." }) : null);
  }

  private renderPreview(): Node | null {
    if (this.table.length === 0) return null;
    if (!this.plan) return h("section", {}, h("h3", { text: "3. Review" }), h("div", { cls: "banner bad", text: "No student rows found. Check the columns above (the student number column needs numbers like 23-050573)." }));

    const { items, portalOnly } = this.plan;
    const count = (status: PlanItem["status"]) => items.filter((i) => i.status === status).length;
    const problems = items.filter((i) => ["invalid", "duplicate", "not-on-portal", "locked"].includes(i.status)).length;
    const selected = items.filter((i) => i.status === "change" && this.checked.has(i.source.key)).length;

    const chips = h("div", { cls: "chips" },
      h("span", { cls: "chip good", text: `${count("change")} to change` }),
      h("span", { cls: "chip", text: `${count("same")} already set` }),
      problems ? h("span", { cls: "chip bad", text: `${problems} cannot be applied` }) : null,
      portalOnly.length ? h("span", { cls: "chip warn", text: `${portalOnly.length} on the portal, not in your paste` }) : null,
      this.ignored ? h("span", { cls: "chip", text: `${this.ignored} non-student line(s) skipped` }) : null);

    const rows = items.map((item) => {
      const change = item.status === "change";
      const box = h("input", { attrs: { type: "checkbox", "aria-label": `Apply ${item.source.studentNumber}` } });
      box.checked = this.checked.has(item.source.key);
      box.disabled = !change;
      box.addEventListener("change", () => {
        if (box.checked) this.checked.add(item.source.key);
        else this.checked.delete(item.source.key);
        this.render();
      });
      const bad = ["invalid", "duplicate", "not-on-portal", "locked"].includes(item.status);
      const note = item.nameWarning
        ? `Name differs — portal has "${item.portal?.name}". Check before applying.`
        : bad ? item.reason ?? "" : STATUS_NOTE[item.status];
      return h("tr", {},
        h("td", {}, change ? box : null),
        h("td", {}, h("span", { cls: "mono", text: item.source.studentNumber }), h("div", { cls: "note", text: item.source.name || item.portal?.name || "" })),
        h("td", { text: change ? `${item.current || "---"} → ${item.value}` : item.status === "same" ? item.value ?? "" : item.source.rawGrade || "—" }),
        h("td", { cls: `note ${bad ? "bad" : item.nameWarning ? "warn" : ""}`, text: note }));
    });

    return h("section", {}, h("h3", { text: "3. Review" }), chips,
      h("div", { cls: "scroll" }, h("table", {},
        h("thead", {}, h("tr", {}, h("th", { text: "" }), h("th", { text: "Student" }), h("th", { text: "Grade" }), h("th", { text: "Note" }))),
        h("tbody", {}, ...rows))),
      h("div", { cls: "actions" },
        h("button", { text: `Fill ${selected} grade${selected === 1 ? "" : "s"} (don't save)`, attrs: selected ? {} : { disabled: "" }, on: { click: () => void this.fill(false) } }),
        h("button", { cls: "primary", text: `Fill and save gradesheet`, attrs: selected ? {} : { disabled: "" }, on: { click: () => void this.fill(true) } })),
      h("div", { cls: "note", text: "Students are matched by student number only. Nothing is changed for students you did not paste, and the portal's Remove and Reset buttons are never used." }));
  }
}

export async function mountPanel(): Promise<void> {
  const sheet = readSheet(document);
  if (!sheet) return;
  await new Panel(sheet).start();
}
