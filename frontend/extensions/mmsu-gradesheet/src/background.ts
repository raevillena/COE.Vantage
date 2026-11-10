import { fetchAccess } from "./access";

// Clicking the extension's toolbar icon opens the portal's Grade Sheet list in a new tab, where the
// gradesheet to push to is chosen (the Portal Insert Grade panel then appears on that class's Edit page).
const GRADESHEETS_URL = "https://my.mmsu.edu.ph/my/class/gradesheet";

function openGradesheets(): void {
  void chrome?.tabs?.create({ url: GRADESHEETS_URL });
}

chrome?.action?.onClicked.addListener(openGradesheets);

// The page script asks here whether the person signed in to Vantage may use the extension.
chrome?.runtime?.onMessage.addListener((message, _sender, sendResponse) => {
  if ((message as { type?: string } | null)?.type !== "vantage-check-access") return;
  void fetchAccess().then(sendResponse);
  return true; // the answer is sent asynchronously
});

// Lets the end-to-end test trigger the same action without clicking the browser toolbar.
(globalThis as { vantageOpenGradesheets?: () => void }).vantageOpenGradesheets = openGradesheets;
