// commands/owner.js
const {
  EmbedBuilder
} = require('discord.js');

const { db, redisGet, redisSet, redisDel } = require('./utils/database');
const { getAnimeGif } = require('./utils/helpers');
const { SHOP_ITEMS } = require('./utils/constants');

// ──────────────────────────────────────────────────────────────
//  Activar / Desactivar Premium manualmente
// ──────────────────────────────────────────────────────────────

async function cmdActivarPremium(ctx, targetId, dias) {
  if (ctx.userId !== process.env.BOT_OWNER_ID)
    return ctx.reply({ content: '❌ Solo el dueño del bot.', ephemeral: true });
  if (!targetId) return ctx.reply({ content: '❌ Debes proporcionar el Discord ID del usuario.', ephemeral: true });
  const expDate = dias ? new Date(Date.now() + dias * 86400000).toISOString() : null;
  await db.savePremium(targetId, { activatedAt: new Date().toISOString(), expiresAt: expDate, activatedBy: ctx.userId, durationDays: dias ?? null });
  const premiumList = await redisGet('premium_users_list') ?? [];
  if (!premiumList.includes(targetId)) { premiumList.push(targetId); await redisSet('premium_users_list', premiumList); }
  ctx.reply({ content: `✅ Premium activado para <@${targetId}>${dias ? ` por **${dias} días**` : ' **permanentemente**'}.` });
}

async function cmdDesactivarPremium(ctx, targetId) {
  if (ctx.userId !== process.env.BOT_OWNER_ID)
    return ctx.reply({ content: '❌ Solo el dueño del bot.', ephemeral: true });
  if (!targetId) return ctx.reply({ content: '❌ Debes proporcionar el Discord ID del usuario.', ephemeral: true });

  const existing = await db.getPremium(targetId);
  if (!existing) return ctx.reply({ content: `❌ El usuario <@${targetId}> no tiene Premium activo.`, ephemeral: true });

  await redisDel(`premium:${targetId}`);
  const premiumList = await redisGet('premium_users_list') ?? [];
  const newList = premiumList.filter(id => id !== targetId);
  await redisSet('premium_users_list', newList);

  ctx.reply({ content: `✅ Premium **desactivado** para <@${targetId}>.` });
}

// ──────────────────────────────────────────────────────────────
//  Encarcelar
// ──────────────────────────────────────────────────────────────

async function cmdEncarcelar(ctx, targetUser, horas = 1) {
  if (ctx.userId !== process.env.BOT_OWNER_ID) return ctx.reply({ content: '❌ Solo el dueño del bot.', ephemeral: true });
  const until = new Date(Date.now() + horas * 3600000).toISOString();
  await redisSet(`jailed:${targetUser.id}`, { until, reason: 'owner_action' });
  
  const gifUrl = await getAnimeGif('handcuff');
  const embed = new EmbedBuilder()
    .setTitle('🔒 Usuario encarcelado')
    .setColor(0xED4245)
    .setDescription(`**${targetUser.username}** ha sido encarcelado por ${horas} hora(s).`);
  if (gifUrl) embed.setImage(gifUrl);
  
  ctx.reply({ embeds: [embed] });
}

// ──────────────────────────────────────────────────────────────
//  Gestión de puntos
// ──────────────────────────────────────────────────────────────

async function cmdSetPuntos(ctx, targetUser, cantidad) {
  if (ctx.userId !== process.env.BOT_OWNER_ID) return ctx.reply({ content: '❌ Solo el dueño.', ephemeral: true });
  if (cantidad < 0) return ctx.reply({ content: '❌ La cantidad no puede ser negativa.', ephemeral: true });
  const eco = await db.getEconomy(targetUser.id) ?? { points: 0, totalEarned: 0 };
  eco.points = cantidad;
  await db.saveEconomy(targetUser.id, eco);
  ctx.reply(`✅ Puntos de **${targetUser.username}** establecidos a ${cantidad}.`);
}

async function cmdAddPuntos(ctx, targetUser, cantidad) {
  if (ctx.userId !== process.env.BOT_OWNER_ID) return ctx.reply({ content: '❌ Solo el dueño.', ephemeral: true });
  const eco = await db.getEconomy(targetUser.id) ?? { points: 0, totalEarned: 0 };
  eco.points = (eco.points ?? 0) + cantidad;
  eco.totalEarned = (eco.totalEarned ?? 0) + cantidad;
  await db.saveEconomy(targetUser.id, eco);
  ctx.reply(`✅ Se añadieron ${cantidad} puntos a **${targetUser.username}**. Ahora tiene ${eco.points}.`);
}

// ──────────────────────────────────────────────────────────────
//  Color de perfil del owner
// ──────────────────────────────────────────────────────────────

async function cmdOwnerColor(ctx, hexColor) {
  if (ctx.userId !== process.env.BOT_OWNER_ID) return ctx.reply({ content: '❌ Solo el dueño.', ephemeral: true });
  const entry = await db.getUser(ctx.userId);
  if (!entry) return ctx.reply('❌ Sin cuenta vinculada.');
  if (!/^#[0-9A-F]{6}$/i.test(hexColor)) return ctx.reply('❌ Formato inválido. Usa #RRGGBB.');
  const colorInt = parseInt(hexColor.slice(1), 16);
  entry.profileColor = colorInt;
  await db.saveUser(ctx.userId, entry);
  ctx.reply(`✅ Color de perfil cambiado a ${hexColor}.`);
}

async function cmdCambiarColor(ctx, colorId) {
  if (ctx.userId !== process.env.BOT_OWNER_ID) return ctx.reply({ content: '❌ Solo el dueño del bot puede usar este comando.', ephemeral: true });
  const item = SHOP_ITEMS.find(i => i.id === colorId && i.type === 'color');
  if (!item) return ctx.reply({ content: '❌ ID de color inválido. Usa los IDs de `/tienda`.', ephemeral: true });
  const entry = await db.getUser(ctx.userId);
  if (!entry) return ctx.reply({ content: '❌ No tienes cuenta vinculada.', ephemeral: true });
  entry.profileColor = item.value;
  if (!entry.inventory) entry.inventory = [];
  if (!entry.inventory.includes(item.id)) entry.inventory.push(item.id);
  await db.saveUser(ctx.userId, entry);
  ctx.reply({ content: `✅ Color cambiado a **${item.name}**.`, ephemeral: true });
}

module.exports = {
  cmdActivarPremium,
  cmdDesactivarPremium,
  cmdEncarcelar,
  cmdSetPuntos,
  cmdAddPuntos,
  cmdOwnerColor,
  cmdCambiarColor
};
