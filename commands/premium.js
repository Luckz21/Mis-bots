// commands/premium.js
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  PermissionFlagsBits
} = require('discord.js');

const { t } = require('../i18n');
const { db, redisGet, redisSet, redisDel } = require('./utils/database');
const roblox = require('./utils/roblox');
const {
  isPremium,
  getGuildLang,
  getRank,
  progressBar,
  premiumEmbed,
  syncRoles,
  paginate
} = require('./utils/helpers');
const { ACHIEVEMENTS } = require('./utils/constants');

// ──────────────────────────────────────────────────────────────
//  Estado de Premium y activación (owner)
// ──────────────────────────────────────────────────────────────

async function cmdPremiumStatus(ctx) {
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
      expText = `Expira: ${new Date(premium.expiresAt).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}\n${bar} ${daysLeft} día(s) restantes`;
    } else {
      expText = 'Permanente ∞';
    }
    embed.setTitle('⭐ Premium activo').setColor(0xFFD700)
      .setDescription(`\`\`\`\n╔══════════════════╗\n║  ⭐ PREMIUM ⭐   ║\n╚══════════════════╝\`\`\`\n**${expText}**\n\n🔔 Alertas ilimitadas · 🎨 /flex · ⚔️ /comparar · 📜 /historial · ⚙️ /syncall · ⏩ Cooldowns x0.5`);
  } else {
    embed.setTitle('⭐ Plan Premium')
      .setDescription(
        `\`\`\`\n╔══════════════════╗\n║   PREMIUM PLAN   ║\n╚══════════════════╝\`\`\`\n` +
        `> 🔔 Alertas **ilimitadas** (gratis = 2/día)\n> 🎨 \`/flex\` — Tarjeta de perfil exclusiva\n> ⚔️ \`/comparar\` — Comparar dos cuentas\n> 📜 \`/historial\` — Ver tus juegos recientes\n> ⚙️ \`/syncall\` — Sincronizar todos los roles\n> ⭐ Rol Premium en el servidor\n> ⏩ Cooldowns reducidos a la mitad\n\n` +
        `**Planes:**\n\`7 días\` - $1.99\n\`30 días\` - $4.99\n\n` +
        `Usa \`/buy\` para comprar con PayPal.`
      );
  }
  ctx.reply({ embeds: [embed] });
}

async function cmdActivarPremium(ctx, targetId, dias) {
  if (ctx.userId !== process.env.BOT_OWNER_ID)
    return ctx.reply({ content: t(await getGuildLang(ctx.guild?.id), 'owner_only'), ephemeral: true });
  if (!targetId) return ctx.reply({ content: '❌ Debes proporcionar el Discord ID del usuario.', ephemeral: true });
  const expDate = dias ? new Date(Date.now() + dias * 86400000).toISOString() : null;
  await db.savePremium(targetId, { activatedAt: new Date().toISOString(), expiresAt: expDate, activatedBy: ctx.userId, durationDays: dias ?? null });
  const premiumList = await redisGet('premium_users_list') ?? [];
  if (!premiumList.includes(targetId)) { premiumList.push(targetId); await redisSet('premium_users_list', premiumList); }
  ctx.reply({ content: `✅ Premium activado para <@${targetId}>${dias ? ` por **${dias} días**` : ' **permanentemente**'}.` });
}

async function cmdDesactivarPremium(ctx, targetId) {
  if (ctx.userId !== process.env.BOT_OWNER_ID)
    return ctx.reply({ content: t(await getGuildLang(ctx.guild?.id), 'owner_only'), ephemeral: true });
  if (!targetId) return ctx.reply({ content: '❌ Debes proporcionar el Discord ID del usuario.', ephemeral: true });

  const existing = await db.getPremium(targetId);
  if (!existing) return ctx.reply({ content: `❌ El usuario <@${targetId}> no tiene Premium activo.`, ephemeral: true });

  await redisDel(`premium:${targetId}`);
  const premiumList = await redisGet('premium_users_list') ?? [];
  const newList = premiumList.filter(id => id !== targetId);
  await redisSet('premium_users_list', newList);

  ctx.reply({ content: `✅ Premium **desactivado** para <@${targetId}>. El usuario ha perdido acceso a las funciones Premium.` });
}

