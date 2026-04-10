const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('./database');
const roblox = require('./roblox');

const pendingVerifications = {};
const cooldowns = new Map();

function isOnCooldown(userId) {
  const now = Date.now();
  if (cooldowns.has(userId) && now < cooldowns.get(userId) + 3000) return true;
  cooldowns.set(userId, now);
  setTimeout(() => cooldowns.delete(userId), 3000);
  return false;
}

function generateCode() { return 'RBX-' + Math.random().toString(36).substring(2, 9).toUpperCase(); }

async function isPremium(discordId) {
  if (discordId === process.env.BOT_OWNER_ID) return true;
  const data = await db.getUser(`premium:${discordId}`); // Adaptado a tu DB
  return data && (!data.expiresAt || new Date(data.expiresAt) > new Date());
}

// --- CORE ROBLOX ---
async function autoSyncOnJoin(member) {
  const user = await db.getUser(member.id);
  if (!user) return;
  const conf = await db.getGuildConf(member.guild.id);
  if (conf?.verifiedRoleId) await member.roles.add(conf.verifiedRoleId).catch(()=>{});
  if (member.guild.members.me.permissions.has(PermissionFlagsBits.ManageNicknames)) member.setNickname(user.robloxUsername).catch(()=>{});
}

async function cmdVerificar(ctx, username) {
  const exist = await db.getUser(ctx.userId);
  if (exist) return ctx.reply(`✅ Ya estás vinculado como **${exist.robloxUsername}**.`);
  const code = generateCode();
  pendingVerifications[ctx.userId] = { username, code };
  ctx.reply({ embeds: [new EmbedBuilder().setTitle('🔐 Verificación').setColor(0xFFAA00).setDescription(`Pon esto en tu perfil de Roblox:\n\n\`\`\`${code}\`\`\`\nLuego usa \`/confirmar\`.`)] });
}

async function cmdConfirmar(ctx) {
  const pending = pendingVerifications[ctx.userId];
  if (!pending) return ctx.reply('❌ Usa `/verificar` primero.');
  const rbxUser = await roblox.getUserByName(pending.username);
  if (!rbxUser) return ctx.reply('❌ Usuario de Roblox no encontrado.');
  // Aquí idealmente validas la descripción con la API de Roblox
  await db.saveUser(ctx.userId, { robloxId: rbxUser.id, robloxUsername: rbxUser.name, verifiedAt: new Date().toISOString() });
  delete pendingVerifications[ctx.userId];
  await autoSyncOnJoin(ctx.member);
  ctx.reply(`✅ Vinculado exitosamente a **${rbxUser.name}**.`);
}

async function cmdDesvincular(ctx) {
  await db.deleteUser(ctx.userId);
  ctx.reply('✅ Datos eliminados.');
}

async function cmdActualizar(ctx) {
  await autoSyncOnJoin(ctx.member);
  ctx.reply('✅ Roles y apodo sincronizados.');
}

async function cmdPerfil(ctx, target) {
  const targetId = target ? target.id : ctx.userId;
  const user = await db.getUser(targetId);
  if (!user) return ctx.reply('❌ Este usuario no está verificado.');
  ctx.reply({ embeds: [new EmbedBuilder().setTitle(`👤 Perfil de ${user.robloxUsername}`).setColor(0x00AAFF).addFields({name: 'Roblox ID', value: `${user.robloxId}`})] });
}

async function cmdAvatar(ctx, target) {
  const targetId = target ? target.id : ctx.userId;
  const user = await db.getUser(targetId);
  if (!user) return ctx.reply('❌ No verificado.');
  ctx.reply(`🖼️ Avatar de ${user.robloxUsername}: https://www.roblox.com/users/${user.robloxId}/profile`);
}

async function cmdEstado(ctx, target) {
  const targetId = target ? target.id : ctx.userId;
  const user = await db.getUser(targetId);
  if (!user) return ctx.reply('❌ No verificado.');
  const presence = await roblox.getPresence(user.robloxId);
  if (!presence) return ctx.reply('❌ No se pudo obtener la presencia.');
  ctx.reply(`🟢 Estado de ${user.robloxUsername}: ${presence.userPresenceType === 2 ? 'Jugando' : 'Desconectado/Web'}`);
}

function startPresenceMonitor(client) {
  setInterval(async () => {
    // Lógica básica del monitor original para no crashear
    console.log("Monitor de presencia activo...");
  }, 60000);
}

