const { chromium } = require('playwright');
const fs = require('fs').promises;
const axios = require('axios');
const path = require('path');

const downloadFolder = 'images';

async function scrapeRedditData(page) {
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

    return outputLines.join('\n');
}

async function downloadImages(dataEntries) {
    const downloadedImages = [];
    
    for (const dataEntry of dataEntries) { // Iterate over each data entry
        
        const match = dataEntry.imageSrc.match(/\/([a-zA-Z0-9-]+)\.jpg/); // Extract the image ID from the image source using regex pattern matching
        
        if (match?.[1]) { // Check if the match is successful and if the image ID is present
            const imageId = match[1];
            const convertedSrc = `https://i.redd.it/${imageId}.jpg`;
            const imageFilename = path.join(downloadFolder, `${imageId}.jpg`);

            try {
                const response = await axios.get(convertedSrc, { responseType: 'arraybuffer' }); // Download the image using axios
                
                await fs.writeFile(imageFilename, response.data); // Write the downloaded image data to a file

                downloadedImages.push({ h3Text: dataEntry.h3Text, imageFilename }); // Store the downloaded image information in the result array
                console.log(`Downloaded image for ${dataEntry.h3Text} to ${imageFilename}`); // Log a success message

            } catch (error) {
                console.error(`Failed to download image for ${dataEntry.h3Text}: ${error}`); // Log an error message if the image download fails
            }
        } else {
            console.error(`Invalid image source for ${dataEntry.h3Text}`); // Log an error message if the image source is invalid
        }
    }
    return downloadedImages; // Return the downloaded images
}


async function postTweets(page, images) {
    for (const image of images) {
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

        await page.waitForTimeout(60 * 1000); // wait for 1 minute
        await fs.unlink(image.imageFilename); // delete the posted image
    }
}

async function run() {
    const pathToExtension = path.join(__dirname, './uBlock0.chromium');
    const userDataDir = '/tmp/test-user-data-dir';
    const browserContext = await chromium.launchPersistentContext(userDataDir, {
        // headless: false,
        args: [
            `--disable-extensions-except=${pathToExtension}`,
            `--load-extension=${pathToExtension}`,
        ],
    });

    const page = await browserContext.newPage();

    const targetLink = 'https://www.reddit.com/r/memes/new/';
    await page.goto(targetLink);

    const outputData = await scrapeRedditData(page);

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
        console.error('Folder already exists');
    }

    const downloadedImages = await downloadImages(validDataEntries);

    await postTweets(page, downloadedImages);

    //await browserContext.close();
    await new Promise(() => { });
}

run().catch((error) => {
    console.error('An error occurred:', error);
});

// Use setInterval to rerun the code every 15 minutes
setInterval(() => {
    run().catch((error) => {
        console.error('An error occurred:', error);
    });
}, 15 * 60 * 1000); // 15 minutes in milliseconds