// ──────────────────────────────────────────────────────────────
//  Comandos Premium (funcionalidades exclusivas)
// ──────────────────────────────────────────────────────────────

async function cmdFlex(ctx) {
  const entry = await db.getUser(ctx.userId);
  if (!entry) return ctx.reply({ content: '❌ Sin cuenta vinculada.', ephemeral: true });
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
  const embed = new EmbedBuilder()
    .setTitle(`✨ ${profile.displayName}`)
    .setDescription(`\`\`\`\n╔════════════════════════════╗\n║     TARJETA DE PERFIL      ║\n╚════════════════════════════╝\`\`\`\n*${profile.description?.slice(0, 120) || 'Sin descripción'}*`)
    .setColor(userColor).setImage(avatarFull)
    .addFields(
      { name: '🎮 Estado',     value: label,                   inline: true },
      { name: '📅 Días',       value: `${age}`,                 inline: true },
      { name: rank.name,       value: `${eco?.points ?? 0} pts`,inline: true },
      { name: '👥 Amigos',     value: `**${friends}**`,         inline: true },
      { name: '👣 Seguidores', value: `**${followers}**`,       inline: true },
      { name: '🏰 Grupos',     value: `**${groups.length}**`,   inline: true },
      { name: '🏅 Insignias',  value: `**${badges.length}+**`,  inline: true },
      { name: '⭐ Premium',     value: (await isPremium(ctx.userId)) ? 'Activo ✅' : 'No ❌', inline: true },
      { name: '\u200B',        value: '\u200B',                  inline: true },
    )
    .setURL(`https://www.roblox.com/users/${entry.robloxId}/profile`)
    .setFooter({ text: `⭐ Usuario Premium · ${new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}` })
    .setTimestamp();
  if (bgUrl) embed.setImage(bgUrl).setThumbnail(avatarFull);
  if (achList.length) embed.addFields({ name: '🏅 Logros', value: achList.join(' ') });
  if (rank.next) embed.addFields({ name: 'Progreso de rango', value: `${progressBar(eco?.points ?? 0, rank.next)} ${eco?.points ?? 0}/${rank.next}` });
  ctx.reply({ embeds: [embed] });
}

async function cmdHistorial(ctx) {
  if (!await isPremium(ctx.userId)) return premiumEmbed(ctx);
  const entry = await db.getUser(ctx.userId);
  if (!entry) return ctx.reply({ content: '❌ No tienes cuenta vinculada.', ephemeral: true });
  const history = await db.getHistory(ctx.userId) ?? [];
  if (!history.length) return ctx.reply('📜 Sin historial aún.\nSe registra automáticamente cuando usas `/estado` mientras juegas en Roblox.');
  const userColor = entry.profileColor || 0x1900ff;
  const embed = new EmbedBuilder()
    .setTitle(`📜 Historial de juegos de ${entry.robloxUsername}`)
    .setDescription(history.map((h, i) => {
      const date = new Date(h.playedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      return `**${i + 1}.** [${h.gameName}](https://www.roblox.com/games/${h.placeId})\n› ${date}`;
    }).join('\n\n'))
    .setColor(userColor)
    .setFooter({ text: `${history.length}/20 registrados · Se actualiza con /estado` }).setTimestamp();
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('clear_history').setLabel('🗑️ Borrar historial').setStyle(ButtonStyle.Danger),
  );
  const msg = await ctx.replyAndFetch({ embeds: [embed], components: [row] });
  if (!msg) return;
  const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30000 });
  collector.on('collect', async (i) => {
    if (i.user.id !== ctx.userId) return i.reply({ content: '❌ Solo tú puedes borrar tu historial.', ephemeral: true });
    await db.deleteHistory(ctx.userId);
    await i.update({ embeds: [new EmbedBuilder().setTitle('🗑️ Historial borrado').setColor(0xED4245).setDescription('Tu historial de juegos fue eliminado correctamente.')], components: [] });
  });
  collector.on('end', () => msg.edit({ components: [] }).catch(() => {}));
}

