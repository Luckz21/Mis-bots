// commands/profile.js
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType
} = require('discord.js');

const { sanitizeUsername } = require('../security');
const { db, redisGet, redisSet } = require('./utils/database');
const roblox = require('./utils/roblox');
const {
  isPremium,
  getGuildLang,
  getRank,
  progressBar,
  paginate,
  filterAlertsByResetPeriod,
  recordGameHistory
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
//  Perfil principal (dashboard)
// ──────────────────────────────────────────────────────────────

async function cmdPerfil(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const lang   = await getGuildLang(ctx.guild?.id);
  const entry  = await db.getUser(target.id);
  if (!entry) return replyEmbed(ctx, 'error', 'no_account', 0xED4245, true, [target.username ?? ctx.username]);
  if (target.id !== ctx.userId && !entry.privacyProfile) return replyEmbed(ctx, 'error', 'profile_private', 0xED4245, true);

  const [profile, avatarUrl, friends, followers, following, groups, badges] = await Promise.all([
    roblox.getProfile(entry.robloxId), roblox.getAvatar(entry.robloxId),
    roblox.getFriendCount(entry.robloxId), roblox.getFollowerCount(entry.robloxId),
    roblox.getFollowingCount(entry.robloxId), roblox.getGroups(entry.robloxId),
    roblox.getBadges(entry.robloxId),
  ]);
  if (!profile) return replyEmbed(ctx, 'error', 'error_generic', 0xED4245, true);

  const [hasPremiumRoblox, hasGold, eco, premiumData] = await Promise.all([
    roblox.isPremiumRoblox(entry.robloxId), isPremium(target.id), db.getEconomy(target.id), db.getPremium(target.id),
  ]);

  const age       = Math.floor((Date.now() - new Date(profile.created)) / 86400000);
  const rank      = getRank(eco?.points ?? 0);
  const topGroups = groups.slice(0, 3).map(g => `[${g.group.name}](https://www.roblox.com/groups/${g.group.id})`).join(' · ') || '_' + (await t(lang, 'no_groups')) + '_';
  const achList   = (eco?.achievements ?? []).map(id => ACHIEVEMENTS.find(a => a.id === id)?.name ?? '').filter(Boolean).join(' ');
  const createdAt = new Date(profile.created).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });

  const userColor = entry.profileColor || 0x1900ff;
  const premiumStatus = hasGold ? '⭐ ' : '';

  const embed = new EmbedBuilder()
    .setTitle(`${premiumStatus}${profile.displayName}  ·  @${profile.name}`)
    .setURL(`https://www.roblox.com/users/${entry.robloxId}/profile`)
    .setColor(userColor)
    .setThumbnail(avatarUrl)
    .setDescription((profile.description?.slice(0, 150) || '_' + (await t(lang, 'no_description')) + '_') + (hasPremiumRoblox ? '\n💎 **Roblox Premium**' : ''))
    .addFields(
      { name: '━━━━━━━━━━━━━━━━━━━━', value: '\u200B' },
      { name: await t(lang, 'profile_id'), value: `\`${entry.robloxId}\``, inline: true },
      { name: await t(lang, 'profile_created'), value: createdAt, inline: true },
      { name: await t(lang, 'profile_age_days'), value: `${age}`, inline: true },
      { name: await t(lang, 'profile_friends'), value: `**${friends}**`, inline: true },
      { name: await t(lang, 'profile_followers'), value: `**${followers}**`, inline: true },
      { name: await t(lang, 'profile_following'), value: `**${following}**`, inline: true },
      { name: await t(lang, 'profile_groups'), value: `**${groups.length}**`, inline: true },
      { name: await t(lang, 'profile_badges'), value: `**${badges.length}+**`, inline: true },
      { name: rank.name, value: `${eco?.points ?? 0} pts`, inline: true },
    );

  if (hasGold && premiumData?.expiresAt) {
    const now = Date.now();
    const exp = new Date(premiumData.expiresAt).getTime();
    const totalDuration = premiumData.durationDays ? premiumData.durationDays * 86400000 : 30 * 86400000;
    const percentLeft = Math.max(0, Math.min(1, (exp - now) / totalDuration));
    const filled = Math.round(percentLeft * 10);
    const bar = '🟩'.repeat(filled) + '⬛'.repeat(10 - filled);
    const daysLeft = Math.ceil((exp - now) / 86400000);
    embed.addFields({ name: await t(lang, 'premium_remaining'), value: `${bar} ${daysLeft} ${await t(lang, 'days')}` });
  } else if (hasGold) {
    embed.addFields({ name: await t(lang, 'premium'), value: await t(lang, 'premium_permanent') });
  }

  if (rank.next) embed.addFields({ name: await t(lang, 'rank_progress'), value: `${progressBar(eco?.points ?? 0, rank.next)} ${eco?.points ?? 0}/${rank.next}` });
  if (achList) embed.addFields({ name: await t(lang, 'achievements'), value: achList });
  embed.addFields({ name: await t(lang, 'top_groups'), value: topGroups });
  embed.setFooter({ text: `${hasGold ? '⭐ Premium · ' : ''}Discord: ${target.username ?? ctx.username}` }).setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`btn_avatar_${entry.robloxId}`).setLabel('🎭 Avatar').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`btn_estado_${entry.robloxId}`).setLabel('🎮 Estado').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`btn_grupos_${entry.robloxId}`).setLabel('🏰 Grupos').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`btn_insignias_${entry.robloxId}`).setLabel('🏅 Insignias').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`btn_sync_${entry.robloxId}`).setLabel('🔄 ' + (await t(lang, 'sync_roles'))).setStyle(ButtonStyle.Secondary),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel('🔗 ' + (await t(lang, 'view_on_roblox'))).setStyle(ButtonStyle.Link).setURL(`https://www.roblox.com/users/${entry.robloxId}/profile`),
  );

  const msg = await ctx.replyAndFetch({ embeds: [embed], components: [row1, row2] });
  if (!msg) return;
  const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 120000 });
  collector.on('collect', async (i) => {
    await i.deferUpdate().catch(() => {});
    const [, action, robloxId] = i.customId.split('_');
    if (action === 'avatar') {
      const url = await roblox.getAvatarFull(robloxId);
      await i.followUp({ embeds: [new EmbedBuilder().setTitle(`🎭 ${profile.displayName}`).setImage(url).setColor(0x1900ff)], ephemeral: true });
    } else if (action === 'estado') {
      const p = await roblox.getPresence(robloxId);
      if (!p) return i.followUp({ content: await t(lang, 'no_presence'), ephemeral: true });
      const { label, color } = roblox.formatPresence(p.userPresenceType);
      const e = new EmbedBuilder().setTitle(label).setDescription(`**${profile.displayName}**`).setColor(color);
      if (p.userPresenceType === 2 && p.universeId) {
        const gn = await roblox.getGameName(p.universeId);
        if (gn) e.addFields({ name: '🕹️', value: gn });
      }
      await i.followUp({ embeds: [e], ephemeral: true });
    } else if (action === 'grupos') {
      const grps = await roblox.getGroups(robloxId);
      await i.followUp({ embeds: [new EmbedBuilder().setTitle(await t(lang, 'groups')).setColor(0x1900ff)
        .setDescription(grps.slice(0, 10).map(g => `• **${g.group.name}** — ${g.role.name}`).join('\n') || '_' + (await t(lang, 'no_groups')) + '_')], ephemeral: true });
    } else if (action === 'insignias') {
      const b = await roblox.getBadges(robloxId);
      await i.followUp({ embeds: [new EmbedBuilder().setTitle(await t(lang, 'badges')).setColor(0xFEE75C)
        .setDescription(b.map(x => `• ${x.name}`).join('\n') || '_' + (await t(lang, 'no_badges')) + '_')], ephemeral: true });
    } else if (action === 'sync') {
      const { syncRoles } = require('./utils/helpers');
      await syncRoles(ctx.guild, i.user.id, robloxId);
      await i.followUp({ content: await t(lang, 'roles_synced'), ephemeral: true });
    }
  });
  collector.on('end', () => msg.edit({ components: [] }).catch(() => {}));
}

