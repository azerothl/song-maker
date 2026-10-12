import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium, type Browser } from "playwright";
import { ErrorNotice } from "./ErrorNotice";

let browser: Browser;
before(async () => {
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
});

it("announces the recovery text and keeps technical details keyboard reachable", async () => {
  const rawMessage = 'HTTP 500 Internal Server Error: {"error":{"message":"failed"}}';
  const markup = renderToStaticMarkup(createElement(ErrorNotice, { message: rawMessage }));
  const page = await browser.newPage();
  try {
    await page.setContent(`${markup}<button id="after-error">Next action</button>`);
    const alert = page.getByRole("alert");
    assert.match(await alert.innerText(), /This action|Cette action/);
    assert.doesNotMatch(await alert.innerText(), /HTTP 500|failed/);

    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement?.tagName), "SUMMARY");
    await page.keyboard.press("Enter");
    assert.equal(await page.locator("details").getAttribute("open"), "");

    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement?.tagName), "PRE");
    assert.equal(await page.locator("pre").innerText(), rawMessage);
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => (document.activeElement as HTMLElement)?.id), "after-error");
  } finally {
    await page.close();
  }
});