async function cmdComparar(ctx, targetUser1, targetUser2) {
  if (!await isPremium(ctx.userId)) return premiumEmbed(ctx);
  if (!targetUser1 || !targetUser2) return ctx.reply({ content: '❌ Menciona a dos usuarios.', ephemeral: true });
  const [e1, e2] = await Promise.all([db.getUser(targetUser1.id), db.getUser(targetUser2.id)]);
  if (!e1) return ctx.reply({ content: `❌ **${targetUser1.username}** sin cuenta.`, ephemeral: true });
  if (!e2) return ctx.reply({ content: `❌ **${targetUser2.username}** sin cuenta.`, ephemeral: true });
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
  ctx.reply({ embeds: [new EmbedBuilder().setTitle(`⚔️ ${p1.name}  vs  ${p2.name}`)
    .setColor(userColor).setThumbnail(av1)
    .setDescription(`Grupos en común: **${common.length}**${common.length ? ` (${common.slice(0,3).map(g=>g.group.name).join(', ')})` : ''}`)
    .addFields(
      { name: `👤 ${p1.name}`,                  value: '\u200B', inline: true }, { name: '⚔️', value: '\u200B', inline: true }, { name: `👤 ${p2.name}`,                  value: '\u200B', inline: true },
      { name: `${w(fr1,fr2)} ${fr1}`,           value: '\u200B', inline: true }, { name: '👥 Amigos',     value: '\u200B', inline: true }, { name: `${w(fr2,fr1)} ${fr2}`,           value: '\u200B', inline: true },
      { name: `${w(fo1,fo2)} ${fo1}`,           value: '\u200B', inline: true }, { name: '👣 Seguidores', value: '\u200B', inline: true }, { name: `${w(fo2,fo1)} ${fo2}`,           value: '\u200B', inline: true },
      { name: `${w(g1.length,g2.length)} ${g1.length}`, value: '\u200B', inline: true }, { name: '🏰 Grupos', value: '\u200B', inline: true }, { name: `${w(g2.length,g1.length)} ${g2.length}`, value: '\u200B', inline: true },
      { name: `${w(age1,age2)} ${age1}d`,       value: '\u200B', inline: true }, { name: '📅 Días',       value: '\u200B', inline: true }, { name: `${w(age2,age1)} ${age2}d`,       value: '\u200B', inline: true },
    ).setFooter({ text: '🏆 = ganador · 🤝 = empate · ⭐ Función Premium' })] });
}

async function cmdMiStats(ctx) {
  if (!await isPremium(ctx.userId)) return premiumEmbed(ctx);
  const entry = await db.getUser(ctx.userId);
  if (!entry) return ctx.reply({ content: '❌ Sin cuenta vinculada.', ephemeral: true });
  const stats = await db.getGameStats(ctx.userId) ?? { games: {} };
  const games = Object.entries(stats.games).sort((a, b) => b[1].count - a[1].count).slice(0, 10);
  if (!games.length) return ctx.reply({ content: '📊 Aún no hay estadísticas. Juega Roblox y usa `/estado`.', ephemeral: true });
  const userColor = entry.profileColor || 0x1900ff;
  const embed = new EmbedBuilder()
    .setTitle(`📊 Estadísticas de juego de ${entry.robloxUsername}`)
    .setColor(userColor)
    .setDescription(games.map(([name, data], i) => `**${i+1}.** ${name} — **${data.count}** sesión${data.count !== 1 ? 'es' : ''}`).join('\n'))
    .setFooter({ text: 'Basado en tu historial de /estado' });
  ctx.reply({ embeds: [embed] });
}

