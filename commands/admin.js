// commands/admin.js
const {
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType
} = require('discord.js');

const { t } = require('../i18n');
const { db } = require('./utils/database');
const { getGuildLang } = require('./utils/helpers');

// ──────────────────────────────────────────────────────────────
//  Roles de verificación y Premium
// ──────────────────────────────────────────────────────────────

async function cmdSetVerifiedRole(ctx, role) {
  const config = await db.getGuildConf(ctx.guild.id) ?? {};
  config.verifiedRoleId = role.id;
  await db.saveGuildConf(ctx.guild.id, config);
  ctx.reply(`✅ Rol de verificado configurado: ${role}`);
}

async function cmdSetPremiumRole(ctx, role) {
  const config = await db.getGuildConf(ctx.guild.id) ?? {};
  config.premiumRoleId = role.id;
  await db.saveGuildConf(ctx.guild.id, config);
  ctx.reply(`✅ Rol Premium configurado: ${role}`);
}

// ──────────────────────────────────────────────────────────────
//  Vinculación de grupos de Roblox a roles
// ──────────────────────────────────────────────────────────────

async function cmdBindRole(ctx, groupId, minRank, role) {
  const config = await db.getGuildConf(ctx.guild.id) ?? {};
  if (!config.bindings) config.bindings = [];
  config.bindings = config.bindings.filter(b => String(b.groupId) !== String(groupId));
  config.bindings.push({ groupId: String(groupId), minRank: Number(minRank), roleId: role.id });
  await db.saveGuildConf(ctx.guild.id, config);
  ctx.reply(`✅ Vinculación creada:\nGrupo Roblox \`${groupId}\` con rango ≥ **${minRank}** → ${role}`);
}

async function cmdUnbindRole(ctx, groupId) {
  const config = await db.getGuildConf(ctx.guild.id);
  if (!config?.bindings?.length) return ctx.reply({ content: '❌ No hay vinculaciones configuradas.', ephemeral: true });
  config.bindings = config.bindings.filter(b => String(b.groupId) !== String(groupId));
  await db.saveGuildConf(ctx.guild.id, config);
  ctx.reply(`✅ Vinculación del grupo \`${groupId}\` eliminada.`);
}

async function cmdListRoles(ctx) {
  const config = await db.getGuildConf(ctx.guild.id);
  const userEntry = await db.getUser(ctx.userId);
  const userColor = userEntry?.profileColor || 0x1900ff;
  ctx.reply({ embeds: [new EmbedBuilder().setTitle('⚙️ Configuración de roles').setColor(userColor)
    .addFields(
      { name: '✅ Rol de verificado',      value: config?.verifiedRoleId ? `<@&${config.verifiedRoleId}>` : '_No configurado_' },
      { name: '⭐ Rol Premium',             value: config?.premiumRoleId  ? `<@&${config.premiumRoleId}>`  : '_No configurado_' },
      { name: '🏰 Vinculaciones de grupos', value: config?.bindings?.length ? config.bindings.map(b => `• Grupo \`${b.groupId}\` rango ≥ ${b.minRank} → <@&${b.roleId}>`).join('\n') : '_Sin vinculaciones_' },
      { name: '🔤 Formato de apodo',       value: config?.nicknameFormat ? `\`${config.nicknameFormat}\`` : '_Desactivado_' },
      { name: '🌐 Idioma del bot',          value: config?.lang ? `\`${config.lang}\`` : '`es` (español)' },
    )
    .setFooter({ text: 'Usa los comandos de admin para modificar esta configuración' })] });
}

// ──────────────────────────────────────────────────────────────
//  Mensajes de bienvenida
// ──────────────────────────────────────────────────────────────

async function cmdSetWelcome(ctx, channelId, message) {
  if (!ctx.guild.members.cache.get(ctx.userId)?.permissions.has(PermissionFlagsBits.ManageGuild))
    return ctx.reply({ content: t(await getGuildLang(ctx.guild.id), 'need_manage_guild'), ephemeral: true });
  const config = await db.getGuildConf(ctx.guild.id) ?? {};
  config.welcomeChannelId = channelId;
  config.welcomeMessage   = message || '¡Bienvenido {user}! Tu cuenta de Roblox **{roblox}** ha sido verificada. 🎉';
  await db.saveGuildConf(ctx.guild.id, config);
  ctx.reply(`✅ Mensaje de bienvenida configurado en <#${channelId}>.`);
}

