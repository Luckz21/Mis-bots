# 🎮 LockBox — Bot de Discord para Roblox

<div align="center">

![Discord](https://img.shields.io/badge/Discord.js-v14-5865F2?style=for-the-badge&logo=discord&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-v22-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Upstash](https://img.shields.io/badge/Upstash-Redis-00E9A3?style=for-the-badge&logo=redis&logoColor=white)
![Railway](https://img.shields.io/badge/Hosted_on-Railway-0B0D0E?style=for-the-badge&logo=railway&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)

**El bot de verificación Roblox más completo para Discord.**
Verificación segura, presencia en tiempo real, economía, minijuegos, roles automáticos y sistema Premium con Ko-fi.

[➕ Añadir al servidor](#-añadir-el-bot) · [⭐ Premium](#-sistema-premium) · [📋 Comandos](#-comandos-completos)

</div>

---

## 📖 ¿Qué es LockBox?

LockBox es un bot de Discord especializado en la integración con **Roblox**. Permite a los miembros de un servidor vincular su cuenta de Discord con su cuenta de Roblox, desbloquear información detallada de perfiles, recibir alertas de presencia en tiempo real y participar en una economía interna con minijuegos.

Está inspirado en bots como **Blox.link** y **RoVer**, pero con funciones adicionales de economía, trivia, sistema Premium por niveles y total control de privacidad para cada usuario.

### ¿Por qué usar LockBox?

- ✅ **Verificación con captcha anti-bot** — Evita registros masivos automatizados
- 🔒 **Control de privacidad total** — Cada usuario decide qué comparte
- 🎮 **Presencia en tiempo real** — Sabe exactamente en qué juego está alguien
- 💰 **Sistema de economía completo** — Puntos, rangos, tienda de roles y minijuegos
- 🌐 **Multi-idioma** — Español, Inglés y Portugués
- ⭐ **Sistema Premium por tiers** — Monetización integrada con Ko-fi

---

## 🏗️ Arquitectura del proyecto

El bot está dividido en 4 archivos con responsabilidades claras:

```
📁 proyecto/
├── bot.js          # Punto de entrada: cliente Discord, slash commands, webhook Ko-fi
├── commands.js     # Toda la lógica de los comandos
├── security.js     # Cooldowns, caché LRU, blacklist, saneamiento de inputs
├── trivia.js       # Banco de 80+ preguntas por categoría con detección inteligente
└── i18n.js         # Traducciones en Español, Inglés y Portugués
```

### Tecnologías usadas

| Tecnología | Uso |
|---|---|
| **Discord.js v14** | Cliente de Discord, slash commands, botones, menús |
| **Upstash Redis** | Base de datos persistente vía HTTP (sin SSL issues) |
| **Railway** | Hosting del bot en la nube |
| **API de Roblox** | Perfiles, presencia, grupos, insignias, catálogo |
| **Ko-fi Webhooks** | Procesamiento automático de donaciones Premium |

---

## ⚙️ Variables de entorno requeridas

Configura estas variables en **Railway → Variables** antes de desplegar:

| Variable | Descripción | Obligatoria |
|---|---|---|
| `DISCORD_TOKEN` | Token del bot de Discord Developer Portal | ✅ |
| `CLIENT_ID` | Application ID de tu aplicación en Discord | ✅ |
| `UPSTASH_REDIS_REST_URL` | URL de tu base de datos en Upstash | ✅ |
| `UPSTASH_REDIS_REST_TOKEN` | Token de autenticación de Upstash | ✅ |
| `ROBLOX_COOKIE` | Cookie `.ROBLOSECURITY` de Roblox (para presencia en tiempo real) | ✅ |
| `KOFI_TOKEN` | Token de verificación del webhook de Ko-fi | ⚠️ Recomendada |
| `KOFI_PAGE` | Tu nombre de usuario en Ko-fi (ej: `tu_usuario`) | ⚠️ Recomendada |
| `BOT_OWNER_ID` | Tu Discord ID — solo tú puedes usar comandos de Owner | ✅ |
| `AUDIT_WEBHOOK_URL` | URL de un webhook de Discord para logs internos | Opcional |

---

## 🚀 Instalación y despliegue

### Requisitos previos

- Cuenta en [Discord Developer Portal](https://discord.com/developers/applications)
- Cuenta en [Upstash](https://upstash.com) (base de datos Redis gratuita)
- Cuenta en [Railway](https://railway.app) (hosting gratuito)
- Cookie `.ROBLOSECURITY` de Roblox (obtenida desde Chrome DevTools → Application → Cookies)

### Pasos de instalación

**1. Crear la aplicación en Discord**
```
Discord Developer Portal → New Application → Bot → Add Bot
Activar: Presence Intent + Server Members Intent + Message Content Intent
```

**2. Subir los archivos a GitHub**
```
Sube: bot.js, commands.js, security.js, trivia.js, i18n.js, package.json
```

**3. Desplegar en Railway**
```
Railway → New Project → Deploy from GitHub → Seleccionar repositorio
Agregar todas las variables de entorno
```

**4. Invitar el bot al servidor**
```
OAuth2 → URL Generator → Scopes: bot → Permisos: Send Messages, Manage Roles,
Read Messages, Manage Channels, Manage Nicknames → Copiar URL e invitar
```

**5. Configurar el servidor**
```
/setverifiedrole @Rol        → Rol que se da al verificarse
/setwelcome #canal mensaje   → Bienvenida automática
/setalertchannel #canal      → Canal de alertas de presencia
/setlang es|en|pt            → Idioma del bot
```

---

## 📋 Comandos completos

Los comandos funcionan con `/` (slash), `!` y `?`.

### 🔐 Verificación

| Comando | Descripción |
|---|---|
| `/verificar <usuario>` | Inicia la vinculación entre Discord y Roblox. Primero resuelve un captcha de suma simple anti-bot. Luego el bot genera un código único (`RBX-XXXXXX`) que el usuario debe poner en su descripción de Roblox. |
| `/confirmar` | Confirma la verificación. El bot consulta la API de Roblox y verifica que el código esté en la descripción del usuario. Si es correcto, guarda la vinculación y asigna roles automáticamente. |
| `/actualizar` | Re-sincroniza los roles de Discord con la cuenta de Roblox vinculada. Útil cuando el usuario cambia de grupo o sube de rango en Roblox. |
| `/desvincular` | Desvincula la cuenta de Roblox del Discord del usuario. Puede volver a verificarse con otra cuenta en cualquier momento. |

> **Seguridad:** El proceso incluye captcha anti-bot, auto-lockdown del servidor si hay demasiados intentos fallidos (10 en 1 minuto = pausa de 5 minutos), y limpieza automática de verificaciones que quedaron pendientes.

---

### 👤 Perfil e información

| Comando | Descripción |
|---|---|
| `/perfil [@usuario]` | Dashboard completo del usuario: avatar, descripción, ID, días en Roblox, amigos, seguidores, grupos, insignias, rango de economía y barra de progreso. Incluye botones interactivos para ver el avatar, estado, grupos e insignias directamente. |
| `/avatar [@usuario]` | Muestra el avatar de Roblox en tamaño grande (headshot + cuerpo completo 720x720). |
| `/estado [@usuario]` | Estado de presencia en tiempo real: ⚫ desconectado, 🟢 conectado en web/app, 🎮 jugando (muestra el nombre del juego con link) o 🛠️ en Roblox Studio. Incluye la última vez que estuvo en línea. También tiene botón para activar alertas directamente. |
| `/grupos [@usuario]` | Lista todos los grupos de Roblox con el nombre del grupo, el rol del usuario y su rango numérico. Paginación con botones ◀ ▶ (5 grupos por página). |
| `/amigos [@usuario]` | Lista de amigos de Roblox con links a sus perfiles. Paginación de 10 por página. |
| `/insignias [@usuario]` | Últimas 10 insignias (badges) ganadas en juegos de Roblox, con nombre y descripción breve de cada una. |
| `/outfit [@usuario]` | Muestra la ropa y accesorios que lleva puesta actualmente el avatar del usuario en Roblox. |
| `/rap [@usuario]` | Estima el valor total en Robux de los items Limited del usuario usando datos de [Rolimons](https://www.rolimons.com). Muestra los 8 items más valiosos y el RAP total. |
| `/historial-nombres [@usuario]` | Muestra los nombres de usuario anteriores que ha tenido la cuenta de Roblox. |
| `/buscar <usuario>` | Busca información pública de **cualquier** usuario de Roblox sin que esté vinculado al bot. |
| `!whoislox <ID>` | Búsqueda inversa: encuentra la información de un usuario de Roblox por su ID numérico. |

---

### ⭐ Funciones Premium

> Todas estas funciones requieren Premium activo. Ver la sección [Sistema Premium](#-sistema-premium).

| Comando | Descripción |
|---|---|
| `/premium` | Muestra el estado Premium del usuario con barra de progreso de tiempo restante, fecha exacta de expiración y las 3 opciones de precio para activarlo via Ko-fi. |
| `/flex` ⭐ | Genera una tarjeta de perfil visual exclusiva con todas las estadísticas, estado actual, logros, rango de economía y (opcionalmente) una imagen de fondo personalizada. |
| `/comparar @u1 @u2` ⭐ | Compara dos cuentas de Roblox lado a lado con indicadores de ganador 🏆 en cada categoría: amigos, seguidores, grupos y antigüedad. |
| `/historial` ⭐ | Historial de los últimos 20 juegos que el usuario ha jugado en Roblox (se registra automáticamente al usar `/estado` mientras juega). Paginación incluida y botón para borrar el historial. |
| `/syncall` ⭐ | Sincroniza los roles de Discord de **todos** los miembros verificados del servidor de una sola vez. Ideal para actualizaciones masivas. |
| `/mistats` ⭐ | Estadísticas personales detalladas: juegos más jugados, trivias ganadas, robos exitosos, racha máxima de daily, total de logros desbloqueados. |
| `!alts lista/agregar/quitar` ⭐ | Vincula hasta **3 cuentas alternativas** de Roblox a un solo Discord. |
| `!setflexbg <url>` ⭐ | Establece una imagen de fondo personalizada para tu tarjeta `/flex`. |
| `!setcolor #RRGGBB` ⭐ | Cambia el color del embed de tu `/perfil` a cualquier color hexadecimal. |
| `!setalertgif <url>` ⭐ | Configura un GIF personalizado que se envía junto a tus alertas de presencia. |
| `!vozprivada` ⭐ | Crea un canal de voz temporal privado en el servidor. Solo tú puedes acceder. Se auto-cierra en 2 horas o cuando se queda vacío. |

---

### 💰 Economía y minijuegos

El sistema de economía usa **puntos** que se acumulan con el tiempo. Los puntos determinan el rango del usuario y pueden usarse en la tienda de roles.

**Rangos por puntos:**
| Rango | Puntos requeridos |
|---|---|
| 🥉 Bronce | 0 – 499 |
| 🥈 Plata | 500 – 1,999 |
| 🥇 Oro | 2,000 – 4,999 |
| 🏆 Platino | 5,000 – 9,999 |
| 💎 Diamante | 10,000+ |

| Comando | Descripción |
|---|---|
| `!daily` | Reclama tu recompensa diaria de 50–100 puntos. Las rachas consecutivas aumentan el multiplicador hasta x2 (después de 10 días). Los usuarios Premium reciben x2 base adicional. |
| `!puntos [@usuario]` | Muestra los puntos actuales, total acumulado, racha de días y barra de progreso visual hacia el siguiente rango. |
| `!logros [@usuario]` | Lista todos los logros disponibles con su descripción, mostrando cuáles están desbloqueados (✅) y cuáles faltan (🔒). |
| `!trivia [categoría]` | El bot hace una pregunta al canal y el primero en responder correctamente gana **+50 puntos**. Categorías disponibles: Roblox, Matemáticas, Ciencias, Historia, Geografía, Tecnología, General. El reconocimiento de respuestas es flexible (acepta sinónimos y variaciones). |
| `!coinflip <puntos>` | Apuesta puntos a cara o cruz. 50% de probabilidad de ganar o perder la cantidad apostada. Mínimo 10 puntos. |
| `!rob @usuario` | Intenta robar hasta el 15% de los puntos de otro usuario. 40% de probabilidad de éxito. Si fallas, pagas una multa del 10% de tus propios puntos. |
| `!pay @usuario <puntos>` | Transfiere puntos a otro usuario del servidor. |
| `!top` | Leaderboard de los 10 usuarios con más puntos en el servidor. |
| `!tienda ver` | Muestra los roles disponibles en la tienda y su precio en puntos. |
| `!tienda comprar <número>` | Compra un rol de la tienda usando tus puntos. |
| `!tienda agregar @rol <precio>` | (Admin) Agrega un rol a la tienda con un precio en puntos. |

**Logros disponibles:**
| Logro | Condición |
|---|---|
| 🎖️ Primer Paso | Verificar tu cuenta por primera vez |
| 🔥 Racha de 7 días | Usar `!daily` 7 días seguidos |
| 🌟 Racha de 30 días | Usar `!daily` 30 días seguidos |
| 💰 1000 puntos | Acumular 1,000 puntos en total |
| 💎 5000 puntos | Acumular 5,000 puntos en total |
| 🧠 Trivia Master | Ganar una trivia |
| 🦹 Ladrón | Robarle puntos a alguien exitosamente |

---

### 🎮 Roblox y búsquedas

| Comando | Descripción |
|---|---|
| `/juego <nombre>` | Busca un juego en Roblox y muestra cuántos jugadores hay en este momento, número de likes y dislikes, con link directo. Soporta autocompletado mientras escribes. |
| `/catalogo <item>` | Busca items en el catálogo de Roblox (ropa, accesorios, sombreros, etc.) mostrando precio en Robux, tipo de item y creador. Paginación de hasta 5 resultados. |
| `/murogrupo <ID>` | Muestra las últimas 5 publicaciones del muro público de un grupo de Roblox. Útil para monitorear la actividad de un grupo sin salir de Discord. |
| `/robloxstatus` | Consulta el estado actual de los servidores de Roblox. Muestra si hay caídas, degradaciones o mantenimientos activos, con el estado de cada servicio individual. |

---

### 🎯 Social y comunidad

| Comando | Descripción |
|---|---|
| `!lfg <juego> [slots]` | Crea un grupo **Looking for Group** para un juego de Roblox con botones interactivos. Otros usuarios pueden tocar ✅ para unirse o ❌ para salir. El anfitrión puede cerrarlo con 🔒. Se cierra automáticamente en 30 minutos o cuando se llena. |
| `/sugerencia <texto>` | Envía una sugerencia al canal de sugerencias del servidor (configurado con `/setsuggestions`). Los usuarios pueden votar 👍 o 👎 durante 24 horas. |

---

### 🔔 Alertas de presencia

El sistema de alertas notifica en tiempo real cuando un usuario cambia su estado en Roblox.

**¿Cómo activar una alerta?**
1. Usa `/estado @usuario`
2. Toca el botón **🔔 Activar alerta**
3. Recibirás un ping en el canal (o por DM si falla) cada vez que esa persona cambie su estado

**Límites:**
- Usuarios gratuitos: máximo **2 alertas activas**
- Usuarios Premium: alertas **ilimitadas**
- Usuarios Premium pueden configurar un GIF personalizado con `!setalertgif`

| Comando | Descripción |
|---|---|
| `!alertas ver` | Muestra la lista de usuarios sobre los que tienes alertas activas con su ID de Roblox. |
| `!alertas quitar @usuario` | Elimina la alerta de un usuario específico. |

**Canal de alertas del servidor:** Si un admin configura `/setalertchannel #canal`, todas las alertas del servidor se enviarán a ese canal con mención al usuario correspondiente.

---

### 🔒 Privacidad

Cada usuario controla qué información comparte con otros miembros del servidor.

| Comando | Descripción |
|---|---|
| `!permitir presencia` | Permite que otros usuarios usen `/estado` para ver en qué juego estás. Por defecto está **desactivado**. |
| `!permitir perfil` | Permite que otros vean tu `/perfil`, `/avatar`, `/grupos`, etc. Por defecto está **activado**. |
| `!bloquear presencia` | Oculta tu presencia de Roblox. Nadie podrá ver tu estado en tiempo real. |
| `!bloquear perfil` | Oculta tu perfil. Nadie podrá ver tu información de Roblox. |

---

### 🔍 Moderación

| Comando | Descripción |
|---|---|
| `/whois @usuario` | Muestra qué cuenta de Roblox tiene un usuario de Discord, cuándo se verificó, su ID de Roblox y si tiene Premium activo. |
| `!whoislox <ID>` | Dado un ID numérico de Roblox, muestra el perfil del usuario asociado a ese ID. |

---

### ⚙️ Administración del servidor

Todos requieren permisos de administrador o el permiso específico indicado.

| Comando | Permiso | Descripción |
|---|---|---|
| `/setverifiedrole @rol` | Gestionar Roles | Define el rol que se asigna automáticamente cuando un usuario se verifica. |
| `/setpremiumrole @rol` | Gestionar Roles | Define el rol que se asigna a usuarios con Premium activo. |
| `/bindrole <grupoId> <rangoMin> @rol` | Gestionar Roles | Vincula un grupo de Roblox a un rol de Discord. Los usuarios que pertenezcan al grupo con el rango mínimo requerido recibirán ese rol automáticamente. |
| `/unbindrole <grupoId>` | Gestionar Roles | Elimina la vinculación de un grupo de Roblox. |
| `/listroles` | Gestionar Roles | Muestra toda la configuración de roles del servidor: verificado, premium, vinculaciones de grupos, formato de apodo e idioma. |
| `/setwelcome #canal mensaje` | Administrar Servidor | Configura un mensaje que se envía automáticamente cuando alguien se verifica. Variables: `{user}` (menciona al usuario) y `{roblox}` (nombre de Roblox). |
| `/setalertchannel #canal` | Administrar Servidor | Define el canal donde se enviarán todas las alertas de presencia del servidor. |
| `/setsuggestions #canal` | Administrar Servidor | Define el canal de sugerencias. |
| `/setnickname {roblox}` | Gestionar Apodos | Activa el auto-nickname al verificarse. Variables: `{roblox}` (nombre Roblox), `{display}` (display name) y `{rank}` (rango en el grupo principal). |
| `/setlang es\|en\|pt` | Administrar Servidor | Cambia el idioma del bot para este servidor (Español, Inglés o Portugués). |
| `!setautovoice <categoryId>` | Gestionar Canales | Activa la creación automática de canales de voz temporales cuando alguien juega Roblox. Se eliminan cuando quedan vacíos. |
| `!tienda agregar @rol <precio>` | Gestionar Roles | Agrega un rol a la tienda de economía con un precio en puntos. |

---

### 👑 Comandos del Owner

Solo el usuario con el ID configurado en `BOT_OWNER_ID` puede usar estos comandos.

| Comando | Descripción |
|---|---|
| `/activarpremium @usuario [días]` | Activa Premium para un usuario por X días. Si no se especifican días, es permanente. |
| `/desactivarpremium @usuario` | Desactiva el Premium de cualquier usuario, incluyéndose a uno mismo. |
| `!activarpremium <ID> <días>` | Versión de texto del comando anterior (usando el Discord ID directamente). |
| `!desactivarpremium <ID>` | Versión de texto del comando de desactivación. |

---

## ⭐ Sistema Premium

LockBox incluye un sistema de monetización integrado con **Ko-fi** que activa funciones exclusivas automáticamente al detectar una donación.

### Tiers de precio

| Plan | Precio | Duración | Funciones |
|---|---|---|---|
| 🌟 **Starter** | $0.99 USD | 2 días | Todas las funciones Premium |
| ⭐ **Weekly** | $4.99 USD | 7 días | Todas las funciones Premium |
| 💎 **Monthly** | $8.99 USD | 30 días | Todas las funciones Premium + mejor valor |

### ¿Cómo activar Premium?

1. Ve a la página de Ko-fi del bot
2. Realiza una donación del monto del plan que deseas
3. **Escribe tu Discord ID** (17-19 dígitos) en el mensaje de la donación
4. El bot detectará el monto automáticamente, activará el plan correcto y te enviará un DM de confirmación

> **¿Dónde obtengo mi Discord ID?**
> Discord → Ajustes → Avanzado → Activar "Modo desarrollador" → Clic derecho en tu nombre → "Copiar ID"

### Funciones exclusivas Premium

- 🔔 Alertas de presencia **ilimitadas** (gratis = 2)
- 🎨 `/flex` — Tarjeta de perfil exclusiva con imagen de fondo personalizable
- ⚔️ `/comparar` — Comparar dos cuentas de Roblox
- 📜 `/historial` — Ver historial de juegos con paginación
- ⚙️ `/syncall` — Sincronizar roles masivamente
- 📊 `/mistats` — Estadísticas personales detalladas
- 🔀 Multi-cuentas (hasta 3 alts de Roblox)
- ⏩ Cooldowns reducidos a la mitad
- ✈️ Auto-daily si olvidaste reclamar (con penalización del 10%)
- ⭐ Insignia global de donador en tu perfil
- 🎤 Canal de voz privado temporal (`!vozprivada`)

### Cómo configurar Ko-fi como admin del bot

1. Crea una cuenta en [Ko-fi.com](https://ko-fi.com)
2. Ve a **Settings → API → Webhook URL**
3. Pon: `https://TU-PROYECTO.up.railway.app/kofi`
4. Copia el **Verification Token** y ponlo en Railway como `KOFI_TOKEN`
5. Para precios fijos, crea productos en **Ko-fi Shop** con los precios exactos ($0.99, $4.99, $8.99)

---

## 🔒 Sistema de seguridad

LockBox incluye múltiples capas de seguridad para proteger el bot y el servidor:

### Captcha anti-bot
Antes de iniciar la verificación, el usuario debe resolver un captcha de suma simple directamente en Discord mediante botones. Evita registros masivos automatizados.

### Auto-lockdown de servidor
Si se detectan más de 10 verificaciones fallidas en 1 minuto, el servidor entra en lockdown durante 5 minutos. Las verificaciones se pausan automáticamente y se reanuden sin intervención manual.

### Sistema de cooldowns
Cada comando tiene un tiempo de espera para evitar spam:
- Comandos ligeros: 3 segundos
- Comandos de API Roblox (perfil, grupos, etc.): 15 segundos
- Comparar cuentas: 30 segundos
- Sincronización masiva: 60 segundos
- Premium: tiempos reducidos a la mitad

### Blacklist automática
Si un usuario viola el cooldown 5 veces seguidas, queda bloqueado durante 5 minutos. Se desbloquea automáticamente.

### Caché LRU en memoria
Los datos de Roblox se cachean en memoria para reducir peticiones a la API:
- Perfiles: 5 minutos
- Avatares: 10 minutos
- Presencia: 30 segundos
- Grupos: 5 minutos
- Amigos: 5 minutos

### Saneamiento de inputs
Todos los inputs del usuario se limpian antes de procesarse: se eliminan caracteres invisibles, caracteres de control y posibles inyecciones.

### Logs de auditoría
Configura `AUDIT_WEBHOOK_URL` con la URL de un webhook de Discord para recibir logs de eventos importantes: verificaciones exitosas, errores de API, activaciones de Premium, etc.

---

## 🌐 Sistema multi-idioma

El bot soporta 3 idiomas que se configuran por servidor:

| Código | Idioma | Comando |
|---|---|---|
| `es` | 🇪🇸 Español (predeterminado) | `/setlang es` |
| `en` | 🇺🇸 English | `/setlang en` |
| `pt` | 🇧🇷 Português | `/setlang pt` |

El idioma afecta todos los mensajes del bot en el servidor, incluyendo verificación, errores, confirmaciones y el sistema de economía.

---

## 📊 Estructura de datos en Redis

Los datos se guardan en Upstash Redis con las siguientes claves:

| Clave | Contenido |
|---|---|
| `user:{discordId}` | Datos de verificación: robloxId, robloxUsername, privacidad, fecha |
| `guild:{guildId}` | Configuración del servidor: roles, bindings, idioma, canales |
| `premium:{discordId}` | Estado Premium: fechas, tier, Ko-fi name |
| `eco:{discordId}` | Economía: puntos, racha, logros, trivias ganadas |
| `alerts:{discordId}` | Alertas de presencia configuradas |
| `history:{discordId}` | Historial de juegos (Premium) |
| `alts:{discordId}` | Cuentas alternativas (Premium) |
| `lfg:{messageId}` | Datos de grupos LFG activos |
| `shop:{guildId}` | Tienda de roles del servidor |
| `alert_users` | Lista global de usuarios con alertas activas |
| `birthday_monitor` | Lista de usuarios para monitor de aniversarios |

---

## 🗺️ Roadmap

Funciones planificadas para futuras versiones:

- [ ] Leaderboard global entre todos los servidores
- [ ] Sistema de transferencia de puntos con impuesto
- [ ] Notificaciones de cumpleaños de cuenta de Roblox (ya en monitor, pendiente UI)
- [ ] Autocompletado en más comandos
- [ ] Dashboard web para ver estadísticas del servidor
- [ ] Integración con la API de grupos de Roblox para gestión de rangos

---

## 🐛 Solución de problemas comunes

**El bot no responde a comandos de texto**
→ Verifica que el bot tenga el permiso "Message Content Intent" activado en Discord Developer Portal.

**`/estado` no muestra el juego**
→ La cookie `.ROBLOSECURITY` puede haber expirado. Renuévala desde Chrome: F12 → Application → Cookies → `www.roblox.com`.

**`/setlang` no cambia el idioma**
→ Asegúrate de ejecutarlo en un canal de texto del servidor (no en DM). El idioma se guarda por servidor.

**El Ko-fi no activa el Premium**
→ Verifica que el usuario haya escrito su Discord ID en el mensaje de la donación. El ID debe tener entre 17 y 19 dígitos.

**El bot no asigna roles automáticamente**
→ Comprueba que el rol del bot esté por encima de los roles que intenta asignar en la jerarquía del servidor.

**Comandos slash no aparecen**
→ Los comandos globales pueden tardar hasta 1 hora en propagarse. En servidores donde el bot ya estuvo, suelen aparecer de inmediato.

---

## 📄 Licencia

Este proyecto está bajo la licencia **MIT**. Puedes usarlo, modificarlo y distribuirlo libremente.

---

## 🙏 Créditos

Desarrollado con el apoyo de la comunidad. Inspirado en [Blox.link](https://blox.link) y [RoVer](https://rover.link).

- [Discord.js](https://discord.js.org) — Librería de Discord
- [Upstash](https://upstash.com) — Base de datos Redis serverless
- [Roblox API](https://api.roblox.com) — Datos de usuarios y juegos
- [Rolimons](https://www.rolimons.com) — Estimación de valor RAP
- [Ko-fi](https://ko-fi.com) — Sistema de donaciones y Premium

---

<div align="center">

**¿Preguntas o sugerencias?**
Usa el comando `/sugerencia` en cualquier servidor donde esté el bot.

⭐ Si te gusta el bot, considera apoyarlo con una donación en Ko-fi.

</div>
