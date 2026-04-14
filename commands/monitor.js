// commands/monitor.js
const { EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { db, redisGet, redisSet } = require('./utils/database');
const roblox = require('./utils/roblox');
const { isPremium, filterAlertsByResetPeriod, syncRoles, getGuildLang } = require('./utils/helpers');
const { t } = require('./utils/translate');

const presenceCacheMonitor = {};

async function startPresenceMonitor(client) {
  console.log('🔔 Monitor de presencia iniciado');
  setInterval(async () => {
    try {
      const alertUsers = await redisGet('alert_users') ?? [];
      for (const discordId of alertUsers) {
        let alerts = await db.getAlerts(discordId) ?? [];
        const isUserPremium = await isPremium(discordId);
        if (!isUserPremium) alerts = filterAlertsByResetPeriod(alerts);
        for (const alert of alerts) {
          const presence = await roblox.getPresence(alert.watchedRobloxId);
          if (!presence) continue;
          const prev = presenceCacheMonitor[alert.watchedRobloxId];
          const curr = presence.userPresenceType;
          if (prev !== undefined && prev !== curr) {
            const { label, color } = roblox.formatPresence(curr);
            const guild = client.guilds.cache.get(alert.guildId);
            const lang = guild ? await getGuildLang(guild.id) : 'es';
            const embed = new EmbedBuilder()
              .setTitle(await t(lang, 'monitor_alert_title'))
              .setDescription(await t(lang, 'monitor_alert_desc', alert.watchedUsername, label))
              .setColor(color).setTimestamp();
            if (curr === 2 && presence.universeId) {
              const gn = await roblox.getGameName(presence.universeId);
              if (gn) embed.addFields({ name: await t(lang, 'playing'), value: `[${gn}](https://www.roblox.com/games/${presence.rootPlaceId})` });
            }
            if (presence.lastOnline) embed.addFields({ name: await t(lang, 'last_online'), value: new Date(presence.lastOnline).toLocaleString('es-ES') });
            const config = await db.getGuildConf(alert.guildId);
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
          const profile = await roblox.getProfile(robloxId);
          const avatarUrl = await roblox.getAvatar(robloxId);
          const guild = client.guilds.cache.get(guildId);
          const lang = guild ? await getGuildLang(guild.id) : 'es';
          const embed = new EmbedBuilder()
            .setTitle(await t(lang, 'monitor_birthday_title'))
            .setDescription(await t(lang, 'monitor_birthday_desc', profile?.name ?? 'Usuario', years))
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
  const entry = await db.getUser(member.id);
  if (!entry) return;
  await syncRoles(member.guild, member.id, entry.robloxId);
}

async function onGuildAdd(guild) {
  try {
    const channel = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.permissionsFor(guild.members.me)?.has(PermissionFlagsBits.SendMessages));
    if (!channel) return;
    const lang = await getGuildLang(guild.id);
    const embed = new EmbedBuilder()
      .setTitle(await t(lang, 'guildadd_title'))
      .setColor(0x1900ff)
      .setDescription(await t(lang, 'guildadd_description'))
      .addFields(
        { name: '1️⃣ ' + await t(lang, 'verified_role'), value: '`/setverifiedrole @Rol`' },
        { name: '2️⃣ ' + await t(lang, 'welcome'), value: '`/setwelcome #canal Mensaje`' },
        { name: '3️⃣ ' + await t(lang, 'alerts'), value: '`/setalertchannel #canal`' },
        { name: '4️⃣ ' + await t(lang, 'groups_roles'), value: '`/bindrole <grupoId> <rangoMin> @Rol`' },
        { name: '5️⃣ ' + await t(lang, 'language'), value: '`/setlang es|en|pt`' },
        { name: '6️⃣ ' + await t(lang, 'verification'), value: '`/verificar <username>`' },
        { name: '📋 ' + await t(lang, 'all_commands'), value: '`/ayuda`' },
      )
      .setFooter({ text: 'Bot Roblox v10.8 · /ayuda' });
    channel.send({ embeds: [embed] });
  } catch (e) { console.error('onGuildAdd:', e.message); }
}

module.exports = { startPresenceMonitor, onMemberJoin, onGuildAdd };
