// commands/profile.js
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  PermissionFlagsBits
} = require('discord.js');

const { sanitizeUsername, sanitizeText } = require('../security');
const { t } = require('../i18n');
const { db, redisGet, redisSet } = require('./utils/database');
const roblox = require('./utils/roblox');
const {
  isPremium,
  getGuildLang,
  getRank,
  progressBar,
  checkAchievements,
  syncRoles,
  paginate,
  filterAlertsByResetPeriod,
  recordGameHistory
} = require('./utils/helpers');
const { ACHIEVEMENTS } = require('./utils/constants');

// ──────────────────────────────────────────────────────────────────────────────
//  Comandos de perfil e información
// ──────────────────────────────────────────────────────────────────────────────

async function cmdPerfil(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const lang   = await getGuildLang(ctx.guild?.id);
  const entry  = await db.getUser(target.id);
  if (!entry) return ctx.reply({ content: t(lang, 'no_account', target.username ?? ctx.username), ephemeral: true });
  if (target.id !== ctx.userId && !entry.privacyProfile) return ctx.reply({ content: t(lang, 'profile_private'), ephemeral: true });

  const [profile, avatarUrl, friends, followers, following, groups, badges] = await Promise.all([
    roblox.getProfile(entry.robloxId), roblox.getAvatar(entry.robloxId),
    roblox.getFriendCount(entry.robloxId), roblox.getFollowerCount(entry.robloxId),
    roblox.getFollowingCount(entry.robloxId), roblox.getGroups(entry.robloxId),
    roblox.getBadges(entry.robloxId),
  ]);
  if (!profile) return ctx.reply({ content: t(lang, 'error_generic'), ephemeral: true });

  const [hasPremiumRoblox, hasGold, eco, premiumData] = await Promise.all([
    roblox.isPremiumRoblox(entry.robloxId), isPremium(target.id), db.getEconomy(target.id), db.getPremium(target.id),
  ]);

  const age       = Math.floor((Date.now() - new Date(profile.created)) / 86400000);
  const rank      = getRank(eco?.points ?? 0);
  const topGroups = groups.slice(0, 3).map(g => `[${g.group.name}](https://www.roblox.com/groups/${g.group.id})`).join(' · ') || '_Sin grupos_';
  const achList   = (eco?.achievements ?? []).map(id => ACHIEVEMENTS.find(a => a.id === id)?.name ?? '').filter(Boolean).join(' ');
  const createdAt = new Date(profile.created).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });

  const userColor = entry.profileColor || 0x1900ff;

  const embed = new EmbedBuilder()
    .setTitle(`${hasGold ? '⭐ ' : ''}${profile.displayName}  ·  @${profile.name}`)
    .setURL(`https://www.roblox.com/users/${entry.robloxId}/profile`)
    .setColor(userColor)
    .setThumbnail(avatarUrl)
    .setDescription((profile.description?.slice(0, 150) || '*Sin descripción*') + (hasPremiumRoblox ? '\n💎 **Roblox Premium**' : ''))
    .addFields(
      { name: '━━━━━━━━━━━━━━━━━━━━', value: '\u200B' },
      { name: '🆔 ID',             value: `\`${entry.robloxId}\``,   inline: true },
      { name: '📅 Creado',         value: createdAt,                   inline: true },
      { name: '📆 Días en Roblox', value: `${age}`,                    inline: true },
      { name: '👥 Amigos',         value: `**${friends}**`,            inline: true },
      { name: '👣 Seguidores',     value: `**${followers}**`,          inline: true },
      { name: '➡️ Siguiendo',      value: `**${following}**`,          inline: true },
      { name: '🏰 Grupos',         value: `**${groups.length}**`,      inline: true },
      { name: '🏅 Insignias',      value: `**${badges.length}+**`,     inline: true },
      { name: rank.name,           value: `${eco?.points ?? 0} pts`,   inline: true },
    );

  if (hasGold && premiumData?.expiresAt) {
    const now = Date.now();
    const exp = new Date(premiumData.expiresAt).getTime();
    const totalDuration = premiumData.durationDays ? premiumData.durationDays * 86400000 : 30 * 86400000;
    const percentLeft = Math.max(0, Math.min(1, (exp - now) / totalDuration));
    const filled = Math.round(percentLeft * 10);
    const bar = '🟩'.repeat(filled) + '⬛'.repeat(10 - filled);
    const daysLeft = Math.ceil((exp - now) / 86400000);
    embed.addFields({ name: '⭐ Premium restante', value: `${bar} ${daysLeft} día(s)` });
  } else if (hasGold) {
    embed.addFields({ name: '⭐ Premium', value: '∞ Permanente' });
  }

  if (rank.next) embed.addFields({ name: 'Progreso de rango', value: `${progressBar(eco?.points ?? 0, rank.next)} ${eco?.points ?? 0}/${rank.next}` });
  if (achList)   embed.addFields({ name: '🏅 Logros', value: achList });
  embed.addFields({ name: '🏰 Grupos destacados', value: topGroups });
  embed.setFooter({ text: `${hasGold ? '⭐ Premium · ' : ''}Discord: ${target.username ?? ctx.username}` }).setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`btn_avatar_${entry.robloxId}`).setLabel('🎭 Avatar').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`btn_estado_${entry.robloxId}`).setLabel('🎮 Estado').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`btn_grupos_${entry.robloxId}`).setLabel('🏰 Grupos').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`btn_insignias_${entry.robloxId}`).setLabel('🏅 Insignias').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`btn_sync_${entry.robloxId}`).setLabel('🔄 Sincronizar roles').setStyle(ButtonStyle.Secondary),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel('🔗 Ver en Roblox').setStyle(ButtonStyle.Link).setURL(`https://www.roblox.com/users/${entry.robloxId}/profile`),
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
      if (!p) return i.followUp({ content: '❌ Sin presencia.', ephemeral: true });
      const { label, color } = roblox.formatPresence(p.userPresenceType);
      const e = new EmbedBuilder().setTitle(label).setDescription(`**${profile.displayName}**`).setColor(color);
      if (p.userPresenceType === 2 && p.universeId) {
        const gn = await roblox.getGameName(p.universeId);
        if (gn) e.addFields({ name: '🕹️', value: gn });
      }
      await i.followUp({ embeds: [e], ephemeral: true });
    } else if (action === 'grupos') {
      const grps = await roblox.getGroups(robloxId);
      await i.followUp({ embeds: [new EmbedBuilder().setTitle('🏰 Grupos').setColor(0x1900ff)
        .setDescription(grps.slice(0, 10).map(g => `• **${g.group.name}** — ${g.role.name}`).join('\n') || '_Sin grupos_')], ephemeral: true });
    } else if (action === 'insignias') {
      const b = await roblox.getBadges(robloxId);
      await i.followUp({ embeds: [new EmbedBuilder().setTitle('🏅 Insignias').setColor(0xFEE75C)
        .setDescription(b.map(x => `• ${x.name}`).join('\n') || '_Sin insignias_')], ephemeral: true });
    } else if (action === 'sync') {
      await syncRoles(ctx.guild, i.user.id, robloxId);
      await i.followUp({ content: '✅ Roles sincronizados.', ephemeral: true });
    }
  });
  collector.on('end', () => msg.edit({ components: [] }).catch(() => {}));
}

