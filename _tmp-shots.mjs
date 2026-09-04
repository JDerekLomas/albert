import { chromium } from "playwright";

const OUT = "/private/tmp/claude-501/-Users-dereklomas-albert/baa5eb18-ac76-49bf-936c-8bfa1cb20315/scratchpad";
const URL = "https://albert-book.vercel.app/d/albert-lin-memoir-ch-14";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 160)));
page.on("pageerror", (e) => errors.push("PAGEERROR: " + String(e).slice(0, 160)));

await page.goto(URL, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForSelector(".tiptap p", { timeout: 30000 });
await page.screenshot({ path: `${OUT}/ui-1-default.png` });
console.log("1 default view");

// Heat panel
await page.getByRole("button", { name: /^Heat/ }).click();
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/ui-2-heat-empty.png` });
console.log("2 heat panel, before running");

await page.getByRole("button", { name: /Assess this chapter/ }).click();
await page.waitForFunction(
  () => !document.body.innerText.includes("Reading the chapter"),
  { timeout: 120000 }
);
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/ui-3-heat-on.png` });
console.log("3 heat map applied");

// Click the top finding to focus a paragraph
const finding = page.locator("aside button, .w-80 button").filter({ hasText: /¶/ }).first();
if (await finding.count()) {
  await finding.click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/ui-4-heat-focus.png` });
  console.log("4 finding focused");
}

// Index panel
await page.getByRole("button", { name: /^Index$/ }).click();
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/ui-5-index-outline.png` });
console.log("5 index / outline tab");

for (const tab of ["Context", "Notes"]) {
  const b = page.getByRole("button", { name: new RegExp(`^${tab}$`) });
  if (await b.count()) {
    await b.first().click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/ui-6-index-${tab.toLowerCase()}.png` });
    console.log(`6 index / ${tab} tab`);
  }
}

console.log(errors.length ? "\nCONSOLE ERRORS:\n" + errors.join("\n") : "\nno console errors");
await browser.close();
