// commands/index.js
// Archivo central que exporta todos los comandos y utilidades

// Utilidades (para bot.js)
const roblox = require('./utils/roblox');
const { startPresenceMonitor, onMemberJoin, onGuildAdd } = require('./monitor'); // Aún no existe, lo crearemos
const { cooldowns } = require('../security');

// Verificación
const {
  cmdCaptcha, cmdVerificar, cmdConfirmar,
  cmdActualizar, cmdDesvincular
} = require('./verification');

// Perfil
const {
  cmdPerfil, cmdAvatar, cmdEstado, cmdGrupos, cmdAmigos,
  cmdInsignias, cmdHistorialNombres, cmdBuscar, cmdWhoisRoblox,
  cmdOutfit, cmdRAP
} = require('./profile');

// Roblox
const {
  cmdCatalogo, cmdMuroGrupo, cmdRobloxStatus
} = require('./robloxCommands');

// Premium
const {
  cmdPremiumStatus, cmdFlex, cmdHistorial, cmdComparar,
  cmdMiStats, cmdAddAlt, cmdAlts, cmdSetFlexBg, cmdBuyPremium
} = require('./premium');

// Economía
const {
  cmdPuntos, cmdDaily, cmdLogros, cmdCoinFlip, cmdPay, cmdRob,
  cmdTopLocal, cmdTopGlobal, cmdTienda, cmdComprar
} = require('./economy');

// Trivia
const {
  cmdTrivia, cmdTriviaCustom
} = require('./triviaCommands');

// Social
const {
  cmdLFG, cmdSugerencia, cmdSetSuggestions
} = require('./social');

// Moderación
const {
  cmdWhois, cmdSyncAll
} = require('./moderation');

// Alertas y privacidad
const {
  cmdAlertas, cmdPermitir, cmdBloquear, cmdDMs
} = require('./alerts');

// Admin
const {
  cmdSetVerifiedRole, cmdSetPremiumRole, cmdBindRole, cmdUnbindRole,
  cmdListRoles, cmdSetWelcome, cmdSetAlertChannel, cmdSetNickname,
  cmdSetLang, cmdSetPrefix, cmdSetVoiceCategory
} = require('./admin');

// Owner
const {
  cmdActivarPremium, cmdDesactivarPremium, cmdEncarcelar,
  cmdSetPuntos, cmdAddPuntos, cmdOwnerColor, cmdCambiarColor
} = require('./owner');

// Ayuda
const { cmdAyuda } = require('./help');

// Monitor (eventos)
const { startPresenceMonitor, onMemberJoin, onGuildAdd } = require('./monitor');

module.exports = {
  // Verificación
  cmdCaptcha, cmdVerificar, cmdConfirmar, cmdActualizar, cmdDesvincular,
  // Perfil
  cmdPerfil, cmdAvatar, cmdEstado, cmdGrupos, cmdAmigos, cmdInsignias,
  cmdHistorialNombres, cmdBuscar, cmdWhoisRoblox, cmdOutfit, cmdRAP,
  // Roblox
  cmdCatalogo, cmdMuroGrupo, cmdRobloxStatus,
  // Premium
  cmdPremiumStatus, cmdFlex, cmdHistorial, cmdComparar, cmdMiStats,
  cmdAddAlt, cmdAlts, cmdSetFlexBg, cmdBuyPremium,
  // Economía
  cmdPuntos, cmdDaily, cmdLogros, cmdCoinFlip, cmdPay, cmdRob,
  cmdTopLocal, cmdTopGlobal, cmdTienda, cmdComprar,
  // Trivia
  cmdTrivia, cmdTriviaCustom,
  // Social
  cmdLFG, cmdSugerencia, cmdSetSuggestions,
  // Moderación
  cmdWhois, cmdSyncAll,
  // Alertas
  cmdAlertas, cmdPermitir, cmdBloquear, cmdDMs,
  // Admin
  cmdSetVerifiedRole, cmdSetPremiumRole, cmdBindRole, cmdUnbindRole,
  cmdListRoles, cmdSetWelcome, cmdSetAlertChannel, cmdSetNickname,
  cmdSetLang, cmdSetPrefix, cmdSetVoiceCategory,
  // Owner
  cmdActivarPremium, cmdDesactivarPremium, cmdEncarcelar,
  cmdSetPuntos, cmdAddPuntos, cmdOwnerColor, cmdCambiarColor,
  // Ayuda
  cmdAyuda,
  // Utilidades para bot.js
  roblox, startPresenceMonitor, onMemberJoin, onGuildAdd,
  cooldowns
};
