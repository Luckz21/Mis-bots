// ============================================================
//  roblox.js
//  Todas las llamadas a la API pública (y autenticada) de Roblox.
//
//  Endpoints usados:
//    users.roblox.com      → perfiles y búsqueda por nombre
//    thumbnails.roblox.com → avatares
//    friends.roblox.com    → amigos, seguidores, siguiendo
//    groups.roblox.com     → grupos y rangos
//    presence.roblox.com   → presencia en tiempo real (requiere cookie)
//    games.roblox.com      → nombre del juego actual
// ============================================================

const ROBLOX_COOKIE = process.env.ROBLOX_COOKIE;

// Función base: hace fetch a la API de Roblox.
// Si la cookie está configurada, la adjunta automáticamente
// para acceder a endpoints autenticados (como presencia).
async function robloxFetch(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (ROBLOX_COOKIE) headers['Cookie'] = `.ROBLOSECURITY=${ROBLOX_COOKIE}`;
  try {
    const res = await fetch(url, { ...options, headers });
    if (!res.ok) return null;
    return res.json();
  } catch (e) {
    console.error('robloxFetch error:', e.message);
    return null;
  }
}

// ── Búsqueda y perfil ────────────────────────────────────────

// Busca un usuario por su nombre de usuario y devuelve { id, name } o null
async function getUserByName(username) {
  const data = await robloxFetch('https://users.roblox.com/v1/usernames/users', {
    method: 'POST',
    body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }),
  });
  return data?.data?.[0] ?? null;
}

// Obtiene el perfil completo de un usuario por su ID numérico
// Incluye: displayName, name, description, created, isBanned
async function getProfile(userId) {
  return robloxFetch(`https://users.roblox.com/v1/users/${userId}`);
}

// ── Avatar ───────────────────────────────────────────────────

// Devuelve la URL de la foto de perfil (headshot) del usuario
async function getAvatar(userId) {
  const data = await robloxFetch(
    `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=420x420&format=Png`
  );
  return data?.data?.[0]?.imageUrl ?? null;
}

// ── Estadísticas sociales ────────────────────────────────────

async function getFriendCount(userId) {
  const data = await robloxFetch(`https://friends.roblox.com/v1/users/${userId}/friends/count`);
  return data?.count ?? 0;
}

async function getFollowerCount(userId) {
  const data = await robloxFetch(`https://friends.roblox.com/v1/users/${userId}/followers/count`);
  return data?.count ?? 0;
}

async function getFollowingCount(userId) {
  const data = await robloxFetch(`https://friends.roblox.com/v1/users/${userId}/followings/count`);
  return data?.count ?? 0;
}

// ── Grupos ───────────────────────────────────────────────────

// Devuelve todos los grupos del usuario con su rol y rango en cada uno.
// Cada elemento tiene: { group: { id, name }, role: { name, rank } }
async function getGroups(userId) {
  const data = await robloxFetch(`https://groups.roblox.com/v1/users/${userId}/groups/roles`);
  return data?.data ?? [];
}

// ── Presencia en tiempo real (requiere cookie) ───────────────

// Devuelve la presencia del usuario:
//   userPresenceType: 0=offline, 1=online(web), 2=in-game, 3=studio
//   universeId, rootPlaceId: para saber el juego exacto
//   lastOnline: fecha de última conexión
async function getPresence(userId) {
  const data = await robloxFetch('https://presence.roblox.com/v1/presence/users', {
    method: 'POST',
    body: JSON.stringify({ userIds: [userId] }),
  });
  return data?.userPresences?.[0] ?? null;
}

// ── Juego actual ─────────────────────────────────────────────

// Dado un universeId (que viene de getPresence), devuelve el nombre del juego
async function getGameName(universeId) {
  if (!universeId) return null;
  const data = await robloxFetch(`https://games.roblox.com/v1/games?universeIds=${universeId}`);
  return data?.data?.[0]?.name ?? null;
}

// ── Helpers de presencia ─────────────────────────────────────

// Convierte el número de tipo de presencia en texto legible con emoji y color
function formatPresence(type) {
  const map = {
    0: { label: '⚫ Desconectado',            color: 0x99AAB5 },
    1: { label: '🟢 Conectado (web o app)',    color: 0x57F287 },
    2: { label: '🎮 Jugando en este momento',  color: 0x00B0F4 },
    3: { label: '🛠️ En Roblox Studio',         color: 0xFEE75C },
  };
  return map[type] ?? { label: '❓ Desconocido', color: 0x99AAB5 };
}

module.exports = {
  getUserByName,
  getProfile,
  getAvatar,
  getFriendCount,
  getFollowerCount,
  getFollowingCount,
  getGroups,
  getPresence,
  getGameName,
  formatPresence,
};
