// ============================================================
//  security.js  —  Cooldowns, caché, blacklist, rate limiting
// ============================================================

// ── Caché LRU en memoria (sin dependencias externas) ─────────
// Guarda perfiles y avatares de Roblox durante 5 minutos
// Si 10 usuarios piden el mismo perfil, solo 1 petición a Roblox

class LRUCache {
  constructor(maxSize = 200, ttlMs = 5 * 60 * 1000) {
    this.cache  = new Map();
    this.maxSize = maxSize;
    this.ttl    = ttlMs;
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    if (Date.now() > item.expiresAt) { this.cache.delete(key); return null; }
    // Mover al final (más reciente)
    this.cache.delete(key);
    this.cache.set(key, item);
    return item.value;
  }

  set(key, value) {
    if (this.cache.has(key)) this.cache.delete(key);
    else if (this.cache.size >= this.maxSize) {
      // Eliminar el más antiguo
      this.cache.delete(this.cache.keys().next().value);
    }
    this.cache.set(key, { value, expiresAt: Date.now() + this.ttl });
  }

  clear() { this.cache.clear(); }
  size()  { return this.cache.size; }
}

// Instancias de caché separadas por tipo de dato
const profileCache  = new LRUCache(300, 5  * 60 * 1000); // 5 min
const avatarCache   = new LRUCache(300, 10 * 60 * 1000); // 10 min
const groupCache    = new LRUCache(200, 5  * 60 * 1000); // 5 min
const presenceCache = new LRUCache(500, 30 * 1000);       // 30 seg (presencia cambia rápido)
const friendCache   = new LRUCache(100, 5  * 60 * 1000); // 5 min
const badgeCache    = new LRUCache(200, 10 * 60 * 1000); // 10 min

// ── Sistema de cooldowns por usuario ─────────────────────────
// Previene spam de comandos

class CooldownManager {
  constructor() {
    this.cooldowns   = new Map(); // userId -> { command -> lastUsed }
    this.violations  = new Map(); // userId -> violationCount
    this.blacklist   = new Set(); // userIds bloqueados temporalmente

    // Limpiar datos viejos cada 10 minutos
    setInterval(() => this._cleanup(), 10 * 60 * 1000);
  }

  // Duraciones en ms por tipo de comando
  static DURATIONS = {
    // Comandos ligeros
    default:    3000,   // 3 segundos
    ayuda:      1000,   // 1 segundo
    puntos:     5000,   // 5 segundos
    daily:      86400000, // 24 horas (manejo especial)

    // Comandos que llaman a la API de Roblox (más restrictivos)
    perfil:     15000,  // 15 segundos
    buscar:     15000,
    comparar:   30000,  // 30 segundos
    flex:       20000,
    estado:     10000,
    grupos:     15000,
    amigos:     15000,
    insignias:  15000,
    avatar:     10000,
    historial:  10000,
    juego:      10000,

    // Comandos admin
    syncall:    60000,  // 60 segundos
    verificar:  10000,
    confirmar:  10000,
  };

  // Retorna null si puede ejecutar, o ms restantes si en cooldown
  check(userId, command) {
    if (this.blacklist.has(userId)) return -1; // bloqueado

    const now = Date.now();
    const duration = CooldownManager.DURATIONS[command] ?? CooldownManager.DURATIONS.default;
    if (command === 'daily') return null; // daily tiene su propio control en la base de datos

    if (!this.cooldowns.has(userId)) this.cooldowns.set(userId, new Map());
    const userCooldowns = this.cooldowns.get(userId);

    const lastUsed = userCooldowns.get(command) ?? 0;
    const remaining = duration - (now - lastUsed);

    if (remaining > 0) {
      // Contar violación
      const violations = (this.violations.get(userId) ?? 0) + 1;
      this.violations.set(userId, violations);

      // Blacklist temporal después de 5 violaciones seguidas
      if (violations >= 5) {
        this.blacklist.add(userId);
        setTimeout(() => {
          this.blacklist.delete(userId);
          this.violations.delete(userId);
        }, 5 * 60 * 1000); // 5 minutos de bloqueo
        console.warn(`⛔ Usuario ${userId} bloqueado temporalmente por spam`);
      }
      return remaining;
    }

    userCooldowns.set(command, now);
    this.violations.delete(userId); // Reset de violaciones al tener éxito
    return null;
  }

  // Formatear tiempo restante en texto legible
  static formatTime(ms) {
    if (ms < 0)      return 'bloqueado temporalmente';
    if (ms < 1000)   return `${ms}ms`;
    if (ms < 60000)  return `${Math.ceil(ms / 1000)}s`;
    return `${Math.ceil(ms / 60000)}min`;
  }

  _cleanup() {
    const now = Date.now();
    for (const [userId, cmds] of this.cooldowns) {
      for (const [cmd, lastUsed] of cmds) {
        const duration = CooldownManager.DURATIONS[cmd] ?? CooldownManager.DURATIONS.default;
        if (now - lastUsed > duration * 2) cmds.delete(cmd);
      }
      if (cmds.size === 0) this.cooldowns.delete(userId);
    }
  }
}

// ── Saneamiento de inputs ─────────────────────────────────────
// Evita inyecciones y caracteres invisibles

function sanitizeUsername(input) {
  if (!input || typeof input !== 'string') return null;
  // Eliminar caracteres invisibles, emojis raros, y limitar longitud
  const cleaned = input
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // control chars
    .replace(/[\u200B-\u200D\uFEFF]/g, '')          // zero-width chars
    .replace(/[^\w\d_\- ]/g, '')                    // solo alfanumérico, guiones y espacios
    .trim()
    .slice(0, 50);
  if (cleaned.length < 3) return null;
  return cleaned;
}

function sanitizeText(input, maxLen = 200) {
  if (!input || typeof input !== 'string') return '';
  return input
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .slice(0, maxLen);
}

// ── Exportar instancias únicas (singleton) ────────────────────
const cooldowns = new CooldownManager();

module.exports = {
  cooldowns,
  profileCache, avatarCache, groupCache,
  presenceCache, friendCache, badgeCache,
  sanitizeUsername, sanitizeText,
  CooldownManager,
};
