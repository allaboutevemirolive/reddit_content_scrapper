const { chromium } = require('playwright');
const path = require('path');

(async () => {

    const pathToExtension = path.join(__dirname, './uBlock0.chromium');
    const userDataDir = '/tmp/test-user-data-dir';
    const browserContext = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        args: [
            `--disable-extensions-except=${pathToExtension}`,
            `--load-extension=${pathToExtension}`,
        ],
    });


    const page = await browserContext.newPage();

    await page.goto('https://twitter.com/compose/tweet');
    await page.screenshot({ path: 'example.png' });

    //await browser.close();
    await new Promise(() => { });
})();
