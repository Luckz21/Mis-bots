// commands/monitor.js
const { EmbedBuilder } = require('discord.js');
const { db, redisGet, redisSet } = require('./utils/database');
const roblox = require('./utils/roblox');
const { isPremium, filterAlertsByResetPeriod } = require('./utils/helpers');

const presenceCacheMonitor = {};

async function startPresenceMonitor(client) {
  console.log('🔔 Monitor de presencia iniciado');
  setInterval(async () => {
    try {
      const alertUsers = await redisGet('alert_users') ?? [];
      for (const discordId of alertUsers) {
        let alerts = await db.getAlerts(discordId) ?? [];
        const isUserPremium = await isPremium(discordId);
        if (!isUserPremium) {
          alerts = filterAlertsByResetPeriod(alerts);
        }
        for (const alert of alerts) {
          const presence = await roblox.getPresence(alert.watchedRobloxId);
          if (!presence) continue;
          const prev = presenceCacheMonitor[alert.watchedRobloxId];
          const curr = presence.userPresenceType;
          if (prev !== undefined && prev !== curr) {
            const { label, color } = roblox.formatPresence(curr);
            const embed = new EmbedBuilder()
              .setTitle('🔔 Alerta de presencia')
              .setDescription(`**${alert.watchedUsername}** → ${label}`)
              .setColor(color).setTimestamp();
            if (curr === 2 && presence.universeId) {
              const gn = await roblox.getGameName(presence.universeId);
              if (gn) embed.addFields({ name: '🕹️ Jugando', value: `[${gn}](https://www.roblox.com/games/${presence.rootPlaceId})` });
            }
            if (presence.lastOnline) embed.addFields({ name: '🕐 Última vez', value: new Date(presence.lastOnline).toLocaleString('es-ES') });
            const config    = await db.getGuildConf(alert.guildId);
            const channelId = config?.alertChannelId ?? alert.channelId;
            try {
              const channel = await client.channels.fetch(channelId);
              await channel.send({ content: `<@${discordId}>`, embeds: [embed] });
            } catch {
              try { 
                const userEntry = await db.getUser(discordId);
                if (userEntry?.allowDMs !== false) {
                  const user = await client.users.fetch(discordId);
                  await user.send({ embeds: [embed] });
                }
              } catch { console.error('No pude notificar a', discordId); }
            }
          }
          presenceCacheMonitor[alert.watchedRobloxId] = curr;
        }
      }
    } catch (e) { console.error('Monitor error:', e.message); }
  }, 60000);

  setInterval(async () => {
    try {
      const birthdayUsers = await redisGet('birthday_monitor') ?? [];
      const today = new Date();
      for (const { discordId, robloxId, channelId, guildId, created } of birthdayUsers) {
        const createdDate = new Date(created);
        if (createdDate.getMonth() === today.getMonth() && createdDate.getDate() === today.getDate()) {
          const years = today.getFullYear() - createdDate.getFullYear();
          const profile  = await roblox.getProfile(robloxId);
          const avatarUrl = await roblox.getAvatar(robloxId);
          const embed = new EmbedBuilder()
            .setTitle('🎂 ¡Aniversario de cuenta!')
            .setDescription(`**${profile?.name ?? 'Usuario'}** celebra **${years} año${years !== 1 ? 's' : ''}** en Roblox hoy!`)
            .setColor(0xFF69B4).setThumbnail(avatarUrl).setTimestamp();
          try {
            const channel = await client.channels.fetch(channelId);
            await channel.send({ content: `<@${discordId}>`, embeds: [embed] });
          } catch { console.error('No pude enviar aniversario a', discordId); }
        }
      }
    } catch (e) { console.error('Birthday monitor error:', e.message); }
  }, 3600000);
}

async function onMemberJoin(member) {
  const { db } = require('./utils/database');
  const { syncRoles } = require('./utils/helpers');
  const entry = await db.getUser(member.id);
  if (!entry) return;
  await syncRoles(member.guild, member.id, entry.robloxId);
  console.log(`🔄 On-join sync: ${member.user.username}`);
}

async function onGuildAdd(guild) {
  const { EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
  try {
    const channel = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.permissionsFor(guild.members.me)?.has(PermissionFlagsBits.SendMessages));
    if (!channel) return;
    channel.send({ embeds: [new EmbedBuilder()
      .setTitle('👋 ¡Hola! Soy el Bot de Roblox v10.8')
      .setColor(0x1900ff)
      .setDescription('Gracias por añadirme. Aquí está la guía rápida:')
      .addFields(
        { name: '1️⃣ Rol de verificado',  value: '`/setverifiedrole @Rol`' },
        { name: '2️⃣ Bienvenida',         value: '`/setwelcome #canal Mensaje`' },
        { name: '3️⃣ Alertas',            value: '`/setalertchannel #canal`' },
        { name: '4️⃣ Grupos → Roles',     value: '`/bindrole <grupoId> <rangoMin> @Rol`' },
        { name: '5️⃣ Idioma',             value: '`/setlang es|en|pt`' },
        { name: '6️⃣ Verificación',       value: 'Los usuarios usan `/verificar <username>`' },
        { name: '📋 Todos los comandos',  value: '`/ayuda`' },
      )
      .setFooter({ text: 'Bot Roblox v10.8 · Usa /ayuda para ver todo' })] });
  } catch (e) { console.error('onGuildAdd:', e.message); }
}

module.exports = {
  startPresenceMonitor,
  onMemberJoin,
  onGuildAdd
};
