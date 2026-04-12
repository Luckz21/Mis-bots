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
const { t } = require('../i18n');
const { db } = require('./utils/database');
const { getGuildLang } = require('./utils/helpers');

// ──────────────────────────────────────────────────────────────
//  LFG Mejorado: crea canal de voz temporal
// ──────────────────────────────────────────────────────────────

async function cmdLFG(ctx, gameName, slots) {
  if (!gameName) return ctx.reply({ content: '❌ Uso: `!lfg <nombre del juego> [slots]`\nEjemplo: `!lfg Blox Fruits 4`', ephemeral: true });
  
  const entry = await db.getUser(ctx.userId);
  if (!entry) return ctx.reply({ content: '❌ Necesitas tener cuenta vinculada para crear un LFG.', ephemeral: true });
  
  // Validar slots
  const maxSlots = Math.min(Math.max(parseInt(slots) || 4, 2), 10);
  
  // Verificar permisos del bot
  const botMember = ctx.guild.members.me;
  if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels) || 
      !botMember.permissions.has(PermissionFlagsBits.MoveMembers)) {
    return ctx.reply({ content: '❌ El bot necesita permisos de **Gestionar Canales** y **Mover Miembros** para crear canales de voz.', ephemeral: true });
  }

  // Obtener categoría configurada o usar la general
  const config = await db.getGuildConf(ctx.guild.id);
  const categoryId = config?.voiceCategoryId;
  let category = null;
  if (categoryId) {
    category = await ctx.guild.channels.fetch(categoryId).catch(() => null);
  }
  if (!category) {
    // Buscar una categoría de voz existente o usar la primera disponible
    category = ctx.guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && 
      c.children.cache.some(ch => ch.type === ChannelType.GuildVoice));
  }

  try {
    // Crear canal de voz temporal
    const voiceChannel = await ctx.guild.channels.create({
      name: `🎮 ${gameName.slice(0, 20)}`,
      type: ChannelType.GuildVoice,
      parent: category?.id || null,
      userLimit: maxSlots,
      permissionOverwrites: [
        {
          id: ctx.guild.id,
          deny: [PermissionFlagsBits.Connect]
        },
        {
          id: ctx.userId,
          allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.MoveMembers]
        },
        {
          id: botMember.id,
          allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.MoveMembers]
        }
      ]
    });

    // Datos del LFG
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

    // Función para generar embed
    const makeLFGEmbed = (data) => {
      const filled = data.members.length;
      const bar = '🟢'.repeat(filled) + '⬛'.repeat(data.slots - filled);
      const userColor = entry.profileColor || 0x1900ff;
      return new EmbedBuilder()
        .setTitle(`🎮 LFG — ${data.gameName}`)
        .setColor(filled >= data.slots ? 0xED4245 : 0x57F287)
        .setDescription(
          `**Anfitrión:** ${data.robloxName} (@${data.hostName})\n` +
          `**Jugadores:** ${bar} ${filled}/${data.slots}\n` +
          `**Canal de voz:** ${voiceChannel.name}\n\n` +
          `**Miembros:**\n${data.members.map((m, i) => `${i + 1}. ${m.roblox} (@${m.name})`).join('\n')}`
        )
        .setFooter({ text: filled >= data.slots ? '🔴 Grupo lleno' : '🟢 Abierto — toca los botones para unirte/salir' })
        .setTimestamp();
    };

    // Botones
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('lfg_join').setLabel('✅ Unirse').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('lfg_leave').setLabel('❌ Salir').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('lfg_close').setLabel('🔒 Cerrar').setStyle(ButtonStyle.Danger),
    );

    const msg = await ctx.replyAndFetch({ 
      content: `🔊 **Canal de voz creado:** ${voiceChannel}\nÚnete al canal y usa los botones para gestionar el grupo.`,
      embeds: [makeLFGEmbed(lfgData)], 
      components: [row] 
    });
    if (!msg) {
      await voiceChannel.delete().catch(() => {});
      return;
    }

    await db.saveLFG(msg.id, lfgData);

    // Collector para botones (30 minutos)
    const collector = msg.createMessageComponentCollector({ 
      componentType: ComponentType.Button, 
      time: 30 * 60 * 1000 
    });

    collector.on('collect', async (i) => {
      const data = await db.getLFG(msg.id) ?? lfgData;
      
      if (i.customId === 'lfg_join') {
        if (data.members.find(m => m.id === i.user.id)) {
          return i.reply({ content: '❌ Ya estás en el grupo.', ephemeral: true });
        }
        if (data.members.length >= data.slots) {
          return i.reply({ content: '❌ El grupo está lleno.', ephemeral: true });
        }
        
        const userEntry = await db.getUser(i.user.id);
        const robloxName = userEntry?.robloxUsername ?? i.user.username;
        
        data.members.push({ 
          id: i.user.id, 
          name: i.user.username, 
          roblox: robloxName 
        });
        await db.saveLFG(msg.id, data);
        
        // Dar permiso de conexión al nuevo miembro
        await voiceChannel.permissionOverwrites.edit(i.user.id, {
          Connect: true
        }).catch(() => {});
        
        await i.update({ 
          embeds: [makeLFGEmbed(data)], 
          components: data.members.length >= data.slots ? [] : [row] 
        });
        
      } else if (i.customId === 'lfg_leave') {
        if (i.user.id === data.hostId) {
          return i.reply({ content: '❌ El anfitrión no puede salir. Usa 🔒 Cerrar para terminar el grupo.', ephemeral: true });
        }
        
        const index = data.members.findIndex(m => m.id === i.user.id);
        if (index === -1) {
          return i.reply({ content: '❌ No estás en el grupo.', ephemeral: true });
        }
        
        data.members.splice(index, 1);
        await db.saveLFG(msg.id, data);
        
        // Quitar permiso de conexión
        await voiceChannel.permissionOverwrites.delete(i.user.id).catch(() => {});
        
        await i.update({ embeds: [makeLFGEmbed(data)], components: [row] });
        
      } else if (i.customId === 'lfg_close') {
        if (i.user.id !== data.hostId) {
          return i.reply({ content: '❌ Solo el anfitrión puede cerrar el grupo.', ephemeral: true });
        }
        
        collector.stop();
        await db.deleteLFG(msg.id);
        
        // Eliminar canal de voz
        await voiceChannel.delete().catch(() => {});
        
        await i.update({ 
          embeds: [makeLFGEmbed(data).setColor(0xED4245).setFooter({ text: '🔒 Grupo cerrado por el anfitrión' })], 
          components: [] 
        });
      }
    });

    collector.on('end', async () => {
      await msg.edit({ components: [] }).catch(() => {});
      await db.deleteLFG(msg.id);
      // Eliminar canal de voz si aún existe
      await voiceChannel.delete().catch(() => {});
    });

  } catch (error) {
    console.error('Error creando LFG:', error);
    ctx.reply({ content: '❌ Ocurrió un error al crear el canal de voz. Verifica los permisos del bot.', ephemeral: true });
  }
}

