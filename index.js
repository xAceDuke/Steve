const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const axios = require('axios');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const dns = require('dns').promises;

const botConfig = {
    host: 'alora.joinmc.world', // Main host to resolve and wake up
    port: 42353, // Fixed backend node port
    username: 'Steve', // The username you provided
    version: '1.19', // The version you requested
    authmePassword: 'StevePassword123!', // You can change the password if you'd like
    webhookUrl: '', // Add your Discord Webhook URL here to get notifications
};

let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY = 300000; // 5 minutes max
let serverLagging = false; // TPS lag tracker (for Phase 4)
let globalBot = null; // Used for dashboard
let initialPlayers = new Set(); // Tracks players who were online before Steve
let isLoggedIn = false; // Prevents actions before AuthMe login

function sendWebhook(message) {
    if (!botConfig.webhookUrl) return;
    axios.post(botConfig.webhookUrl, { content: message }).catch(() => {});
}

// ---------------------------
// Express Dashboard Setup
// ---------------------------
const app = express();
const port = process.env.PORT || 3000;
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// Setup console capture to emit logs via WebSockets
const originalConsoleLog = console.log;
console.log = function (...args) {
    const msg = args.join(' ');
    io.emit('log', { timestamp: new Date().toISOString(), message: msg });
    originalConsoleLog.apply(console, args);
};

app.get('/api/status', (req, res) => {
    if (globalBot && globalBot.entity) {
        res.json({
            online: true,
            username: globalBot.username,
            health: Math.round(globalBot.health),
            food: Math.round(globalBot.food),
            dimension: globalBot.game ? globalBot.game.dimension : 'Loading...',
            lagging: serverLagging,
            position: {
                x: Math.round(globalBot.entity.position.x),
                y: Math.round(globalBot.entity.position.y),
                z: Math.round(globalBot.entity.position.z),
            }
        });
    } else {
        res.json({ online: false, reconnecting: true });
    }
});

app.get('/api/inventory', (req, res) => {
    if (globalBot && globalBot.inventory) {
        const items = globalBot.inventory.items().map(item => ({
            name: item.name,
            count: item.count,
            displayName: item.displayName
        }));
        res.json({ items });
    } else {
        res.json({ items: [] });
    }
});

app.get('/ping', (req, res) => {
    res.status(200).send('pong');
});

server.listen(port, () => {
    console.log(`[WEB] Remote dashboard running at port ${port}`);
});

// Periodic state broadcast via Socket.IO
setInterval(() => {
    if (globalBot && globalBot.entity) {
        io.emit('bot_status', {
            online: true,
            username: globalBot.username,
            health: Math.round(globalBot.health),
            food: Math.round(globalBot.food),
            dimension: globalBot.game ? globalBot.game.dimension : 'Loading...',
            lagging: serverLagging,
            ping: globalBot.player && globalBot.player.ping !== undefined ? globalBot.player.ping : 0,
            position: {
                x: Math.round(globalBot.entity.position.x),
                y: Math.round(globalBot.entity.position.y),
                z: Math.round(globalBot.entity.position.z),
            }
        });
    } else {
        io.emit('bot_status', { online: false, reconnecting: true });
    }
}, 1000);

