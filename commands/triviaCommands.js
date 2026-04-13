// commands/triviaCommands.js
const { EmbedBuilder } = require('discord.js');
const { db, redisGet, redisSet } = require('./utils/database');
const { isPremium, getGuildLang, checkAchievements } = require('./utils/helpers');
const { t } = require('./utils/translate');
const roblox = require('./utils/roblox');

const {
  getRandomQuestion: _getRandomQ,
  checkAnswer: _checkAnswer,
  CATEGORIES: _TRIVIA_CATS,
  getQuestionByCategory
} = require('../trivia.js');

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function replyEmbed(ctx, titleKey, descKey, color = 0x1900ff, ephemeral = false, args = []) {
  const lang = await getGuildLang(ctx.guild?.id);
  const title = await t(lang, titleKey, ...args);
  const description = await t(lang, descKey, ...args);
  const embed = new EmbedBuilder().setTitle(title).setDescription(description).setColor(color);
  return ctx.reply({ embeds: [embed], ephemeral });
}

// ──────────────────────────────────────────────────────────────
//  Trivia normal
// ──────────────────────────────────────────────────────────────
async function cmdTrivia(ctx, category) {
  const lang = await getGuildLang(ctx.guild?.id);
  const channel = ctx.channel;
  if (!channel) return replyEmbed(ctx, 'error', 'text_only', 0xED4245, true);

  const today = new Date().toISOString().slice(0,10);
  const countKey = `trivia:count:${ctx.userId}:${today}`;
  const count = parseInt(await redisGet(countKey) || '0');
  const isPremiumUser = await isPremium(ctx.userId);
  const limit = isPremiumUser ? 30 : 10;
  
  if (count >= limit) {
    return replyEmbed(ctx, 'limit_reached', 'trivia_daily_limit', 0xED4245, true, [limit]);
  }

  let question;
  if (category && _TRIVIA_CATS.includes(category)) {
    question = getQuestionByCategory(category);
  } else {
    question = _getRandomQ();
  }

  const catEmoji = { Roblox: '🎮', Matemáticas: '🔢', Ciencias: '🔬', Historia: '📜', Geografía: '🌍', Tecnología: '💻', General: '🎯' };
  const userEntry = await db.getUser(ctx.userId);
  const userColor = userEntry?.profileColor || 0x1900ff;
  const embed = new EmbedBuilder()
    .setTitle(`${catEmoji[question.cat] ?? '🎲'} ${await t(lang, 'trivia_category', question.cat)}`)
    .setDescription(`**${question.q}**`)
    .setColor(userColor)
    .setFooter({ text: `${await t(lang, 'write_answer')} · 30s · ${count + 1}/${limit} ${await t(lang, 'today')}` });

  await ctx.reply({ embeds: [embed] });

  const filter = m => m.author.id !== (ctx.clientUserId ?? '') && !m.author.bot;
  const collector = channel.createMessageCollector({ filter, time: 30000 });
  let answered = false;

  collector.on('collect', async (m) => {
    if (answered) return;
    if (_checkAnswer(m.content, question.a)) {
      answered = true;
      collector.stop('answered');
      
      await redisSet(countKey, count + 1);
      await fetch(`${REDIS_URL}/expire/${countKey}/86400`, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
      
      const eco = await db.getEconomy(m.author.id) ?? { points: 0, totalEarned: 0, triviaWins: 0 };
      const reward = 5;
      eco.points = (eco.points ?? 0) + reward;
      eco.totalEarned = (eco.totalEarned ?? 0) + reward;
      eco.triviaWins = (eco.triviaWins ?? 0) + 1;
      await db.saveEconomy(m.author.id, eco);
      
      const user = await db.getUser(m.author.id);
      await checkAchievements(m.author.id, eco, user);
      
      await m.reply(await t(lang, 'trivia_correct', question.a, m.author.id, reward, eco.points, count + 1, limit));
    }
  });

  collector.on('end', (collected, reason) => {
    if (!answered) {
      channel.send(await t(lang, 'trivia_timeout', question.a)).catch(() => {});
    }
  });
}

// ──────────────────────────────────────────────────────────────
//  Trivia personalizada
// ──────────────────────────────────────────────────────────────
async function cmdTriviaCustom(ctx, subcommand, ...args) {
  const lang = await getGuildLang(ctx.guild?.id);
  const isOwner = ctx.userId === process.env.BOT_OWNER_ID;
  
  if (subcommand === 'add' && isOwner) {
    const input = args.join(' ');
    const parts = input.split('|');
    if (parts.length < 2) return replyEmbed(ctx, 'error', 'trivia_custom_add_format', 0xED4245, true);
    const question = parts[0].trim();
    const answer = parts[1].trim();
    if (!question || !answer) return replyEmbed(ctx, 'error', 'trivia_custom_required', 0xED4245, true);
    
    const questions = await redisGet('custom_trivia') || [];
    questions.push({ q: question, a: answer, cat: 'Personalizada' });
    await redisSet('custom_trivia', questions);
    replyEmbed(ctx, 'success', 'trivia_custom_added', 0x57F287, true);
    
  } else if (subcommand === 'list') {
    const questions = await redisGet('custom_trivia') || [];
    if (!questions.length) return replyEmbed(ctx, 'info', 'trivia_custom_empty', 0x1900ff, true);
    const userColor = (await db.getUser(ctx.userId))?.profileColor || 0x1900ff;
    const embed = new EmbedBuilder()
      .setTitle(await t(lang, 'trivia_custom_list'))
      .setColor(userColor)
      .setDescription(questions.map((q, i) => `**${i+1}.** ${q.q}\n→ \`${q.a}\``).join('\n\n'))
      .setFooter({ text: `${questions.length} ${await t(lang, 'questions')}` });
    ctx.reply({ embeds: [embed] });
    
  } else if (subcommand === 'play') {
    const today = new Date().toISOString().slice(0,10);
    const countKey = `trivia:custom:count:${ctx.userId}:${today}`;
    const count = parseInt(await redisGet(countKey) || '0');
    const isPremiumUser = await isPremium(ctx.userId);
    const limit = isPremiumUser ? 15 : 5;
    
    if (count >= limit) {
      return replyEmbed(ctx, 'limit_reached', 'trivia_custom_daily_limit', 0xED4245, true, [limit]);
    }
    
    const questions = await redisGet('custom_trivia') || [];
    if (!questions.length) return replyEmbed(ctx, 'info', 'trivia_custom_empty', 0x1900ff, true);
    
    const question = questions[Math.floor(Math.random() * questions.length)];
    const userColor = (await db.getUser(ctx.userId))?.profileColor || 0x1900ff;
    const embed = new EmbedBuilder()
      .setTitle(await t(lang, 'trivia_custom_title'))
      .setDescription(`**${question.q}**`)
      .setColor(userColor)
      .setFooter({ text: `${await t(lang, 'write_answer')} · 30s · ${count+1}/${limit} ${await t(lang, 'today')}` });
    
    await ctx.reply({ embeds: [embed] });
    
    const filter = m => m.author.id === ctx.userId && !m.author.bot;
    const collector = ctx.channel.createMessageCollector({ filter, time: 30000 });
    let answered = false;
    
    collector.on('collect', async (m) => {
      if (answered) return;
      const userAnswer = m.content.trim().toLowerCase();
      const correctAnswer = question.a.toLowerCase();
      
      if (userAnswer === correctAnswer) {
        answered = true;
        collector.stop('correct');
        
        await redisSet(countKey, count + 1);
        await fetch(`${REDIS_URL}/expire/${countKey}/86400`, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
        
        const eco = await db.getEconomy(ctx.userId) ?? { points: 0, totalEarned: 0 };
        const reward = 10;
        eco.points = (eco.points ?? 0) + reward;
        eco.totalEarned = (eco.totalEarned ?? 0) + reward;
        await db.saveEconomy(ctx.userId, eco);
        
        await m.reply(await t(lang, 'trivia_custom_correct', reward, eco.points));
      }
    });
    
    collector.on('end', (collected, reason) => {
      if (!answered) {
        ctx.channel.send(await t(lang, 'trivia_timeout', question.a)).catch(() => {});
      }
    });
    
  } else {
    replyEmbed(ctx, 'error', 'trivia_custom_usage', 0xED4245, true);
  }
}

module.exports = {
  cmdTrivia,
  cmdTriviaCustom
};
