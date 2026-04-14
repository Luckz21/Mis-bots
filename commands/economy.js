// commands/economy.js
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType
} = require('discord.js');

const { db, redisGet, redisSet, redisDel } = require('./utils/database');
const {
  isPremium,
  getGuildLang,
  getRank,
  progressBar,
  checkAchievements,
  isJailed,
  getAnimeGif
} = require('./utils/helpers');
const { t } = require('./utils/translate');
const { ACHIEVEMENTS, SHOP_ITEMS } = require('./utils/constants');

// Helper para respuestas rápidas con embed
async function replyEmbed(ctx, titleKey, descKey, color = 0x1900ff, ephemeral = false, args = []) {
  const lang = await getGuildLang(ctx.guild?.id);
  const title = await t(lang, titleKey, ...args);
  const description = await t(lang, descKey, ...args);
  const embed = new EmbedBuilder().setTitle(title).setDescription(description).setColor(color);
  return ctx.reply({ embeds: [embed], ephemeral });
}

// ──────────────────────────────────────────────────────────────
//  Puntos y Daily
// ──────────────────────────────────────────────────────────────

async function cmdPuntos(ctx, targetUser) {
  const lang = await getGuildLang(ctx.guild?.id);
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const eco = await db.getEconomy(target.id) ?? { points: 0, totalEarned: 0, streak: 0 };
  const rank = getRank(eco.points ?? 0);
  const bar = rank.next ? `${progressBar(eco.points ?? 0, rank.next)} ${eco.points}/${rank.next}` : '💎 ' + (await t(lang, 'max_rank'));
  const userEntry = await db.getUser(ctx.userId);
  const userColor = userEntry?.profileColor || 0x1900ff;
  ctx.reply({
    embeds: [new EmbedBuilder()
      .setTitle(await t(lang, 'points_of', target.username ?? ctx.username))
      .setColor(userColor)
      .addFields(
        { name: await t(lang, 'current_points'), value: `**${eco.points ?? 0}**`, inline: true },
        { name: await t(lang, 'total_earned'), value: `**${eco.totalEarned ?? 0}**`, inline: true },
        { name: await t(lang, 'current_streak'), value: `**${eco.streak ?? 0}** ${await t(lang, 'days')}`, inline: true },
        { name: rank.name, value: bar },
      ).setFooter({ text: await t(lang, 'earn_points_daily') })]
  });
}

async function cmdDaily(ctx) {
  const lang = await getGuildLang(ctx.guild?.id);
  const eco = await db.getEconomy(ctx.userId) ?? { points: 0, lastDaily: null, totalEarned: 0, streak: 0, dailyClaims: 0 };
  const now = new Date();
  const last = eco.lastDaily ? new Date(eco.lastDaily) : null;
  if (last && now - last < 86400000) {
    const next = new Date(last.getTime() + 86400000);
    const hrs = Math.floor((next - now) / 3600000);
    const mins = Math.floor(((next - now) % 3600000) / 60000);
    return replyEmbed(ctx, 'daily_already_title', 'daily_wait', 0xED4245, false, [hrs, mins, eco.streak ?? 0]);
  }
  const isConsecutive = last && (now - last) < 48 * 3600000;
  eco.streak = isConsecutive ? (eco.streak ?? 0) + 1 : 1;
  const premium = await isPremium(ctx.userId);
  const streakBonus = 1 + Math.min(eco.streak, 10) * 0.1;
  const base = 50 + Math.floor(Math.random() * 50);
  const reward = Math.floor(base * (premium ? 2 : 1) * streakBonus);
  eco.points = (eco.points ?? 0) + reward;
  eco.lastDaily = now.toISOString();
  eco.totalEarned = (eco.totalEarned ?? 0) + reward;
  eco.dailyClaims = (eco.dailyClaims ?? 0) + 1;
  await db.saveEconomy(ctx.userId, eco);
  const user = await db.getUser(ctx.userId);
  const newAchs = await checkAchievements(ctx.userId, eco, user);
  const rank = getRank(eco.points);
  const userColor = user?.profileColor || 0x1900ff;

  const embed = new EmbedBuilder()
    .setTitle(await t(lang, 'daily_claimed_embed_title'))
    .setColor(0x57F287)
    .setDescription(await t(lang, 'daily_claimed_embed_desc', reward, eco.streak, eco.points))
    .setFooter({ text: `${rank.name} · ${await t(lang, 'come_back_tomorrow')}` });

  if (premium) embed.addFields({ name: '⭐ Premium', value: await t(lang, 'daily_premium_bonus') });
  if (newAchs.length) embed.addFields({ name: await t(lang, 'new_achievements'), value: newAchs.map(a => `**${a.name}** — ${a.desc}`).join('\n') });

  const gifUrl = await getAnimeGif('smile');
  if (gifUrl) embed.setThumbnail(gifUrl);

  ctx.reply({ embeds: [embed] });
}