async function cmdAddAlt(ctx, username) {
  if (!await isPremium(ctx.userId)) return premiumEmbed(ctx);
  const clean = sanitizeUsername(username);
  if (!clean) return ctx.reply({ content: '❌ Nombre inválido.', ephemeral: true });
  const robloxUser = await roblox.getUserByName(clean);
  if (!robloxUser) return ctx.reply({ content: '❌ Usuario no encontrado.', ephemeral: true });
  const alts = await db.getAlts(ctx.userId) ?? [];
  if (alts.length >= 3) return ctx.reply({ content: '❌ Ya tienes 3 alts vinculadas (máximo).', ephemeral: true });
  if (alts.find(a => a.id === robloxUser.id)) return ctx.reply({ content: '❌ Esa cuenta ya está vinculada como alt.', ephemeral: true });
  const main = await db.getUser(ctx.userId);
  if (main?.robloxId === robloxUser.id) return ctx.reply({ content: '❌ Esa es tu cuenta principal.', ephemeral: true });
  alts.push({ id: robloxUser.id, name: robloxUser.name, displayName: robloxUser.displayName });
  await db.saveAlts(ctx.userId, alts);
  ctx.reply({ embeds: [new EmbedBuilder().setTitle('✅ Alt añadida').setColor(0x57F287).setDescription(`**${robloxUser.displayName}** (@${robloxUser.name})`)] });
}

async function cmdAlts(ctx) {
  if (!await isPremium(ctx.userId)) return premiumEmbed(ctx);
  const alts = await db.getAlts(ctx.userId) ?? [];
  if (!alts.length) return ctx.reply({ content: '❌ No tienes alts vinculadas. Usa `/addalt <usuario>`.', ephemeral: true });
  const userEntry = await db.getUser(ctx.userId);
  const userColor = userEntry?.profileColor || 0x1900ff;
  const embed = new EmbedBuilder()
    .setTitle('👥 Tus cuentas alt')
    .setColor(userColor)
    .setDescription(alts.map((a, i) => `**${i+1}.** [${a.displayName}](https://www.roblox.com/users/${a.id}/profile) (@${a.name})`).join('\n'));
  ctx.reply({ embeds: [embed] });
}

async function cmdSetFlexBg(ctx, url) {
  if (!await isPremium(ctx.userId)) return premiumEmbed(ctx);
  if (!url || !url.match(/^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i)) return ctx.reply({ content: '❌ URL inválida. Debe ser una imagen (jpg, png, gif).', ephemeral: true });
  await db.saveFlexBg(ctx.userId, url);
  ctx.reply({ content: '✅ Fondo de /flex actualizado.', ephemeral: true });
}

// ──────────────────────────────────────────────────────────────
//  Compra de Premium con PayPal (botón de pago)
// ──────────────────────────────────────────────────────────────

async function cmdBuyPremium(ctx) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('buy_7d').setLabel('⭐ 7 días - $1.99').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('buy_30d').setLabel('💎 30 días - $4.99').setStyle(ButtonStyle.Danger),
  );

  const userEntry = await db.getUser(ctx.userId);
  const userColor = userEntry?.profileColor || 0x1900ff;
  const embed = new EmbedBuilder()
    .setTitle('🛒 Comprar Premium')
    .setColor(userColor)
    .setDescription('Selecciona el plan que deseas adquirir. Serás redirigido a PayPal para completar el pago de forma segura.');

  const msg = await ctx.replyAndFetch({ embeds: [embed], components: [row] });
  if (!msg) return;

  const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });
  collector.on('collect', async (i) => {
    if (i.user.id !== ctx.userId) return i.reply({ content: '❌ Solo quien ejecutó el comando.', ephemeral: true });

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
      .setTitle(`🔗 Pago — ${itemName}`)
      .setColor(0x009CDE)
      .setDescription(`Haz clic en el botón para pagar **$${amount}** con PayPal.\nEl Premium se activará automáticamente.`)
      .setFooter({ text: 'Serás redirigido a PayPal' });

    const linkRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel('💳 Pagar con PayPal').setStyle(ButtonStyle.Link).setURL(paypalUrl)
    );

    await i.update({ embeds: [newEmbed], components: [linkRow] });
  });

  collector.on('end', () => msg.edit({ components: [] }).catch(() => {}));
}

module.exports = {
  cmdPremiumStatus,
  cmdActivarPremium,
  cmdDesactivarPremium,
  cmdFlex,
  cmdHistorial,
  cmdComparar,
  cmdMiStats,
  cmdAddAlt,
  cmdAlts,
  cmdSetFlexBg,
  cmdBuyPremium
};