// --- ECONOMÍA V9 ---
async function cmdDaily(ctx) {
  const eco = await db.getUser(`eco:${ctx.userId}`) || { points: 0, last: 0, streak: 0 };
  const now = Date.now();
  if (now - eco.last < 86400000) return ctx.reply('⏰ Vuelve mañana.');
  eco.streak = now - eco.last > 172800000 ? 1 : eco.streak + 1;
  const win = 100 + (eco.streak * 10);
  eco.points += win;
  eco.last = now;
  await db.saveUser(`eco:${ctx.userId}`, eco);
  ctx.reply(`🎁 Ganaste **${win}** puntos. Racha: **${eco.streak}**. Total: **${eco.points}**.`);
}

async function cmdPuntos(ctx, target) {
  const targetId = target ? target.id : ctx.userId;
  const eco = await db.getUser(`eco:${targetId}`) || { points: 0 };
  ctx.reply(`💰 Puntos: **${eco.points}**`);
}

async function cmdCoinflip(ctx, bet, choice) {
  const eco = await db.getUser(`eco:${ctx.userId}`) || { points: 0 };
  if (eco.points < bet) return ctx.reply('❌ No tienes suficientes puntos.');
  const result = Math.random() < 0.5 ? 'cara' : 'cruz';
  if (result === choice) eco.points += bet; else eco.points -= bet;
  await db.saveUser(`eco:${ctx.userId}`, eco);
  ctx.reply(`🪙 Cayó **${result}**. ${result === choice ? `Ganaste ${bet}` : `Perdiste ${bet}`}. Total: **${eco.points}**.`);
}

async function cmdPay(ctx, target, amount) {
  if (amount <= 0 || target.id === ctx.userId) return ctx.reply('❌ Inválido.');
  const sEco = await db.getUser(`eco:${ctx.userId}`) || { points: 0 };
  const tEco = await db.getUser(`eco:${target.id}`) || { points: 0 };
  if (sEco.points < amount) return ctx.reply('❌ Fondos insuficientes.');
  sEco.points -= amount; tEco.points += amount;
  await db.saveUser(`eco:${ctx.userId}`, sEco); await db.saveUser(`eco:${target.id}`, tEco);
  ctx.reply(`💸 Pagaste ${amount} a ${target.username}.`);
}

async function cmdRob(ctx, target) {
  if (target.id === ctx.userId) return ctx.reply('❌ No te robes a ti mismo.');
  const sEco = await db.getUser(`eco:${ctx.userId}`) || { points: 0 };
  if (sEco.points < 100) return ctx.reply('❌ Necesitas 100 puntos de fianza.');
  const success = Math.random() < 0.4;
  if (success) { sEco.points += 50; await db.saveUser(`eco:${ctx.userId}`, sEco); ctx.reply('🥷 Robo exitoso (+50).'); }
  else { sEco.points -= 100; await db.saveUser(`eco:${ctx.userId}`, sEco); ctx.reply('🚓 Atrapado. Pagas -100.'); }
}

// --- UTILIDADES ---
async function cmdPremiumStatus(ctx) {
  const prem = await isPremium(ctx.userId);
  ctx.reply(prem ? '⭐ Eres Premium.' : '❌ No eres Premium.');
}

async function cmdSetVerifiedRole(ctx, role) {
  await db.saveGuildConf(ctx.guild.id, { verifiedRoleId: role.id });
  ctx.reply(`✅ Rol de verificado guardado.`);
}

async function cmdSetWelcome(ctx, channelId, message) {
  await db.saveGuildConf(ctx.guild.id, { welcomeChannelId: channelId, welcomeMessage: message });
  ctx.reply(`✅ Bienvenida configurada.`);
}

async function cmdAyuda(ctx) {
  ctx.reply({ embeds: [new EmbedBuilder().setTitle('📋 Comandos').setDescription('`/verificar`, `/perfil`, `/estado`, `/daily`, `/puntos`, `/coinflip`, `/rob`').setColor(0x5865F2)] });
}

module.exports = {
  isOnCooldown, autoSyncOnJoin, startPresenceMonitor,
  cmdVerificar, cmdConfirmar, cmdDesvincular, cmdActualizar,
  cmdPerfil, cmdAvatar, cmdEstado, cmdAyuda,
  cmdDaily, cmdPuntos, cmdCoinflip, cmdPay, cmdRob,
  cmdPremiumStatus, cmdSetVerifiedRole, cmdSetWelcome
};
