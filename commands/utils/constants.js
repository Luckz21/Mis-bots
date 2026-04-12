// commands/utils/constants.js

// ── Rangos de economía (10 niveles) ──────────────────────────
const RANKS = [
  { name: '🥉 Bronce',    min: 0,     color: 0xCD7F32, next: 500   },
  { name: '🥈 Plata',     min: 500,   color: 0xC0C0C0, next: 2000  },
  { name: '🥇 Oro',       min: 2000,  color: 0xFFD700, next: 5000  },
  { name: '🏆 Platino',   min: 5000,  color: 0xE5E4E2, next: 10000 },
  { name: '💎 Diamante',  min: 10000, color: 0x00FFFF, next: 20000 },
  { name: '🌟 Maestro',   min: 20000, color: 0x9B59B6, next: 35000 },
  { name: '🔮 Gran Maestro', min: 35000, color: 0x8E44AD, next: 50000 },
  { name: '👑 Élite',     min: 50000, color: 0xF1C40F, next: 75000 },
  { name: '🚀 Leyenda',   min: 75000, color: 0xE67E22, next: 100000 },
  { name: '⚡ Dios',      min: 100000, color: 0xFF00FF, next: null },
];

// ── Logros (achievements) ────────────────────────────────────
const ACHIEVEMENTS = [
  { id: 'first_verify',  name: '🎖️ Primer Paso', desc: 'Verificar tu cuenta por primera vez' },
  { id: 'streak_7',      name: '🔥 Racha de 7 días', desc: 'Usar !daily 7 días seguidos' },
  { id: 'streak_30',     name: '🌟 Racha de 30 días', desc: 'Usar !daily 30 días seguidos' },
  { id: 'points_1000',   name: '💰 1000 puntos', desc: 'Acumular 1000 puntos en total' },
  { id: 'points_5000',   name: '💎 5000 puntos', desc: 'Acumular 5000 puntos en total' },
  { id: 'points_10000',  name: '🏦 10000 puntos', desc: 'Acumular 10000 puntos en total' },
  { id: 'points_50000',  name: '🚀 50000 puntos', desc: 'Acumular 50000 puntos en total' },
  { id: 'trivia_10',     name: '🧠 Aprendiz', desc: 'Responder 10 preguntas de trivia correctamente' },
  { id: 'trivia_50',     name: '📚 Erudito', desc: 'Responder 50 preguntas de trivia correctamente' },
  { id: 'trivia_100',    name: '🏛️ Sabio', desc: 'Responder 100 preguntas de trivia correctamente' },
  { id: 'rob_5',         name: '🦹 Ladronzuelo', desc: 'Robar exitosamente 5 veces' },
  { id: 'rob_20',        name: '💰 Maestro del hurto', desc: 'Robar exitosamente 20 veces' },
  { id: 'rob_fail_10',   name: '🚔 Torpe', desc: 'Fallar 10 robos' },
  { id: 'rob_jail_5',    name: '🔒 Preso', desc: 'Ir a la cárcel 5 veces' },
  { id: 'bail_paid_3',   name: '💸 Fianza pagada', desc: 'Pagar fianza 3 veces' },
  { id: 'stolen_1000',   name: '🪙 Mil monedas robadas', desc: 'Robar un total de 1000 puntos' },
  { id: 'stolen_10000',  name: '💼 Botín mayor', desc: 'Robar un total de 10000 puntos' },
  { id: 'daily_30',      name: '📅 Comprometido', desc: 'Reclamar 30 dailies en total' },
  { id: 'shop_5',        name: '🛍️ Comprador', desc: 'Comprar 5 items en la tienda' },
  { id: 'color_collector', name: '🎨 Coleccionista', desc: 'Comprar 10 colores diferentes' },
  { id: 'owner_exclusive', name: '👑 Dueño del Bot', desc: 'Ser el creador y dueño de LockBox' },
];

