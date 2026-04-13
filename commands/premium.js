// commands/premium.js
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType
} = require('discord.js');

const { db } = require('./utils/database');
const roblox = require('./utils/roblox');
const {
  isPremium,
  getGuildLang,
  getRank,
  progressBar,
  premiumEmbed,
  checkAchievements
} = require('./utils/helpers');
const { t } = require('./utils/translate');
const { ACHIEVEMENTS } = require('./utils/constants');

// Helper para respuestas rápidas con embed
async function replyEmbed(ctx, titleKey, descKey, color = 0x1900ff, ephemeral = false, args = []) {
  const lang = await getGuildLang(ctx.guild?.id);
  const title = await t(lang, titleKey, ...args);
  const description = await t(lang, descKey, ...args);
  const embed = new EmbedBuilder().setTitle(title).setDescription(description).setColor(color);
  return ctx.reply({ embeds: [embed], ephemeral });
}

// ──────────────────────────────────────────────────────────────
//  Estado Premium
// ──────────────────────────────────────────────────────────────

async function cmdPremiumStatus(ctx) {
  const lang = await getGuildLang(ctx.guild?.id);
  const [premium, active] = await Promise.all([db.getPremium(ctx.userId), isPremium(ctx.userId)]);
  const userEntry = await db.getUser(ctx.userId);
  const userColor = userEntry?.profileColor || 0x1900ff;
  const embed = new EmbedBuilder().setColor(userColor);
  
  if (active) {
    let expText = '';
    let bar = '';
    if (premium?.expiresAt) {
      const now = Date.now();
      const exp = new Date(premium.expiresAt).getTime();
      const totalDuration = premium.durationDays ? premium.durationDays * 86400000 : 30 * 86400000;
      const percentLeft = Math.max(0, Math.min(1, (exp - now) / totalDuration));
      const filled = Math.round(percentLeft * 10);
      bar = '🟩'.repeat(filled) + '⬛'.repeat(10 - filled);
      const daysLeft = Math.ceil((exp - now) / 86400000);
      const expDateStr = new Date(premium.expiresAt).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
      expText = (await t(lang, 'premium_expires', expDateStr)) + `\n${bar} ${daysLeft} ${await t(lang, 'days_remaining')}`;
    } else {
      expText = await t(lang, 'premium_permanent');
    }
    embed.setTitle(await t(lang, 'premium_active_title'))
      .setColor(0xFFD700)
      .setDescription(`\`\`\`\n╔══════════════════╗\n║  ⭐ PREMIUM ⭐   ║\n╚══════════════════╝\`\`\`\n**${expText}**\n\n${await t(lang, 'premium_features')}`);
  } else {
    embed.setTitle(await t(lang, 'premium_inactive_title'))
      .setDescription(
        `\`\`\`\n╔══════════════════╗\n║   PREMIUM PLAN   ║\n╚══════════════════╝\`\`\`\n` +
        `${await t(lang, 'premium_features_list')}\n\n` +
        `${await t(lang, 'premium_plans')}\n` +
        `${await t(lang, 'premium_buy_cta')}`
      );
  }
  ctx.reply({ embeds: [embed] });
}

// ──────────────────────────────────────────────────────────────
//  Flex - Tarjeta de perfil exclusiva
// ──────────────────────────────────────────────────────────────