// ──────────────────────────────────────────────────────────────
//  Canal de alertas
// ──────────────────────────────────────────────────────────────

async function cmdSetAlertChannel(ctx, channelId) {
  if (!ctx.guild.members.cache.get(ctx.userId)?.permissions.has(PermissionFlagsBits.ManageGuild))
    return ctx.reply({ content: t(await getGuildLang(ctx.guild.id), 'need_manage_guild'), ephemeral: true });
  const config = await db.getGuildConf(ctx.guild.id) ?? {};
  config.alertChannelId = channelId;
  await db.saveGuildConf(ctx.guild.id, config);
  ctx.reply(`✅ Canal de alertas de presencia configurado: <#${channelId}>`);
}

// ──────────────────────────────────────────────────────────────
//  Formato de apodo automático
// ──────────────────────────────────────────────────────────────

async function cmdSetNickname(ctx, format) {
  if (!ctx.guild.members.cache.get(ctx.userId)?.permissions.has(PermissionFlagsBits.ManageNicknames))
    return ctx.reply({ content: '❌ Necesitas **Gestionar Apodos**.', ephemeral: true });
  const config = await db.getGuildConf(ctx.guild.id) ?? {};
  config.nicknameFormat = format ?? null;
  await db.saveGuildConf(ctx.guild.id, config);
  if (format) ctx.reply(`✅ Auto-nickname activado: \`${format}\``);
  else ctx.reply('✅ Auto-nickname desactivado.');
}

// ──────────────────────────────────────────────────────────────
//  Idioma del bot
// ──────────────────────────────────────────────────────────────

async function cmdSetLang(ctx, lang) {
  if (!['es', 'en', 'pt'].includes(lang)) return ctx.reply({ content: '❌ Idiomas disponibles: `es` (Español), `en` (English), `pt` (Português)', ephemeral: true });
  if (!ctx.guild.members.cache.get(ctx.userId)?.permissions.has(PermissionFlagsBits.ManageGuild))
    return ctx.reply({ content: t(await getGuildLang(ctx.guild.id), 'need_manage_guild'), ephemeral: true });
  const config = await db.getGuildConf(ctx.guild.id) ?? {};
  config.lang = lang;
  await db.saveGuildConf(ctx.guild.id, config);
  const names = { es: '🇪🇸 Español', en: '🇺🇸 English', pt: '🇧🇷 Português' };
  ctx.reply(`✅ Idioma del bot cambiado a **${names[lang]}**.`);
}

// ──────────────────────────────────────────────────────────────
//  Prefijo para comandos de texto
// ──────────────────────────────────────────────────────────────

async function cmdSetPrefix(ctx, prefix) {
  if (!ctx.guild.members.cache.get(ctx.userId)?.permissions.has(PermissionFlagsBits.ManageGuild))
    return ctx.reply({ content: t(await getGuildLang(ctx.guild.id), 'need_manage_guild'), ephemeral: true });
  const config = await db.getGuildConf(ctx.guild.id) ?? {};
  config.prefix = prefix;
  await db.saveGuildConf(ctx.guild.id, config);
  ctx.reply(`✅ Prefijo del servidor cambiado a \`${prefix}\``);
}

// ──────────────────────────────────────────────────────────────
//  Categoría para canales de voz automáticos (LFG)
// ──────────────────────────────────────────────────────────────

async function cmdSetVoiceCategory(ctx, categoryId) {
  if (!ctx.guild.members.cache.get(ctx.userId)?.permissions.has(PermissionFlagsBits.ManageChannels))
    return ctx.reply({ content: '❌ Necesitas Gestionar Canales.', ephemeral: true });
  const config = await db.getGuildConf(ctx.guild.id) ?? {};
  config.voiceCategoryId = categoryId;
  await db.saveGuildConf(ctx.guild.id, config);
  ctx.reply(`✅ Categoría para canales de voz automáticos configurada.`);
}

module.exports = {
  cmdSetVerifiedRole,
  cmdSetPremiumRole,
  cmdBindRole,
  cmdUnbindRole,
  cmdListRoles,
  cmdSetWelcome,
  cmdSetAlertChannel,
  cmdSetNickname,
  cmdSetLang,
  cmdSetPrefix,
  cmdSetVoiceCategory
};
