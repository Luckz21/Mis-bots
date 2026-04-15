// commands/owner.js
const { EmbedBuilder } = require('discord.js');
const { db, redisGet, redisSet, redisDel } = require('./utils/database');
const { getAnimeGif, getGuildLang } = require('./utils/helpers');
const { t } = require('./utils/translate');
const { SHOP_ITEMS } = require('./utils/constants');

async function replyEmbed(ctx, titleKey, descKey, color = 0x1900ff, ephemeral = false, args = []) {
  const lang = await getGuildLang(ctx.guild?.id);
  const title = await t(lang, titleKey, ...args);
  const description = await t(lang, descKey, ...args);
  const embed = new EmbedBuilder().setTitle(title).setDescription(description).setColor(color);
  return ctx.reply({ embeds: [embed], ephemeral });
}

async function cmdActivarPremium(ctx, targetId, dias) {
  if (ctx.userId !== process.env.BOT_OWNER_ID) return replyEmbed(ctx, 'error', 'owner_only', 0xED4245, true);
  if (!targetId) return replyEmbed(ctx, 'error', 'provide_user_id', 0xED4245, true);
  const expDate = dias ? new Date(Date.now() + dias * 86400000).toISOString() : null;
  await db.savePremium(targetId, { activatedAt: new Date().toISOString(), expiresAt: expDate, activatedBy: ctx.userId, durationDays: dias ?? null });
  const premiumList = await redisGet('premium_users_list') ?? [];
  if (!premiumList.includes(targetId)) { premiumList.push(targetId); await redisSet('premium_users_list', premiumList); }
  replyEmbed(ctx, 'success', 'owner_activarpremium', 0x57F287, false, [targetId, dias ? ` por ${dias} días` : ' permanentemente']);
}

async function cmdDesactivarPremium(ctx, targetId) {
  if (ctx.userId !== process.env.BOT_OWNER_ID) return replyEmbed(ctx, 'error', 'owner_only', 0xED4245, true);
  if (!targetId) return replyEmbed(ctx, 'error', 'provide_user_id', 0xED4245, true);
  const existing = await db.getPremium(targetId);
  if (!existing) return replyEmbed(ctx, 'error', 'user_no_premium', 0xED4245, true, [targetId]);
  await redisDel(`premium:${targetId}`);
  const premiumList = await redisGet('premium_users_list') ?? [];
  const newList = premiumList.filter(id => id !== targetId);
  await redisSet('premium_users_list', newList);
  replyEmbed(ctx, 'success', 'owner_desactivarpremium', 0x57F287, false, [targetId]);
}

async function cmdEncarcelar(ctx, targetUser, horas = 1) {
  if (ctx.userId !== process.env.BOT_OWNER_ID) return replyEmbed(ctx, 'error', 'owner_only', 0xED4245, true);
  const until = new Date(Date.now() + horas * 3600000).toISOString();
  await redisSet(`jailed:${targetUser.id}`, { until, reason: 'owner_action' });
  const gifUrl = await getAnimeGif('handcuff');
  const lang = await getGuildLang(ctx.guild?.id);
  const embed = new EmbedBuilder()
    .setTitle(await t(lang, 'owner_encarcelar_title'))
    .setColor(0xED4245)
    .setDescription(await t(lang, 'owner_encarcelar_desc', targetUser.username, horas));
  if (gifUrl) embed.setImage(gifUrl);
  ctx.reply({ embeds: [embed] });
}

async function cmdSetPuntos(ctx, targetUser, cantidad) {
  if (ctx.userId !== process.env.BOT_OWNER_ID) return replyEmbed(ctx, 'error', 'owner_only', 0xED4245, true);
  if (cantidad < 0) return replyEmbed(ctx, 'error', 'invalid_amount', 0xED4245, true);
  const eco = await db.getEconomy(targetUser.id) ?? { points: 0 };
  eco.points = cantidad;
  await db.saveEconomy(targetUser.id, eco);
  replyEmbed(ctx, 'success', 'owner_setpuntos', 0x57F287, false, [targetUser.username, cantidad]);
}

async function cmdAddPuntos(ctx, targetUser, cantidad) {
  if (ctx.userId !== process.env.BOT_OWNER_ID) return replyEmbed(ctx, 'error', 'owner_only', 0xED4245, true);
  const eco = await db.getEconomy(targetUser.id) ?? { points: 0, totalEarned: 0 };
  eco.points = (eco.points ?? 0) + cantidad;
  eco.totalEarned = (eco.totalEarned ?? 0) + cantidad;
  await db.saveEconomy(targetUser.id, eco);
  replyEmbed(ctx, 'success', 'owner_addpuntos', 0x57F287, false, [cantidad, targetUser.username, eco.points]);
}

async function cmdOwnerColor(ctx, hexColor) {
  if (ctx.userId !== process.env.BOT_OWNER_ID) return replyEmbed(ctx, 'error', 'owner_only', 0xED4245, true);
  const entry = await db.getUser(ctx.userId);
  if (!entry) return replyEmbed(ctx, 'error', 'no_linked_account', 0xED4245, true);
  if (!/^#[0-9A-F]{6}$/i.test(hexColor)) return replyEmbed(ctx, 'error', 'invalid_hex', 0xED4245, true);
  entry.profileColor = parseInt(hexColor.slice(1), 16);
  await db.saveUser(ctx.userId, entry);
  replyEmbed(ctx, 'success', 'owner_ownercolor', 0x57F287, false, [hexColor]);
}

async function cmdCambiarColor(ctx, colorId) {
  if (ctx.userId !== process.env.BOT_OWNER_ID) return replyEmbed(ctx, 'error', 'owner_only', 0xED4245, true);
  const item = SHOP_ITEMS.find(i => i.id === colorId && i.type === 'color');
  if (!item) return replyEmbed(ctx, 'error', 'invalid_color_id', 0xED4245, true);
  const entry = await db.getUser(ctx.userId);
  if (!entry) return replyEmbed(ctx, 'error', 'no_linked_account', 0xED4245, true);
  entry.profileColor = item.value;
  if (!entry.inventory) entry.inventory = [];
  if (!entry.inventory.includes(item.id)) entry.inventory.push(item.id);
  await db.saveUser(ctx.userId, entry);
  replyEmbed(ctx, 'success', 'owner_cambiarcolor', 0x57F287, true, [item.name]);
}

async function cmdSendDM(ctx, targetId, message) {
  if (ctx.userId !== process.env.BOT_OWNER_ID) 
    return replyEmbed(ctx, 'error', 'owner_only', 0xED4245, true);
  if (!targetId || !message) 
    return replyEmbed(ctx, 'error', 'senddm_usage', 0xED4245, true);
  
  try {
    const user = await ctx.guild.client.users.fetch(targetId);
    const embed = new EmbedBuilder()
      .setTitle('📨 Mensaje del equipo de LockBox')
      .setDescription(message)
      .setColor(0x1900ff)
      .setFooter({ text: `Enviado por ${ctx.username}` })
      .setTimestamp();
    
    await user.send({ embeds: [embed] });
    replyEmbed(ctx, 'success', 'senddm_success', 0x57F287, true, [user.username]);
  } catch (e) {
    replyEmbed(ctx, 'error', 'senddm_fail', 0xED4245, true, [targetId]);
  }
}

module.exports = {
  cmdActivarPremium, cmdDesactivarPremium, cmdEncarcelar,
  cmdSetPuntos, cmdAddPuntos, cmdOwnerColor, cmdCambiarColor,
  cmdSendDM  // <-- nueva
};