// Self-ping to keep Render awake if KEEPALIVE_URL is provided
const KEEPALIVE_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`;
setInterval(() => {
    axios.get(`${KEEPALIVE_URL}/ping`).catch(() => {});
}, 300000); // 5 minutes
// ---------------------------

async function createBot() {
    let targetIp = botConfig.host;
    try {
        console.log(`[BOT] Resolving IP for ${botConfig.host}...`);
        const { address } = await dns.lookup(botConfig.host);
        targetIp = address;
        console.log(`[BOT] Resolved ${botConfig.host} to ${targetIp}`);
    } catch (e) {
        console.log(`[BOT] DNS lookup failed for ${botConfig.host}: ${e.message}. Using fallback...`);
        targetIp = '51.79.228.175'; // fallback just in case
    }

    console.log(`[BOT] Connecting to ${targetIp}:${botConfig.port}...`);

    const bot = mineflayer.createBot({
        host: targetIp,
        port: botConfig.port,
        username: botConfig.username,
        version: botConfig.version,
    });
    
    globalBot = bot;

    import('mineflayer-auto-eat').then((autoeatModule) => {
        const loader = autoeatModule.loader || (autoeatModule.default && autoeatModule.default.loader) || autoeatModule.plugin;
        bot.loadPlugin(loader);
    }).catch(err => {
        console.error('[BOT] Failed to load mineflayer-auto-eat plugin:', err);
    });
    bot.loadPlugin(pathfinder);

    bot.once('spawn', () => {
        console.log(`[BOT] Spawned in the world as ${bot.username}.`);
        sendWebhook(`✅ **${bot.username}** has spawned in the server \`${botConfig.host}:${botConfig.port}\`.`);
        reconnectAttempts = 0; // Reset backoff on successful connection
        
        // Populate the Set of players already on the server when Steve spawns
        initialPlayers = new Set(Object.keys(bot.players));

        if (bot.autoEat) {
            bot.autoEat.options = {
                priority: 'foodPoints',
                startAt: 15,
                bannedFood: ['rotten_flesh', 'pufferfish', 'spider_eye', 'poisonous_potato']
            };
        }
    });

    // Listen to ALL chat messages and emit to WebSocket
    bot.on('message', (jsonMsg, position) => {
        const message = jsonMsg.toString();
        if (message.trim().length > 0) {
            io.emit('chat', { timestamp: new Date().toISOString(), message: message });
        }
    });

    // TPS Lag Monitor
    let lastTime = Date.now();
    bot.on('time', () => {
        const now = Date.now();
        const diff = now - lastTime;
        // The 'time' event fires every 20 ticks (1 second on healthy server)
        // If it takes >3000ms, the server is struggling (TPS < 6)
        if (diff > 3000) {
            if (!serverLagging) {
                console.log(`[BOT] ⚠️ Server lag detected (${diff}ms per 20 ticks). Pausing Anti-AFK...`);
                serverLagging = true;
            }
        } else {
            if (serverLagging) {
                console.log(`[BOT] ✅ Server recovered. Resuming Anti-AFK...`);
                serverLagging = false;
            }
        }
        lastTime = now;
    });

    // Intelligent Welcomes & Goodbyes
    bot.on('playerJoined', (player) => {
        if (player.username === bot.username) return;
        if (initialPlayers.has(player.username)) return; // Ignore players who were here before Steve
        
        const welcomes = [
            `Welcome to the server, ${player.username}!`,
            `Hey ${player.username}, welcome!`,
            `${player.username} has joined! Have fun!`,
            `Greetings, ${player.username} 👋`,
            `Hi ${player.username}, nice to see you here.`
        ];
        
        // Delay greeting to seem human (2 - 5 seconds)
        setTimeout(() => {
            const greeting = welcomes[Math.floor(Math.random() * welcomes.length)];
            bot.chat(greeting);
        }, Math.random() * 3000 + 2000);
    });

    bot.on('playerLeft', (player) => {
        if (player.username === bot.username) return;
        
        if (initialPlayers.has(player.username)) {
            // Player was here before Steve, so we don't say goodbye, just remove them from tracking
            initialPlayers.delete(player.username);
            return;
        }

        const goodbyes = [
            `See ya, ${player.username}!`,
            `Goodbye ${player.username} 👋`,
            `Take care, ${player.username}.`,
            `${player.username} left the server. Farewell!`,
            `Catch you later, ${player.username}.`
        ];
        
        setTimeout(() => {
            const greeting = goodbyes[Math.floor(Math.random() * goodbyes.length)];
            bot.chat(greeting);
        }, Math.random() * 3000 + 2000);
    });

    // Listen to messages for AuthMe
    bot.on('messagestr', (message, messagePosition) => {
        // Ignore obvious player chat
        if (message.startsWith('<')) return;

        const lowerMsg = message.toLowerCase();
        
        // Handle Authme Registration
        if (lowerMsg.includes('/register')) {
            console.log(`[BOT] AuthMe requested registration. Attempting to register...`);
            bot.chat(`/register ${botConfig.authmePassword} ${botConfig.authmePassword}`);
            isLoggedIn = true;
            startPostLoginRoutines(bot);
        }
        
        // Handle Authme Login
        if (lowerMsg.includes('/login')) {
            console.log(`[BOT] AuthMe requested login. Attempting to login...`);
            bot.chat(`/login ${botConfig.authmePassword}`);
            isLoggedIn = true;
            startPostLoginRoutines(bot);
        }
    });

    function startPostLoginRoutines(bot) {
        startAntiAFK(bot);
        startSurvivalMonitor(bot);
        
        setTimeout(() => {
            console.log(`[BOT] Enabling God Mode and initiating stealth isolation...`);
            bot.chat('/god');
            bot.chat('/gamemode creative');
            bot.chat('/heal');
            bot.chat('/feed');
            
            // Ensure Steve does not block multiplayer sleeping
            bot.chat('/gamerule playersSleepingPercentage 0');

            // Build an invisible barrier platform absolute coordinates to prevent falling
            bot.chat(`/execute in minecraft:overworld run fill -2 299 -2 2 299 2 barrier`);
            
            // Teleport high above spawn to stay hidden
            bot.chat(`/execute in minecraft:overworld run tp ${bot.username} 0 300 0`);

        }, 3000);
    }

    // Handle Death
    bot.on('death', () => {
        console.log('[BOT] Bot died. It should respawn automatically.');
        sendWebhook(`💀 **${bot.username}** has died! Attempting to respawn.`);
    });

    // Intelligent Health / God Mode monitor
    // If Steve ever drops below full health, he will intelligently re-enable OP protections
    bot.on('health', () => {
        if (!isLoggedIn) return; // Ignore damage before AuthMe login
        if (bot.health < 20) {
            console.log(`[BOT] Taking damage! Health at ${bot.health}. Re-asserting God Mode...`);
            bot.chat('/god');
            bot.chat('/gamemode creative');
            bot.chat('/heal');
            bot.chat('/feed');
        }
    });

    bot.on('autoeat_started', () => {
        console.log('[BOT] Started eating to restore hunger.');
    });

    // Handle Disconnection Events
    let lastKickReason = '';
    let lastError = null;
    bot.on('kicked', (reason) => {
        lastKickReason = String(reason).toLowerCase();
        console.log(`[BOT] Kicked: ${reason}`);
        sendWebhook(`⚠️ **${bot.username}** was kicked! Reason: \`${reason}\``);
    });

    bot.on('error', (err) => {
        lastError = err;
        console.log(`[BOT] Connection Error: ${err.message}`);
        sendWebhook(`❌ **${bot.username}** encountered a connection error: \`${err.message}\``);
    });

    bot.on('end', (reason) => {
        console.log(`[BOT] Disconnected (${reason}).`);
        sendWebhook(`🔌 **${bot.username}** disconnected. Reason: \`${reason}\``);
        stopAntiAFK();
        stopSurvivalMonitor();
        
        let reasonStr = String(reason).toLowerCase() + ' ' + lastKickReason;
        if (lastError) reasonStr += ' ' + lastError.message.toLowerCase();
        let delay = 10000; // Base 10s
        isLoggedIn = false; // Reset login state

        // Server Restart / Kick Detection
        if (reasonStr.includes('restart') || reasonStr.includes('queue') || reasonStr.includes('already playing')) {
             console.log('[BOT] Server appears to be restarting, full, or player already on. Applying 60s wait delay.');
             delay = 60000;
             reconnectAttempts = 0; 
        } else {
             // Exponential Backoff calculation
             delay = Math.min(10000 * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY);
             reconnectAttempts++;
        }

        if (reasonStr.includes('econnrefused')) {
             console.log(`[BOT] Server connection refused. Initiating wake-up routine via ${botConfig.host}...`);
             const wakeBot = mineflayer.createBot({
                 host: botConfig.host, // Connects normally (port 25565) to wake up the server
                 username: botConfig.username,
                 version: botConfig.version
             });
             
             wakeBot.on('error', () => {});
             wakeBot.on('kicked', () => {});
             setTimeout(() => {
                 try { wakeBot.quit(); } catch(e){}
             }, 5000); // Allow 5 seconds for wake-up handshake
        }

        console.log(`[BOT] Auto-reconnecting in ${delay / 1000} seconds... (Attempt ${reconnectAttempts})`);
        setTimeout(createBot, delay);
    });
}

