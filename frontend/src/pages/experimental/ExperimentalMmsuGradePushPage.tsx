import { Download } from "lucide-react";

const DOWNLOAD_URL = "/downloads/vantage-mmsu-grade-push.zip";
const EXTENSION_VERSION = "0.2.0";
const PORTAL_GRADESHEETS_URL = "https://my.mmsu.edu.ph/my/class/gradesheet";

/** A picture in a step. `width` and `height` are the CSS size (the files are 2x for sharp screens). */
function Shot({ file, alt, caption, width, height }: { file: string; alt: string; caption: string; width: number; height: number }) {
  return (
    <figure className="pt-2">
      <img
        src={`/guides/mmsu-grade-push/${file}`}
        alt={alt}
        width={width}
        height={height}
        loading="lazy"
        decoding="async"
        className="h-auto max-w-full rounded border border-border bg-surface"
      />
      <figcaption className="mt-1 text-xs text-foreground-muted">{caption}</figcaption>
    </figure>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground" aria-hidden>
        {n}
      </span>
      <div className="min-w-0">
        <p className="font-medium text-foreground">{title}</p>
        <div className="mt-0.5 space-y-1 text-sm text-foreground-muted">{children}</div>
      </div>
    </li>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded border border-border bg-surface p-4">
      <h2 className="text-lg font-medium text-foreground">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

const kbd = "rounded border border-border bg-surface-muted px-1 py-0.5 font-mono text-xs text-foreground";

/** Setup and usage of the MMSU grade push browser extension (experimental, off unless enabled on the Profile page). */
export function ExperimentalMmsuGradePushPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">MMSU Grade Push</h1>
        <p className="mt-1 text-sm text-foreground-muted">
          A browser extension that fills the MMSU portal gradesheet from a table you copy out of Excel or Google Sheets, then checks that the portal
          shows what your sheet says. It runs in your own browser, inside the portal page you are already logged in to. Vantage never sees your portal
          password or your grades.
        </p>
      </div>

      <Card title="1. Get the extension">
        <a
          href={DOWNLOAD_URL}
          download
          className="inline-flex items-center gap-2 rounded bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <Download size={16} aria-hidden /> Download extension (v{EXTENSION_VERSION})
        </a>
        <ol className="mt-4 space-y-3">
          <Step n={1} title="Extract the zip into a folder you will keep">
            <p>The browser reads the extension from that folder every time it starts, so do not delete it or leave it in Downloads.</p>
          </Step>
          <Step n={2} title="Open the extensions page and turn on Developer mode">
            <p>
              In Chrome go to <span className={kbd}>chrome://extensions</span>; in Edge go to <span className={kbd}>edge://extensions</span>. Switch on <b>Developer mode</b>.
            </p>
            <Shot
              file="01-developer-mode.png"
              alt="The Chrome extensions page with the Developer mode switch turned on and the Load unpacked, Pack extension and Update buttons showing"
              caption="Developer mode (top right) is on, so the Load unpacked button shows. Your browser's version may look slightly different."
              width={1280}
              height={112}
            />
          </Step>
          <Step n={3} title="Load it">
            <p>
              Click <b>Load unpacked</b> and choose the folder you extracted (the one that contains <span className={kbd}>manifest.json</span>). “Vantage MMSU Grade Push” appears in the list.
            </p>
            <Shot
              file="02-extension-loaded.png"
              alt="The extension card for Vantage MMSU Grade Push, switched on"
              caption="Once loaded, the extension is listed and switched on."
              width={430}
              height={260}
            />
            <p>Chrome may remind you at startup about developer-mode extensions; that message is expected for an extension installed this way.</p>
          </Step>
          <Step n={4} title="To update later">
            <p>Download the new zip, extract it over the same folder, then press the reload icon on the extension's card.</p>
          </Step>
        </ol>
      </Card>

      <Card title="Who can use it">
        <p className="text-sm text-foreground">
          The extension checks that you are signed in to Vantage <strong>in the same browser</strong>, and that an administrator has allowed MMSU Grade Push for your account and you have switched it on in your Profile (this page appears only then). If not, the panel on the portal says why and offers <em>Check again</em>. The check only asks Vantage who you are and whether you have access; it sends no grades, student data or portal passwords.
        </p>
      </Card>

      <Card title="2. Use it on a gradesheet">
        <ol className="space-y-3">
          <Step n={1} title="Open the class gradesheet in the portal">
            <p>
              Log in to the portal and go to its{" "}
              <a href={PORTAL_GRADESHEETS_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline">
                Grade Sheet list (opens in a new tab)
              </a>
              , and click <b>Edit</b> on the class. A <b>Vantage grade push</b> tab appears on the right edge of the page. Click it to open the panel.
            </p>
            <p>You can also click the extension's icon in the browser toolbar: it opens that same Grade Sheet list in a new tab.</p>
            <Shot
              file="03-panel-tab.png"
              alt="The blue Vantage grade push tab on the right edge of a page"
              caption="The Vantage grade push tab on the right edge of the gradesheet page."
              width={180}
              height={170}
            />
          </Step>
          <Step n={2} title="Copy your table and paste it into the panel">
            <p>
              In Excel or Google Sheets, select the columns that hold the student number, the name and the final grade (copy the header row too) and press <span className={kbd}>Ctrl</span>+<span className={kbd}>C</span>. Paste into the panel's box. The columns do not need to be next to each other, and extra columns are fine.
            </p>
            <p>The panel finds the student number, name and final grade columns from the header. If it picked the wrong ones, change them in the dropdowns.</p>
          </Step>
          <Step n={3} title="Review what will change">
            <p>
              Each pasted student is matched to the portal by <b>student number</b> (<span className={kbd}>23-050573</span> and <span className={kbd}>23050573</span> are the same). The list shows the current grade on the portal and the new one, and why any row cannot be applied. Untick a row to leave it alone.
            </p>
            <p>If a student number matches but the name looks different, the row is unticked until you check it and tick it yourself.</p>
            <Shot
              file="04-paste-and-review.png"
              alt="The panel after pasting a table: detected columns, a summary of how many grades will change, a row-by-row list, and the Fill buttons"
              caption="After pasting: the columns it found, what will change, what cannot be applied and why, and the two buttons. (Made-up students.)"
              width={520}
              height={758}
            />
          </Step>
          <Step n={4} title="Fill, or fill and save">
            <p>
              <b>Fill</b> only sets the dropdowns so you can look at them and press the portal's own <b>Save Gradesheet</b> yourself. <b>Fill and save gradesheet</b> asks you to confirm, sets the grades and presses Save for you.
            </p>
          </Step>
          <Step n={5} title="Read the check">
            <p>
              After the portal reloads, the panel compares every grade it set with what the portal now shows and tells you either that all of them match or exactly which ones do not. It also lists any other student whose grade changed without you asking.
            </p>
            <Shot
              file="05-check-all-match.png"
              alt="The panel showing a green message: all 4 grades on the portal match your sheet"
              caption="When everything went through."
              width={520}
              height={382}
            />
            <Shot
              file="06-check-differences.png"
              alt="The panel showing a red message with one grade the portal did not keep and one grade that changed without being asked"
              caption="When the portal did not keep a grade, or changed one you did not ask for, it is listed here."
              width={520}
              height={501}
            />
            <p>If you saved by hand, open the panel and press <b>Check the portal</b>. Press <b>Done</b> to clear the result.</p>
          </Step>
        </ol>
      </Card>

      <Card title="What it will and will not do">
        <ul className="list-disc space-y-1 pl-5 text-sm text-foreground-muted">
          <li>It only works on the portal's gradesheet edit pages (<span className={kbd}>my.mmsu.edu.ph/my/class/gradesheet/…</span>) and does nothing anywhere else.</li>
          <li>It only offers the grades the portal's own dropdown has: 1.00 to 3.00 in steps of 0.25, 4.00, 5.00, INC, DRP and IP. A grade such as 3.25 or 3.5 is refused, never rounded. An empty grade cell leaves that student as is.</li>
          <li>It never touches the <b>Remove Selected</b> or <b>Reset Gradesheet</b> buttons, the team teaching box, or the chairman and dean selections.</li>
          <li>Students you did not paste are left alone, and the panel tells you which students on the portal were not in your paste.</li>
          <li>The same student number pasted twice with different grades is refused rather than guessed.</li>
          <li>Your pasted table stays in the page. The last fill is kept in this browser for 30 minutes only, so the check can run after the portal reloads.</li>
        </ul>
      </Card>

      <Card title="Troubleshooting">
        <ul className="list-disc space-y-1 pl-5 text-sm text-foreground-muted">
          <li><b>No “Vantage grade push” tab:</b> make sure you are on the gradesheet <b>Edit</b> page (not the class list), the extension is switched on at <span className={kbd}>chrome://extensions</span>, and reload the page. If the portal's page layout changes, the extension deliberately shows nothing instead of guessing.</li>
          <li><b>“No student rows found”:</b> the student number column needs numbers like <span className={kbd}>23-050573</span>. Check the column dropdowns.</li>
          <li><b>The check says some grades differ:</b> the portal did not keep them. Read the portal message shown in the panel, fix the cause, and run it again.</li>
        </ul>
      </Card>

      <p className="text-xs text-foreground-muted">
        This is an experimental feature. It is switched on from your Profile page (Experimental features) and is not enabled by default.
      </p>
    </div>
  );
}
