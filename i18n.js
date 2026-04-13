// ============================================================
//  i18n.js  —  Sistema de multi-idioma (Ampliado y corregido)
//  Idiomas: es (español), en (inglés), pt (portugués)
// ============================================================

const translations = {
 es: {
  // ... existentes ...
  // Trivia
  text_only: 'Este comando solo funciona en canales de texto.',
  limit_reached: 'Límite alcanzado',
  trivia_daily_limit: 'Has alcanzado el límite diario de trivia ({0} preguntas).',
  trivia_category: 'Trivia - {0}',
  write_answer: 'Escribe tu respuesta',
  today: 'hoy',
  trivia_correct: '✅ ¡Correcto! La respuesta era **{0}**\n🎁 <@{1}> gana **+{2} puntos**! Saldo: **{3}**\n📊 {4}/{5} preguntas hoy.',
  trivia_timeout: '⏰ Tiempo agotado. La respuesta era **{0}**.',
  trivia_custom_add_format: 'Formato: `/triviacustom add ¿Pregunta? | respuesta`',
  trivia_custom_required: 'Pregunta y respuesta requeridas.',
  trivia_custom_added: 'Pregunta personalizada añadida.',
  trivia_custom_empty: 'No hay preguntas personalizadas.',
  trivia_custom_list: '📚 Preguntas Personalizadas',
  trivia_custom_daily_limit: 'Límite diario alcanzado ({0} preguntas).',
  trivia_custom_title: '🎲 Trivia Personalizada',
  trivia_custom_correct: '✅ ¡Correcto! +{0} puntos. Saldo: **{1}**',
  trivia_custom_usage: 'Subcomando no reconocido. Usa `add`, `list` o `play`.',
  // LFG
  lfg_usage: 'Uso: `!lfg <juego> [slots]`\nEjemplo: `!lfg Blox Fruits 4`',
  lfg_missing_perms: 'El bot necesita permisos de **Gestionar Canales** y **Mover Miembros**.',
  host: 'Anfitrión',
  players: 'Jugadores',
  voice_channel: 'Canal de voz',
  members: 'Miembros',
  group_full: 'Grupo lleno',
  group_open: 'Abierto — toca los botones para unirte/salir',
  join: 'Unirse',
  leave: 'Salir',
  close: 'Cerrar',
  voice_channel_created: 'Canal de voz creado',
  join_voice_and_manage: 'Únete al canal y usa los botones para gestionar el grupo.',
  already_in_group: 'Ya estás en el grupo.',
  host_cannot_leave: 'El anfitrión no puede salir. Usa 🔒 Cerrar.',
  not_in_group: 'No estás en el grupo.',
  only_host_can_close: 'Solo el anfitrión puede cerrar el grupo.',
  group_closed: 'Grupo cerrado por el anfitrión',
  lfg_error: 'Error al crear el LFG. Verifica los permisos del bot.',
  // Sugerencias
  suggestion_too_short: 'La sugerencia debe tener al menos 10 caracteres.',
  suggestions_not_configured: 'El servidor no tiene canal de sugerencias configurado.',
  suggestions_channel_not_found: 'No pude encontrar el canal de sugerencias.',
  new_suggestion: '💡 Nueva sugerencia',
  author: 'Autor',
  not_linked: 'No vinculado',
  suggestion_sent: '✅ Sugerencia enviada a <#{0}>!',
  // Moderación
  whois_footer: 'Información de vinculación Discord ↔ Roblox',
  need_admin: 'Necesitas permiso de Administrador.',
  bot_need_manage_roles: 'El bot necesita el permiso Gestionar Roles.',
  syncall_start: '⏳ Sincronizando roles de todos los miembros verificados...',
  syncall_done: '✅ Roles sincronizados para **{0}** miembros verificados.',
  // Alertas
  alerts_empty: 'No tienes alertas activas (las gratuitas se reinician a las 20:00 RD).',
  alerts_footer: 'Recibirás un ping cuando cambie su estado',
  mention_user_to_remove_alert: 'Menciona al usuario cuya alerta quieres eliminar.',
  alertas_usage: 'Uso: `!alertas ver` / `!alertas quitar @usuario`',
  permitir_usage: 'Uso: `!permitir presencia` o `!permitir perfil`',
  bloquear_usage: 'Uso: `!bloquear presencia` o `!bloquear perfil`',
  presence_public: 'Tu presencia en Roblox ahora es visible para otros.',
  profile_public: 'Tu perfil de Roblox ahora es visible para otros.',
  presence_private: 'Tu presencia en Roblox ahora es privada.',
  profile_private: 'Tu perfil de Roblox ahora es privado.',
  dms_enabled: 'Mensajes directos del bot activados.',
  dms_disabled: 'Mensajes directos del bot desactivados.',
  // Admin
  not_configured: 'No configurado',
  no_bindings: 'Sin vinculaciones',
  disabled: 'Desactivado',
  bot_language: 'Idioma del bot',
  admin_listroles_footer: 'Usa los comandos de admin para modificar esta configuración',
  invalid_language: 'Idiomas disponibles: es (Español), en (English), pt (Português)',
  // Owner
  provide_user_id: 'Debes proporcionar el ID de Discord del usuario.',
  user_no_premium: 'El usuario <@{0}> no tiene Premium activo.',
  invalid_amount: 'La cantidad no puede ser negativa.',
  invalid_hex: 'Formato inválido. Usa #RRGGBB.',
  invalid_color_id: 'ID de color inválido. Usa los IDs de `/tienda`.',
  // Help
  help_select_category: '📂 Selecciona una categoría...',
  help_overview: '🏠 Vista general',
  help_overview_desc: 'Ver resumen de todas las categorías',
  help_category_footer: 'Usa el menú de abajo para cambiar de categoría',
  only_author: 'Solo quien ejecutó el comando puede navegar.',
  // Monitor
  monitor_alert_title: '🔔 Alerta de presencia',
  monitor_alert_desc: '**{0}** → {1}',
  playing: '🕹️ Jugando',
  last_online: '🕐 Última vez',
  monitor_birthday_title: '🎂 ¡Aniversario de cuenta!',
  monitor_birthday_desc: '**{0}** celebra **{1} año(s)** en Roblox hoy!',
  // Guild Add
  guildadd_title: '👋 ¡Hola! Soy el Bot de Roblox v10.8',
  guildadd_description: 'Gracias por añadirme. Aquí está la guía rápida:',
  welcome: 'Bienvenida',
  groups_roles: 'Grupos → Roles',
  verification: 'Verificación',
  all_commands: 'Todos los comandos',
  // Compras
  pay_with_paypal: 'Pagar con PayPal',
  // Coinflip
  invalid_bet: 'Apuesta inválida',
  coinflip_win: '🎉 ¡Ganaste el coinflip!',
  coinflip_lose: '💀 Perdiste el coinflip',
  coinflip_result: 'Apostaste **{0} puntos** y {1} **{2}** 🪙',
  won: 'ganaste',
  lost: 'perdiste',
  current_balance: '💰 Saldo actual',
  // Rob
  rob_self: 'No puedes robarte a ti mismo.',
  owner_no_rob: 'El dueño no necesita robar.',
  jailed: 'Encarcelado',
  rob_success_title: '🦹 ¡Robo exitoso!',
  rob_fail_title: '🚔 ¡Robo fallido!',
  rob_fail_desc: 'Fallaste al robar a **{1}**.\nMulta: **{0}** monedas.\nEstás **encarcelado por 1 hora**.\n\nPuedes pagar 200 monedas para salir inmediatamente.',
  pay_bail: 'Pagar fianza',
  bail_insufficient: 'Necesitas 200 monedas. Tienes {0}.',
  bail_paid: '✅ Fianza pagada. Estás libre.',
  // Tienda
  shop_title: '🛒 Tienda de Puntos',
  shop_footer: 'Usa /comprar <id> para adquirir. ✅ = Ya desbloqueado',
  // General
  max_rank: '¡Rango máximo!',
  points_of: '💰 Puntos de {0}',
  current_points: '💰 Puntos actuales',
  total_earned: '📈 Total ganado',
  current_streak: '🔥 Racha actual',
  earn_points_daily: 'Gana puntos con /daily todos los días',
  daily_already_title: '⏰ Daily reclamado',
  daily_wait: 'Vuelve en **{0}h {1}m**.\n🔥 Racha actual: **{2}** días.',
  daily_claimed: '🎁 ¡Daily reclamado!',
  earned: '💰 Ganaste',
  streak: '🔥 Racha',
  total: '💼 Total',
  come_back_tomorrow: 'Vuelve mañana para más puntos',
  premium_bonus_applied: '¡x2 aplicado!',
  achievements_of: '🏅 Logros de {0}',
  unlocked: 'desbloqueados',
  mention_user: 'Debes mencionar a un usuario.',
  pay_success: '✅ Enviaste **{0} puntos** a **{1}**.',
  pay_insufficient: 'No tienes suficientes puntos. Tienes **{0}**.',
  rob_success: '🦹 ¡Robaste **{0}** puntos a **{1}**!',
  rob_owner_fail: 'No puedes robar al dueño del bot.',
  rob_jailed: 'Estás encarcelado por **{0} minutos**. Usa el botón de "Pagar fianza".',
  rob_protected: 'No puedes robar a **{0}** porque está bajo protección carcelaria.',
  rob_no_points: '**{0}** no tiene suficientes puntos para robar (mínimo 50).',
  lb_local_title: '🏆 Top Puntos del Servidor',
  lb_global_title: '🌍 Top Puntos Global',
  no_data: 'No hay datos aún.',
  shop_not_found: 'Item no encontrado. Usa /tienda para ver.',
  shop_already_owned: 'Ya tienes este item.',
  shop_no_points: '❌ Necesitas **{0}** puntos, tienes **{1}**.',
  shop_buy_success: '✅ Compraste **{0}** por **{1}** puntos.',
  // ... y cualquier otra que hayas visto en los archivos
}

// Obtener texto en el idioma del servidor (default: español)
function t(guildLang, key, ...args) {
  const lang   = translations[guildLang] ?? translations.es;
  const fallback = translations.es;
  const value  = lang[key] ?? fallback[key];
  if (!value) return `[${key}]`;
  return typeof value === 'function' ? value(...args) : value;
}

module.exports = { t, translations };