// ──────────────────────────────────────────────────────────────
//  Sugerencias
// ──────────────────────────────────────────────────────────────

async function cmdSugerencia(ctx, text) {
  const clean = sanitizeText(text, 500);
  if (!clean || clean.length < 10) return ctx.reply({ content: '❌ La sugerencia debe tener al menos 10 caracteres.', ephemeral: true });
  
  const config = await db.getGuildConf(ctx.guild.id);
  if (!config?.suggestionChannelId) return ctx.reply({ content: '❌ El servidor no tiene canal de sugerencias configurado.', ephemeral: true });
  
  const channel = await ctx.guild.channels.fetch(config.suggestionChannelId).catch(() => null);
  if (!channel) return ctx.reply({ content: '❌ No pude encontrar el canal de sugerencias.', ephemeral: true });
  
  const entry = await db.getUser(ctx.userId);
  const userColor = entry?.profileColor || 0x1900ff;
  
  const embed = new EmbedBuilder()
    .setTitle('💡 Nueva sugerencia')
    .setDescription(clean)
    .setColor(userColor)
    .addFields(
      { name: '👤 Autor', value: `<@${ctx.userId}> (${ctx.username})`, inline: true },
      { name: '🎮 Roblox', value: entry ? `[${entry.robloxUsername}](https://www.roblox.com/users/${entry.robloxId}/profile)` : '_No vinculado_', inline: true },
    )
    .setFooter({ text: `ID: ${ctx.userId}` })
    .setTimestamp();
  
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('sug_up').setLabel('👍 0').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('sug_down').setLabel('👎 0').setStyle(ButtonStyle.Danger),
  );
  
  const suggMsg = await channel.send({ embeds: [embed], components: [row] });
  ctx.reply({ content: `✅ Sugerencia enviada a <#${config.suggestionChannelId}>!`, ephemeral: true });
  
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
  if (!ctx.guild.members.cache.get(ctx.userId)?.permissions.has(PermissionFlagsBits.ManageGuild))
    return ctx.reply({ content: t(await getGuildLang(ctx.guild.id), 'need_manage_guild'), ephemeral: true });
  const config = await db.getGuildConf(ctx.guild.id) ?? {};
  config.suggestionChannelId = channelId;
  await db.saveGuildConf(ctx.guild.id, config);
  ctx.reply(`✅ Canal de sugerencias: <#${channelId}>`);
}

module.exports = {
  cmdLFG,
  cmdSugerencia,
  cmdSetSuggestions
};
