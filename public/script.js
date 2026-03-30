const socket = io();

// DOM Elements
const statusBadge = document.getElementById('status-badge');
const statusText = document.getElementById('status-text');
const botName = document.getElementById('bot-name');
const pingValue = document.getElementById('ping-value');

const healthFill = document.getElementById('health-fill');
const healthValue = document.getElementById('health-value');
const foodFill = document.getElementById('food-fill');
const foodValue = document.getElementById('food-value');
const dimValue = document.getElementById('dim-value');
const posValue = document.getElementById('pos-value');
const lagValue = document.getElementById('lag-value');

const inventoryGrid = document.getElementById('inventory-grid');
const logContainer = document.getElementById('log-container');
const chatContainer = document.getElementById('chat-container');

// Socket Events
socket.on('connect', () => {
    // Initial inventory fetch
    fetchInventory();
});

socket.on('bot_status', (data) => {
    if (data.online) {
        statusBadge.className = 'status-badge online';
        statusText.textContent = 'SECURE UPLINK ESTABLISHED';
        
        botName.textContent = data.username.toUpperCase() + '_ROOT';

        healthFill.style.width = `${(data.health / 20) * 100}%`;
        healthValue.textContent = `${Math.round(data.health)} / 20`;

        foodFill.style.width = `${(data.food / 20) * 100}%`;
        foodValue.textContent = `${Math.round(data.food)} / 20`;

        dimValue.textContent = typeof data.dimension === 'string' 
            ? data.dimension.replace('minecraft:', '').toUpperCase() 
            : 'AWAITING...';
            
        posValue.textContent = `${data.position.x}, ${data.position.y}, ${data.position.z}`;

        lagValue.innerHTML = data.lagging 
            ? '<span style="color: var(--danger);">WARNING: DEGRADED</span>' 
            : '<span style="color: var(--accent);">OPTIMAL</span>';
            
        pingValue.textContent = data.ping !== undefined ? data.ping + ' ms' : '-- ms';
    } else {
        statusBadge.className = 'status-badge';
        statusText.textContent = 'UPLINK SEVERED. RECONNECTING...';
        pingValue.textContent = '-- ms';
        healthFill.style.width = '0%';
        foodFill.style.width = '0%';
    }
});

socket.on('log', (data) => {
    const isScrolledToBottom = logContainer.scrollHeight - logContainer.clientHeight <= logContainer.scrollTop + 10;
    
    const div = document.createElement('div');
    div.className = 'log-line';
    
    // basic color coding
    if (data.message.toLowerCase().includes('error') || data.message.toLowerCase().includes('died')) {
        div.classList.add('error');
    } else if (data.message.toLowerCase().includes('warning') || data.message.toLowerCase().includes('lag')) {
        div.classList.add('warn');
    }
    
    // Add time
    const timeString = new Date(data.timestamp).toLocaleTimeString();
    
    div.innerHTML = `<span class="timestamp">[${timeString}]</span> <span class="msg">${escapeHtml(data.message)}</span>`;
    
    logContainer.appendChild(div);
    
    // Limit to 200 logs
    while (logContainer.children.length > 200) {
        logContainer.removeChild(logContainer.firstChild);
    }
    
    if (isScrolledToBottom) {
        logContainer.scrollTop = logContainer.scrollHeight;
    }
});

socket.on('chat', (data) => {
    const isScrolledToBottom = chatContainer.scrollHeight - chatContainer.clientHeight <= chatContainer.scrollTop + 10;
    
    const div = document.createElement('div');
    div.className = 'chat-line';
    
    const timeString = new Date(data.timestamp).toLocaleTimeString();
    
    div.innerHTML = `<span class="timestamp">[${timeString}]</span> <span class="msg">${escapeHtml(data.message)}</span>`;
    
    chatContainer.appendChild(div);
    
    while (chatContainer.children.length > 100) {
        chatContainer.removeChild(chatContainer.firstChild);
    }
    
    if (isScrolledToBottom) {
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
});

// Helper
function escapeHtml(unsafe) {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

// Inventory Polling
async function fetchInventory() {
    try {
        const res = await fetch('/api/inventory');
        const data = await res.json();

        if (data.items.length === 0) {
            inventoryGrid.innerHTML = '<div class="loading-text">PAYLOAD EMPTY.</div>';
            return;
        }

        inventoryGrid.innerHTML = '';
        data.items.forEach(item => {
            const div = document.createElement('div');
            div.className = 'inv-item';
            
            const cleanName = item.displayName || item.name.replace(/_/g, ' ').toUpperCase();

            div.innerHTML = `
                <div style="font-size: 0.65rem; padding-bottom: 4px;">${cleanName}</div>
                <div class="inv-count">x${item.count}</div>
            `;
            inventoryGrid.appendChild(div);
        });

    } catch (e) {
        console.error('Fetch inventory err:', e);
    }
}

// Poll inventory every 5 seconds since it's not strictly realtime needed as much
setInterval(fetchInventory, 5000);