// ── Tienda (30+ colores) ─────────────────────────────────────
const SHOP_ITEMS = [
  { id: 'color_red', name: '🔴 Rojo', cost: 500, type: 'color', value: 0xED4245 },
  { id: 'color_blue', name: '🔵 Azul', cost: 500, type: 'color', value: 0x5865F2 },
  { id: 'color_green', name: '🟢 Verde', cost: 500, type: 'color', value: 0x57F287 },
  { id: 'color_yellow', name: '🟡 Amarillo', cost: 500, type: 'color', value: 0xFEE75C },
  { id: 'color_purple', name: '🟣 Morado', cost: 500, type: 'color', value: 0x9B59B6 },
  { id: 'color_orange', name: '🟠 Naranja', cost: 500, type: 'color', value: 0xE67E22 },
  { id: 'color_pink', name: '💗 Rosa', cost: 500, type: 'color', value: 0xFF69B4 },
  { id: 'color_cyan', name: '🔷 Cian', cost: 500, type: 'color', value: 0x00FFFF },
  { id: 'color_lime', name: '🍏 Lima', cost: 500, type: 'color', value: 0x00FF00 },
  { id: 'color_magenta', name: '🌸 Magenta', cost: 500, type: 'color', value: 0xFF00FF },
  { id: 'color_brown', name: '🤎 Marrón', cost: 500, type: 'color', value: 0x8B4513 },
  { id: 'color_navy', name: '🌙 Azul marino', cost: 500, type: 'color', value: 0x000080 },
  { id: 'color_teal', name: '🦚 Verde azulado', cost: 500, type: 'color', value: 0x008080 },
  { id: 'color_olive', name: '🫒 Oliva', cost: 500, type: 'color', value: 0x808000 },
  { id: 'color_maroon', name: '🍷 Granate', cost: 500, type: 'color', value: 0x800000 },
  { id: 'color_coral', name: '🐠 Coral', cost: 500, type: 'color', value: 0xFF7F50 },
  { id: 'color_salmon', name: '🍣 Salmón', cost: 500, type: 'color', value: 0xFA8072 },
  { id: 'color_gold', name: '🥇 Dorado', cost: 1000, type: 'color', value: 0xFFD700 },
  { id: 'color_silver', name: '🥈 Plateado', cost: 1000, type: 'color', value: 0xC0C0C0 },
  { id: 'color_bronze', name: '🥉 Bronce', cost: 1000, type: 'color', value: 0xCD7F32 },
  { id: 'color_lavender', name: '💜 Lavanda', cost: 500, type: 'color', value: 0xE6E6FA },
  { id: 'color_mint', name: '🌿 Menta', cost: 500, type: 'color', value: 0x98FF98 },
  { id: 'color_peach', name: '🍑 Durazno', cost: 500, type: 'color', value: 0xFFDAB9 },
  { id: 'color_skyblue', name: '☀️ Azul cielo', cost: 500, type: 'color', value: 0x87CEEB },
  { id: 'color_indigo', name: '🌀 Índigo', cost: 500, type: 'color', value: 0x4B0082 },
  { id: 'color_violet', name: '🔮 Violeta', cost: 500, type: 'color', value: 0xEE82EE },
  { id: 'color_turquoise', name: '💎 Turquesa', cost: 500, type: 'color', value: 0x40E0D0 },
  { id: 'color_chocolate', name: '🍫 Chocolate', cost: 500, type: 'color', value: 0xD2691E },
  { id: 'color_tomato', name: '🍅 Tomate', cost: 500, type: 'color', value: 0xFF6347 },
  { id: 'color_plum', name: '🍇 Ciruela', cost: 500, type: 'color', value: 0xDDA0DD },
  { id: 'badge_vip', name: '🌟 Insignia VIP', cost: 2000, type: 'badge' },
];

