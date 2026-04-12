// commands/index.js
// Este archivo re-exporta todos los comandos y utilidades públicas

// Importar todos los módulos de comandos
const verification = require('./verification');
const profile = require('./profile');
const robloxCommands = require('./robloxCommands');
const premium = require('./premium');
const economy = require('./economy');
const triviaCommands = require('./triviaCommands');
const social = require('./social');
const moderation = require('./moderation');
const alerts = require('./alerts');
const admin = require('./admin');
const owner = require('./owner');
const help = require('./help');
const monitor = require('./monitor');

// Re-exportar todo
module.exports = {
  // Verificación
  ...verification,

  // Perfil
  ...profile,

  // Roblox y catálogo
  ...robloxCommands,

  // Premium
  ...premium,

  // Economía
  ...economy,

  // Trivia
  ...triviaCommands,

  // Social
  ...social,

  // Moderación
  ...moderation,

  // Alertas y privacidad
  ...alerts,

  // Admin
  ...admin,

  // Owner
  ...owner,

  // Ayuda
  ...help,

  // Monitor y eventos
  ...monitor,

  // Cooldowns (desde security)
  cooldowns: require('../security').cooldowns,
  CooldownManager: require('../security').CooldownManager
};
