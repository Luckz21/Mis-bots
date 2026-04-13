// commands/social.js
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ChannelType,
  PermissionFlagsBits
} = require('discord.js');

const { sanitizeText } = require('../security');
const { db } = require('./utils/database');
const { getGuildLang } = require('./utils/helpers');
const { t } = require('./utils/translate');

async function replyEmbed(ctx, titleKey, descKey, color = 0x1900ff, ephemeral = false, args = []) {
  const lang = await getGuildLang(ctx.guild?.id);
  const title = await t(lang, titleKey, ...args);
  const description = await t(lang, descKey, ...args);
  const embed = new EmbedBuilder().setTitle(title).setDescription(description).setColor(color);
  return ctx.reply({ embeds: [embed], ephemeral });
}

// ──────────────────────────────────────────────────────────────
//  LFG Mejorado (crea canal de voz temporal)
// ──────────────────────────────────────────────────────────────
async function cmdLFG(ctx, gameName, slots) {
  const lang = await getGuildLang(ctx.guild?.id);
  if (!gameName) return replyEmbed(ctx, 'error', 'lfg_usage', 0xED4245, true);
  
  const entry = await db.getUser(ctx.userId);
  if (!entry) return replyEmbed(ctx, 'error', 'no_linked_account', 0xED4245, true);
  
  const maxSlots = Math.min(Math.max(parseInt(slots) || 4, 2), 10);
  
  const botMember = ctx.guild.members.me;
  if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels) || 
      !botMember.permissions.has(PermissionFlagsBits.MoveMembers)) {
    return replyEmbed(ctx, 'error', 'lfg_missing_perms', 0xED4245, true);
  }

  const config = await db.getGuildConf(ctx.guild.id);
  const categoryId = config?.voiceCategoryId;
  let category = null;
  if (categoryId) {
    category = await ctx.guild.channels.fetch(categoryId).catch(() => null);
  }
  if (!category) {
    category = ctx.guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && 
      c.children.cache.some(ch => ch.type === ChannelType.GuildVoice));
  }

  try {
    const voiceChannel = await ctx.guild.channels.create({
      name: `🎮 ${gameName.slice(0, 20)}`,
      type: ChannelType.GuildVoice,
      parent: category?.id || null,
      userLimit: maxSlots,
      permissionOverwrites: [
        { id: ctx.guild.id, deny: [PermissionFlagsBits.Connect] },
        { id: ctx.userId, allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.MoveMembers] },
        { id: botMember.id, allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.MoveMembers] }
      ]
    });

    const lfgData = {
      hostId: ctx.userId,
      hostName: ctx.username,
      robloxName: entry.robloxUsername,
      gameName: sanitizeText(gameName, 50),
      slots: maxSlots,
      members: [{ id: ctx.userId, name: ctx.username, roblox: entry.robloxUsername }],
      createdAt: new Date().toISOString(),
      voiceChannelId: voiceChannel.id
    };

    const makeLFGEmbed = (data) => {
      const filled = data.members.length;
      const bar = '🟢'.repeat(filled) + '⬛'.repeat(data.slots - filled);
      const userColor = entry.profileColor || 0x1900ff;
      return new EmbedBuilder()
        .setTitle(`🎮 ${data.gameName}`)
        .setColor(filled >= data.slots ? 0xED4245 : 0x57F287)
        .setDescription(
          `${await t(lang, 'host')}: ${data.robloxName} (@${data.hostName})\n` +
          `${await t(lang, 'players')}: ${bar} ${filled}/${data.slots}\n` +
          `${await t(lang, 'voice_channel')}: ${voiceChannel.name}\n\n` +
          `${await t(lang, 'members')}:\n${data.members.map((m, i) => `${i + 1}. ${m.roblox} (@${m.name})`).join('\n')}`
        )
        .setFooter({ text: filled >= data.slots ? await t(lang, 'group_full') : await t(lang, 'group_open') })
        .setTimestamp();
    };

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('lfg_join').setLabel('✅ ' + (await t(lang, 'join'))).setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('lfg_leave').setLabel('❌ ' + (await t(lang, 'leave'))).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('lfg_close').setLabel('🔒 ' + (await t(lang, 'close'))).setStyle(ButtonStyle.Danger),
    );

    const msg = await ctx.replyAndFetch({ 
      content: `🔊 ${await t(lang, 'voice_channel_created')}: ${voiceChannel}\n${await t(lang, 'join_voice_and_manage')}`,
      embeds: [makeLFGEmbed(lfgData)], 
      components: [row] 
    });
    if (!msg) {
      await voiceChannel.delete().catch(() => {});
      return;
    }

    await db.saveLFG(msg.id, lfgData);

    const collector = msg.createMessageComponentCollector({ 
      componentType: ComponentType.Button, 
      time: 30 * 60 * 1000 
    });

    collector.on('collect', async (i) => {
      const data = await db.getLFG(msg.id) ?? lfgData;
      
      if (i.customId === 'lfg_join') {
        if (data.members.find(m => m.id === i.user.id)) {
          return i.reply({ content: await t(lang, 'already_in_group'), ephemeral: true });
        }
        if (data.members.length >= data.slots) {
          return i.reply({ content: await t(lang, 'group_full'), ephemeral: true });
        }
        
        const userEntry = await db.getUser(i.user.id);
        const robloxName = userEntry?.robloxUsername ?? i.user.username;
        
        data.members.push({ id: i.user.id, name: i.user.username, roblox: robloxName });
        await db.saveLFG(msg.id, data);
        
        await voiceChannel.permissionOverwrites.edit(i.user.id, { Connect: true }).catch(() => {});
        
        await i.update({ 
          embeds: [makeLFGEmbed(data)], 
          components: data.members.length >= data.slots ? [] : [row] 
        });
        
      } else if (i.customId === 'lfg_leave') {
        if (i.user.id === data.hostId) {
          return i.reply({ content: await t(lang, 'host_cannot_leave'), ephemeral: true });
        }
        
        const index = data.members.findIndex(m => m.id === i.user.id);
        if (index === -1) {
          return i.reply({ content: await t(lang, 'not_in_group'), ephemeral: true });
        }
        
        data.members.splice(index, 1);
        await db.saveLFG(msg.id, data);
        
        await voiceChannel.permissionOverwrites.delete(i.user.id).catch(() => {});
        
        await i.update({ embeds: [makeLFGEmbed(data)], components: [row] });
        
      } else if (i.customId === 'lfg_close') {
        if (i.user.id !== data.hostId) {
          return i.reply({ content: await t(lang, 'only_host_can_close'), ephemeral: true });
        }
        
        collector.stop();
        await db.deleteLFG(msg.id);
        await voiceChannel.delete().catch(() => {});
        
        await i.update({ 
          embeds: [makeLFGEmbed(data).setColor(0xED4245).setFooter({ text: await t(lang, 'group_closed') })], 
          components: [] 
        });
      }
    });

    collector.on('end', async () => {
      await msg.edit({ components: [] }).catch(() => {});
      await db.deleteLFG(msg.id);
      await voiceChannel.delete().catch(() => {});
    });

  } catch (error) {
    console.error('Error creando LFG:', error);
    replyEmbed(ctx, 'error', 'lfg_error', 0xED4245, true);
  }
}

