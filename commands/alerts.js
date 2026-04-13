// commands/alerts.js
const { EmbedBuilder } = require('discord.js');
const { db, redisGet, redisSet } = require('./utils/database');
const { isPremium, filterAlertsByResetPeriod, getGuildLang } = require('./utils/helpers');
const { t } = require('./utils/translate');

async function replyEmbed(ctx, titleKey, descKey, color = 0x1900ff, ephemeral = false, args = []) {
  const lang = await getGuildLang(ctx.guild?.id);
  const title = await t(lang, titleKey, ...args);
  const description = await t(lang, descKey, ...args);
  const embed = new EmbedBuilder().setTitle(title).setDescription(description).setColor(color);
  return ctx.reply({ embeds: [embed], ephemeral });
}

async function cmdAlertas(ctx, sub, targetUser) {
  const lang = await getGuildLang(ctx.guild?.id);
  if (sub === 'ver') {
    let alerts = await db.getAlerts(ctx.userId) ?? [];
    const isPremiumUser = await isPremium(ctx.userId);
    if (!isPremiumUser) alerts = filterAlertsByResetPeriod(alerts);
    if (!alerts.length) return replyEmbed(ctx, 'info', 'alerts_empty', 0x1900ff, true);
    const userEntry = await db.getUser(ctx.userId);
    const userColor = userEntry?.profileColor || 0x1900ff;
    const embed = new EmbedBuilder()
      .setTitle(await t(lang, 'alerts_list_title'))
      .setColor(userColor)
      .setDescription(alerts.map((a, i) => `**${i + 1}.** **${a.watchedUsername}** (\`${a.watchedRobloxId}\`)${a.createdAt ? ` · ${new Date(a.createdAt).toLocaleTimeString('es-ES')}` : ''}`).join('\n'))
      .setFooter({ text: await t(lang, 'alerts_footer') });
    ctx.reply({ embeds: [embed], ephemeral: true });
    return;
  }
  if (sub === 'quitar') {
    if (!targetUser) return replyEmbed(ctx, 'error', 'mention_user_to_remove_alert', 0xED4245, true);
    const entry = await db.getUser(targetUser.id);
    if (!entry) return replyEmbed(ctx, 'error', 'no_account', 0xED4245, true, [targetUser.username]);
    let alerts = await db.getAlerts(ctx.userId) ?? [];
    const isPremiumUser = await isPremium(ctx.userId);
    if (!isPremiumUser) alerts = filterAlertsByResetPeriod(alerts);
    alerts = alerts.filter(a => String(a.watchedRobloxId) !== String(entry.robloxId));
    await db.saveAlerts(ctx.userId, alerts);
    return replyEmbed(ctx, 'success', 'alerts_removed', 0x57F287, true, [entry.robloxUsername]);
  }
  replyEmbed(ctx, 'error', 'alertas_usage', 0xED4245, true);
}

async function cmdPermitir(ctx, tipo) {
  const lang = await getGuildLang(ctx.guild?.id);
  if (!['presencia', 'perfil'].includes(tipo)) return replyEmbed(ctx, 'error', 'permitir_usage', 0xED4245, true);
  const entry = await db.getUser(ctx.userId);
  if (!entry) return replyEmbed(ctx, 'error', 'no_linked_account', 0xED4245, true);
  await db.saveUser(ctx.userId, { ...entry, [tipo === 'presencia' ? 'privacyPresence' : 'privacyProfile']: true });
  replyEmbed(ctx, 'success', tipo === 'presencia' ? 'presence_public' : 'profile_public', 0x57F287, true);
}

async function cmdBloquear(ctx, tipo) {
  const lang = await getGuildLang(ctx.guild?.id);
  if (!['presencia', 'perfil'].includes(tipo)) return replyEmbed(ctx, 'error', 'bloquear_usage', 0xED4245, true);
  const entry = await db.getUser(ctx.userId);
  if (!entry) return replyEmbed(ctx, 'error', 'no_linked_account', 0xED4245, true);
  await db.saveUser(ctx.userId, { ...entry, [tipo === 'presencia' ? 'privacyPresence' : 'privacyProfile']: false });
  replyEmbed(ctx, 'success', tipo === 'presencia' ? 'presence_private' : 'profile_private', 0x57F287, true);
}

async function cmdDMs(ctx, enable) {
  const lang = await getGuildLang(ctx.guild?.id);
  const entry = await db.getUser(ctx.userId);
  if (!entry) return replyEmbed(ctx, 'error', 'no_linked_account', 0xED4245, true);
  const newStatus = enable ?? !(entry.allowDMs ?? true);
  entry.allowDMs = newStatus;
  await db.saveUser(ctx.userId, entry);
  replyEmbed(ctx, 'success', newStatus ? 'dms_enabled' : 'dms_disabled', 0x57F287, true);
}

module.exports = { cmdAlertas, cmdPermitir, cmdBloquear, cmdDMs };