async function cmdAvatar(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const lang   = await getGuildLang(ctx.guild?.id);
  const entry  = await db.getUser(target.id);
  if (!entry) return ctx.reply({ content: t(lang, 'no_account', target.username ?? ctx.username), ephemeral: true });
  if (target.id !== ctx.userId && !entry.privacyProfile) return ctx.reply({ content: t(lang, 'profile_private'), ephemeral: true });
  const [h, f] = await Promise.all([roblox.getAvatar(entry.robloxId), roblox.getAvatarFull(entry.robloxId)]);
  if (!h) return ctx.reply({ content: t(lang, 'error_generic'), ephemeral: true });
  const userColor = entry.profileColor || 0x1900ff;
  ctx.reply({ embeds: [new EmbedBuilder()
    .setTitle(`🎭 Avatar de ${entry.robloxUsername}`)
    .setURL(`https://www.roblox.com/users/${entry.robloxId}/profile`)
    .setColor(userColor).setThumbnail(h).setImage(f)
    .setFooter({ text: `Solicitado por ${ctx.username}` })] });
}

async function cmdEstado(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const lang   = await getGuildLang(ctx.guild?.id);
  const entry  = await db.getUser(target.id);
  if (!entry) return ctx.reply({ content: t(lang, 'no_account', target.username ?? ctx.username), ephemeral: true });
  const isSelf = target.id === ctx.userId;
  if (!isSelf && !entry.privacyPresence) return ctx.reply({ content: t(lang, 'presence_private', target.username), ephemeral: true });
  if (!process.env.ROBLOX_COOKIE) return ctx.reply({ content: t(lang, 'no_cookie'), ephemeral: true });
  
  // Limpiar caché para forzar consulta fresca
  const { presenceCache } = require('../security');
  presenceCache.cache?.delete?.(entry.robloxId);
  
  const presence = await roblox.getPresence(entry.robloxId);
  if (!presence) return ctx.reply({ content: t(lang, 'error_generic'), ephemeral: true });
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
  if (gameName) embed.addFields({ name: '🕹️ Jugando', value: `[${gameName}](https://www.roblox.com/games/${presence.rootPlaceId})` });
  if (presence.lastOnline) embed.addFields({ name: '🕐 Última vez en línea', value: new Date(presence.lastOnline).toLocaleString('es-ES', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) });
  embed.setFooter({ text: `Solicitado por ${ctx.username}` }).setTimestamp();
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`setalert_${entry.robloxId}_${entry.robloxUsername}`).setLabel('🔔 Activar alerta').setStyle(ButtonStyle.Primary),
  );
  const msg = await ctx.replyAndFetch({ embeds: [embed], components: [row] });
  if (!msg) return;
  const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30000 });
  collector.on('collect', async (i) => {
    if (i.user.id !== ctx.userId) return i.reply({ content: '❌ Solo quien ejecutó el comando.', ephemeral: true });
    const [, wId, wName] = i.customId.split('_');
    let userAlerts  = await db.getAlerts(ctx.userId) ?? [];
    const userPremium = await isPremium(ctx.userId);
    const validAlerts = userPremium ? userAlerts : filterAlertsByResetPeriod(userAlerts);
    if (!userPremium && validAlerts.length >= 2)
      return i.reply({ content: '❌ Límite gratuito: 2 alertas por día (se reinician a las 20:00 RD). ⭐ Premium = ilimitadas.', ephemeral: true });
    if (!validAlerts.find(a => String(a.watchedRobloxId) === String(wId))) {
      const newAlert = { watchedRobloxId: wId, watchedUsername: wName, channelId: i.channelId, guildId: i.guildId, createdAt: new Date().toISOString() };
      userAlerts.push(newAlert);
      await db.saveAlerts(ctx.userId, userAlerts);
      const alertUsers = await redisGet('alert_users') ?? [];
      if (!alertUsers.includes(ctx.userId)) { alertUsers.push(ctx.userId); await redisSet('alert_users', alertUsers); }
    }
    await i.reply({ content: `✅ Alerta activada para **${wName}**. Recibirás un ping cuando cambie su estado.`, ephemeral: true });
  });
  collector.on('end', () => msg.edit({ components: [] }).catch(() => {}));
}