// ──────────────────────────────────────────────────────────────
//  Sugerencias
// ──────────────────────────────────────────────────────────────
async function cmdSugerencia(ctx, text) {
  const lang = await getGuildLang(ctx.guild?.id);
  const clean = sanitizeText(text, 500);
  if (!clean || clean.length < 10) return replyEmbed(ctx, 'error', 'suggestion_too_short', 0xED4245, true);
  
  const config = await db.getGuildConf(ctx.guild.id);
  if (!config?.suggestionChannelId) return replyEmbed(ctx, 'error', 'suggestions_not_configured', 0xED4245, true);
  
  const channel = await ctx.guild.channels.fetch(config.suggestionChannelId).catch(() => null);
  if (!channel) return replyEmbed(ctx, 'error', 'suggestions_channel_not_found', 0xED4245, true);
  
  const entry = await db.getUser(ctx.userId);
  const userColor = entry?.profileColor || 0x1900ff;
  
  const embed = new EmbedBuilder()
    .setTitle(await t(lang, 'new_suggestion'))
    .setDescription(clean)
    .setColor(userColor)
    .addFields(
      { name: await t(lang, 'author'), value: `<@${ctx.userId}> (${ctx.username})`, inline: true },
      { name: '🎮 Roblox', value: entry ? `[${entry.robloxUsername}](https://www.roblox.com/users/${entry.robloxId}/profile)` : '_' + (await t(lang, 'not_linked')) + '_', inline: true },
    )
    .setFooter({ text: `ID: ${ctx.userId}` })
    .setTimestamp();
  
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('sug_up').setLabel('👍 0').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('sug_down').setLabel('👎 0').setStyle(ButtonStyle.Danger),
  );
  
  const suggMsg = await channel.send({ embeds: [embed], components: [row] });
  ctx.reply({ content: await t(lang, 'suggestion_sent', config.suggestionChannelId), ephemeral: true });
  
  const votes = { up: new Set(), down: new Set() };
  const collector = suggMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 86400000 });
  
  collector.on('collect', async (i) => {
    if (i.customId === 'sug_up') {
      votes.down.delete(i.user.id);
      if (votes.up.has(i.user.id)) votes.up.delete(i.user.id);
      else votes.up.add(i.user.id);
    } else {
      votes.up.delete(i.user.id);
      if (votes.down.has(i.user.id)) votes.down.delete(i.user.id);
      else votes.down.add(i.user.id);
    }
    const newRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('sug_up').setLabel(`👍 ${votes.up.size}`).setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('sug_down').setLabel(`👎 ${votes.down.size}`).setStyle(ButtonStyle.Danger),
    );
    await i.update({ components: [newRow] });
  });
  
  collector.on('end', () => suggMsg.edit({ components: [] }).catch(() => {}));
}

async function cmdSetSuggestions(ctx, channelId) {
  const lang = await getGuildLang(ctx.guild?.id);
  if (!ctx.guild.members.cache.get(ctx.userId)?.permissions.has(PermissionFlagsBits.ManageGuild))
    return replyEmbed(ctx, 'error', 'need_manage_guild', 0xED4245, true);
  const config = await db.getGuildConf(ctx.guild.id) ?? {};
  config.suggestionChannelId = channelId;
  await db.saveGuildConf(ctx.guild.id, config);
  replyEmbed(ctx, 'success', 'admin_setsuggestions', 0x57F287, false, [channelId]);
}

module.exports = {
  cmdLFG,
  cmdSugerencia,
  cmdSetSuggestions
};