// ──────────────────────────────────────────────────────────────
//  Logros
// ──────────────────────────────────────────────────────────────

async function cmdLogros(ctx, targetUser) {
  const lang = await getGuildLang(ctx.guild?.id);
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const eco = await db.getEconomy(target.id) ?? {};
  const achieved = eco.achievements ?? [];
  const userEntry = await db.getUser(ctx.userId);
  const userColor = userEntry?.profileColor || 0x1900ff;
  ctx.reply({
    embeds: [new EmbedBuilder()
      .setTitle(await t(lang, 'achievements_of', target.username ?? ctx.username))
      .setColor(userColor)
      .setDescription(ACHIEVEMENTS.map(a =>
        `${achieved.includes(a.id) ? '✅' : '🔒'} **${a.name}**\n› _${a.desc}_`
      ).join('\n\n'))
      .setFooter({ text: `${achieved.length}/${ACHIEVEMENTS.length} ${await t(lang, 'unlocked')}` })]
  });
}

// ──────────────────────────────────────────────────────────────
//  Coinflip (mejorado con GIF)
// ──────────────────────────────────────────────────────────────

async function cmdCoinFlip(ctx, betStr) {
  const lang = await getGuildLang(ctx.guild?.id);
  const eco = await db.getEconomy(ctx.userId) ?? { points: 0 };
  const bet = parseInt(betStr);
  if (!bet || bet < 10 || bet > (eco.points ?? 0))
    return replyEmbed(ctx, 'invalid_bet', 'coinflip_bet_range', 0xED4245, false, [eco.points ?? 0]);
  const win = Math.random() > 0.5;
  eco.points = (eco.points ?? 0) + (win ? bet : -bet);
  eco.totalEarned = win ? (eco.totalEarned ?? 0) + bet : eco.totalEarned;
  await db.saveEconomy(ctx.userId, eco);
  const userEntry = await db.getUser(ctx.userId);
  const userColor = userEntry?.profileColor || 0x1900ff;
  const title = win ? await t(lang, 'coinflip_title_win') : await t(lang, 'coinflip_title_lose');
  const description = win
    ? await t(lang, 'coinflip_desc_win', bet, bet)
    : await t(lang, 'coinflip_desc_lose', bet, bet);
  const balanceText = await t(lang, 'coinflip_balance');
  const footerText = win ? await t(lang, 'coinflip_footer_win') : await t(lang, 'coinflip_footer_lose');
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(win ? 0x57F287 : 0xED4245)
    .addFields({ name: balanceText, value: `**${eco.points}** ${await t(lang, 'points')}`, inline: false })
    .setFooter({ text: footerText })
    .setTimestamp();
  const gifUrl = await getAnimeGif(win ? 'smile' : 'cry');
  if (gifUrl) embed.setThumbnail(gifUrl);
  ctx.reply({ embeds: [embed] });
}

// ──────────────────────────────────────────────────────────────
//  Pay (mejorado con embed y GIF)
// ──────────────────────────────────────────────────────────────