// ──────────────────────────────────────────────────────────────
//  Avatar
// ──────────────────────────────────────────────────────────────

async function cmdAvatar(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const lang   = await getGuildLang(ctx.guild?.id);
  const entry  = await db.getUser(target.id);
  if (!entry) return replyEmbed(ctx, 'error', 'no_account', 0xED4245, true, [target.username ?? ctx.username]);
  if (target.id !== ctx.userId && !entry.privacyProfile) return replyEmbed(ctx, 'error', 'profile_private', 0xED4245, true);
  const [h, f] = await Promise.all([roblox.getAvatar(entry.robloxId), roblox.getAvatarFull(entry.robloxId)]);
  if (!h) return replyEmbed(ctx, 'error', 'error_generic', 0xED4245, true);
  const userColor = entry.profileColor || 0x1900ff;
  ctx.reply({ embeds: [new EmbedBuilder()
    .setTitle(await t(lang, 'avatar_of', entry.robloxUsername))
    .setURL(`https://www.roblox.com/users/${entry.robloxId}/profile`)
    .setColor(userColor).setThumbnail(h).setImage(f)
    .setFooter({ text: await t(lang, 'requested_by', ctx.username) })] });
}

// ──────────────────────────────────────────────────────────────
//  Estado
// ──────────────────────────────────────────────────────────────

