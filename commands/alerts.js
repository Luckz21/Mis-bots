// commands/alerts.js
const {
  EmbedBuilder
} = require('discord.js');

const { db } = require('./utils/database');
const { isPremium, filterAlertsByResetPeriod } = require('./utils/helpers');

// ──────────────────────────────────────────────────────────────
//  Alertas (ver, quitar)
// ──────────────────────────────────────────────────────────────

async function cmdAlertas(ctx, sub, targetUser) {
  if (sub === 'ver') {
    let alerts = await db.getAlerts(ctx.userId) ?? [];
    const isPremiumUser = await isPremium(ctx.userId);
    if (!isPremiumUser) alerts = filterAlertsByResetPeriod(alerts);
    if (!alerts.length) return ctx.reply({ content: '❌ No tienes alertas activas (las gratuitas se reinician a las 20:00 RD).', ephemeral: true });
    const userEntry = await db.getUser(ctx.userId);
    const userColor = userEntry?.profileColor || 0x1900ff;
    ctx.reply({ embeds: [new EmbedBuilder().setTitle('🔔 Tus alertas de presencia').setColor(userColor)
      .setDescription(alerts.map((a, i) => `**${i + 1}.** **${a.watchedUsername}** (\`${a.watchedRobloxId}\`)${a.createdAt ? ` · ${new Date(a.createdAt).toLocaleTimeString('es-ES')}` : ''}`).join('\n'))
      .setFooter({ text: 'Recibirás un ping cuando cambie su estado' })] });
    return;
  }
  if (sub === 'quitar') {
    if (!targetUser) return ctx.reply({ content: '❌ Menciona al usuario cuya alerta quieres eliminar.', ephemeral: true });
    const entry = await db.getUser(targetUser.id);
    if (!entry) return ctx.reply({ content: '❌ Ese usuario no tiene cuenta de Roblox vinculada.', ephemeral: true });
    let alerts = await db.getAlerts(ctx.userId) ?? [];
    const isPremiumUser = await isPremium(ctx.userId);
    if (!isPremiumUser) alerts = filterAlertsByResetPeriod(alerts);
    alerts = alerts.filter(a => String(a.watchedRobloxId) !== String(entry.robloxId));
    await db.saveAlerts(ctx.userId, alerts);
    return ctx.reply(`✅ Alerta de **${entry.robloxUsername}** eliminada correctamente.`);
  }
  ctx.reply({ content: '❌ Uso: `!alertas ver` — Ver tus alertas\n`!alertas quitar @usuario` — Eliminar una alerta', ephemeral: true });
}

// ──────────────────────────────────────────────────────────────
//  Privacidad (permitir / bloquear)
// ──────────────────────────────────────────────────────────────

async function cmdPermitir(ctx, tipo) {
  if (!['presencia', 'perfil'].includes(tipo)) return ctx.reply({ content: '❌ Uso: `!permitir presencia` o `!permitir perfil`', ephemeral: true });
  const entry = await db.getUser(ctx.userId);
  if (!entry) return ctx.reply({ content: '❌ No tienes cuenta vinculada.', ephemeral: true });
  await db.saveUser(ctx.userId, { ...entry, [tipo === 'presencia' ? 'privacyPresence' : 'privacyProfile']: true });
  ctx.reply(`✅ Tu **${tipo === 'presencia' ? 'presencia en Roblox' : 'perfil'}** ahora es **visible** para otros.`);
}

async function cmdBloquear(ctx, tipo) {
  if (!['presencia', 'perfil'].includes(tipo)) return ctx.reply({ content: '❌ Uso: `!bloquear presencia` o `!bloquear perfil`', ephemeral: true });
  const entry = await db.getUser(ctx.userId);
  if (!entry) return ctx.reply({ content: '❌ No tienes cuenta vinculada.', ephemeral: true });
  await db.saveUser(ctx.userId, { ...entry, [tipo === 'presencia' ? 'privacyPresence' : 'privacyProfile']: false });
  ctx.reply(`🔒 Tu **${tipo === 'presencia' ? 'presencia en Roblox' : 'perfil'}** ahora es **privada**.`);
}

// ──────────────────────────────────────────────────────────────
//  DMs (activar/desactivar mensajes directos)
// ──────────────────────────────────────────────────────────────

async function cmdDMs(ctx, enable) {
  const entry = await db.getUser(ctx.userId);
  if (!entry) return ctx.reply({ content: '❌ No tienes cuenta vinculada.', ephemeral: true });
  const newStatus = enable ?? !(entry.allowDMs ?? true);
  entry.allowDMs = newStatus;
  await db.saveUser(ctx.userId, entry);
  ctx.reply({ content: `✅ Mensajes directos del bot **${newStatus ? 'activados' : 'desactivados'}**.`, ephemeral: true });
}

module.exports = {
  cmdAlertas,
  cmdPermitir,
  cmdBloquear,
  cmdDMs
};
