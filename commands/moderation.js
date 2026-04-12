// commands/moderation.js
const {
  EmbedBuilder,
  PermissionFlagsBits
} = require('discord.js');

const { db } = require('./utils/database');
const roblox = require('./utils/roblox');
const { isPremium, syncRoles } = require('./utils/helpers');

// ──────────────────────────────────────────────────────────────
//  Whois - Ver vinculación Discord-Roblox
// ──────────────────────────────────────────────────────────────

async function cmdWhois(ctx, targetUser) {
  if (!targetUser) return ctx.reply({ content: '❌ Menciona a un usuario. Ej: `/whois @usuario`', ephemeral: true });
  const entry = await db.getUser(targetUser.id);
  if (!entry) return ctx.reply({ content: `❌ **${targetUser.username}** no tiene cuenta de Roblox vinculada.`, ephemeral: true });
  const [premium, avatarUrl] = await Promise.all([isPremium(targetUser.id), roblox.getAvatar(entry.robloxId)]);
  const userColor = entry.profileColor || 0x1900ff;
  ctx.reply({ embeds: [new EmbedBuilder().setTitle(`🔍 Whois: ${targetUser.username}`)
    .setColor(userColor).setThumbnail(avatarUrl)
    .addFields(
      { name: '🎮 Cuenta de Roblox', value: `[${entry.robloxUsername}](https://www.roblox.com/users/${entry.robloxId}/profile)`, inline: true },
      { name: '🆔 ID de Roblox',     value: `\`${entry.robloxId}\``,                                                               inline: true },
      { name: '⭐ Premium',           value: premium ? 'Sí ✅' : 'No ❌',                                                            inline: true },
      { name: '📅 Verificado el',    value: new Date(entry.verifiedAt).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' }), inline: true },
    )
    .setFooter({ text: 'Información de vinculación Discord ↔ Roblox' })] });
}

// ──────────────────────────────────────────────────────────────
//  SyncAll - Sincronizar roles de todos los verificados (Admin)
// ──────────────────────────────────────────────────────────────

async function cmdSyncAll(ctx) {
  if (!ctx.guild.members.cache.get(ctx.userId)?.permissions.has(PermissionFlagsBits.Administrator)) {
    return ctx.reply({ content: '❌ Necesitas permiso de **Administrador** para usar este comando.', ephemeral: true });
  }
  if (!ctx.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles))
    return ctx.reply({ content: '❌ El bot necesita el permiso **Gestionar Roles** en este servidor.', ephemeral: true });
  
  await ctx.reply('⏳ Sincronizando roles de todos los miembros verificados...');
  const members = await ctx.guild.members.fetch();
  let count = 0;
  for (const [id] of members) {
    const entry = await db.getUser(id);
    if (entry) { 
      await syncRoles(ctx.guild, id, entry.robloxId); 
      count++; 
    }
  }
  ctx.reply(`✅ Roles sincronizados para **${count}** miembros verificados.`);
}

module.exports = {
  cmdWhois,
  cmdSyncAll
};
