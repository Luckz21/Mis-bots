require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits, Partials } = require('discord.js');
const http = require('http');
const cmd = require('./commands.js');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const PREFIXES = ['!', '?'];

if (!TOKEN || !CLIENT_ID) { console.error('❌ Faltan credenciales.'); process.exit(1); }

// --- COMANDOS SLASH ---
const slashCommands = [
  new SlashCommandBuilder().setName('verificar').setDescription('Vincula tu cuenta de Roblox').addStringOption(o => o.setName('usuario').setDescription('Usuario').setRequired(true)),
  new SlashCommandBuilder().setName('confirmar').setDescription('Confirma verificación'),
  new SlashCommandBuilder().setName('actualizar').setDescription('Sincroniza roles'),
  new SlashCommandBuilder().setName('desvincular').setDescription('Borra tus datos'),
  new SlashCommandBuilder().setName('perfil').setDescription('Ver perfil').addUserOption(o => o.setName('usuario').setDescription('Usuario')),
  new SlashCommandBuilder().setName('avatar').setDescription('Ver avatar').addUserOption(o => o.setName('usuario').setDescription('Usuario')),
  new SlashCommandBuilder().setName('estado').setDescription('Ver presencia').addUserOption(o => o.setName('usuario').setDescription('Usuario')),
  new SlashCommandBuilder().setName('ayuda').setDescription('Lista de comandos'),
  // Premium & Economía
  new SlashCommandBuilder().setName('premium').setDescription('Estado Premium'),
  new SlashCommandBuilder().setName('daily').setDescription('Recompensa diaria'),
  new SlashCommandBuilder().setName('puntos').setDescription('Ver puntos').addUserOption(o => o.setName('usuario').setDescription('Usuario')),
  new SlashCommandBuilder().setName('coinflip').setDescription('Cara o cruz').addIntegerOption(o => o.setName('apuesta').setRequired(true)).addStringOption(o => o.setName('eleccion').setRequired(true).addChoices({name:'Cara', value:'cara'},{name:'Cruz', value:'cruz'})),
  new SlashCommandBuilder().setName('pay').setDescription('Pagar a alguien').addUserOption(o => o.setName('usuario').setRequired(true)).addIntegerOption(o => o.setName('cantidad').setRequired(true)),
  new SlashCommandBuilder().setName('rob').setDescription('Robar puntos').addUserOption(o => o.setName('usuario').setRequired(true)),
  // Admin
  new SlashCommandBuilder().setName('setverifiedrole').setDescription('Rol verificado').addRoleOption(o => o.setName('rol').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  new SlashCommandBuilder().setName('setwelcome').setDescription('Canal bienvenida').addChannelOption(o => o.setName('canal').setRequired(true)).addStringOption(o => o.setName('mensaje').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
].map(c => c.toJSON());

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildPresences, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.GuildMember]
});

function makeCtx(interactionOrMessage) {
  const isInteraction = !!interactionOrMessage.commandName;
  return {
    userId: isInteraction ? interactionOrMessage.user.id : interactionOrMessage.author.id,
    username: isInteraction ? interactionOrMessage.user.username : interactionOrMessage.author.username,
    guild: interactionOrMessage.guild,
    member: interactionOrMessage.member,
    reply: (content) => isInteraction ? interactionOrMessage.reply(content) : interactionOrMessage.reply(content),
    editReply: (content) => interactionOrMessage.editReply(content)
  };
}

client.on('guildMemberAdd', async (member) => {
  try { await cmd.autoSyncOnJoin(member); } catch (e) { console.error("Error OnJoin:", e); }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (cmd.isOnCooldown(interaction.user.id)) return interaction.reply({ content: '⏳ Vas muy rápido. Espera.', ephemeral: true });

  const ctx = makeCtx(interaction);
  try {
    switch (interaction.commandName) {
      case 'verificar': return cmd.cmdVerificar(ctx, interaction.options.getString('usuario'));
      case 'confirmar': return cmd.cmdConfirmar(ctx);
      case 'actualizar': return cmd.cmdActualizar(ctx);
      case 'desvincular': return cmd.cmdDesvincular(ctx);
      case 'perfil': return cmd.cmdPerfil(ctx, interaction.options.getUser('usuario'));
      case 'avatar': return cmd.cmdAvatar(ctx, interaction.options.getUser('usuario'));
      case 'estado': return cmd.cmdEstado(ctx, interaction.options.getUser('usuario'));
      case 'ayuda': return cmd.cmdAyuda(ctx);
      case 'premium': return cmd.cmdPremiumStatus(ctx);
      case 'daily': return cmd.cmdDaily(ctx);
      case 'puntos': return cmd.cmdPuntos(ctx, interaction.options.getUser('usuario'));
      case 'coinflip': return cmd.cmdCoinflip(ctx, interaction.options.getInteger('apuesta'), interaction.options.getString('eleccion'));
      case 'pay': return cmd.cmdPay(ctx, interaction.options.getUser('usuario'), interaction.options.getInteger('cantidad'));
      case 'rob': return cmd.cmdRob(ctx, interaction.options.getUser('usuario'));
      case 'setverifiedrole': return cmd.cmdSetVerifiedRole(ctx, interaction.options.getRole('rol'));
      case 'setwelcome': return cmd.cmdSetWelcome(ctx, interaction.options.getChannel('canal').id, interaction.options.getString('mensaje'));
    }
  } catch (e) { console.error(e); }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  const prefix = PREFIXES.find(p => message.content.startsWith(p));
  if (!prefix) return;
  if (cmd.isOnCooldown(message.author.id)) return message.reply('⏳ Vas muy rápido. Espera.');

  const args = message.content.slice(prefix.length).trim().split(/\s+/);
  const command = args.shift().toLowerCase();
  const ctx = makeCtx(message);
  const targetUser = message.mentions.users.first();

  try {
    if (command === 'daily') return cmd.cmdDaily(ctx);
    if (command === 'puntos') return cmd.cmdPuntos(ctx, targetUser);
    if (command === 'ayuda') return cmd.cmdAyuda(ctx);
  } catch (e) { console.error(e); }
});

const server = http.createServer((req, res) => { res.writeHead(200); res.end('Bot activo ✅'); });

client.once('ready', async () => {
  console.log(`✅ Conectado como ${client.user.tag}`);
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: slashCommands });
  cmd.startPresenceMonitor(client);
  server.listen(process.env.PORT || 3000);
});

client.login(TOKEN);