async function cmdEstado(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const lang   = await getGuildLang(ctx.guild?.id);
  const entry  = await db.getUser(target.id);
  if (!entry) return replyEmbed(ctx, 'error', 'no_account', 0xED4245, true, [target.username ?? ctx.username]);
  const isSelf = target.id === ctx.userId;
  if (!isSelf && !entry.privacyPresence) return replyEmbed(ctx, 'error', 'presence_private', 0xED4245, true, [target.username]);
  if (!process.env.ROBLOX_COOKIE) return replyEmbed(ctx, 'error', 'no_cookie', 0xED4245, true);
  
  const { presenceCache } = require('../security');
  presenceCache.cache?.delete?.(entry.robloxId);
  
  const presence = await roblox.getPresence(entry.robloxId);
  if (!presence) return replyEmbed(ctx, 'error', 'error_generic', 0xED4245, true);
  const { label, color } = roblox.formatPresence(presence.userPresenceType);
  let gameName = null;
  if (presence.userPresenceType === 2 && presence.universeId) {
    gameName = await roblox.getGameName(presence.universeId);
    if (isSelf && gameName) await recordGameHistory(ctx.userId, gameName, presence.rootPlaceId);
  }
  const userColor = entry.profileColor || 0x1900ff;
  const embed = new EmbedBuilder().setTitle(label)
    .setDescription(`**[${entry.robloxUsername}](https://www.roblox.com/users/${entry.robloxId}/profile)**`)
    .setColor(userColor);
  if (gameName) embed.addFields({ name: await t(lang, 'playing'), value: `[${gameName}](https://www.roblox.com/games/${presence.rootPlaceId})` });
  if (presence.lastOnline) embed.addFields({ name: await t(lang, 'last_online'), value: new Date(presence.lastOnline).toLocaleString('es-ES', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) });
  embed.setFooter({ text: await t(lang, 'requested_by', ctx.username) }).setTimestamp();
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`setalert_${entry.robloxId}_${entry.robloxUsername}`).setLabel('🔔 ' + (await t(lang, 'activate_alert'))).setStyle(ButtonStyle.Primary),
  );
  const msg = await ctx.replyAndFetch({ embeds: [embed], components: [row] });
  if (!msg) return;
  const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30000 });
  collector.on('collect', async (i) => {
    if (i.user.id !== ctx.userId) return i.reply({ content: await t(lang, 'only_author'), ephemeral: true });
    const [, wId, wName] = i.customId.split('_');
    let userAlerts  = await db.getAlerts(ctx.userId) ?? [];
    const userPremium = await isPremium(ctx.userId);
    const validAlerts = userPremium ? userAlerts : filterAlertsByResetPeriod(userAlerts);
    if (!userPremium && validAlerts.length >= 100)
      return i.reply({ content: await t(lang, 'alert_limit_free'), ephemeral: true });
    if (!validAlerts.find(a => String(a.watchedRobloxId) === String(wId))) {
      const newAlert = { watchedRobloxId: wId, watchedUsername: wName, channelId: i.channelId, guildId: i.guildId, createdAt: new Date().toISOString() };
      userAlerts.push(newAlert);
      await db.saveAlerts(ctx.userId, userAlerts);
      const alertUsers = await redisGet('alert_users') ?? [];
      if (!alertUsers.includes(ctx.userId)) { alertUsers.push(ctx.userId); await redisSet('alert_users', alertUsers); }
    }
    await i.reply({ content: await t(lang, 'alert_activated', wName), ephemeral: true });
  });
  collector.on('end', () => msg.edit({ components: [] }).catch(() => {}));
}

// ──────────────────────────────────────────────────────────────
//  Grupos
// ──────────────────────────────────────────────────────────────

