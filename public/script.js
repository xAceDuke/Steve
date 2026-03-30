const statusBadge = document.getElementById('status-badge');
const statusText = document.getElementById('status-text');
const botName = document.getElementById('bot-name');
const healthFill = document.getElementById('health-fill');
const healthValue = document.getElementById('health-value');
const foodFill = document.getElementById('food-fill');
const foodValue = document.getElementById('food-value');
const dimValue = document.getElementById('dim-value');
const posValue = document.getElementById('pos-value');
const lagValue = document.getElementById('lag-value');
const inventoryGrid = document.getElementById('inventory-grid');
const botAvatar = document.getElementById('bot-avatar');

function updateStatusUI(online) {
    if (online) {
        statusBadge.className = 'status-badge online';
        statusText.textContent = 'Online';
    } else {
        statusBadge.className = 'status-badge offline';
        statusText.textContent = 'Offline';
        
        // Reset values when offline
        healthFill.style.width = '0%';
        healthValue.textContent = '0 / 20';
        foodFill.style.width = '0%';
        foodValue.textContent = '0 / 20';
        dimValue.textContent = 'Unknown';
        posValue.textContent = '0 / 0 / 0';
        lagValue.textContent = 'N/A';
        inventoryGrid.innerHTML = '<div class="loading-text">Bot offline.</div>';
    }
}

async function fetchStatus() {
    try {
        const res = await fetch('/api/status');
        const data = await res.json();

        updateStatusUI(data.online);

        if (data.online) {
            botName.textContent = data.username + ' Bot';
            botAvatar.src = `https://minotar.net/helm/${data.username}/100.png`;

            healthFill.style.width = `${(data.health / 20) * 100}%`;
            healthValue.textContent = `${data.health} / 20`;

            foodFill.style.width = `${(data.food / 20) * 100}%`;
            foodValue.textContent = `${data.food} / 20`;

            dimValue.textContent = data.dimension.replace('minecraft:', '').replace('_', ' ').toUpperCase();
            
            posValue.textContent = `${data.position.x} / ${data.position.y} / ${data.position.z}`;

            if (data.lagging) {
                lagValue.innerHTML = '<span style="color: var(--accent-red);">Lagging ⚠️</span>';
            } else {
                lagValue.innerHTML = '<span style="color: var(--accent-green);">Optimal ✅</span>';
            }
        }
    } catch (e) {
        console.error('Failed to fetch status', e);
        updateStatusUI(false);
    }
}

async function fetchInventory() {
    try {
        const res = await fetch('/api/inventory');
        const data = await res.json();

        if (data.items.length === 0) {
            inventoryGrid.innerHTML = '<div class="loading-text">Inventory is empty.</div>';
            return;
        }

        inventoryGrid.innerHTML = '';
        data.items.forEach(item => {
            const div = document.createElement('div');
            div.className = 'inv-item';
            
            const cleanName = item.displayName || item.name.replace(/_/g, ' ');

            div.innerHTML = `
                <span class="inv-name">${cleanName}</span>
                <span class="inv-count">x${item.count}</span>
            `;
            inventoryGrid.appendChild(div);
        });

    } catch (e) {
        console.error('Failed to fetch inventory', e);
    }
}

function pollData() {
    fetchStatus();
    fetchInventory();
}

// Initial fetch
pollData();

// Poll every 2 seconds
setInterval(pollData, 2000);