async function cmdFlex(ctx) {
  const lang = await getGuildLang(ctx.guild?.id);
  const entry = await db.getUser(ctx.userId);
  if (!entry) return replyEmbed(ctx, 'error', 'no_linked_account', 0xED4245, true);
  
  const [profile, avatarFull, friends, followers, groups, badges, presence, eco, bgUrl] = await Promise.all([
    roblox.getProfile(entry.robloxId), roblox.getAvatarFull(entry.robloxId),
    roblox.getFriendCount(entry.robloxId), roblox.getFollowerCount(entry.robloxId),
    roblox.getGroups(entry.robloxId), roblox.getBadges(entry.robloxId),
    roblox.getPresence(entry.robloxId), db.getEconomy(ctx.userId),
    db.getFlexBg(ctx.userId),
  ]);
  
  const { label } = roblox.formatPresence(presence?.userPresenceType ?? 0);
  const age  = Math.floor((Date.now() - new Date(profile.created)) / 86400000);
  const rank = getRank(eco?.points ?? 0);
  const achList = (eco?.achievements ?? []).map(id => ACHIEVEMENTS.find(a => a.id === id)?.name ?? '').filter(Boolean);
  const userColor = entry.profileColor || 0x1900ff;
  const isUserPremium = await isPremium(ctx.userId);
  
  const title = await t(lang, 'flex_title', profile.displayName);
  const desc = await t(lang, 'flex_description', profile.description?.slice(0, 120) || (await t(lang, 'no_description')));
  
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(desc)
    .setColor(userColor).setImage(avatarFull)
    .addFields(
      { name: await t(lang, 'status'), value: label, inline: true },
      { name: await t(lang, 'profile_age_days'), value: `${age}`, inline: true },
      { name: rank.name, value: `${eco?.points ?? 0} pts`, inline: true },
      { name: await t(lang, 'profile_friends'), value: `**${friends}**`, inline: true },
      { name: await t(lang, 'profile_followers'), value: `**${followers}**`, inline: true },
      { name: await t(lang, 'profile_groups'), value: `**${groups.length}**`, inline: true },
      { name: await t(lang, 'profile_badges'), value: `**${badges.length}+**`, inline: true },
      { name: '⭐ Premium', value: isUserPremium ? await t(lang, 'active_yes') : await t(lang, 'active_no'), inline: true },
      { name: '\u200B', value: '\u200B', inline: true },
    )
    .setURL(`https://www.roblox.com/users/${entry.robloxId}/profile`)
    .setFooter({ text: `⭐ ${await t(lang, 'premium_user')} · ${new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}` })
    .setTimestamp();
  
  if (bgUrl) embed.setImage(bgUrl).setThumbnail(avatarFull);
  if (achList.length) embed.addFields({ name: await t(lang, 'achievements'), value: achList.join(' ') });
  if (rank.next) embed.addFields({ name: await t(lang, 'rank_progress'), value: `${progressBar(eco?.points ?? 0, rank.next)} ${eco?.points ?? 0}/${rank.next}` });
  
  ctx.reply({ embeds: [embed] });
}

// ──────────────────────────────────────────────────────────────
//  Historial de juegos
// ──────────────────────────────────────────────────────────────

async function cmdHistorial(ctx) {
  const lang = await getGuildLang(ctx.guild?.id);
  if (!await isPremium(ctx.userId)) return premiumEmbed(ctx);
  const entry = await db.getUser(ctx.userId);
  if (!entry) return replyEmbed(ctx, 'error', 'no_linked_account', 0xED4245, true);
  const history = await db.getHistory(ctx.userId) ?? [];
  if (!history.length) return replyEmbed(ctx, 'history_title', 'history_empty', 0x1900ff, false, [entry.robloxUsername]);
  
  const userColor = entry.profileColor || 0x1900ff;
  const embed = new EmbedBuilder()
    .setTitle(await t(lang, 'history_title', entry.robloxUsername))
    .setDescription(history.map((h, i) => {
      const date = new Date(h.playedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      return `**${i + 1}.** [${h.gameName}](https://www.roblox.com/games/${h.placeId})\n› ${date}`;
    }).join('\n\n'))
    .setColor(userColor)
    .setFooter({ text: `${history.length}/20 ${await t(lang, 'registered')} · ${await t(lang, 'updates_with_estado')}` }).setTimestamp();
  
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('clear_history').setLabel('🗑️ ' + (await t(lang, 'clear_history'))).setStyle(ButtonStyle.Danger),
  );
  const msg = await ctx.replyAndFetch({ embeds: [embed], components: [row] });
  if (!msg) return;
  const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30000 });
  collector.on('collect', async (i) => {
    if (i.user.id !== ctx.userId) return i.reply({ content: await t(lang, 'only_author'), ephemeral: true });
    await db.deleteHistory(ctx.userId);
    await i.update({ embeds: [new EmbedBuilder().setTitle(await t(lang, 'history_cleared')).setColor(0xED4245).setDescription(await t(lang, 'history_cleared_desc'))], components: [] });
  });
  collector.on('end', () => msg.edit({ components: [] }).catch(() => {}));
}

// ──────────────────────────────────────────────────────────────
//  Comparar dos cuentas
// ──────────────────────────────────────────────────────────────