async function cmdGrupos(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const lang   = await getGuildLang(ctx.guild?.id);
  const entry  = await db.getUser(target.id);
  if (!entry) return replyEmbed(ctx, 'error', 'no_account', 0xED4245, true, [target.username ?? ctx.username]);
  if (target.id !== ctx.userId && !entry.privacyProfile) return replyEmbed(ctx, 'error', 'profile_private', 0xED4245, true);
  const groups = await roblox.getGroups(entry.robloxId);
  if (!groups.length) return ctx.reply(`**${entry.robloxUsername}** ` + (await t(lang, 'no_groups_public')));
  const userColor = entry.profileColor || 0x1900ff;
  const pages = [];
  for (let i = 0; i < groups.length; i += 5) {
    const groupTexts = await Promise.all(groups.slice(i, i + 5).map(async (g) => {
      const roleText = await t(lang, 'role');
      const rankText = await t(lang, 'rank');
      return `**[${g.group.name}](https://www.roblox.com/groups/${g.group.id})**\n› ${roleText}: **${g.role.name}** · ${rankText} \`${g.role.rank}\``;
    }));
    pages.push(new EmbedBuilder()
      .setTitle(await t(lang, 'groups_of', entry.robloxUsername))
      .setColor(userColor)
      .setDescription(groupTexts.join('\n\n'))
      .setFooter({ text: `${groups.length} ${await t(lang, 'total_groups')}` }));
  }
  await paginate(ctx, pages);
}

// ──────────────────────────────────────────────────────────────
//  Amigos
// ──────────────────────────────────────────────────────────────

async function cmdAmigos(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const lang   = await getGuildLang(ctx.guild?.id);
  const entry  = await db.getUser(target.id);
  if (!entry) return replyEmbed(ctx, 'error', 'no_account', 0xED4245, true, [target.username ?? ctx.username]);
  if (target.id !== ctx.userId && !entry.privacyProfile) return replyEmbed(ctx, 'error', 'profile_private', 0xED4245, true);
  const friends = await roblox.getFriends(entry.robloxId);
  if (!friends.length) return ctx.reply(`**${entry.robloxUsername}** ` + (await t(lang, 'no_friends_public')));
  const userColor = entry.profileColor || 0x1900ff;
  const pages = [];
  for (let i = 0; i < friends.length; i += 10)
    pages.push(new EmbedBuilder().setTitle(await t(lang, 'friends_of', entry.robloxUsername)).setColor(userColor)
      .setDescription(friends.slice(i, i + 10).map(f => {
        const nm = f.name || `ID:${f.id}`;
        const dn = f.displayName || nm;
        return `• [${dn}](https://www.roblox.com/users/${f.id}/profile)${dn !== nm ? ` (@${nm})` : ''}`;
      }).join('\n')).setFooter({ text: `${friends.length} ${await t(lang, 'total_friends')}` }));
  await paginate(ctx, pages);
}

// ──────────────────────────────────────────────────────────────
//  Insignias
// ──────────────────────────────────────────────────────────────

async function cmdInsignias(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const lang   = await getGuildLang(ctx.guild?.id);
  const entry  = await db.getUser(target.id);
  if (!entry) return replyEmbed(ctx, 'error', 'no_account', 0xED4245, true, [target.username ?? ctx.username]);
  if (target.id !== ctx.userId && !entry.privacyProfile) return replyEmbed(ctx, 'error', 'profile_private', 0xED4245, true);
  const badges = await roblox.getBadges(entry.robloxId);
  const userColor = entry.profileColor || 0x1900ff;
  ctx.reply({ embeds: [new EmbedBuilder().setTitle(await t(lang, 'badges_of', entry.robloxUsername)).setColor(userColor)
    .setDescription(badges.length ? badges.map(b => `• **${b.name}**${b.description ? `\n  › ${b.description.slice(0, 60)}` : ''}`).join('\n\n') : '_' + (await t(lang, 'no_badges_recent')) + '_')
    .setFooter({ text: await t(lang, 'badges_footer') })] });
}

// ──────────────────────────────────────────────────────────────
//  Historial de nombres
// ──────────────────────────────────────────────────────────────

async function cmdHistorialNombres(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const lang   = await getGuildLang(ctx.guild?.id);
  const entry  = await db.getUser(target.id);
  if (!entry) return replyEmbed(ctx, 'error', 'no_account', 0xED4245, true, [target.username ?? ctx.username]);
  const history = await roblox.getNameHistory(entry.robloxId);
  const userColor = entry.profileColor || 0x1900ff;
  ctx.reply({ embeds: [new EmbedBuilder().setTitle(await t(lang, 'name_history_of', entry.robloxUsername))
    .setColor(userColor)
    .setDescription(history.length ? history.map((h, i) => `**${i + 1}.** ${h.name}`).join('\n') : '_' + (await t(lang, 'no_name_history')) + '_')
    .setFooter({ text: await t(lang, 'name_history_footer') })] });
}

