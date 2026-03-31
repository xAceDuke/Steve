# Steve 24/7 Minecraft Bot

Steve is an advanced, resilient 24/7 Minecraft bot designed to maintain a persistent connection, handle authentications, survive in the game world, and provide a sleek web dashboard to monitor his status.

---

## ⚡ Features

- **AuthMe Support:** Automatically detects login requirements and seamlessly registers/logs in securely.
- **Intelligent Connection & Wake-up:** Dynamically resolves server IPs via DNS lookup. If the connected server is asleep, Steve intelligently pings the proxy to wake it up and waits for a smooth connection.
- **God Mode & Survival Monitor:** Once logged in, Steve enables god mode, heals, feeds, and builds a bedrock isolation platform at the edge of the world to stay safe from players. He constantly monitors his health and auto-eats.
- **Advanced Anti-AFK:** Performs human-like movements, looks around, swings his arm, and uses `/ping` to stay active on strict servers. Stops automatically if severe server lag is detected.
- **Intelligent Chat:** Greets new players and says goodbye when they leave, with natural human-like delays.
- **Auto Reconnect & Exponential Backoff:** If kicked or the server restarts, Steve aggressively but safely attempts to reconnect, backing off exponentially up to 5 minutes to avoid rate limits.
- **Verbose Render Logging:** Outputs all background actions (Anti-AFK tasks, restocking, custom wake-up pings) to the console to ensure activity is easily monitored inside Render.
- **Feature-Rich Web Dashboard:** A beautiful, responsive glassmorphism web interface showing his Vitals (Health & Food), Location, Server TPS Lag status, and real-time Inventory payload.
- **Discord Webhook integration:** Sends alerts on spawns, deaths, kicks, and errors.
- **Render 24/7 Persistence:** Designed with Render's Free Tier in mind, featuring built-in keep-alive mechanics so Steve never sleeps.

---

## 🚀 Local Setup

### Prerequisites
- [Node.js](https://nodejs.org/) (v16.x or newer strongly recommended)
- A Minecraft account/server.

### Installation

1. **Clone or download this repository** to your machine.
2. **Open a terminal** in the folder where you placed the bot.
3. **Install dependencies:**
   ```bash
   npm install
   ```
   Open `index.js` and edit the `botConfig` variables at the top:
   ```javascript
   const botConfig = {
       host: 'alora.joinmc.world',      // Main host to resolve and wake up
       port: 42353,                     // Fixed backend node port
       username: 'Steve',               // The bot's username
       version: '1.19',                 // Target MC version
       authmePassword: 'YourSecurePassword!', // For AuthMe servers
       webhookUrl: '',                  // (Optional) Discord webhook for alerts
   };
   ```
5. **Start the Bot:**
   ```bash
   node index.js
   ```
6. **View the Dashboard:**
   Open your browser and navigate to `http://localhost:3000`.

---

## ☁️ Deploying to Render (Free 24/7 Hosting)

Render provides a generous free tier for running Node.js web services. Follow these steps to host Steve completely free.

### 1. Push to GitHub
Upload your configured bot folder to a new private GitHub repository.

### 2. Create a Render Web Service
1. Go to [Render](https://render.com/) and sign in.
2. Click **New +** and select **Web Service**.
3. Connect your GitHub account and select your Steve Bot repository.
4. Configure the service:
   - **Name:** `steve-bot`
   - **Environment:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node index.js`
   - **Instance Type:** Free

### 3. Add Environment Variables (Optional but Recommended)
In the Render Web Service settings, go to the **Environment** tab:
1. `NODE_VERSION`: `18.16.0` (Ensures compatibility)
2. `RENDER_EXTERNAL_URL`: (Paste the URL Render gave you, e.g., `https://steve-bot.onrender.com`). This activates the internal `axios` self-ping!

Click **Save Changes** and wait for the bot to deploy.

---

## 🕰️ Making Steve Run 24/7 on Render's Free Tier

**⚠️ CRITICAL RENDER LIMITATION:** Render spins down free web services if they receive no external HTTP traffic for 15 minutes. While Steve has an internal self-ping, Render ignores internal routing for activity tracking. 

**To keep Steve 100% online 24/7, you MUST set up an external pinger.**

### Using UptimeRobot (Free & Reliable)
1. Go to [UptimeRobot](https://uptimerobot.com/) and create a free account.
2. Click **Add New Monitor**.
3. Set the following:
   - **Monitor Type:** HTTP(s)
   - **Friendly Name:** `Steve Bot Keep-Alive`
   - **URL/IP:** `https://your-render-app.onrender.com/ping`  *(Replace with your actual Render URL + /ping)*
   - **Monitoring Interval:** 5 minutes
4. Click **Create Monitor**.

That's it! UptimeRobot will ping your `/ping` route every 5 minutes from the outside, deceiving Render into keeping the server—and Steve—awake 24/7 without spending a dime.

---

## 🛠️ Modifying Dashboard
The beautiful glassmorphism dashboard is located in the `/public` folder:
- **`index.html`** - DOM Structure & Layout
- **`style.css`** - Styling, animations, and color scheme
- **`script.js`** - Data fetching & UI updating logic

The backend API is served via Express in `index.js`, specifically the `/api/status` and `/api/inventory` endpoints.
