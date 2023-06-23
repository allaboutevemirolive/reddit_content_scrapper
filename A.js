const { chromium } = require('playwright');
const fs = require('fs').promises; // Use fs.promises for asynchronous file system operations;
const axios = require('axios');
const path = require('path');

const downloadFolder = 'images';

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

    const targetLink = 'https://www.reddit.com/r/memes/new/';
    await page.goto(targetLink);

    const divElements = await page.$$('div[style]:nth-child(-n+5)');
    const uniqueResults = new Set();

    for (const divElement of divElements) {
        const h3Element = await divElement.$('h3._eYtD2XCVieq6emjKBH3m');
        if (h3Element) {
            const h3Text = await h3Element.innerText();
            uniqueResults.add(`H3 Text: ${h3Text}`);
        }

        const imgElement = await divElement.$('img[src^="https://preview.redd.it/"]');
        if (imgElement) {
            const imgSrc = await imgElement.getAttribute('src');
            uniqueResults.add(`Image Src: ${imgSrc}`);
        }

        const aElement = await divElement.$('a[href^="/r/memes/comments/"]');
        if (aElement) {
            const aHref = await aElement.getAttribute('href');
            uniqueResults.add(`A Href: ${aHref}`);
        }
    }

    const outputLines = [];
    let foundH3 = false;

    for (const line of [...uniqueResults]) {
        if (line.startsWith('H3 Text:')) {
            if (foundH3) {
                outputLines.push('\n');
            }
            foundH3 = true;
        }
        outputLines.push(line);
    }

    const outputData = outputLines.join('\n');

    const lines = outputData.split('\n');
    const validDataEntries = [];

    let currentEntry = {};

    for (const line of lines) {
        const [key, value] = line.split(': ');

        if (key === 'H3 Text') {
            if (currentEntry.h3Text && currentEntry.imageSrc && currentEntry.aHref) {
                validDataEntries.push(currentEntry);
            }
            currentEntry = { h3Text: value };
        } else if (key === 'Image Src') {
            currentEntry.imageSrc = value;
        } else if (key === 'A Href') {
            currentEntry.aHref = value;
        }
    }

    if (currentEntry.h3Text && currentEntry.imageSrc && currentEntry.aHref) {
        validDataEntries.push(currentEntry);
    }

    try {
        await fs.mkdir(downloadFolder);
        console.log(`Created directory: ${downloadFolder}`);
    } catch (error) {
        console.error(`Failed to create directory: ${downloadFolder}`, error);
        return;
    }


    const downloadedImages = [];

    for (const dataEntry of validDataEntries) {
        const match = dataEntry.imageSrc.match(/\/([a-zA-Z0-9-]+)\.jpg/);
        if (match && match[1]) {
            const imageId = match[1];
            const convertedSrc = `https://i.redd.it/${imageId}.jpg`;
            const imageFilename = path.join(downloadFolder, `${imageId}.jpg`);

            try {
                const response = await axios.get(convertedSrc, { responseType: 'arraybuffer' });
                await fs.writeFile(imageFilename, response.data);
                downloadedImages.push({ h3Text: dataEntry.h3Text, imageFilename });
                console.log(`Downloaded image for ${dataEntry.h3Text} to ${imageFilename}`);
            } catch (error) {
                console.error(`Failed to download image for ${dataEntry.h3Text}: ${error}`);
            }
        } else {
            console.error(`Invalid image source for ${dataEntry.h3Text}`);
        }
    }

    for (const image of downloadedImages) {
        await page.goto('https://twitter.com/compose/tweet');

        const tweetText = await page.waitForSelector('div[aria-label="Tweet text"]');
        await page.waitForTimeout(2000);

        await tweetText.fill(image.h3Text);

        const filePath = path.join(__dirname, image.imageFilename);
        await page.waitForSelector('input[type=file]');
        const inputFile = await page.$('input[type=file]');
        await inputFile.setInputFiles(filePath);

        const tweetButtonDiv = await page.waitForSelector('div[data-testid="tweetButton"]');
        await tweetButtonDiv.click();

        console.log(`Posted ${image.imageFilename}`);

        await page.waitForTimeout(60000); // wait for 1 minute
        await fs.unlink(image.imageFilename); // delete the posted image
    }

    //await new Promise(() => { });
    await browserContext.close();
})();