async function cmdComparar(ctx, targetUser1, targetUser2) {
  const lang = await getGuildLang(ctx.guild?.id);
  if (!await isPremium(ctx.userId)) return premiumEmbed(ctx);
  if (!targetUser1 || !targetUser2) return replyEmbed(ctx, 'error', 'mention_two_users', 0xED4245, true);
  
  const [e1, e2] = await Promise.all([db.getUser(targetUser1.id), db.getUser(targetUser2.id)]);
  if (!e1) return replyEmbed(ctx, 'error', 'no_account', 0xED4245, true, [targetUser1.username]);
  if (!e2) return replyEmbed(ctx, 'error', 'no_account', 0xED4245, true, [targetUser2.username]);
  
  const [p1, fr1, fo1, g1, p2, fr2, fo2, g2, av1] = await Promise.all([
    roblox.getProfile(e1.robloxId), roblox.getFriendCount(e1.robloxId), roblox.getFollowerCount(e1.robloxId), roblox.getGroups(e1.robloxId),
    roblox.getProfile(e2.robloxId), roblox.getFriendCount(e2.robloxId), roblox.getFollowerCount(e2.robloxId), roblox.getGroups(e2.robloxId),
    roblox.getAvatar(e1.robloxId),
  ]);
  
  const gIds1  = new Set(g1.map(g => g.group.id));
  const common = g2.filter(g => gIds1.has(g.group.id));
  const age1   = Math.floor((Date.now() - new Date(p1.created)) / 86400000);
  const age2   = Math.floor((Date.now() - new Date(p2.created)) / 86400000);
  const w = (a, b) => a > b ? '🏆' : a < b ? '💀' : '🤝';
  const userColor = e1.profileColor || 0x1900ff;
  
  const embed = new EmbedBuilder()
    .setTitle(await t(lang, 'compare_title', p1.name, p2.name))
    .setColor(userColor).setThumbnail(av1)
    .setDescription(await t(lang, 'common_groups', common.length) + (common.length ? ` (${common.slice(0,3).map(g=>g.group.name).join(', ')})` : ''))
    .addFields(
      { name: `👤 ${p1.name}`, value: '\u200B', inline: true }, { name: '⚔️', value: '\u200B', inline: true }, { name: `👤 ${p2.name}`, value: '\u200B', inline: true },
      { name: `${w(fr1,fr2)} ${fr1}`, value: '\u200B', inline: true }, { name: await t(lang, 'friends'), value: '\u200B', inline: true }, { name: `${w(fr2,fr1)} ${fr2}`, value: '\u200B', inline: true },
      { name: `${w(fo1,fo2)} ${fo1}`, value: '\u200B', inline: true }, { name: await t(lang, 'followers'), value: '\u200B', inline: true }, { name: `${w(fo2,fo1)} ${fo2}`, value: '\u200B', inline: true },
      { name: `${w(g1.length,g2.length)} ${g1.length}`, value: '\u200B', inline: true }, { name: await t(lang, 'groups'), value: '\u200B', inline: true }, { name: `${w(g2.length,g1.length)} ${g2.length}`, value: '\u200B', inline: true },
      { name: `${w(age1,age2)} ${age1}d`, value: '\u200B', inline: true }, { name: await t(lang, 'days'), value: '\u200B', inline: true }, { name: `${w(age2,age1)} ${age2}d`, value: '\u200B', inline: true },
    )
    .setFooter({ text: await t(lang, 'compare_footer') });
  
  ctx.reply({ embeds: [embed] });
}

// ──────────────────────────────────────────────────────────────
//  Estadísticas de juego (MiStats)
// ──────────────────────────────────────────────────────────────

async function cmdMiStats(ctx) {
  const lang = await getGuildLang(ctx.guild?.id);
  if (!await isPremium(ctx.userId)) return premiumEmbed(ctx);
  const entry = await db.getUser(ctx.userId);
  if (!entry) return replyEmbed(ctx, 'error', 'no_linked_account', 0xED4245, true);
  const stats = await db.getGameStats(ctx.userId) ?? { games: {} };
  const games = Object.entries(stats.games).sort((a, b) => b[1].count - a[1].count).slice(0, 10);
  if (!games.length) return replyEmbed(ctx, 'mistats_title', 'mistats_empty', 0x1900ff, false, [entry.robloxUsername]);
  const userColor = entry.profileColor || 0x1900ff;
  const embed = new EmbedBuilder()
    .setTitle(await t(lang, 'mistats_title', entry.robloxUsername))
    .setColor(userColor)
    .setDescription(games.map(([name, data], i) => `**${i+1}.** ${name} — **${data.count}** ${await t(lang, 'sessions')}`).join('\n'))
    .setFooter({ text: await t(lang, 'based_on_estado') });
  ctx.reply({ embeds: [embed] });
}

// ──────────────────────────────────────────────────────────────
//  Añadir cuenta alt
// ──────────────────────────────────────────────────────────────

async function cmdAddAlt(ctx, username) {
  const lang = await getGuildLang(ctx.guild?.id);
  if (!await isPremium(ctx.userId)) return premiumEmbed(ctx);
  const clean = require('../security').sanitizeUsername(username);
  if (!clean) return replyEmbed(ctx, 'error', 'invalid_username', 0xED4245, true);
  const robloxUser = await roblox.getUserByName(clean);
  if (!robloxUser) return replyEmbed(ctx, 'error', 'verify_not_found', 0xED4245, true);
  const alts = await db.getAlts(ctx.userId) ?? [];
  if (alts.length >= 3) return replyEmbed(ctx, 'error', 'max_alts_reached', 0xED4245, true);
  if (alts.find(a => a.id === robloxUser.id)) return replyEmbed(ctx, 'error', 'alt_already_linked', 0xED4245, true);
  const main = await db.getUser(ctx.userId);
  if (main?.robloxId === robloxUser.id) return replyEmbed(ctx, 'error', 'alt_is_main', 0xED4245, true);
  alts.push({ id: robloxUser.id, name: robloxUser.name, displayName: robloxUser.displayName });
  await db.saveAlts(ctx.userId, alts);
  ctx.reply({ embeds: [new EmbedBuilder().setTitle(await t(lang, 'addalt_success')).setColor(0x57F287).setDescription(`**${robloxUser.displayName}** (@${robloxUser.name})`)] });
}