async function cmdGrupos(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const lang   = await getGuildLang(ctx.guild?.id);
  const entry  = await db.getUser(target.id);
  if (!entry) return ctx.reply({ content: t(lang, 'no_account', target.username ?? ctx.username), ephemeral: true });
  if (target.id !== ctx.userId && !entry.privacyProfile) return ctx.reply({ content: t(lang, 'profile_private'), ephemeral: true });
  const groups = await roblox.getGroups(entry.robloxId);
  if (!groups.length) return ctx.reply(`**${entry.robloxUsername}** no tiene grupos públicos.`);
  const userColor = entry.profileColor || 0x1900ff;
  const pages = [];
  for (let i = 0; i < groups.length; i += 5)
    pages.push(new EmbedBuilder().setTitle(`🏰 Grupos de ${entry.robloxUsername}`).setColor(userColor)
      .setDescription(groups.slice(i, i + 5).map(g =>
        `**[${g.group.name}](https://www.roblox.com/groups/${g.group.id})**\n› Rol: **${g.role.name}** · Rango \`${g.role.rank}\``
      ).join('\n\n')).setFooter({ text: `${groups.length} grupos en total` }));
  await paginate(ctx, pages);
}

async function cmdAmigos(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const lang   = await getGuildLang(ctx.guild?.id);
  const entry  = await db.getUser(target.id);
  if (!entry) return ctx.reply({ content: t(lang, 'no_account', target.username ?? ctx.username), ephemeral: true });
  if (target.id !== ctx.userId && !entry.privacyProfile) return ctx.reply({ content: t(lang, 'profile_private'), ephemeral: true });
  const friends = await roblox.getFriends(entry.robloxId);
  if (!friends.length) return ctx.reply(`**${entry.robloxUsername}** no tiene amigos públicos.`);
  const userColor = entry.profileColor || 0x1900ff;
  const pages = [];
  for (let i = 0; i < friends.length; i += 10)
    pages.push(new EmbedBuilder().setTitle(`👥 Amigos de ${entry.robloxUsername}`).setColor(userColor)
      .setDescription(friends.slice(i, i + 10).map(f => {
        const nm = f.name || `ID:${f.id}`;
        const dn = f.displayName || nm;
        return `• [${dn}](https://www.roblox.com/users/${f.id}/profile)${dn !== nm ? ` (@${nm})` : ''}`;
      }).join('\n')).setFooter({ text: `${friends.length} amigos` }));
  await paginate(ctx, pages);
}

