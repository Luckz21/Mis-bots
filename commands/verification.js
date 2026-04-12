// commands/verification.js
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType
} = require('discord.js');

const { sanitizeUsername } = require('../security');
const { t } = require('../i18n');
const { db, redisGet, redisSet } = require('./utils/database');
const roblox = require('./utils/roblox');
const { isPremium, getGuildLang, checkAchievements, syncRoles } = require('./utils/helpers');

// Estado compartido (solo dentro de este módulo)
const pendingVerifications = {};
const pendingCaptchas = new Set();

function generateCode() {
  return 'RBX-' + Math.random().toString(36).substring(2, 9).toUpperCase();
}

// ──────────────────────────────────────────────────────────────────────────────
//  Comandos públicos
// ──────────────────────────────────────────────────────────────────────────────

async function cmdCaptcha(ctx) {
  const lang = await getGuildLang(ctx.guild?.id);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('captcha_verify').setLabel('✅ Soy humano').setStyle(ButtonStyle.Success),
  );
  const msg = await ctx.replyAndFetch({
    embeds: [
      new EmbedBuilder()
        .setTitle(t(lang, 'captcha_title'))
        .setColor(0x1900ff)
        .setDescription(t(lang, 'captcha_desc'))
    ],
    components: [row]
  });
  if (!msg) return;
  const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });
  collector.on('collect', async (i) => {
    if (i.user.id !== ctx.userId) return i.reply({ content: '❌ Solo quien ejecutó el comando.', ephemeral: true });
    pendingCaptchas.add(ctx.userId);
    await i.update({
      embeds: [new EmbedBuilder().setTitle('✅ Verificación completada').setColor(0x57F287).setDescription(t(lang, 'captcha_success'))],
      components: []
    });
  });
  collector.on('end', () => msg.edit({ components: [] }).catch(() => {}));
}

async function cmdVerificar(ctx, robloxUsername) {
  const lang = await getGuildLang(ctx.guild?.id);
  if (!pendingCaptchas.has(ctx.userId)) {
    return ctx.reply({ content: '❌ Debes completar el captcha primero. Usa `/captcha`.', ephemeral: true });
  }
  pendingCaptchas.delete(ctx.userId);
  const clean = sanitizeUsername(robloxUsername);
  if (!clean) return ctx.reply({ content: '❌ Nombre de usuario inválido o demasiado corto.', ephemeral: true });
  const existing = await db.getUser(ctx.userId);
  if (existing) return ctx.reply({ content: t(lang, 'verify_already', existing.robloxUsername), ephemeral: true });
  const robloxUser = await roblox.getUserByName(clean);
  if (!robloxUser) return ctx.reply({ content: t(lang, 'verify_not_found'), ephemeral: true });
  const code = generateCode();
  pendingVerifications[ctx.userId] = { robloxId: robloxUser.id, robloxUsername: robloxUser.name, code };
  ctx.reply({
    embeds: [new EmbedBuilder()
      .setTitle(t(lang, 'verify_title'))
      .setColor(0x1900ff)
      .setDescription(`${t(lang, 'verify_step1')}\n${t(lang, 'verify_step2')}\n\`\`\`${code}\`\`\`\n${t(lang, 'verify_step3')}\n\n${t(lang, 'verify_time')}`)
      .addFields(
        { name: '👤 Usuario', value: `**${robloxUser.name}**`, inline: true },
        { name: '🆔 ID',      value: `\`${robloxUser.id}\``,  inline: true },
      )
      .setFooter({ text: 'El código solo verifica que eres el dueño de la cuenta' })
    ],
    ephemeral: true
  });
  setTimeout(() => { if (pendingVerifications[ctx.userId]?.code === code) delete pendingVerifications[ctx.userId]; }, 600000);
}