// ──────────────────────────────────────────────────────────────
//  Buscar
// ──────────────────────────────────────────────────────────────

async function cmdBuscar(ctx, username) {
  const lang  = await getGuildLang(ctx.guild?.id);
  const clean = sanitizeUsername(username);
  if (!clean) return replyEmbed(ctx, 'error', 'invalid_username', 0xED4245, true);
  const u = await roblox.getUserByName(clean);
  if (!u) return replyEmbed(ctx, 'error', 'verify_not_found', 0xED4245, true);
  const [p, av, fr, fo, fg, gr] = await Promise.all([
    roblox.getProfile(u.id), roblox.getAvatar(u.id),
    roblox.getFriendCount(u.id), roblox.getFollowerCount(u.id),
    roblox.getFollowingCount(u.id), roblox.getGroups(u.id),
  ]);
  if (!p) return replyEmbed(ctx, 'error', 'error_generic', 0xED4245, true);
  const age = Math.floor((Date.now() - new Date(p.created)) / 86400000);
  ctx.reply({ embeds: [new EmbedBuilder().setTitle(`🔍 ${p.displayName}  ·  @${p.name}`)
    .setURL(`https://www.roblox.com/users/${u.id}/profile`).setColor(0x1900ff).setThumbnail(av)
    .addFields(
      { name: await t(lang, 'profile_id'), value: `\`${u.id}\``, inline: true },
      { name: await t(lang, 'profile_age_days'), value: `${age}`, inline: true },
      { name: await t(lang, 'profile_friends'), value: `${fr}`, inline: true },
      { name: await t(lang, 'profile_followers'), value: `${fo}`, inline: true },
      { name: await t(lang, 'profile_groups'), value: `${gr.length}`, inline: true },
      { name: '\u200B', value: '\u200B', inline: true },
      { name: await t(lang, 'description'), value: p.description?.slice(0, 300) || '_' + (await t(lang, 'no_description')) + '_' },
    ).setFooter({ text: await t(lang, 'public_search_footer') })] });
}

// ──────────────────────────────────────────────────────────────
//  WhoisRoblox (búsqueda por ID)
// ──────────────────────────────────────────────────────────────

async function cmdWhoisRoblox(ctx, robloxId) {
  const lang = await getGuildLang(ctx.guild?.id);
  if (!robloxId || isNaN(robloxId)) return replyEmbed(ctx, 'error', 'invalid_roblox_id', 0xED4245, true);
  const profile  = await roblox.getUserById(robloxId);
  if (!profile) return replyEmbed(ctx, 'error', 'user_not_found_by_id', 0xED4245, true);
  const avatarUrl = await roblox.getAvatar(robloxId);
  const embed = new EmbedBuilder()
    .setTitle(`🔍 Roblox ID: ${robloxId}`)
    .setColor(0x1900ff).setThumbnail(avatarUrl)
    .addFields(
      { name: await t(lang, 'username'), value: `**${profile.displayName}** (@${profile.name})`, inline: true },
      { name: '🆔 ID', value: `\`${robloxId}\``, inline: true },
      { name: await t(lang, 'profile_created'), value: new Date(profile.created).toLocaleDateString('es-ES'), inline: true },
      { name: await t(lang, 'description'), value: profile.description?.slice(0, 200) || '_' + (await t(lang, 'no_description')) + '_' },
    )
    .setURL(`https://www.roblox.com/users/${robloxId}/profile`)
    .setFooter({ text: await t(lang, 'search_by_id_footer') });
  ctx.reply({ embeds: [embed] });
}

// ──────────────────────────────────────────────────────────────
//  Outfit
// ──────────────────────────────────────────────────────────────

async function cmdOutfit(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const lang   = await getGuildLang(ctx.guild?.id);
  const entry  = await db.getUser(target.id);
  if (!entry) return replyEmbed(ctx, 'error', 'no_account', 0xED4245, true, [target.username ?? ctx.username]);
  const outfit = await roblox.getOutfit(entry.robloxId);
  if (!outfit) return replyEmbed(ctx, 'error', 'outfit_not_found', 0xED4245, true);
  const userColor = entry.profileColor || 0x1900ff;
  const embed = new EmbedBuilder()
    .setTitle(await t(lang, 'outfit_of', entry.robloxUsername))
    .setColor(userColor)
    .setDescription(`**${outfit.name}**`)
    .setImage(outfit.imageUrl)
    .setFooter({ text: await t(lang, 'current_outfit_footer') });
  ctx.reply({ embeds: [embed] });
}

