// commands/utils/roblox.js
const {
  profileCache, avatarCache, groupCache,
  presenceCache, friendCache, badgeCache,
  outfitCache, rapCache
} = require('../../security.js');

const ROBLOX_COOKIE = process.env.ROBLOX_COOKIE;

async function robloxFetch(url, options = {}, retries = 2) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (ROBLOX_COOKIE) headers['Cookie'] = `.ROBLOSECURITY=${ROBLOX_COOKIE}`;
  
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { ...options, headers });
      if (res.status === 429) {
        const retryAfter = res.headers.get('Retry-After') || 5;
        await new Promise(r => setTimeout(r, retryAfter * 1000));
        continue;
      }
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      if (i === retries) console.error('robloxFetch error:', url, e.message);
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  return null;
}

const roblox = {
  getUserByName: async (username) => {
    const cached = profileCache.get(`name:${username}`);
    if (cached) return cached;
    const data = await robloxFetch('https://users.roblox.com/v1/usernames/users', {
      method: 'POST', body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }),
    });
    const result = data?.data?.[0] ?? null;
    if (result) profileCache.set(`name:${username}`, result);
    return result;
  },
  getUserById: async (id) => {
    const cached = profileCache.get(`profile:${id}`);
    if (cached) return cached;
    const result = await robloxFetch(`https://users.roblox.com/v1/users/${id}`);
    if (result) profileCache.set(`profile:${id}`, result);
    return result;
  },
  getProfile: async (id) => {
    const cached = profileCache.get(`profile:${id}`);
    if (cached) return cached;
    const result = await robloxFetch(`https://users.roblox.com/v1/users/${id}`);
    if (result) profileCache.set(`profile:${id}`, result);
    return result;
  },
  getAvatar: async (id) => {
    const cached = avatarCache.get(`head:${id}`);
    if (cached) return cached;
    const d = await robloxFetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${id}&size=420x420&format=Png`);
    const result = d?.data?.[0]?.imageUrl ?? null;
    if (result) avatarCache.set(`head:${id}`, result);
    return result;
  },
  getAvatarFull: async (id) => {
    const cached = avatarCache.get(`full:${id}`);
    if (cached) return cached;
    const d = await robloxFetch(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${id}&size=720x720&format=Png`);
    const result = d?.data?.[0]?.imageUrl ?? null;
    if (result) avatarCache.set(`full:${id}`, result);
    return result;
  },
  getFriendCount:    async (id) => (await robloxFetch(`https://friends.roblox.com/v1/users/${id}/friends/count`))?.count ?? 0,
  getFollowerCount:  async (id) => (await robloxFetch(`https://friends.roblox.com/v1/users/${id}/followers/count`))?.count ?? 0,
  getFollowingCount: async (id) => (await robloxFetch(`https://friends.roblox.com/v1/users/${id}/followings/count`))?.count ?? 0,
  getFriends: async (id) => {
    const cached = friendCache.get(id);
    if (cached) return cached;
    const data = await robloxFetch(`https://friends.roblox.com/v1/users/${id}/friends?userSort=Alphabetical`);
    const result = (data?.data ?? []).map(f => ({
      id: f.id ?? f.userId,
      name: f.name ?? f.username ?? `ID:${f.id}`,
      displayName: f.displayName ?? f.name ?? `ID:${f.id}`,
    }));
    if (result.length) friendCache.set(id, result);
    return result;
  },
  getGroups: async (id) => {
    const cached = groupCache.get(id);
    if (cached) return cached;
    const data = await robloxFetch(`https://groups.roblox.com/v1/users/${id}/groups/roles`);
    const result = data?.data ?? [];
    if (result.length) groupCache.set(id, result);
    return result;
  },
  getGroupWall: async (groupId) => {
    const data = await robloxFetch(`https://groups.roblox.com/v2/groups/${groupId}/wall/posts?limit=5&sortOrder=Desc`);
    return data?.data ?? [];
  },
  getGroupInfo: async (groupId) => {
    return robloxFetch(`https://groups.roblox.com/v1/groups/${groupId}`);
  },
  getPresence: async (id) => {
    const cached = presenceCache.get(id);
    if (cached) return cached;
    const d = await robloxFetch('https://presence.roblox.com/v1/presence/users', {
      method: 'POST', body: JSON.stringify({ userIds: [id] }),
    });
    const result = d?.userPresences?.[0] ?? null;
    if (result) presenceCache.set(id, result);
    return result;
  },
  getGameName: async (uid) => {
    if (!uid) return null;
    const cached = profileCache.get(`game:${uid}`);
    if (cached) return cached;
    const d = await robloxFetch(`https://games.roblox.com/v1/games?universeIds=${uid}`);
    const result = d?.data?.[0]?.name ?? null;
    if (result) profileCache.set(`game:${uid}`, result);
    return result;
  },
  getBadges: async (id) => {
    const cached = badgeCache.get(id);
    if (cached) return cached;
    const data = await robloxFetch(`https://badges.roblox.com/v1/users/${id}/badges?limit=10&sortOrder=Desc`);
    const result = data?.data ?? [];
    if (result.length) badgeCache.set(id, result);
    return result;
  },
  getNameHistory: async (id) => {
    const data = await robloxFetch(`https://users.roblox.com/v1/users/${id}/username-history?limit=10&sortOrder=Desc`);
    return data?.data ?? [];
  },
  searchGame: async (q) => {
    const d = await robloxFetch(`https://games.roblox.com/v1/games/list?model.keyword=${encodeURIComponent(q)}&model.maxRows=10`);
    return d?.games ?? [];
  },
  searchCatalog: async (q) => {
    const d = await robloxFetch(`https://catalog.roblox.com/v1/search/items?keyword=${encodeURIComponent(q)}&limit=5&category=All`);
    return d?.data ?? [];
  },
  getCatalogItem: async (id) => {
    return robloxFetch(`https://economy.roblox.com/v2/assets/${id}/details`);
  },
  getCatalogThumbnail: async (id) => {
    const d = await robloxFetch(`https://thumbnails.roblox.com/v1/assets?assetIds=${id}&size=150x150&format=Png`);
    return d?.data?.[0]?.imageUrl ?? null;
  },
  isPremiumRoblox: async (id) => {
    const d = await robloxFetch(`https://premiumfeatures.roblox.com/v1/users/${id}/validate-membership`);
    return d === true || d?.isPremium === true;
  },
  getRobloxStatus: async () => {
    try {
      const res = await fetch('https://status.roblox.com/api/v2/summary.json', {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      if (!res.ok) return null;
      return await res.json();
    } catch { return null; }
  },
  formatPresence: (type) => ({
    0: { label: '⚫ Desconectado',           color: 0x99AAB5 },
    1: { label: '🟢 Conectado (web o app)',   color: 0x57F287 },
    2: { label: '🎮 Jugando en este momento', color: 0x00B0F4 },
    3: { label: '🛠️ En Roblox Studio',        color: 0xFEE75C },
  }[type] ?? { label: '❓ Desconocido', color: 0x99AAB5 }),
  getOutfit: async (id) => {
    const cached = outfitCache.get(id);
    if (cached) return cached;
    const d = await robloxFetch(`https://avatar.roblox.com/v1/users/${id}/outfits?limit=1`);
    const result = d?.data?.[0] ?? null;
    if (result) outfitCache.set(id, result);
    return result;
  },
  getRAP: async (id) => {
    const cached = rapCache.get(id);
    if (cached) return cached;
    try {
      const res = await fetch(`https://www.rolimons.com/api/player/${id}`);
      const data = await res.json();
      const result = { value: data?.rap ?? 0, limiteds: data?.limiteds ?? [] };
      rapCache.set(id, result);
      return result;
    } catch { return { value: 0, limiteds: [] }; }
  },
};

module.exports = roblox;
