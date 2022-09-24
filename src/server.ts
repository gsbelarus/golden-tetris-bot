import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import Router from 'koa-router';
import https from 'https';
import path from 'path';
import * as fs from 'fs';
import send from 'koa-send';
import Telegraf, { Markup } from 'telegraf';
import { FileDB } from './fileDB';
import { TelegrafContext } from 'telegraf/typings/context';
import { Lang, getLocString, getUserLang } from './stringResources';

const serverStarted = new Date();

/**
 * Converts given date into "DD.MM.YYYY" string.
 * @param d Date
 */
const formatDate = (d: Date) => `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;

/**
 * Format time interval given in milliseconds into "hh:mm:ss" string.
 * @param ms Time interval in milliseconds.
 */
const formatMSTime = (ms: number) => {
  const sec = (ms / 1000 >> 0) % 60;
  const min = (ms / (1000 * 60) >> 0) % 60;
  const hrs = (ms / (1000 * 60 * 60)) >> 0;
  return `${hrs.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
};

interface IUserHistory {
  userName: string;
  chatId: number[];
  results: {
    date: string;
    points: number;
    lines: number;
    figures: number;
    level: number;
    duration: number;
  }[];
};

const db = new FileDB<IUserHistory>(path.resolve(process.cwd(), 'data/results.json'));

const logData: string[] = [];

const log = (data: any, userId?: number, chatId?: number) => {
  const d = new Date();
  const date = formatDate(d);
  const time = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds()}`;
  let chat = chatId ? `, chatId: ${chatId}` : '';
  let user = '';

  if (userId) {
    const userHistory = db.read(userId);
    if (userHistory) {
      user = `, user: ${userId}-${userHistory.userName}`;
    }
  }

  const msg = `${date} ${time}${user}${chat}: ${data}`;

  if (logData.length > 1000000) {
    logData.length = 0;
  }
  logData.push(msg);

  console.log(msg);
};

const app = new Koa();
const router = new Router();
const contexts: TelegrafContext[] = [];

router.get('/', (ctx, next) => {
  ctx.body = '@GoldenTetrisBot for Telegram. Copyright (c) 2020 by Golden Software of Belarus, Ltd';
  next();
});

router.get('/log', (ctx, next) => {
  ctx.body = '<html><body><pre>' + logData.map( l => `<div>${l}</div>` ).join('') + '</pre></body></html>';
  next();
});

router.get('/tetris/telegramBot/v1/submitTetris/', async (ctx) => {
  ctx.body = 'Score submitted';

  const chatId = parseInt(ctx.query.chatId);
  const userId = parseInt(ctx.query.userId);
  const points = parseInt(ctx.query.points);
  const figures = parseInt(ctx.query.figures);
  const lines = parseInt(ctx.query.lines);
  const level = parseInt(ctx.query.level);
  const duration = parseInt(ctx.query.duration);

  if (isNaN(chatId) || isNaN(userId) || isNaN(points) || isNaN(figures) || isNaN(lines) || isNaN(level) || isNaN(duration)) {
    log(`Invalid submit scores request: ${ctx.query}`);
  } else {
    const userData = db.read(userId);

    if (userData) {
      const d = new Date();
      const results = [
        ...userData.results,
        {
          date: formatDate(d),
          points,
          figures,
          lines,
          level,
          duration
        }
      ]
        .sort( (a, b) => b.points - a.points )
        .slice(0, 100);
      db.write(userId, { ...userData, results });
      log(`New${results[0].points < points ? ' high ' : ' '}score ${points} submitted.`, userId, chatId);
    }

    if (userData) {
      const context = contexts[ctx.query.chatId];

      if (context) {
        try {
          await (bot.telegram as any).setGameScore(userId, points, context.callbackQuery?.inline_message_id,
            chatId, context.callbackQuery?.message?.message_id);
        } catch(e) {
          if (e.description === 'Bad Request: BOT_SCORE_NOT_MODIFIED') {
            log('There are higher scores registered with Telegram.', userId, chatId);
          } else {
            log(e, userId, chatId);
          }
        }
      }
    }
  }
});

let gamesServed = 0;

router.get(new RegExp('/tetris/(.+)'), async (ctx) => {
  if (ctx.params[0] === 'index.html') {
    gamesServed++;
  };
  await send(ctx, ctx.params[0], { root: path.resolve(process.cwd(), 'tetris') });
});

app
  .use(bodyParser())
  .use(router.routes())
  .use(router.allowedMethods());

const cert = fs.readFileSync(path.resolve(process.cwd(), 'ssl/gdmn.app.crt'));
const key = fs.readFileSync(path.resolve(process.cwd(), 'ssl/gdmn.app.key'));
const ca = fs.readFileSync(path.resolve(process.cwd(), 'ssl/gdmn.app.ca-bundle'), {encoding:'utf8'})
  .split('-----END CERTIFICATE-----\r\n')
  .map(cert => cert +'-----END CERTIFICATE-----\r\n')
  .pop();

const koaCallback = app.callback();
const host = process.env.GOLDEN_TETRIS_TELEGRAM_BOT_HOST; // 'tetris.gdmn.app';
const port = Number(process.env.GOLDEN_TETRIS_TELEGRAM_BOT_PORT);

if (typeof host !== 'string' || !host) {
  throw new Error('GOLDEN_TETRIS_TELEGRAM_BOT_HOST env variable is not specified.');
};

if (typeof port !== 'number' || isNaN(port)) {
  throw new Error('GOLDEN_TETRIS_TELEGRAM_BOT_PORT env variable is not specified.');
};

const tetrisRoot = `https://${host}:${port}/tetris`;