// ──────────────────────────────────────────────────────────────
//  RAP
// ──────────────────────────────────────────────────────────────

async function cmdRAP(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const lang   = await getGuildLang(ctx.guild?.id);
  const entry  = await db.getUser(target.id);
  if (!entry) return replyEmbed(ctx, 'error', 'no_account', 0xED4245, true, [target.username ?? ctx.username]);
  const rap = await roblox.getRAP(entry.robloxId);
  const userColor = entry.profileColor || 0x1900ff;
  const embed = new EmbedBuilder()
    .setTitle(await t(lang, 'rap_of', entry.robloxUsername))
    .setColor(userColor)
    .addFields(
      { name: await t(lang, 'estimated_value'), value: `${rap.value.toLocaleString()} R$`, inline: true },
      { name: await t(lang, 'limiteds_found'), value: `${rap.limiteds.length}`, inline: true },
    )
    .setFooter({ text: await t(lang, 'rap_source') });
  ctx.reply({ embeds: [embed] });
}

async function cmdPlaytime(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const lang   = await getGuildLang(ctx.guild?.id);
  const entry  = await db.getUser(target.id);
  if (!entry) return replyEmbed(ctx, 'error', 'no_account', 0xED4245, true, [target.username ?? ctx.username]);
  
  // Verificar si el usuario tiene permiso para ver estos datos
  if (target.id !== ctx.userId && !entry.privacyProfile) 
    return replyEmbed(ctx, 'error', 'profile_private', 0xED4245, true);
  
  // Obtener el historial de juegos del usuario
  const history = await db.getHistory(target.id) ?? [];
  if (!history.length) 
    return replyEmbed(ctx, 'info', 'playtime_no_data', 0x1900ff, false, [entry.robloxUsername]);
  
  // Filtrar solo los juegos de los últimos 7 días
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentHistory = history.filter(h => new Date(h.playedAt).getTime() > sevenDaysAgo);
  
  if (!recentHistory.length)
    return replyEmbed(ctx, 'info', 'playtime_no_recent', 0x1900ff, false, [entry.robloxUsername]);
  
  // Calcular tiempo total por juego (estimación basada en sesiones)
  // Nota: No tenemos la duración exacta, solo el número de veces que se usó /estado
  // Asumimos 15 minutos por cada vez que se detectó al usuario jugando
  const playtimeByGame = {};
  for (const session of recentHistory) {
    const gameName = session.gameName;
    if (!playtimeByGame[gameName]) {
      playtimeByGame[gameName] = {
        count: 0,
        estimatedMinutes: 0,
        placeId: session.placeId
      };
    }
    playtimeByGame[gameName].count++;
    playtimeByGame[gameName].estimatedMinutes += 15; // 15 minutos por detección
  }
  
  // Convertir a array y ordenar por tiempo estimado
  const gameList = Object.entries(playtimeByGame)
    .map(([name, data]) => ({
      name,
      count: data.count,
      minutes: data.estimatedMinutes,
      placeId: data.placeId
    }))
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 10);
  
  const userColor = entry.profileColor || 0x1900ff;
  
  // Formatear el tiempo para mostrarlo legible
  const formatTime = (minutes) => {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };
  
  const description = gameList.map((game, index) => {
    const timeStr = formatTime(game.minutes);
    const gameUrl = `https://www.roblox.com/games/${game.placeId}`;
    return `**${index + 1}.** [${game.name}](${gameUrl})\n⏱️ ${timeStr} (${game.count} sesiones)`;
  }).join('\n\n') || `_${await t(lang, 'playtime_no_data')}_`;
  
  const embed = new EmbedBuilder()
    .setTitle(await t(lang, 'playtime_title', entry.robloxUsername))
    .setDescription(description)
    .setColor(userColor)
    .setFooter({ text: await t(lang, 'playtime_footer') })
    .setTimestamp();
  
  ctx.reply({ embeds: [embed] });
}

module.exports = {
  cmdPerfil,
  cmdAvatar,
  cmdEstado,
  cmdGrupos,
  cmdAmigos,
  cmdInsignias,
  cmdHistorialNombres,
  cmdBuscar,
  cmdWhoisRoblox,
  cmdOutfit,
  cmdRAP,
  cmdPlaytime
};