async function cmdInsignias(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const entry  = await db.getUser(target.id);
  if (!entry) return ctx.reply({ content: '❌ Sin cuenta vinculada.', ephemeral: true });
  if (target.id !== ctx.userId && !entry.privacyProfile) return ctx.reply({ content: '🔒 Perfil privado.', ephemeral: true });
  const badges = await roblox.getBadges(entry.robloxId);
  const userColor = entry.profileColor || 0x1900ff;
  ctx.reply({ embeds: [new EmbedBuilder().setTitle(`🏅 Insignias de ${entry.robloxUsername}`).setColor(userColor)
    .setDescription(badges.length ? badges.map(b => `• **${b.name}**${b.description ? `\n  › ${b.description.slice(0, 60)}` : ''}`).join('\n\n') : '_Sin insignias recientes_')
    .setFooter({ text: 'Últimas 10 insignias · Se ganan jugando diferentes juegos' })] });
}

async function cmdHistorialNombres(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const entry  = await db.getUser(target.id);
  if (!entry) return ctx.reply({ content: '❌ Sin cuenta vinculada.', ephemeral: true });
  const history = await roblox.getNameHistory(entry.robloxId);
  const userColor = entry.profileColor || 0x1900ff;
  ctx.reply({ embeds: [new EmbedBuilder().setTitle(`📜 Historial de nombres de ${entry.robloxUsername}`)
    .setColor(userColor)
    .setDescription(history.length ? history.map((h, i) => `**${i + 1}.** ${h.name}`).join('\n') : '_Sin historial de nombres anteriores_')
    .setFooter({ text: 'Nombres anteriores que tuvo esta cuenta de Roblox' })] });
}