async function cmdConfirmar(ctx) {
  const lang    = await getGuildLang(ctx.guild?.id);
  const pending = pendingVerifications[ctx.userId];
  if (!pending) return ctx.reply({ content: t(lang, 'confirm_no_pending'), ephemeral: true });
  const profile = await roblox.getProfile(pending.robloxId);
  if (!profile) return ctx.reply({ content: t(lang, 'confirm_no_profile'), ephemeral: true });
  if (!(profile.description ?? '').includes(pending.code))
    return ctx.reply({ content: t(lang, 'confirm_code_fail', pending.code, pending.robloxUsername), ephemeral: true });
  await db.saveUser(ctx.userId, {
    robloxId: pending.robloxId, robloxUsername: pending.robloxUsername,
    verifiedAt: new Date().toISOString(), privacyPresence: false, privacyProfile: true,
    allowDMs: true,
  });
  const eco = await db.getEconomy(ctx.userId) ?? { points: 0 };
  const user = await db.getUser(ctx.userId);
  const newAchs = await checkAchievements(ctx.userId, eco, user);
  delete pendingVerifications[ctx.userId];
  await syncRoles(ctx.guild, ctx.userId, pending.robloxId);

  const createdProfile = await roblox.getProfile(pending.robloxId);
  if (createdProfile?.created) {
    const config = await db.getGuildConf(ctx.guild.id);
    const alertChannel = config?.alertChannelId ?? ctx.channelId;
    const birthdayList = await redisGet('birthday_monitor') ?? [];
    if (!birthdayList.find(b => b.discordId === ctx.userId)) {
      birthdayList.push({ discordId: ctx.userId, robloxId: pending.robloxId, channelId: alertChannel, guildId: ctx.guild.id, created: createdProfile.created });
      await redisSet('birthday_monitor', birthdayList);
    }
  }

  const config = await db.getGuildConf(ctx.guild.id);
  if (config?.welcomeChannelId) {
    const ch = await ctx.guild.channels.fetch(config.welcomeChannelId).catch(() => null);
    if (ch) ch.send((config.welcomeMessage || '¡Bienvenido {user}! Tu cuenta **{roblox}** fue verificada. 🎉')
      .replace('{user}', `<@${ctx.userId}>`)
      .replace('{roblox}', pending.robloxUsername))
      .catch(() => {});
  }
  const avatarUrl = await roblox.getAvatar(pending.robloxId);
  const embed = new EmbedBuilder().setTitle('✅ ¡Verificación exitosa!').setColor(0x57F287)
    .setThumbnail(avatarUrl)
    .setDescription(t(lang, 'confirm_success', pending.robloxUsername))
    .addFields(
      { name: '👁️ Perfil',   value: 'Visible para otros ✅', inline: true },
      { name: '🎮 Presencia', value: 'Privada por defecto 🔒',  inline: true },
    )
    .setFooter({ text: 'Puedes borrar el código de tu descripción de Roblox' });
  if (newAchs.length) embed.addFields({ name: '🏅 Logros desbloqueados', value: newAchs.map(a => `**${a.name}**`).join(', ') });
  ctx.reply({ embeds: [embed] });
}

async function cmdActualizar(ctx) {
  const entry = await db.getUser(ctx.userId);
  if (!entry) return ctx.reply({ content: '❌ No tienes cuenta de Roblox vinculada. Usa `/verificar` primero.', ephemeral: true });
  await syncRoles(ctx.guild, ctx.userId, entry.robloxId);
  ctx.reply({ content: '✅ Tus roles de Discord han sido actualizados según tu cuenta de Roblox.', ephemeral: true });
}

async function cmdDesvincular(ctx) {
  const entry = await db.getUser(ctx.userId);
  if (!entry) return ctx.reply({ content: '❌ No tienes ninguna cuenta de Roblox vinculada.', ephemeral: true });
  await db.deleteUser(ctx.userId);
  ctx.reply(`✅ Tu cuenta **${entry.robloxUsername}** fue desvinculada. Puedes volver a verificarte cuando quieras.`);
}

module.exports = {
  cmdCaptcha,
  cmdVerificar,
  cmdConfirmar,
  cmdActualizar,
  cmdDesvincular
};