https.createServer({ cert, ca, key }, koaCallback).listen(port, () => log(`HTTPS server started at ${host}:${port}`) );

const telegramBotToken = process.env.GOLDEN_TETRIS_TELEGRAM_BOT_TOKEN;

if (typeof telegramBotToken !== 'string' || !telegramBotToken) {
  throw new Error('GOLDEN_TETRIS_TELEGRAM_BOT_TOKEN env variable is not specified.');
};

const getKeyboard = (lang: Lang) => Markup.inlineKeyboard([
  [
    Markup.gameButton('🎮 '+ getLocString('playSolo', lang)) as any,
    Markup.urlButton('🏅 ' + getLocString('playWithFriends', lang), 'https://telegram.me/GoldenTetrisBot?game=tetris')
  ],
  [
    Markup.callbackButton('🏆 ' + getLocString('top40', lang), 'top40'),
    Markup.callbackButton('📃 ' + getLocString('history', lang), 'history'),
  ],
  [
    Markup.urlButton(getLocString('visitGS', lang), 'http://gsbelarus.com')
  ]
]).forceReply(true); //TODO: надо ли здесь этот force?

const bot = new Telegraf(telegramBotToken);

let callbacksReceived = 0;

bot.use( (ctx, next) => {
  callbacksReceived++;
  log(`Chat ${ctx.chat?.id}: ${ctx.updateType} "${ctx.message?.text ?? ctx.callbackQuery?.data ?? ctx.callbackQuery?.game_short_name ?? ''}"`);
  return next();
});

bot.start( async (ctx) => {
  try {
    await ctx.replyWithGame('tetris', { reply_markup: getKeyboard(getUserLang(ctx.update.message?.from)) });
  } catch(e) {
    log(e);
  }
});

bot.action('top40', (ctx) => {
  const lang = getUserLang(ctx.callbackQuery?.from);
  const data = Object.values(db.getMutable(false))
    .map( ({ userName, results }) => ({ userName, topScore: results[0]?.points ?? 0 }) )
    .sort( (a, b) => b.topScore - a.topScore )
    .slice(0, 40)
    .filter( t => t.topScore )
    .map( (t, idx) => `${(idx + 1).toString().padEnd(3, ' ')}${t.userName.slice(0, 20).padEnd(20, ' ')}${t.topScore.toString().padStart(5, ' ')}` );
  if (data.length) {
    const withHeader = [
      getLocString('top40Header', lang),
      ''.padEnd(28, '='),
      ...data
    ];
    return ctx.reply('```\n' + withHeader.join('\n') + '```', { parse_mode: 'MarkdownV2' });
  } else {
    return ctx.reply(getLocString('noRes', lang));
  }
});