async function cmdBuscar(ctx, username) {
  const lang  = await getGuildLang(ctx.guild?.id);
  const clean = sanitizeUsername(username);
  if (!clean) return ctx.reply({ content: '❌ Nombre inválido.', ephemeral: true });
  const u = await roblox.getUserByName(clean);
  if (!u) return ctx.reply({ content: t(lang, 'verify_not_found'), ephemeral: true });
  const [p, av, fr, fo, fg, gr] = await Promise.all([
    roblox.getProfile(u.id), roblox.getAvatar(u.id),
    roblox.getFriendCount(u.id), roblox.getFollowerCount(u.id),
    roblox.getFollowingCount(u.id), roblox.getGroups(u.id),
  ]);
  if (!p) return ctx.reply({ content: t(lang, 'error_generic'), ephemeral: true });
  const age = Math.floor((Date.now() - new Date(p.created)) / 86400000);
  ctx.reply({ embeds: [new EmbedBuilder().setTitle(`🔍 ${p.displayName}  ·  @${p.name}`)
    .setURL(`https://www.roblox.com/users/${u.id}/profile`).setColor(0x1900ff).setThumbnail(av)
    .addFields(
      { name: '🆔 ID',          value: `\`${u.id}\``, inline: true },
      { name: '📅 Días',        value: `${age}`,       inline: true },
      { name: '👥 Amigos',      value: `${fr}`,         inline: true },
      { name: '👣 Seguidores',  value: `${fo}`,         inline: true },
      { name: '🏰 Grupos',      value: `${gr.length}`,  inline: true },
      { name: '\u200B',         value: '\u200B',         inline: true },
      { name: '📝 Descripción', value: p.description?.slice(0, 300) || '_Sin descripción_' },
    ).setFooter({ text: 'Búsqueda pública · No requiere vinculación previa' })] });
}

async function cmdWhoisRoblox(ctx, robloxId) {
  if (!robloxId || isNaN(robloxId)) return ctx.reply({ content: '❌ Proporciona un ID numérico de Roblox. Ej: `!whoislox 123456`', ephemeral: true });
  const profile  = await roblox.getUserById(robloxId);
  if (!profile)  return ctx.reply({ content: '❌ No encontré ningún usuario con ese ID en Roblox.', ephemeral: true });
  const avatarUrl = await roblox.getAvatar(robloxId);
  const embed = new EmbedBuilder()
    .setTitle(`🔍 ID de Roblox: ${robloxId}`)
    .setColor(0x1900ff).setThumbnail(avatarUrl)
    .addFields(
      { name: '👤 Nombre',       value: `**${profile.displayName}** (@${profile.name})`, inline: true },
      { name: '🆔 ID',           value: `\`${robloxId}\``,  inline: true },
      { name: '📅 Creado',       value: new Date(profile.created).toLocaleDateString('es-ES'), inline: true },
      { name: '📝 Descripción',  value: profile.description?.slice(0, 200) || '_Sin descripción_' },
    )
    .setURL(`https://www.roblox.com/users/${robloxId}/profile`)
    .setFooter({ text: 'Búsqueda por ID de Roblox' });
  ctx.reply({ embeds: [embed] });
}

async function cmdOutfit(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const entry  = await db.getUser(target.id);
  if (!entry) return ctx.reply({ content: '❌ Sin cuenta vinculada.', ephemeral: true });
  const outfit = await roblox.getOutfit(entry.robloxId);
  if (!outfit) return ctx.reply({ content: '❌ No se pudo obtener el outfit.', ephemeral: true });
  const userColor = entry.profileColor || 0x1900ff;
  const embed = new EmbedBuilder()
    .setTitle(`👕 Outfit de ${entry.robloxUsername}`)
    .setColor(userColor)
    .setDescription(`**${outfit.name}**`)
    .setImage(outfit.imageUrl)
    .setFooter({ text: 'Ropa actual en Roblox' });
  ctx.reply({ embeds: [embed] });
}

async function cmdRAP(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const entry  = await db.getUser(target.id);
  if (!entry) return ctx.reply({ content: '❌ Sin cuenta vinculada.', ephemeral: true });
  const rap = await roblox.getRAP(entry.robloxId);
  const userColor = entry.profileColor || 0x1900ff;
  const embed = new EmbedBuilder()
    .setTitle(`💰 Valor RAP de ${entry.robloxUsername}`)
    .setColor(userColor)
    .addFields(
      { name: 'Valor estimado', value: `${rap.value.toLocaleString()} R$`, inline: true },
      { name: 'Limiteds', value: `${rap.limiteds.length}`, inline: true },
    )
    .setFooter({ text: 'Fuente: Rolimons (aproximado)' });
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
  cmdRAP
};
