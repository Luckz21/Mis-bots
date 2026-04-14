// commands/triviaCommands.js
const { EmbedBuilder } = require('discord.js');
const { db, redisGet, redisSet } = require('./utils/database');
const { isPremium, getGuildLang, checkAchievements } = require('./utils/helpers');
const { t } = require('./utils/translate');

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
  
  // Pre-traducir todos los textos
  const secondsText = await t(lang, 'seconds');
  const todayText = await t(lang, 'today');
  const writeAnswerText = await t(lang, 'write_answer');
  const categoryText = await t(lang, 'trivia_category', question.cat);
  const footerText = `${writeAnswerText} · 30 ${secondsText} · ${count + 1}/${limit} ${todayText}`;
  
  const embed = new EmbedBuilder()
    .setTitle(`${catEmoji[question.cat] ?? '🎲'} ${categoryText}`)
    .setDescription(`**${question.q}**`)
    .setColor(userColor)
    .setFooter({ text: footerText });

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
      
      // Preparar textos para el embed de respuesta
      const correctTitle = await t(lang, 'trivia_correct_title');
      const pointsText = await t(lang, 'points');
      const balanceText = await t(lang, 'balance');
      const questionsText = await t(lang, 'questions_today');
      
      const responseEmbed = new EmbedBuilder()
        .setTitle(correctTitle)
        .setColor(0x57F287)
        .setDescription(await t(lang, 'trivia_correct_desc', question.a, m.author.username, reward, eco.points))
        .addFields(
          { name: '🎁 ' + await t(lang, 'reward'), value: `+${reward} ${pointsText}`, inline: true },
          { name: '💰 ' + balanceText, value: `${eco.points} ${pointsText}`, inline: true },
          { name: '📊 ' + questionsText, value: `${count + 1}/${limit}`, inline: true }
        )
        .setFooter({ text: await t(lang, 'trivia_correct_footer') });
      
      await m.reply({ embeds: [responseEmbed] });
    }
  });

  collector.on('end', async (collected, reason) => {
    if (!answered) {
      const timeoutTitle = await t(lang, 'trivia_timeout_title');
      const timeoutDesc = await t(lang, 'trivia_timeout', question.a);
      const timeoutEmbed = new EmbedBuilder()
        .setTitle(timeoutTitle)
        .setColor(0xED4245)
        .setDescription(timeoutDesc);
      channel.send({ embeds: [timeoutEmbed] }).catch(() => {});
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
    return;
  }
  
  if (subcommand === 'list') {
    const questions = await redisGet('custom_trivia') || [];
    if (!questions.length) return replyEmbed(ctx, 'info', 'trivia_custom_empty', 0x1900ff, true);
    const userColor = (await db.getUser(ctx.userId))?.profileColor || 0x1900ff;
    const questionsText = await t(lang, 'questions');
    const embed = new EmbedBuilder()
      .setTitle(await t(lang, 'trivia_custom_list'))
      .setColor(userColor)
      .setDescription(questions.map((q, i) => `**${i+1}.** ${q.q}\n→ \`${q.a}\``).join('\n\n'))
      .setFooter({ text: `${questions.length} ${questionsText}` });
    ctx.reply({ embeds: [embed] });
    return;
  }
  
  if (subcommand === 'play') {
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
    const secondsText = await t(lang, 'seconds');
    const todayText = await t(lang, 'today');
    const writeAnswerText = await t(lang, 'write_answer');
    const footerText = `${writeAnswerText} · 30 ${secondsText} · ${count+1}/${limit} ${todayText}`;
    
    const embed = new EmbedBuilder()
      .setTitle(await t(lang, 'trivia_custom_title'))
      .setDescription(`**${question.q}**`)
      .setColor(userColor)
      .setFooter({ text: footerText });
    
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
        
        const pointsText = await t(lang, 'points');
        const balanceText = await t(lang, 'balance');
        const correctTitle = await t(lang, 'trivia_correct_title');
        
        const responseEmbed = new EmbedBuilder()
          .setTitle(correctTitle)
          .setColor(0x57F287)
          .setDescription(await t(lang, 'trivia_custom_correct_desc', reward, eco.points))
          .addFields(
            { name: '🎁 ' + await t(lang, 'reward'), value: `+${reward} ${pointsText}`, inline: true },
            { name: '💰 ' + balanceText, value: `${eco.points} ${pointsText}`, inline: true }
          );
        
        await m.reply({ embeds: [responseEmbed] });
      }
    });
    
    collector.on('end', async (collected, reason) => {
      if (!answered) {
        const timeoutTitle = await t(lang, 'trivia_timeout_title');
        const timeoutDesc = await t(lang, 'trivia_timeout', question.a);
        const timeoutEmbed = new EmbedBuilder()
          .setTitle(timeoutTitle)
          .setColor(0xED4245)
          .setDescription(timeoutDesc);
        ctx.channel.send({ embeds: [timeoutEmbed] }).catch(() => {});
      }
    });
    return;
  }
  
  replyEmbed(ctx, 'error', 'trivia_custom_usage', 0xED4245, true);
}

module.exports = {
  cmdTrivia,
  cmdTriviaCustom
};