async function cmdPay(ctx, targetUser, amountStr) {
  const lang = await getGuildLang(ctx.guild?.id);
  if (!targetUser) return replyEmbed(ctx, 'error', 'mention_user', 0xED4245, true);
  if (targetUser.id === ctx.userId) return replyEmbed(ctx, 'error', 'pay_self', 0xED4245, true);
  const amount = parseInt(amountStr);
  const eco = await db.getEconomy(ctx.userId) ?? { points: 0 };
  if (!amount || amount < 1 || amount > (eco.points ?? 0))
    return replyEmbed(ctx, 'error', 'pay_insufficient', 0xED4245, true, [eco.points ?? 0]);
  const targetEco = await db.getEconomy(targetUser.id) ?? { points: 0 };
  eco.points -= amount;
  targetEco.points = (targetEco.points ?? 0) + amount;
  await Promise.all([db.saveEconomy(ctx.userId, eco), db.saveEconomy(targetUser.id, targetEco)]);
  const embed = new EmbedBuilder()
    .setTitle(await t(lang, 'pay_success_embed_title'))
    .setColor(0x57F287)
    .setDescription(await t(lang, 'pay_success_embed_desc', amount, targetUser.username))
    .addFields({ name: await t(lang, 'current_balance'), value: `**${eco.points}** ${await t(lang, 'points')}` })
    .setFooter({ text: await t(lang, 'pay_success_footer') });
  const gifUrl = await getAnimeGif('wave');
  if (gifUrl) embed.setThumbnail(gifUrl);
  ctx.reply({ embeds: [embed] });
}

// ──────────────────────────────────────────────────────────────
//  Robo (con dueño puede elegir cantidad)
// ──────────────────────────────────────────────────────────────

async function cmdRob(ctx, targetUser, customAmount = null) {
  const lang = await getGuildLang(ctx.guild?.id);
  const isOwner = ctx.userId === process.env.BOT_OWNER_ID;

  if (!targetUser) return replyEmbed(ctx, 'error', 'mention_user', 0xED4245, true);
  if (targetUser.id === ctx.userId) return replyEmbed(ctx, 'error', 'rob_self', 0xED4245, true);
  if (targetUser.id === process.env.BOT_OWNER_ID && !isOwner) {
    return replyEmbed(ctx, 'error', 'rob_owner_fail', 0xED4245, true);
  }
  if (!isOwner && await isJailed(ctx.userId)) {
    const jailed = await redisGet(`jailed:${ctx.userId}`);
    const mins = Math.ceil((new Date(jailed.until) - new Date()) / 60000);
    return replyEmbed(ctx, 'jailed', 'rob_jailed', 0xED4245, true, [mins]);
  }
  if (!isOwner && await isJailed(targetUser.id)) {
    return replyEmbed(ctx, 'error', 'rob_protected', 0xED4245, true, [targetUser.username]);
  }

  const eco = await db.getEconomy(ctx.userId) ?? { points: 0, successfulRobs: 0, failedRobs: 0, totalStolen: 0, timesJailed: 0, bailPaidCount: 0 };
  const targetEco = await db.getEconomy(targetUser.id) ?? { points: 0 };
  if (targetEco.points < 50) return replyEmbed(ctx, 'error', 'rob_no_points', 0xED4245, true, [targetUser.username]);

  let amount;
  if (isOwner && customAmount !== null) {
    amount = Math.min(customAmount, targetEco.points);
  } else {
    const maxRob = Math.min(200, Math.floor(targetEco.points * 0.2));
    amount = Math.floor(Math.random() * maxRob) + 20;
  }
  const success = isOwner ? true : (Math.random() < 0.4);

  if (success) {
    targetEco.points -= amount;
    eco.points += amount;
    eco.successfulRobs = (eco.successfulRobs ?? 0) + 1;
    eco.totalStolen = (eco.totalStolen ?? 0) + amount;
    await Promise.all([db.saveEconomy(ctx.userId, eco), db.saveEconomy(targetUser.id, targetEco)]);

    const embed = new EmbedBuilder()
      .setTitle(await t(lang, 'rob_success_embed_title'))
      .setColor(0x57F287)
      .setDescription(isOwner
        ? await t(lang, 'owner_rob_success', amount, targetUser.username)
        : await t(lang, 'rob_success_embed_desc', amount, targetUser.username))
      .addFields({ name: await t(lang, 'current_balance'), value: `**${eco.points}** ${await t(lang, 'points')}` });
    const gifUrl = await getAnimeGif('kick');
    if (gifUrl) embed.setThumbnail(gifUrl);
    await ctx.reply({ embeds: [embed] });

    const user = await db.getUser(ctx.userId);
    await checkAchievements(ctx.userId, eco, user);
  } else {
    const fine = Math.min(100, eco.points);
    eco.points -= fine;
    eco.failedRobs = (eco.failedRobs ?? 0) + 1;
    await db.saveEconomy(ctx.userId, eco);
    const until = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    eco.timesJailed = (eco.timesJailed ?? 0) + 1;
    await db.saveEconomy(ctx.userId, eco);
    await redisSet(`jailed:${ctx.userId}`, { until, reason: 'robo_fallido' });

    const embed = new EmbedBuilder()
      .setTitle(await t(lang, 'rob_fail_embed_title'))
      .setColor(0xED4245)
      .setDescription(await t(lang, 'rob_fail_embed_desc', fine, targetUser.username) + '\n\n' + await t(lang, 'rob_jail_offer_bail'));
    const gifUrl = await getAnimeGif('cry');
    if (gifUrl) embed.setThumbnail(gifUrl);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('pay_bail').setLabel('💰 ' + (await t(lang, 'pay_bail')) + ' (200)').setStyle(ButtonStyle.Primary),
    );
    const msg = await ctx.replyAndFetch({ embeds: [embed], components: [row] });
    if (!msg) return;

    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 3600000 });
    collector.on('collect', async (i) => {
      if (i.user.id !== ctx.userId) return i.reply({ content: await t(lang, 'only_author'), ephemeral: true });
      const userEco = await db.getEconomy(ctx.userId) ?? { points: 0, bailPaidCount: 0 };
      if (userEco.points < 200) {
        return i.reply({ content: await t(lang, 'bail_insufficient', userEco.points), ephemeral: true });
      }
      userEco.points -= 200;
      userEco.bailPaidCount = (userEco.bailPaidCount ?? 0) + 1;
      await db.saveEconomy(ctx.userId, userEco);
      await redisDel(`jailed:${ctx.userId}`);
      const user = await db.getUser(ctx.userId);
      await checkAchievements(ctx.userId, userEco, user);
      await i.update({ embeds: [embed.setFooter({ text: await t(lang, 'bail_paid') }).setColor(0x57F287)], components: [] });
      collector.stop();
    });
    collector.on('end', () => msg.edit({ components: [] }).catch(() => {}));
    const user = await db.getUser(ctx.userId);
    await checkAchievements(ctx.userId, eco, user);
  }
}

