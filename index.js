const puppeteer = require('puppeteer');
const async = require('async');
const fs = require('fs');
const axios = require('axios');

PARALLEL_TASK = process.env.PARALLEL_TASK || 2;
DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK;

if (!DISCORD_WEBHOOK) throw 'Missing DISCORD_WEBHOOK environment variable.';

const sleep = (milliseconds) => {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
};

const randomInt = (min, max) => {
  return Math.floor(Math.random() * (max - min) + min);
};

const sendDiscordMessage = async (payload) => {
  try {
    await axios.post(DISCORD_WEBHOOK, payload);
  } catch (e) {
    console.error(e);
  }
};

const sendDiscordNotification = async (data) => {
  const giveawayDone = data
    .filter(({ done, success }) => done === true && success)
    .map((d) => ({
      name: d.url + '?igr=fgc18',
      value: `🥇 Félicitation ${d.winnerNickname}, tu as remporté le giveaway!`,
    }));
  const giveawayNotDone = data
    .filter(({ done, success }) => done !== true && success)
    .map((d) => ({
      name: d.url + '?igr=fgc18',
      value: `🎁 Il ne te reste plus que ${d.days} jour(s) et ${d.hours} heure(s) pour participer.`,
    }));

  const commons = {
    username: 'Info giveaway',
    avatar_url:
      'https://emojipedia-us.s3.dualstack.us-west-1.amazonaws.com/thumbs/240/google/298/santa-claus_1f385.png',
    attachments: [],
  };
  const header = { content: '🔥🔥 GIVEAWAYS DU MOMENT 🔥🔥', ...commons };
  const footer = {
    embeds: [
      {
        color: null,
        author: {
          name: 'Made by Felix.',
          url: 'https://github.com/felixcapuano',
          icon_url:
            'https://cdn.discordapp.com/avatars/421801671237042176/54f15ee8202729e9570cb939ce08cfe9.webp',
        },
      },
    ],
    ...commons,
  };

  console.log('Send discord messages');
  await sendDiscordMessage(header);

  let i1 = 0;
  while (true) {
    const chunk = giveawayNotDone.slice(i1 * 25, (i1 + 1) * 25);
    const payload = {
      embeds: [
        {
          title: 'Giveaway en cours',
          color: 9436928,
          fields: chunk,
        },
      ],
      ...commons,
    };
    if (payload) await sendDiscordMessage(payload);

    if (chunk.length < 25) break;
    i1++;
  }

  let i2 = 0;
  while (true) {
    const chunk = giveawayDone.slice(i2 * 25, (i2 + 1) * 25);
    const payload = {
      embeds: [
        {
          title: 'Giveaway terminé',
          color: 9371648,
          fields: chunk,
        },
      ],
      ...commons,
    };
    if (payload) await sendDiscordMessage(payload);

    if (chunk.length < 25) break;
    i2++;
  }

  await sendDiscordMessage(footer);
};

const innerHTMLbyClass = async (className, page) => {
  return page.$eval(className, (element) => element.innerHTML);
};

let counter = 0;
const extractFromURL = async (url, browser) => {
  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle2' });
  } catch (e) {
    console.error(e);
    await page.close();
    await sleep(randomInt(5, 10) * 1000);
    return await extractFromURL(url, browser);
  }

  counter++;
  console.log(counter, 'extracting', url);

  const data = { url };
  if (await page.$('.giveaway-result')) {
    data.winnerNickname = await innerHTMLbyClass('.winner-nickname', page);
    data.done = true;
    data.success = true;
  } else if (await page.$('.ig-contest-countdown ')) {
    data.days = await innerHTMLbyClass('.ig-contest-countdown-days', page);
    data.hours = await innerHTMLbyClass('.ig-contest-countdown-hours', page);
    // data.minutes = await innerHTMLbyClass(
    //   '.ig-contest-countdown-minutes',
    //   page
    // );
    // data.seconds = await innerHTMLbyClass(
    //   '.ig-contest-countdown-seconds',
    //   page
    // );
    data.done = false;
    data.success = true;
  } else {
    data.success = false;
  }
  await page.close();

  return data;
};

fs.readFile('./links.txt', 'utf8', async (err, data) => {
  console.time('execution');

  if (err) return;
  const links = data.split(/\r?\n/).map((line) => line.trim());

  const browser = await puppeteer.launch({ headless: true });

  const jobs = links.map((link) => async (callback) => {
    const data = await extractFromURL(link, browser);
    return data;
  });

  const results = await async.parallelLimit(jobs, PARALLEL_TASK);

  await sendDiscordNotification(results);

  await browser.close();

  console.timeEnd('execution');
});
