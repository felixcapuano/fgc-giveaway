const puppeteer = require('puppeteer');
const async = require('async');
const fs = require('fs');
const axios = require('axios');

PARALLEL_TASK = process.env.PARALLEL_TASK || 5;
DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK;

if (!DISCORD_WEBHOOK) throw 'Missing DISCORD_WEBHOOK environment variable.';

const sendDiscordNotification = (data) => {
  const giveawayDone = data
    .filter(({ done }) => done === true)
    .map((d) => ({
      name: d.url + '?igr=fgc18',
      value: `Ce giveway à été remporté par ${d.winnerNickname}`,
    }));
  const giveawayNotDone = data
    .filter(({ done }) => done !== true)
    .map((d) => ({
      name: d.url + '?igr=fgc18',
      value: `Le giveaway se termine dans ${d.days} jour(s), ${d.hours} heure(s) et ${d.minutes} minute(s).`,
    }));

  const payload = {
    content: 'Liste des giveaways',
    embeds: [
      {
        title: 'Giveaways en cours',
        color: 9436928,
        fields: giveawayNotDone,
      },
      {
        title: 'Giveaways finis',
        color: 9371648,
        fields: giveawayDone,
      },
    ],
    attachments: [],
  };
  axios
    .post(DISCORD_WEBHOOK, payload)
    .catch((error) => console.error(error.message));
};

const innerHTMLbyClass = async (className, page) => {
  return page.$eval(className, (element) => element.innerHTML);
};

const extractFromURL = async (url, browser) => {
  const page = await browser.newPage();

  await page.goto(url, { waitUntil: 'networkidle2' });

  const data = { url };
  if (await page.$('.giveaway-result')) {
    data.winnerNickname = await innerHTMLbyClass('.winner-nickname', page);
    data.done = true;
  } else if (await page.$('.ig-contest-countdown ')) {
    data.days = await innerHTMLbyClass('.ig-contest-countdown-days', page);
    data.hours = await innerHTMLbyClass('.ig-contest-countdown-hours', page);
    data.minutes = await innerHTMLbyClass(
      '.ig-contest-countdown-minutes',
      page
    );
    // data.seconds = await innerHTMLbyClass(
    //   '.ig-contest-countdown-seconds',
    //   page
    // );
    data.done = false;
  }
  await page.close();
  console.log('extract', url);

  return data;
};

console.time('execution');
fs.readFile('./links.txt', 'utf8', async (err, data) => {
  if (err) return;
  const links = data.split(/\r?\n/);

  const browser = await puppeteer.launch({ headless: true });

  const jobs = links.map((link) => async (callback) => {
    const data = await extractFromURL(link, browser);
    return data;
  });

  const results = await async.parallelLimit(jobs, PARALLEL_TASK);

  console.log(results);
  sendDiscordNotification(results);

  await browser.close();
});
console.timeEnd('execution');