// ──────────────────────────────────────────────────────────────
//  Fianza (nuevo comando para admin/owner)
// ──────────────────────────────────────────────────────────────

async function cmdFianza(ctx, targetUser) {
  const lang = await getGuildLang(ctx.guild?.id);
  const isOwner = ctx.userId === process.env.BOT_OWNER_ID;
  const isAdmin = ctx.guild?.members.cache.get(ctx.userId)?.permissions.has('Administrator');
  if (!isOwner && !isAdmin) {
    return replyEmbed(ctx, 'error', 'need_admin', 0xED4245, true);
  }
  if (!targetUser) return replyEmbed(ctx, 'error', 'mention_user', 0xED4245, true);
  const isUserJailed = await isJailed(targetUser.id);
  if (!isUserJailed) return replyEmbed(ctx, 'error', 'bail_not_jailed', 0xED4245, true);

  const payerEco = await db.getEconomy(ctx.userId) ?? { points: 0 };
  if (payerEco.points < 200) {
    return replyEmbed(ctx, 'error', 'bail_insufficient_funds', 0xED4245, true);
  }
  payerEco.points -= 200;
  await db.saveEconomy(ctx.userId, payerEco);
  await redisDel(`jailed:${targetUser.id}`);

  const embed = new EmbedBuilder()
    .setTitle(await t(lang, 'bail_command_title'))
    .setColor(0x57F287)
    .setDescription(await t(lang, 'bail_success', targetUser.username, ctx.username));
  ctx.reply({ embeds: [embed] });
}

// ──────────────────────────────────────────────────────────────
//  Rankings, Tienda, Comprar (se mantienen con ligeros ajustes)
// ──────────────────────────────────────────────────────────────

// ... (mantén cmdTopLocal, cmdTopGlobal, cmdTienda, cmdComprar como antes)

module.exports = {
  cmdPuntos,
  cmdDaily,
  cmdLogros,
  cmdCoinFlip,
  cmdPay,
  cmdRob,
  cmdFianza,
  cmdTopLocal,
  cmdTopGlobal,
  cmdTienda,
  cmdComprar
};