let antiAfkInterval = null;

function startAntiAFK(bot) {
    if (antiAfkInterval) clearInterval(antiAfkInterval);
    console.log('[BOT] Advanced Anti-AFK started.');
    
    // Setup pathfinder movements
    const mcData = require('minecraft-data')(bot.version);
    const defaultMove = new Movements(bot, mcData);
    bot.pathfinder.setMovements(defaultMove);

    antiAfkInterval = setInterval(() => {
        try {
            if (serverLagging) return; // Prevent spamming actions during severe lag

            const actions = ['walk', 'look', 'swing', 'chat_ping', 'sneak'];
            const randomAction = actions[Math.floor(Math.random() * actions.length)];
            
            switch(randomAction) {
                case 'walk':
                    if (bot.entity) {
                        const x = bot.entity.position.x + (Math.random() * 10 - 5);
                        const z = bot.entity.position.z + (Math.random() * 10 - 5);
                        const y = bot.entity.position.y;
                        bot.pathfinder.setGoal(new goals.GoalNear(x, y, z, 1));
                    }
                    break;
                case 'look':
                    if (bot.entity) {
                        const yaw = bot.entity.yaw + (Math.random() - 0.5) * Math.PI;
                        const pitch = (Math.random() - 0.5) * Math.PI / 2;
                        bot.look(yaw, pitch, false);
                    }
                    break;
                case 'swing':
                    bot.swingArm('right');
                    break;
                case 'chat_ping':
                    bot.chat('/ping'); // Invisible activity registration
                    break;
                case 'sneak':
                    bot.setControlState('sneak', true);
                    setTimeout(() => bot.setControlState('sneak', false), 2000);
                    break;
            }
        } catch (e) {
            // Catch error silently
        }
    }, 15000);
}

