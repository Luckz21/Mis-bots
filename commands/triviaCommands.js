// commands/triviaCommands.js
const {
  EmbedBuilder
} = require('discord.js');

const { db, redisGet, redisSet } = require('./utils/database');
const { isPremium, getGuildLang, checkAchievements } = require('./utils/helpers');
const roblox = require('./utils/roblox');

// Importar el módulo original de preguntas de trivia
const {
  getRandomQuestion: _getRandomQ,
  checkAnswer: _checkAnswer,
  CATEGORIES: _TRIVIA_CATS,
  getQuestionByCategory
} = require('../trivia.js');

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

// ──────────────────────────────────────────────────────────────
//  Trivia normal (límite diario, 5 pts, categorías)
// ──────────────────────────────────────────────────────────────

async function cmdTrivia(ctx, category) {
  const lang = await getGuildLang(ctx.guild?.id);
  const channel = ctx.channel;
  if (!channel) return ctx.reply({ content: '❌ Este comando solo funciona en canales de texto.', ephemeral: true });

  const today = new Date().toISOString().slice(0,10);
  const countKey = `trivia:count:${ctx.userId}:${today}`;
  const count = parseInt(await redisGet(countKey) || '0');
  const isPremiumUser = await isPremium(ctx.userId);
  const limit = isPremiumUser ? 30 : 10;
  
  if (count >= limit) {
    return ctx.reply({ content: `❌ Has alcanzado el límite diario de trivia (${limit} preguntas). Vuelve mañana o hazte Premium para 30.`, ephemeral: true });
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
    .setTitle(`${catEmoji[question.cat] ?? '🎲'} Trivia — ${question.cat}`)
    .setDescription(`**${question.q}**`)
    .setColor(userColor)
    .setFooter({ text: `Escribe tu respuesta · 30 segundos · ${count + 1}/${limit} hoy` });

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
      
      await m.reply(`✅ ¡Correcto! La respuesta era **${question.a}**\n🎁 <@${m.author.id}> gana **+${reward} puntos**! Saldo: **${eco.points}**\n📊 ${count + 1}/${limit} preguntas hoy.`);
    }
  });

  collector.on('end', (collected, reason) => {
    if (!answered) {
      channel.send(`⏰ Tiempo agotado. La respuesta era **${question.a}**.`).catch(() => {});
    }
  });
}

// ──────────────────────────────────────────────────────────────
//  Trivia personalizada (add, list, play)
// ──────────────────────────────────────────────────────────────

async function cmdTriviaCustom(ctx, subcommand, ...args) {
  const isOwner = ctx.userId === process.env.BOT_OWNER_ID;
  
  if (subcommand === 'add' && isOwner) {
    const input = args.join(' ');
    const parts = input.split('|');
    if (parts.length < 2) return ctx.reply('❌ Formato: `/triviacustom add ¿Pregunta? | respuesta`');
    const question = parts[0].trim();
    const answer = parts[1].trim();
    if (!question || !answer) return ctx.reply('❌ Pregunta y respuesta requeridas.');
    
    const questions = await redisGet('custom_trivia') || [];
    questions.push({ q: question, a: answer, cat: 'Personalizada' });
    await redisSet('custom_trivia', questions);
    ctx.reply('✅ Pregunta personalizada añadida.');
    
  } else if (subcommand === 'list') {
    const questions = await redisGet('custom_trivia') || [];
    if (!questions.length) return ctx.reply('No hay preguntas personalizadas.');
    const userColor = (await db.getUser(ctx.userId))?.profileColor || 0x1900ff;
    const embed = new EmbedBuilder()
      .setTitle('📚 Preguntas Personalizadas')
      .setColor(userColor)
      .setDescription(questions.map((q, i) => `**${i+1}.** ${q.q}\n→ \`${q.a}\``).join('\n\n'))
      .setFooter({ text: `${questions.length} preguntas` });
    ctx.reply({ embeds: [embed] });
    
  } else if (subcommand === 'play') {
    const today = new Date().toISOString().slice(0,10);
    const countKey = `trivia:custom:count:${ctx.userId}:${today}`;
    const count = parseInt(await redisGet(countKey) || '0');
    const isPremiumUser = await isPremium(ctx.userId);
    const limit = isPremiumUser ? 15 : 5;
    
    if (count >= limit) {
      return ctx.reply(`❌ Límite diario alcanzado (${limit} preguntas).`);
    }
    
    const questions = await redisGet('custom_trivia') || [];
    if (!questions.length) return ctx.reply('No hay preguntas personalizadas aún.');
    
    const question = questions[Math.floor(Math.random() * questions.length)];
    const userColor = (await db.getUser(ctx.userId))?.profileColor || 0x1900ff;
    const embed = new EmbedBuilder()
      .setTitle('🎲 Trivia Personalizada')
      .setDescription(`**${question.q}**`)
      .setColor(userColor)
      .setFooter({ text: `Escribe tu respuesta · 30 segundos · ${count+1}/${limit} hoy` });
    
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
        
        await m.reply(`✅ ¡Correcto! +${reward} puntos. Saldo: **${eco.points}**`);
      }
    });
    
    collector.on('end', (collected, reason) => {
      if (!answered) {
        ctx.channel.send(`⏰ Tiempo agotado. La respuesta era: **${question.a}**`);
      }
    });
    
  } else {
    ctx.reply('❌ Subcomando no reconocido. Usa `add`, `list` o `play`.');
  }
}

module.exports = {
  cmdTrivia,
  cmdTriviaCustom
};
