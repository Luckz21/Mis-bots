// commands/economy.js
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType
} = require('discord.js');

const { db, redisGet, redisSet, redisDel } = require('./utils/database');
const roblox = require('./utils/roblox');
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
  const eco    = await db.getEconomy(target.id) ?? { points: 0, totalEarned: 0, streak: 0 };
  const rank   = getRank(eco.points ?? 0);
  const bar    = rank.next ? `${progressBar(eco.points ?? 0, rank.next)} ${eco.points}/${rank.next}` : '💎 ' + (await t(lang, 'max_rank'));
  const userEntry = await db.getUser(ctx.userId);
  const userColor = userEntry?.profileColor || 0x1900ff;
  ctx.reply({ embeds: [new EmbedBuilder()
    .setTitle(await t(lang, 'points_of', target.username ?? ctx.username))
    .setColor(userColor)
    .addFields(
      { name: await t(lang, 'current_points'), value: `**${eco.points ?? 0}**`, inline: true },
      { name: await t(lang, 'total_earned'), value: `**${eco.totalEarned ?? 0}**`, inline: true },
      { name: await t(lang, 'current_streak'), value: `**${eco.streak ?? 0}** ${await t(lang, 'days')}`, inline: true },
      { name: rank.name, value: bar },
    ).setFooter({ text: await t(lang, 'earn_points_daily') })] });
}

async function cmdDaily(ctx) {
  const lang = await getGuildLang(ctx.guild?.id);
  const eco  = await db.getEconomy(ctx.userId) ?? { points: 0, lastDaily: null, totalEarned: 0, streak: 0, dailyClaims: 0 };
  const now  = new Date();
  const last = eco.lastDaily ? new Date(eco.lastDaily) : null;
  if (last && now - last < 86400000) {
    const next = new Date(last.getTime() + 86400000);
    const hrs  = Math.floor((next - now) / 3600000);
    const mins = Math.floor(((next - now) % 3600000) / 60000);
    return replyEmbed(ctx, 'daily_already_title', 'daily_wait', 0xED4245, false, [hrs, mins, eco.streak ?? 0]);
  }
  const isConsecutive = last && (now - last) < 48 * 3600000;
  eco.streak = isConsecutive ? (eco.streak ?? 0) + 1 : 1;
  const premium    = await isPremium(ctx.userId);
  const streakBonus = 1 + Math.min(eco.streak, 10) * 0.1;
  const base       = 50 + Math.floor(Math.random() * 50);
  const reward     = Math.floor(base * (premium ? 2 : 1) * streakBonus);
  eco.points       = (eco.points ?? 0) + reward;
  eco.lastDaily    = now.toISOString();
  eco.totalEarned  = (eco.totalEarned ?? 0) + reward;
  eco.dailyClaims  = (eco.dailyClaims ?? 0) + 1;
  await db.saveEconomy(ctx.userId, eco);
  const user    = await db.getUser(ctx.userId);
  const newAchs = await checkAchievements(ctx.userId, eco, user);
  const rank    = getRank(eco.points);
  const userColor = user?.profileColor || 0x1900ff;
  const embed   = new EmbedBuilder()
    .setTitle(await t(lang, 'daily_claimed'))
    .setColor(0x57F287)
    .addFields(
      { name: await t(lang, 'earned'), value: `**${reward} ${await t(lang, 'points')}**`, inline: true },
      { name: await t(lang, 'streak'), value: `**${eco.streak}** ${await t(lang, 'days')}`, inline: true },
      { name: await t(lang, 'total'), value: `**${eco.points}**`, inline: true },
    )
    .setFooter({ text: `${rank.name} · ${await t(lang, 'come_back_tomorrow')}` });
  if (premium) embed.addFields({ name: '⭐ Premium', value: await t(lang, 'premium_bonus_applied') });
  if (newAchs.length) embed.addFields({ name: await t(lang, 'new_achievements'), value: newAchs.map(a => `**${a.name}** — ${a.desc}`).join('\n') });
  const gifUrl = await getAnimeGif('smile');
  if (gifUrl) embed.setImage(gifUrl);
  ctx.reply({ embeds: [embed] });
}

// ──────────────────────────────────────────────────────────────
//  Logros
// ──────────────────────────────────────────────────────────────

async function cmdLogros(ctx, targetUser) {
  const lang = await getGuildLang(ctx.guild?.id);
  const target  = targetUser ?? { id: ctx.userId, username: ctx.username };
  const eco     = await db.getEconomy(target.id) ?? {};
  const achieved = eco.achievements ?? [];
  const userEntry = await db.getUser(ctx.userId);
  const userColor = userEntry?.profileColor || 0x1900ff;
  ctx.reply({ embeds: [new EmbedBuilder()
    .setTitle(await t(lang, 'achievements_of', target.username ?? ctx.username))
    .setColor(userColor)
    .setDescription(ACHIEVEMENTS.map(a =>
      `${achieved.includes(a.id) ? '✅' : '🔒'} **${a.name}**\n› _${a.desc}_`
    ).join('\n\n'))
    .setFooter({ text: `${achieved.length}/${ACHIEVEMENTS.length} ${await t(lang, 'unlocked')}` })] });
}