function stopAntiAFK() {
    if (antiAfkInterval) {
        clearInterval(antiAfkInterval);
        antiAfkInterval = null;
        console.log('[BOT] Anti-AFK stopped.');
    }
}

let survivalInterval = null;

function startSurvivalMonitor(bot) {
    if (survivalInterval) clearInterval(survivalInterval);
    survivalInterval = setInterval(() => {
        try {
            // 1. Check Totem
            const offhand = bot.inventory.slots[45]; // slot 45 is off-hand
            if (!offhand || offhand.name !== 'totem_of_undying') {
                const totem = bot.inventory.items().find(item => item.name === 'totem_of_undying');
                if (totem) {
                    bot.equip(totem, 'off-hand');
                } else {
                    bot.chat(`/give ${bot.username} totem_of_undying 1`); // Use OP to fetch one
                }
            }
            
            // OP Food Restock
            const foods = bot.inventory.items().filter(item => ['golden_apple', 'baked_potato', 'cooked_beef'].includes(item.name));
            if (foods.length === 0) {
                bot.chat(`/give ${bot.username} golden_apple 64`);
            }
            
            // 2. Dimension Check (Anti-Portal)
            if (bot.game) {
                const currentDim = typeof bot.game.dimension === 'string' ? bot.game.dimension : String(bot.game.dimension);
                if (currentDim.includes('nether') || currentDim.includes('end')) {
                    console.log(`[BOT] Portal dimension detected (${currentDim}). Teleporting to safe sky platform...`);
                    // Build barrier platform first
                    bot.chat(`/execute in minecraft:overworld run fill -2 299 -2 2 299 2 barrier`);
                    // Try teleporting directly with execute command to force overworld safety
                    bot.chat(`/execute in minecraft:overworld run tp ${bot.username} 0 300 0`);
                }
            }
        } catch (e) { }
    }, 5000);
}

function stopSurvivalMonitor() {
    if (survivalInterval) clearInterval(survivalInterval);
    survivalInterval = null;
}

// Setup graceful shutdown
function handleShutdown() {
    console.log('[SYSTEM] Shutting down. Disconnecting Steve...');
    if (globalBot) {
        globalBot.removeAllListeners('end'); // Stop auto-reconnect
        globalBot.quit(); // Gracefully close connection 
    }
    process.exit(0);
}

process.on('SIGINT', handleShutdown);
process.on('SIGTERM', handleShutdown);

// Start the bot
createBot();