bot.action('history', (ctx, next) => {
  const lang = getUserLang(ctx.callbackQuery?.from);
  const userId = ctx.callbackQuery?.from.id;
  if (userId) {
    const userData = db.read(userId);
    if (userData && userData.results?.length) {
      const data = [
        getLocString('histFor', lang) + userData.userName,
        '',
        getLocString('histHeader', lang),
        ''.padEnd(30, '='),
        ...userData.results
        .map( r => `${r.date.padEnd(11, ' ')}${r.points.toString().padStart(5, ' ')}  ${r.level}   ${formatMSTime(r.duration)}` )
      ];
      return ctx.reply('```\n' + data.join('\n') + '```', { parse_mode: 'MarkdownV2' });
    } else {
      return ctx.reply(getLocString('noRes', lang));
    }
  }
  return next();
});

bot.on('message', (ctx, next) => {
  if (ctx.message?.text === 'diagnostics') {
    db.flush();
    const data = [
      `Server started: ${serverStarted}`,
      `Node version: ${process.versions.node}`,
      'Memory usage:',
      JSON.stringify(process.memoryUsage(), undefined, 2),
      `Contexts count: ${contexts.filter( c => c ).length}`,
      `Players registered: ${Object.keys(db.getMutable(false)).length}`,
      `Games registered: ${Object.values(db.getMutable(false)).reduce( (c, s) => c + s.results.length, 0 )}`,
      `Callbacks received: ${callbacksReceived}`,
      `Games served: ${gamesServed}`,
      `Log records: ${logData.length}`,
    ]
    return ctx.reply('```\n' + data.join('\n') + '```', { parse_mode: 'MarkdownV2' });
  } else {
    return next();
  }
});

bot.on('callback_query',
  async (ctx, next) => {
    const chatId = ctx.chat?.id;
    const userId = ctx.callbackQuery?.from.id;

    if (!chatId) {
      //  чат ИД отсутствует, если мы поделились сообщением, которое
      //  запускает бота с другим человеком. В этом случае сообщим
      //  ему, что следует подключить бота и запускать игру
      //  из чата с ботом

      try {
        await ctx.answerGameQuery(`${tetrisRoot}/index.html?no_chat_warning`);
      }
      catch(e) {
        log(e, userId, chatId);
      }

      return next();
    }

    if (chatId && userId && ctx.update.callback_query?.game_short_name === 'tetris') {

      const userData = db.read(userId);

      if (!userData) {
        const userName = (ctx.callbackQuery?.from.first_name ?? '') + ' ' + (ctx.callbackQuery?.from.last_name ?? '');
        db.write(userId, {
          userName,
          chatId: [chatId],
          results: []
        });
      }
      else if (!userData.chatId.includes(chatId)) {
        db.write(userId, { ...userData, chatId: [...userData.chatId, chatId]});
      }

      try {
        const lang = ctx.callbackQuery?.from.language_code?.slice(0, 2).toLowerCase() ?? 'en';
        await ctx.answerGameQuery(`${tetrisRoot}/index.html?userId=${userId}&chatId=${chatId}&lang=${lang}`);
        contexts[chatId] = ctx;
        log('Game submitted...', userId, chatId);
      }
      catch(e) {
        log(e, userId, chatId);
      }
    }

    return next();
  }
);

bot.launch()
  .then( () => bot.telegram.setMyCommands([ { command: 'start', description: 'Start the game' }]) )
  .then( () => setInterval( db.flush, 60 * 60 * 1000 ) );

process
  .on('SIGINT', () => process.exit())
  .on('exit', code => {
    db.flush();
    log(`Process exit event with code: ${code}`);
  });