// ── Categorías de ayuda ──────────────────────────────────────
const HELP_CATEGORIES = {
  '🔐 Verificación': {
    description: 'Conecta tu cuenta de Roblox con Discord para acceder a todas las funciones del bot.',
    commands: [
      { name: '/captcha', desc: 'Completa la verificación anti-bot antes de usar /verificar.' },
      { name: '/verificar <usuario>', desc: 'Inicia el proceso de vinculación.' },
      { name: '/confirmar', desc: 'Confirma la verificación.' },
      { name: '/actualizar', desc: 'Re-sincroniza tus roles.' },
      { name: '/desvincular', desc: 'Desvincula tu cuenta.' },
    ],
  },
  '👤 Perfil e información': {
    description: 'Consulta información detallada de cuentas de Roblox.',
    commands: [
      { name: '/perfil [@usuario]', desc: 'Dashboard completo con estadísticas.' },
      { name: '/outfit [@usuario]', desc: 'Muestra la ropa actual del usuario.' },
      { name: '/rap [@usuario]', desc: 'Valor estimado RAP de sus limiteds.' },
      { name: '/avatar [@usuario]', desc: 'Avatar en tamaño grande.' },
      { name: '/estado [@usuario]', desc: 'Presencia en Roblox.' },
      { name: '/grupos [@usuario]', desc: 'Lista de grupos.' },
      { name: '/amigos [@usuario]', desc: 'Lista de amigos.' },
      { name: '/insignias [@usuario]', desc: 'Insignias recientes.' },
      { name: '/historial-nombres [@usuario]', desc: 'Nombres anteriores.' },
      { name: '/buscar <usuario>', desc: 'Busca usuario público.' },
      { name: '!whoislox <ID>', desc: 'Búsqueda por ID.' },
    ],
  },
  '⭐ Premium': {
    description: 'Funciones exclusivas para supporters.',
    commands: [
      { name: '/premium', desc: 'Estado y opciones de compra.' },
      { name: '/flex', desc: 'Tarjeta de perfil exclusiva.' },
      { name: '/comparar @u1 @u2', desc: 'Compara dos cuentas.' },
      { name: '/historial', desc: 'Historial de juegos.' },
      { name: '/mistats', desc: 'Estadísticas de juego.' },
      { name: '/addalt <usuario>', desc: 'Añadir cuenta alt.' },
      { name: '/alts', desc: 'Ver alts vinculadas.' },
      { name: '/setflexbg <url>', desc: 'Fondo personalizado para /flex.' },
      { name: '/buy', desc: 'Comprar Premium con PayPal (7 o 30 días).' },
    ],
  },
  '💰 Economía': {
    description: 'Sistema de puntos, rachas y minijuegos.',
    commands: [
      { name: '/daily', desc: 'Reclama puntos diarios.' },
      { name: '/puntos [@usuario]', desc: 'Ver puntos y racha.' },
      { name: '/logros [@usuario]', desc: 'Logros desbloqueados.' },
      { name: '/toplocal', desc: 'Top 10 del servidor.' },
      { name: '/topglobal', desc: 'Top 10 global.' },
      { name: '/tienda', desc: 'Ver tienda de puntos (30+ colores).' },
      { name: '/comprar <id>', desc: 'Comprar item de la tienda.' },
      { name: '/rob @usuario', desc: 'Intentar robar puntos.' },
      { name: '!pay @usuario <cantidad>', desc: 'Transferir puntos.' },
      { name: '!coinflip <cantidad>', desc: 'Apuesta cara o cruz.' },
      { name: '/trivia', desc: 'Responde trivia (5 pts, límite diario).' },
      { name: '/triviacustom', desc: 'Trivia con preguntas personalizadas.' },
    ],
  },
  '🎮 Roblox y búsquedas': {
    description: 'Busca juegos, catálogo y estado.',
    commands: [
      { name: '/catalogo <item>', desc: 'Busca items del catálogo.' },
      { name: '/murogrupo <ID>', desc: 'Muro de un grupo.' },
      { name: '/robloxstatus', desc: 'Estado de los servidores.' },
    ],
  },
  '🎯 Social': {
    description: 'Funciones para comunidad.',
    commands: [
      { name: '!lfg <juego> [slots]', desc: 'Crea grupo LFG con canal de voz.' },
      { name: '/sugerencia <texto>', desc: 'Envía una sugerencia.' },
    ],
  },
  '🔔 Alertas y privacidad': {
    description: 'Controla quién ve tu información.',
    commands: [
      { name: '🔔 Botón en /estado', desc: 'Activar alerta de presencia.' },
      { name: '!alertas ver', desc: 'Ver tus alertas activas.' },
      { name: '!alertas quitar @usuario', desc: 'Eliminar alerta.' },
      { name: '!permitir presencia|perfil', desc: 'Hacer público.' },
      { name: '!bloquear presencia|perfil', desc: 'Hacer privado.' },
      { name: '/dms', desc: 'Activar/desactivar mensajes directos del bot.' },
    ],
  },
  '🔍 Moderación': {
    description: 'Herramientas para staff.',
    commands: [
      { name: '/whois @usuario', desc: 'Ver vinculación Discord-Roblox.' },
      { name: '/syncall', desc: 'Sincronizar todos los roles (Admin).' },
    ],
  },
  '⚙️ Administración': {
    description: 'Configuración del servidor.',
    commands: [
      { name: '/setverifiedrole @rol', desc: 'Rol de verificado.' },
      { name: '/setpremiumrole @rol', desc: 'Rol Premium.' },
      { name: '/bindrole <grupo> <rango> @rol', desc: 'Vincular grupo a rol.' },
      { name: '/unbindrole <grupo>', desc: 'Eliminar vinculación.' },
      { name: '/listroles', desc: 'Ver configuración.' },
      { name: '/setwelcome #canal', desc: 'Mensaje de bienvenida.' },
      { name: '/setalertchannel #canal', desc: 'Canal de alertas.' },
      { name: '/setsuggestions #canal', desc: 'Canal de sugerencias.' },
      { name: '/setnickname formato', desc: 'Auto-nickname.' },
      { name: '/setlang es|en|pt', desc: 'Idioma del bot.' },
      { name: '/setprefix <prefijo>', desc: 'Prefijo para comandos de texto.' },
    ],
  },
  '👑 Owner': {
    description: 'Comandos exclusivos del dueño del bot.',
    commands: [
      { name: '/activarpremium <id> [días]', desc: 'Activar Premium manualmente.' },
      { name: '/desactivarpremium <id>', desc: 'Desactivar Premium.' },
      { name: '/encarcelar @usuario [horas]', desc: 'Encarcela a un usuario.' },
      { name: '/setpuntos @usuario <cantidad>', desc: 'Establece puntos.' },
      { name: '/addpuntos @usuario <cantidad>', desc: 'Añade puntos.' },
      { name: '/ownercolor <#HEX>', desc: 'Cambia el color de perfil del owner.' },
      { name: '/cambiarcolor <id>', desc: 'Cambia de color usando ID de tienda.' },
    ],
  },
};

module.exports = {
  RANKS,
  ACHIEVEMENTS,
  SHOP_ITEMS,
  HELP_CATEGORIES
};