// ──────────────────────────────────────────────────────────────
//  Coinflip y Pay
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
  const winText = await t(lang, 'won');
  const loseText = await t(lang, 'lost');
  ctx.reply({ embeds: [new EmbedBuilder()
    .setTitle(win ? await t(lang, 'coinflip_win') : await t(lang, 'coinflip_lose'))
    .setColor(win ? 0x57F287 : 0xED4245)
    .setDescription(await t(lang, 'coinflip_result', bet, win ? winText : loseText, bet))
    .addFields({ name: await t(lang, 'current_balance'), value: `**${eco.points}** ${await t(lang, 'points')}` })] });
}

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
  replyEmbed(ctx, 'success', 'pay_success', 0x57F287, false, [amount, targetUser.username]);
}

// ──────────────────────────────────────────────────────────────
//  Robo
// ──────────────────────────────────────────────────────────────

async function cmdRob(ctx, targetUser) {
  const lang = await getGuildLang(ctx.guild?.id);
  if (!targetUser) return replyEmbed(ctx, 'error', 'mention_user', 0xED4245, true);
  if (targetUser.id === ctx.userId) return replyEmbed(ctx, 'error', 'rob_self', 0xED4245, true);
  if (targetUser.id === process.env.BOT_OWNER_ID) {
    if (ctx.userId === '752391528475000933') {
      return ctx.reply({ content: '¿Como se atreve un simple femboy a morder la mano su alfa? 🥵', ephemeral: true });
    }
    return replyEmbed(ctx, 'error', 'rob_owner_fail', 0xED4245, true);
  }
  if (ctx.userId === process.env.BOT_OWNER_ID) return replyEmbed(ctx, 'success', 'owner_no_rob', 0xFFD700, true);
  if (await isJailed(ctx.userId)) {
    const jailed = await redisGet(`jailed:${ctx.userId}`);
    const mins = Math.ceil((new Date(jailed.until) - new Date()) / 60000);
    return replyEmbed(ctx, 'jailed', 'rob_jailed', 0xED4245, true, [mins]);
  }
  if (await isJailed(targetUser.id)) {
    return replyEmbed(ctx, 'error', 'rob_protected', 0xED4245, true, [targetUser.username]);
  }
  const eco = await db.getEconomy(ctx.userId) ?? { points: 0, successfulRobs: 0, failedRobs: 0, totalStolen: 0, timesJailed: 0, bailPaidCount: 0 };
  const targetEco = await db.getEconomy(targetUser.id) ?? { points: 0 };
  if (targetEco.points < 50) return replyEmbed(ctx, 'error', 'rob_no_points', 0xED4245, true, [targetUser.username]);
  const isOwner = ctx.userId === process.env.BOT_OWNER_ID;
  const success = isOwner ? true : (Math.random() < 0.4);
  const maxRob = Math.min(200, Math.floor(targetEco.points * 0.2));
  const amount = Math.floor(Math.random() * maxRob) + 20;
  if (success) {
    targetEco.points -= amount;
    eco.points += amount;
    eco.successfulRobs = (eco.successfulRobs ?? 0) + 1;
    eco.totalStolen = (eco.totalStolen ?? 0) + amount;
    await Promise.all([db.saveEconomy(ctx.userId, eco), db.saveEconomy(targetUser.id, targetEco)]);
    const gifUrl = await getAnimeGif('kick');
    const embed = new EmbedBuilder()
      .setTitle(await t(lang, 'rob_success_title'))
      .setColor(0x57F287)
      .setDescription(await t(lang, 'rob_success', amount, targetUser.username));
    if (gifUrl) embed.setImage(gifUrl);
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
    const gifUrl = await getAnimeGif('cry');
    const embed = new EmbedBuilder()
      .setTitle(await t(lang, 'rob_fail_title'))
      .setColor(0xED4245)
      .setDescription(await t(lang, 'rob_fail_desc', fine, targetUser.username));
    if (gifUrl) embed.setImage(gifUrl);
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
//  Rankings
// ──────────────────────────────────────────────────────────────

async function cmdTopLocal(ctx) {
  const lang = await getGuildLang(ctx.guild?.id);
  const members = await ctx.guild.members.fetch();
  const ecoList = [];
  for (const [id] of members) {
    const eco = await db.getEconomy(id);
    if (eco?.points) ecoList.push({ id, username: members.get(id)?.user.username ?? id, points: eco.points });
  }
  ecoList.sort((a, b) => b.points - a.points);
  const top10 = ecoList.slice(0, 10);
  const userEntry = await db.getUser(ctx.userId);
  const userColor = userEntry?.profileColor || 0x1900ff;
  const pointsText = await t(lang, 'points');
  const noDataText = await t(lang, 'no_data');
  const description = top10.length 
    ? top10.map((u, i) => `**${i+1}.** ${u.username} — **${u.points}** ${pointsText}`).join('\n')
    : noDataText;
  const embed = new EmbedBuilder()
    .setTitle(await t(lang, 'lb_local_title'))
    .setColor(userColor)
    .setDescription(description);
  ctx.reply({ embeds: [embed] });
}

async function cmdTopGlobal(ctx) {
  const lang = await getGuildLang(ctx.guild?.id);
  const global = await redisGet('leaderboard_global') ?? [];
  global.sort((a, b) => b.points - a.points);
  const top10 = global.slice(0, 10);
  const userEntry = await db.getUser(ctx.userId);
  const userColor = userEntry?.profileColor || 0x1900ff;
  const pointsText = await t(lang, 'points');
  const noDataText = await t(lang, 'no_data');
  const description = top10.length 
    ? top10.map((u, i) => `**${i+1}.** ${u.username} — **${u.points}** ${pointsText}`).join('\n')
    : noDataText;
  const embed = new EmbedBuilder()
    .setTitle(await t(lang, 'lb_global_title'))
    .setColor(userColor)
    .setDescription(description);
  ctx.reply({ embeds: [embed] });
}

// ──────────────────────────────────────────────────────────────
//  Tienda
// ──────────────────────────────────────────────────────────────

async function cmdTienda(ctx) {
  const lang = await getGuildLang(ctx.guild?.id);
  const userEntry = await db.getUser(ctx.userId);
  const inventory = userEntry?.inventory ?? [];
  const isOwner = ctx.userId === process.env.BOT_OWNER_ID;
  const userColor = userEntry?.profileColor || 0x1900ff;
  const pointsText = await t(lang, 'points');
  const shopFooterText = await t(lang, 'shop_footer');
  const embed = new EmbedBuilder()
    .setTitle(await t(lang, 'shop_title'))
    .setColor(userColor)
    .setDescription(
      SHOP_ITEMS.map(item => {
        const owned = inventory.includes(item.id) || isOwner;
        const status = owned ? '✅' : '🔒';
        return `${status} **${item.name}** — \`${item.cost}\` ${pointsText}\nID: \`${item.id}\``;
      }).join('\n\n')
    )
    .setFooter({ text: shopFooterText });
  ctx.reply({ embeds: [embed] });
}

async function cmdComprar(ctx, itemId) {
  const lang = await getGuildLang(ctx.guild?.id);
  const item = SHOP_ITEMS.find(i => i.id === itemId);
  if (!item) return replyEmbed(ctx, 'error', 'shop_not_found', 0xED4245, true);
  const isOwner = ctx.userId === process.env.BOT_OWNER_ID;
  const eco = await db.getEconomy(ctx.userId) ?? { points: 0, shopPurchases: 0 };
  const profile = await db.getUser(ctx.userId) ?? {};
  if (!profile.inventory) profile.inventory = [];
  if (profile.inventory.includes(item.id)) return replyEmbed(ctx, 'error', 'shop_already_owned', 0xED4245, true);
  if (!isOwner) {
    if (eco.points < item.cost) return replyEmbed(ctx, 'error', 'shop_no_points', 0xED4245, true, [item.cost, eco.points]);
    eco.points -= item.cost;
    eco.shopPurchases = (eco.shopPurchases ?? 0) + 1;
  }
  profile.inventory.push(item.id);
  if (item.type === 'color') profile.profileColor = item.value;
  await db.saveUser(ctx.userId, profile);
  if (!isOwner) await db.saveEconomy(ctx.userId, eco);
  const user = await db.getUser(ctx.userId);
  await checkAchievements(ctx.userId, eco, user);
  const successMsg = isOwner 
    ? `👑 Como dueño, recibiste **${item.name}** gratis.`
    : await t(lang, 'shop_buy_success', item.name, item.cost);
  replyEmbed(ctx, 'success', 'shop_buy_success', 0x57F287, true, [item.name, item.cost]);
}

module.exports = {
  cmdPuntos,
  cmdDaily,
  cmdLogros,
  cmdCoinFlip,
  cmdPay,
  cmdRob,
  cmdTopLocal,
  cmdTopGlobal,
  cmdTienda,
  cmdComprar
};