// ──────────────────────────────────────────────────────────────
//  Ver alts vinculadas
// ──────────────────────────────────────────────────────────────

async function cmdAlts(ctx) {
  const lang = await getGuildLang(ctx.guild?.id);
  if (!await isPremium(ctx.userId)) return premiumEmbed(ctx);
  const alts = await db.getAlts(ctx.userId) ?? [];
  if (!alts.length) return replyEmbed(ctx, 'alts_title', 'alts_empty', 0x1900ff, true);
  const userEntry = await db.getUser(ctx.userId);
  const userColor = userEntry?.profileColor || 0x1900ff;
  const embed = new EmbedBuilder()
    .setTitle(await t(lang, 'alts_title'))
    .setColor(userColor)
    .setDescription(alts.map((a, i) => `**${i+1}.** [${a.displayName}](https://www.roblox.com/users/${a.id}/profile) (@${a.name})`).join('\n'));
  ctx.reply({ embeds: [embed] });
}

// ──────────────────────────────────────────────────────────────
//  Fondo personalizado para /flex
// ──────────────────────────────────────────────────────────────

async function cmdSetFlexBg(ctx, url) {
  const lang = await getGuildLang(ctx.guild?.id);
  if (!await isPremium(ctx.userId)) return premiumEmbed(ctx);
  if (!url || !url.match(/^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i))
    return replyEmbed(ctx, 'error', 'setflexbg_invalid_url', 0xED4245, true);
  await db.saveFlexBg(ctx.userId, url);
  replyEmbed(ctx, 'success', 'setflexbg_success', 0x57F287, true);
}

// ──────────────────────────────────────────────────────────────
//  Compra Premium con PayPal
// ──────────────────────────────────────────────────────────────

async function cmdBuyPremium(ctx) {
  const lang = await getGuildLang(ctx.guild?.id);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('buy_7d').setLabel('⭐ 7 días - $1.99').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('buy_30d').setLabel('💎 30 días - $4.99').setStyle(ButtonStyle.Danger),
  );

  const userEntry = await db.getUser(ctx.userId);
  const userColor = userEntry?.profileColor || 0x1900ff;
  const embed = new EmbedBuilder()
    .setTitle(await t(lang, 'buy_title'))
    .setColor(userColor)
    .setDescription(await t(lang, 'buy_description'));

  const msg = await ctx.replyAndFetch({ embeds: [embed], components: [row] });
  if (!msg) return;

  const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });
  collector.on('collect', async (i) => {
    if (i.user.id !== ctx.userId) return i.reply({ content: await t(lang, 'only_author'), ephemeral: true });

    let amount, itemName;
    if (i.customId === 'buy_7d') { amount = '1.99'; itemName = 'Premium 7 días'; }
    else { amount = '4.99'; itemName = 'Premium 30 días'; }

    const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : 'http://localhost:8080';
    const paypalUrl = `https://www.paypal.com/cgi-bin/webscr?` +
      `cmd=_xclick&business=${encodeURIComponent(process.env.PAYPAL_EMAIL)}` +
      `&item_name=${encodeURIComponent(itemName)}` +
      `&amount=${amount}` +
      `&currency_code=USD` +
      `&custom=${ctx.userId}` +
      `&notify_url=${encodeURIComponent(`${baseUrl}/paypal-webhook`)}` +
      `&return=${encodeURIComponent('https://discord.com/channels/@me')}` +
      `&cancel_return=${encodeURIComponent('https://discord.com/channels/@me')}`;

    const newEmbed = new EmbedBuilder()
      .setTitle(await t(lang, 'buy_paypal_title', itemName))
      .setColor(0x009CDE)
      .setDescription(await t(lang, 'buy_paypal_description', amount))
      .setFooter({ text: await t(lang, 'buy_paypal_footer') });

    const linkRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel('💳 ' + (await t(lang, 'pay_with_paypal'))).setStyle(ButtonStyle.Link).setURL(paypalUrl)
    );

    await i.update({ embeds: [newEmbed], components: [linkRow] });
  });

  collector.on('end', () => msg.edit({ components: [] }).catch(() => {}));
}

module.exports = {
  cmdPremiumStatus,
  cmdFlex,
  cmdHistorial,
  cmdComparar,
  cmdMiStats,
  cmdAddAlt,
  cmdAlts,
  cmdSetFlexBg,
  cmdBuyPremium
};
