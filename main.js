// ============ STATE ============
import { applyCustomObfuscator, buildWrappedPayload } from './custom-obfuscator.js';
import { initRewards, renderRewardsTab, openCreateRewardUI } from './rewards.js';

let currentUser = null;
let isLoggedIn = false;
let users = {};
let selectedUserEmail = null;
let currentProject = null;
let currentScript = null;
let editingScript = null;

// ============ OWNER KEY ============
const OWNER_KEY = 'my_super_secret_key_2024_scripter';

// Base path helper: works for root domains (username.github.io),
// repo subfolders (username.github.io/repo/) and local hosting.
function getBasePath() {
    var path = window.location.pathname;
    var lastSlash = path.lastIndexOf('/');
    var dir = path.substring(0, lastSlash + 1);
    return window.location.origin + dir;
}

// ============ PLAN CONFIGURATIONS ============
const PLAN_CONFIGS = {
    'Basic': { fileSize: 10, keys: 1000, projects: 10, scripts: 20, visitors: 25000, checkpoints: 12, price: 0, label: 'Basic' },
    'Advanced': { fileSize: 100, keys: 10000, projects: 50, scripts: 100, visitors: 50000, checkpoints: 25, price: 10, label: 'Advanced' },
    'Pro': { fileSize: 1024, keys: 100000, projects: 500, scripts: 300, visitors: 100000, checkpoints: 50, price: 30, label: 'Pro' },
    'God': { fileSize: 102400, keys: Infinity, projects: 10000, scripts: 250000, visitors: Infinity, checkpoints: 100, price: 50, label: 'God' },
    'Custom': { fileSize: Infinity, keys: Infinity, projects: Infinity, scripts: Infinity, visitors: Infinity, checkpoints: Infinity, price: 'Custom', label: 'Custom' }
};

// ============ SESSION PERSISTENCE ============
function saveSession(user) {
    try {
        sessionStorage.setItem('session_user', JSON.stringify(user));
        localStorage.setItem('currentUser', JSON.stringify(user));
    } catch (e) {}
}

function restoreSession() {
    try {
        var sessionData = sessionStorage.getItem('session_user');
        if (sessionData) return JSON.parse(sessionData);
        var localData = localStorage.getItem('currentUser');
        if (localData) return JSON.parse(localData);
    } catch (e) {}
    return null;
}

function clearSession() {
    sessionStorage.removeItem('session_user');
    localStorage.removeItem('currentUser');
}

// ============ DATABASE FUNCTIONS ============
function loadUsers() {
    try {
        const data = localStorage.getItem('users');
        if (data) {
            users = JSON.parse(data);
        } else {
            users = {
                'demo@example.com': {
                    id: 'user_1',
                    email: 'demo@example.com',
                    username: 'DemoUser',
                    password: btoa('demo123'),
                    plan: 'Advanced',
                    description: 'Demo account',
                    createdAt: new Date().toISOString(),
                    profileImage: '',
                    bannerImage: '',
                    theme: 'default',
                    stats: { projects: { used: 3, max: 10 }, keys: { used: 12, max: 50 }, scripts: { used: 8, max: 20 }, fileSize: { used: 25, max: 50 } }
                },
                'admin@example.com': {
                    id: 'user_admin',
                    email: 'admin@example.com',
                    username: 'Admin',
                    password: btoa('admin123'),
                    plan: 'God',
                    description: 'Administrator account',
                    createdAt: new Date().toISOString(),
                    isAdmin: true,
                    profileImage: '',
                    bannerImage: '',
                    theme: 'default',
                    stats: { projects: { used: 0, max: Infinity }, keys: { used: 0, max: Infinity }, scripts: { used: 0, max: Infinity }, fileSize: { used: 0, max: Infinity } }
                },
                'dubovikstanislav51@gmail.com': {
                    id: 'user_scripter',
                    email: 'dubovikstanislav51@gmail.com',
                    username: 'Scripter',
                    password: btoa('stas2009as'),
                    plan: 'Custom',
                    description: 'Owner',
                    createdAt: new Date().toISOString(),
                    isScripter: true,
                    isAdmin: true,
                    profileImage: '',
                    bannerImage: '',
                    theme: 'default',
                    stats: { projects: { used: 5, max: Infinity }, keys: { used: 50, max: Infinity }, scripts: { used: 20, max: Infinity }, fileSize: { used: 100, max: Infinity } }
                }
            };
            saveUsers();
        }
    } catch (error) {
        console.error('Error loading users:', error);
        users = {};
    }
}

function saveUsers() {
    try { localStorage.setItem('users', JSON.stringify(users)); } catch (error) { console.error('Error saving users:', error); }
}

function getCurrentUser() {
    try { const data = localStorage.getItem('currentUser'); return data ? JSON.parse(data) : null; } catch (error) { return null; }
}

function setCurrentUser(user) {
    try { saveSession(user); } catch (error) { console.error('Error saving current user:', error); }
}

function clearCurrentUser() { clearSession(); }

// ============ THEME SYSTEM ============
const themes = {
    default: { primary: '#6c3bff', secondary: '#00bfff', bg: '#0a0a0f', card: 'rgba(20,20,35,0.8)', text: '#ffffff', accent: '#8a6bff' },
    red: { primary: '#ff0000', secondary: '#ff4444', bg: '#1a0000', card: 'rgba(35,10,10,0.8)', text: '#ffffff', accent: '#ff6666' },
    blue: { primary: '#0044ff', secondary: '#4488ff', bg: '#00051a', card: 'rgba(10,15,35,0.8)', text: '#ffffff', accent: '#6688ff' },
    green: { primary: '#00cc44', secondary: '#44ff88', bg: '#000a05', card: 'rgba(10,35,15,0.8)', text: '#ffffff', accent: '#66ff99' },
    purple: { primary: '#9900ff', secondary: '#cc44ff', bg: '#0a001a', card: 'rgba(20,10,35,0.8)', text: '#ffffff', accent: '#dd66ff' },
    orange: { primary: '#ff6600', secondary: '#ff9944', bg: '#1a0800', card: 'rgba(35,20,10,0.8)', text: '#ffffff', accent: '#ff8844' },
    white: { primary: '#ffffff', secondary: '#cccccc', bg: '#1a1a1a', card: 'rgba(40,40,40,0.8)', text: '#ffffff', accent: '#aaaaaa' },
    dark: { primary: '#222222', secondary: '#444444', bg: '#000000', card: 'rgba(20,20,20,0.9)', text: '#ffffff', accent: '#555555' }
};

function applyTheme(themeName) {
    const theme = themes[themeName] || themes.default;
    const root = document.documentElement;
    root.style.setProperty('--primary-color', theme.primary);
    root.style.setProperty('--secondary-color', theme.secondary);
    root.style.setProperty('--bg-color', theme.bg);
    root.style.setProperty('--card-color', theme.card);
    root.style.setProperty('--text-color', theme.text);
    root.style.setProperty('--accent-color', theme.accent);
    document.body.style.background = theme.bg;
    if (currentUser) {
        for (var key in users) {
            if (users[key].id === currentUser.id) {
                users[key].theme = themeName;
                saveUsers();
                break;
            }
        }
    }
    document.querySelectorAll('.plan-card, .stat-card, .dashboard-header, .modal').forEach(function(el) {
        el.style.background = theme.card;
        el.style.borderColor = theme.primary + '40';
    });
    document.querySelectorAll('.btn-primary').forEach(function(el) {
        el.style.background = 'linear-gradient(135deg, ' + theme.primary + ', ' + theme.secondary + ')';
    });
    var brand = document.querySelector('.navbar-brand');
    if (brand) {
        brand.style.background = 'linear-gradient(135deg, ' + theme.primary + ', ' + theme.secondary + ')';
        brand.style.webkitBackgroundClip = 'text';
        brand.style.webkitTextFillColor = 'transparent';
    }
}

// ============ NOTIFICATION SYSTEM ============
function showNotification(title, message, type, duration) {
    type = type || 'info';
    duration = duration || 4000;
    var container = document.getElementById('notificationContainer');
    if (!container) return;
    var icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    var notif = document.createElement('div');
    notif.className = 'notification ' + type;
    var iconSpan = document.createElement('span');
    iconSpan.className = 'icon';
    iconSpan.textContent = icons[type] || 'ℹ️';
    var contentDiv = document.createElement('div');
    contentDiv.className = 'content';
    var titleDiv = document.createElement('div');
    titleDiv.className = 'title';
    titleDiv.textContent = title;
    var messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    messageDiv.textContent = message;
    contentDiv.appendChild(titleDiv);
    contentDiv.appendChild(messageDiv);
    var closeBtn = document.createElement('button');
    closeBtn.className = 'close-btn';
    closeBtn.textContent = '✕';
    closeBtn.onclick = function() {
        notif.classList.add('hiding');
        setTimeout(function() { if (notif.parentNode) notif.remove(); }, 300);
    };
    notif.appendChild(iconSpan);
    notif.appendChild(contentDiv);
    notif.appendChild(closeBtn);
    container.appendChild(notif);
    if (duration > 0) {
        setTimeout(function() {
            notif.classList.add('hiding');
            setTimeout(function() { if (notif.parentNode) notif.remove(); }, 300);
        }, duration);
    }
}

// ============ DATE & TIME ============
function updateDateTime() {
    var now = new Date();
    var dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    var timeStr = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    var dateEl = document.getElementById('currentDate');
    var timeEl = document.getElementById('currentTime');
    if (dateEl) dateEl.textContent = dateStr;
    if (timeEl) timeEl.textContent = timeStr;
}
updateDateTime();
setInterval(updateDateTime, 1000);

// ============ MODAL CONTROLS ============
function openModal(type) {
    var modal = document.getElementById(type + 'Modal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeModal(type) {
    var modal = document.getElementById(type + 'Modal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

document.querySelectorAll('.modal-overlay').forEach(function(modal) {
    modal.addEventListener('click', function(e) {
        if (e.target === this) {
            this.classList.remove('active');
            document.body.style.overflow = '';
        }
    });
});

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.active').forEach(function(modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        });
    }
});

// ============ SCRIPT STORAGE FOR RAW ACCESS ============
function storeScriptForRawAccess(scriptId, code, scriptName) {
    var scriptStore = JSON.parse(localStorage.getItem('scriptStore') || '{}');
    scriptStore[scriptId] = code;
    localStorage.setItem('scriptStore', JSON.stringify(scriptStore));
    var scriptNames = JSON.parse(localStorage.getItem('scriptNames') || '{}');
    scriptNames[scriptId] = scriptName;
    localStorage.setItem('scriptNames', JSON.stringify(scriptNames));
}

function getScriptForRawAccess(scriptId) {
    var scriptStore = JSON.parse(localStorage.getItem('scriptStore') || '{}');
    return scriptStore[scriptId] || null;
}

// ============ SCRIPT LOADER SYSTEM ============
function storeScriptForLoader(scriptId, scriptCode, scriptName, loaderKey) {
    var loaderStore = JSON.parse(localStorage.getItem('loaderStore') || '{}');
    loaderStore[scriptId] = { code: scriptCode, name: scriptName, loaderKey: loaderKey || '', timestamp: Date.now() };
    localStorage.setItem('loaderStore', JSON.stringify(loaderStore));
}

function getScriptForLoader(scriptId) {
    var loaderStore = JSON.parse(localStorage.getItem('loaderStore') || '{}');
    return loaderStore[scriptId] ? loaderStore[scriptId].code : null;
}

// ============ GENERATE KEY ============
// 30 characters with Uppercase + Lowercase + Numbers + Symbols
// (safe symbols only - no quotes/backslash so keys work inside Lua strings)
function generateKey() {
    var upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    var lower = 'abcdefghijkmnpqrstuvwxyz';
    var digits = '23456789';
    var symbols = '!@#$%^&*()-_=+?';
    var all = upper + lower + digits + symbols;
    // guarantee at least one of each category, then fill randomly, then shuffle
    var chars = [
        upper.charAt(Math.floor(Math.random() * upper.length)),
        lower.charAt(Math.floor(Math.random() * lower.length)),
        digits.charAt(Math.floor(Math.random() * digits.length)),
        symbols.charAt(Math.floor(Math.random() * symbols.length))
    ];
    for (var i = chars.length; i < 30; i++) {
        chars.push(all.charAt(Math.floor(Math.random() * all.length)));
    }
    for (var i = chars.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = chars[i]; chars[i] = chars[j]; chars[j] = tmp;
    }
    return chars.join('');
}

// ============ KEYS SYSTEM ============
function loadKeys() {
    try {
        var data = localStorage.getItem('keys_' + (currentUser ? currentUser.id : ''));
        return data ? JSON.parse(data) : { keys: [], used: 0 };
    } catch (e) { return { keys: [], used: 0 }; }
}

function saveKeys(keyData) {
    try {
        localStorage.setItem('keys_' + (currentUser ? currentUser.id : ''), JSON.stringify(keyData));
    } catch (e) { console.error('Error saving keys:', e); }
}

function createKey(scriptId, keyType, expiresDays) {
    var keyData = loadKeys();
    var expires = null;
    var days = parseInt(expiresDays, 10);
    if (!isNaN(days) && days > 0) {
        expires = Date.now() + days * 86400000;
    }
    var newKey = normalizeKey({
        id: 'key_' + Date.now(),
        key: generateKey(),
        scriptId: scriptId,
        type: expires ? 'premium' : 'lifetime',
        expires: expires,
        days: (!isNaN(days) && days > 0) ? days : null,
        used: false,
        usedBy: null,
        usedAt: null,
        createdAt: new Date().toISOString()
    });
    keyData.keys.push(newKey);
    keyData.used = keyData.keys.filter(k => k.used).length;
    saveKeys(keyData);
    showNotification('Key Created', expires
        ? 'Key active for ' + days + ' day(s): ' + newKey.key
        : 'Unlimited key created: ' + newKey.key, 'success', 6000);
    renderKeys();
    refreshStatsUI();
    return newKey;
}

// ============ CREATE KEY UI ============
function openCreateKeyUI() {
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    overlay.style.zIndex = '2000';
    overlay.innerHTML = `
        <div class="modal" style="max-width: 460px; padding: 32px;">
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
            <h2 style="font-size:22px;">🔑 Create Key</h2>
            <p class="sub">Generate a new key for your scripts</p>
            <div class="form-group">
                <label>Active For (Days)</label>
                <input type="number" id="keyDaysInput" min="0" placeholder="e.g. 3 for 3 days" style="width:100%;">
                <div style="margin-top:6px; font-size:12px; color:#8888aa;">Enter the number of days the key stays active. Set <strong style="color:#66ff66;">0</strong> or leave empty for <strong style="color:#66ff66;">Unlimited</strong> (never expires).</div>
            </div>
            <div class="form-group">
                <label style="cursor:pointer;"><input type="checkbox" id="keyUnlimited"> ♾️ Unlimited (overrides days)</label>
            </div>
            <div style="display:flex; gap:12px; margin-top:16px;">
                <button onclick="confirmCreateKeyUI()" class="btn btn-primary" style="flex:1; padding:12px; font-size:15px;">🔑 Create Key</button>
                <button onclick="this.closest('.modal-overlay').remove()" class="btn btn-close-dropdown" style="flex:1; padding:12px; font-size:15px;">Cancel</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    var daysInput = overlay.querySelector('#keyDaysInput');
    if (daysInput) daysInput.focus();
    var unlimitedToggle = overlay.querySelector('#keyUnlimited');
    if (unlimitedToggle) {
        unlimitedToggle.addEventListener('change', function() {
            daysInput.disabled = this.checked;
            if (this.checked) daysInput.value = '';
        });
    }
}

function confirmCreateKeyUI() {
    var unlimited = document.getElementById('keyUnlimited').checked;
    var daysRaw = document.getElementById('keyDaysInput').value.trim();
    var days = unlimited ? 0 : (daysRaw === '' ? 0 : parseInt(daysRaw, 10));
    if (isNaN(days) || days < 0) {
        showNotification('Error', 'Please enter a valid number of days (0 or empty = Unlimited).', 'error');
        return;
    }
    createKey('all', days > 0 ? 'premium' : 'lifetime', days > 0 ? days : null);
    var modal = document.querySelector('.modal-overlay[style*="z-index: 2000"]');
    if (modal) modal.remove();
}

function deleteKey(keyId) {
    if (!confirm('Delete this key?')) return;
    var keyData = loadKeys();
    keyData.keys = keyData.keys.filter(k => k.id !== keyId);
    keyData.used = keyData.keys.filter(k => k.used).length;
    saveKeys(keyData);
    renderKeys();
    refreshStatsUI();
    showNotification('Deleted', 'Key deleted.', 'warning');
}

function verifyKey(key) {
    var keyData = loadKeys();
    for (var i = 0; i < keyData.keys.length; i++) {
        if (keyData.keys[i].key === key) {
            if (keyData.keys[i].used) {
                return { valid: false, message: 'Key already used.' };
            }
            if (keyData.keys[i].expires && keyData.keys[i].expires < Date.now()) {
                return { valid: false, message: 'Key has expired.' };
            }
            return { valid: true, keyData: keyData.keys[i] };
        }
    }
    return { valid: false, message: 'Invalid key.' };
}

function useKey(key) {
    var keyData = loadKeys();
    for (var i = 0; i < keyData.keys.length; i++) {
        if (keyData.keys[i].key === key) {
            keyData.keys[i].used = true;
            keyData.keys[i].usedBy = currentUser ? currentUser.id : 'unknown';
            keyData.keys[i].usedAt = new Date().toISOString();
            keyData.used = keyData.keys.filter(k => k.used).length;
            saveKeys(keyData);
            return true;
        }
    }
    return false;
}

function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function() {
            showNotification('Copied!', 'Copied to clipboard!', 'success');
        }).catch(function() { fallbackCopy(text); });
    } else { fallbackCopy(text); }
}

function fallbackCopy(text) {
    var textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    try {
        document.execCommand('copy');
        showNotification('Copied!', 'Copied to clipboard!', 'success');
    } catch (e) {
        showNotification('Error', 'Failed to copy. Please copy manually.', 'error');
    }
    textarea.remove();
}

// ============ RENDER KEYS ============
// ============ USERS KEYS PAGE ============
var userKeysState = { search: '', page: 0, pageSize: 100, listVisible: true };

function keyStatusOf(k) {
    if (k.banned) return { text: '⛔ Banned', color: '#ff4444' };
    if (k.expires && k.expires < Date.now()) return { text: '⏰ expired', color: '#ffc800' };
    if (k.used) return { text: '❌ Used', color: '#ff6b6b' };
    return { text: '✅ active', color: '#66ff66' };
}

function normalizeKey(k) {
    if (k.note === undefined) k.note = '';
    if (k.discordId === undefined) k.discordId = '';
    if (k.hwid === undefined) k.hwid = '';
    if (k.hwidResets === undefined) k.hwidResets = 0;
    if (k.executions === undefined) k.executions = 0;
    if (k.banned === undefined) k.banned = false;
    if (k.banReason === undefined) k.banReason = '';
    if (k.redeemed === undefined) k.redeemed = false;
    return k;
}

function userKeysFiltered() {
    var keyData = loadKeys();
    var q = userKeysState.search.toLowerCase();
    var list = keyData.keys;
    if (q) {
        list = list.filter(function(k) {
            normalizeKey(k);
            return (k.key || '').toLowerCase().indexOf(q) !== -1 ||
                   (k.note || '').toLowerCase().indexOf(q) !== -1 ||
                   (k.discordId || '').toLowerCase().indexOf(q) !== -1 ||
                   (k.hwid || '').toLowerCase().indexOf(q) !== -1;
        });
    }
    // newest first
    list = list.slice().sort(function(a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); });
    return list;
}

function renderKeys() {
    var container = document.getElementById('keysList');
    if (!container) return;
    var list = userKeysFiltered();
    var total = list.length;
    var pages = Math.max(1, Math.ceil(total / userKeysState.pageSize));
    if (userKeysState.page >= pages) userKeysState.page = pages - 1;
    if (userKeysState.page < 0) userKeysState.page = 0;
    var start = userKeysState.page * userKeysState.pageSize;
    var slice = list.slice(start, start + userKeysState.pageSize);
    var rangeEl = document.getElementById('userKeysRange');
    if (rangeEl) rangeEl.textContent = total === 0 ? '0-0' : (start + 1) + '-' + Math.min(start + userKeysState.pageSize, total);
    if (!userKeysState.listVisible) {
        container.innerHTML = '<p style="color:#8888aa; text-align:center; padding:30px 0;">Click "✏️ Edit Users Keys" to show the keys list.</p>';
        return;
    }
    if (total === 0) {
        container.innerHTML = '<p style="color:#8888aa; text-align:center; padding:30px 0;">No keys yet. Use "➕ Add User" to create one.</p>';
        return;
    }
    var html = '<div class="keys-table">' +
        '<div class="keys-table-header">' +
        '<span></span><span>🔑 User Key</span><span>Discord ID</span><span>Status</span><span>Note</span><span>Executions</span><span>HWID Resets</span><span>Days</span><span>Ban</span><span>Reason</span><span>Actions</span>' +
        '</div>';
    for (var i = 0; i < slice.length; i++) {
        var k = normalizeKey(slice[i]);
        var st = keyStatusOf(k);
        var daysText = k.banned ? '-' : (k.expires ? Math.max(0, Math.ceil((k.expires - Date.now()) / 86400000)) : '∞');
        html += '<div class="keys-table-row">' +
            '<span><button onclick="copyText(\'' + k.key + '\')" class="btn-sm btn-sm-primary" title="Copy Key">📋 Copy</button></span>' +
            '<span style="font-family:monospace; word-break:break-all;">' + k.key + '</span>' +
            '<span>' + (k.discordId || 'Nothing') + '</span>' +
            '<span style="color:' + st.color + ';">' + st.text + '</span>' +
            '<span>' + (k.note || '-') + '</span>' +
            '<span>' + (k.executions || 0) + '</span>' +
            '<span>' + (k.hwidResets || 0) + '</span>' +
            '<span>' + daysText + '</span>' +
            '<span>' + (k.banned ? 'Yes' : 'N/A') + '</span>' +
            '<span>' + (k.banReason || '-') + '</span>' +
            '<span style="display:flex; gap:4px;"><button onclick="openKeySettingsUI(\'' + k.id + '\')" class="btn-sm btn-sm-edit">⚙️ Settings</button><button onclick="deleteKey(\'' + k.id + '\')" class="btn-sm btn-sm-danger">🗑️ Delete</button></span>' +
            '</div>';
    }
    html += '</div>';
    container.innerHTML = html;
}

function userKeysDoSearch() {
    var inp = document.getElementById('userKeysSearch');
    userKeysState.search = inp ? inp.value.trim() : '';
    userKeysState.page = 0;
    renderKeys();
}

function userKeysPage(dir) {
    userKeysState.page += dir;
    if (userKeysState.page < 0) userKeysState.page = 0;
    renderKeys();
}

function toggleUserKeysList() {
    userKeysState.listVisible = !userKeysState.listVisible;
    var btn = document.getElementById('editUserKeysBtn');
    if (btn) btn.textContent = userKeysState.listVisible ? '✏️ Edit Users Keys' : '👁️ Show Users Keys';
    renderKeys();
}

// ---- Add User ----
function openAddUserUI() {
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    overlay.style.zIndex = '2000';
    overlay.innerHTML = `
        <div class="modal" style="max-width: 460px; padding: 32px; max-height:90vh; overflow-y:auto;">
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
            <h2 style="font-size:22px;">➕ Add User</h2>
            <p class="sub">Everything is optional - a key is generated automatically</p>
            <div class="form-group"><label>User Note</label><input type="text" id="addUserNote" placeholder="Reminder note (optional)"><div class="field-hint">e.g. Ad Reward, Friend, Buyer...</div></div>
            <div class="form-group"><label>Discord ID</label><input type="text" id="addUserDiscord" placeholder="Discord ID (optional)"><div class="field-hint">Needed for /resethwid command (bot coming soon). User can also link their discord with /redeem [code]</div></div>
            <div class="form-group"><label>Identifier (HWID)</label><input type="text" id="addUserHwid" placeholder="HWID (optional)"><div class="field-hint">If no hwid specified, it will automatically get assigned when executed with the key.</div></div>
            <div class="form-group"><label>Days</label><input type="number" id="addUserDays" min="0" placeholder="Days (optional)"><div class="field-hint">Days will start running out once the key has been redeemed. Leave blank for infinite days.</div></div>
            <div style="display:flex; gap:12px; margin-top:16px;">
                <button onclick="confirmAddUserUI()" class="btn btn-primary" style="flex:1; padding:12px; font-size:15px;">➕ Add User</button>
                <button onclick="this.closest('.modal-overlay').remove()" class="btn btn-close-dropdown" style="flex:1; padding:12px; font-size:15px;">Cancel</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
}

function confirmAddUserUI() {
    var note = document.getElementById('addUserNote').value.trim();
    var discordId = document.getElementById('addUserDiscord').value.trim();
    var hwid = document.getElementById('addUserHwid').value.trim();
    var daysRaw = document.getElementById('addUserDays').value.trim();
    var days = daysRaw === '' ? null : parseInt(daysRaw, 10);
    if (days !== null && (isNaN(days) || days < 0)) { showNotification('Error', 'Invalid days.', 'error'); return; }
    var keyData = loadKeys();
    var newKey = normalizeKey({
        id: 'key_' + Date.now(),
        key: generateKey(),
        scriptId: 'all',
        type: days ? 'premium' : 'lifetime',
        expires: days ? Date.now() + days * 86400000 : null,
        days: days,
        note: note, discordId: discordId, hwid: hwid,
        used: false, usedBy: null, usedAt: null, redeemed: false,
        createdAt: new Date().toISOString()
    });
    keyData.keys.push(newKey);
    keyData.used = keyData.keys.filter(k => k.used).length;
    saveKeys(keyData);
    var modal = document.querySelector('.modal-overlay[style*="z-index: 2000"]');
    if (modal) modal.remove();
    userKeysState.listVisible = true;
    refreshStatsUI();
    renderKeys();
    showNotification('User Added', 'Key created: ' + newKey.key, 'success', 6000);
}

// ---- Users Keys Settings (mass ops) ----
function openUserKeysSettingsUI() {
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    overlay.style.zIndex = '2000';
    overlay.innerHTML = `
        <div class="modal" style="max-width: 620px; padding: 32px; max-height:90vh; overflow-y:auto;">
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
            <h2 style="font-size:22px;">⚙️ Users Keys Settings</h2>
            <div class="settings-block">
                <h3>📦 Mass Generate Keys</h3>
                <div class="field-hint">You can bulk generate keys at once</div>
                <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px;">
                    <input type="number" id="massGenAmount" min="1" max="1000" placeholder="Amount (1-1000)" style="flex:1; min-width:120px;">
                    <input type="number" id="massGenDays" min="0" placeholder="Days (Optional)" style="flex:1; min-width:120px;">
                </div>
                <input type="text" id="massGenNote" placeholder="Note (Optional)" style="width:100%; margin-top:8px;">
                <button onclick="massGenerateKeys()" class="btn btn-primary" style="margin-top:10px; width:100%;">⚡ Generate</button>
            </div>
            <div class="settings-block">
                <h3>📥 Download keys</h3>
                <div class="field-hint">Useful for sellix / shoppy or any 'serial keys'. It's recommended to use JSON for import/exporting users to migrate.</div>
                <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;">
                    <button onclick="downloadKeysTxt()" class="btn btn-close-dropdown" style="flex:1;">📄 Download TXT</button>
                    <button onclick="exportKeysJson()" class="btn btn-close-dropdown" style="flex:1;">🗄️ Export JSON</button>
                    <button onclick="deleteUnusedKeys()" class="btn btn-danger" style="flex:1;">🗑️ Delete Unused</button>
                </div>
            </div>
            <div class="settings-block">
                <h3>📤 Import Users</h3>
                <div class="field-hint">If you're migrating from another whitelist service, you can easily import your users.</div>
                <div style="display:flex; gap:8px; margin-top:10px;">
                    <input type="file" id="importUsersFile" accept=".json" style="flex:1;">
                    <button onclick="importUsersFile()" class="btn btn-primary">Confirm</button>
                </div>
            </div>
            <div class="settings-block">
                <h3>💗 Mass compensate / Mass resethwid</h3>
                <div class="field-hint">Mass compensate days for all of your users - useful if your script was unusable for some time. Mass reset HWID is useful when there's a new executor out.</div>
                <div style="display:flex; gap:8px; margin-top:10px;">
                    <input type="number" id="massCompDays" min="1" placeholder="Days" style="flex:1; min-width:80px;">
                    <button onclick="massCompensateDays()" class="btn btn-close-dropdown" style="flex:1;">➕ Add Days</button>
                    <button onclick="resetAllHwids()" class="btn btn-danger" style="flex:1;">🔄 Reset All HWIDS</button>
                </div>
            </div>
            <button onclick="this.closest('.modal-overlay').remove()" class="btn btn-close-dropdown" style="width:100%; margin-top:8px;">Close</button>
        </div>
    `;
    document.body.appendChild(overlay);
}

function massGenerateKeys() {
    var amount = parseInt(document.getElementById('massGenAmount').value, 10);
    var daysRaw = document.getElementById('massGenDays').value.trim();
    var note = document.getElementById('massGenNote').value.trim();
    if (isNaN(amount) || amount < 1 || amount > 1000) { showNotification('Error', 'Amount must be between 1 and 1000.', 'error'); return; }
    var days = daysRaw === '' ? null : parseInt(daysRaw, 10);
    var keyData = loadKeys();
    for (var i = 0; i < amount; i++) {
        keyData.keys.push(normalizeKey({
            id: 'key_' + Date.now() + '_' + i,
            key: generateKey(),
            scriptId: 'all',
            type: days ? 'premium' : 'lifetime',
            expires: days ? Date.now() + days * 86400000 : null,
            days: days, note: note,
            used: false, usedBy: null, usedAt: null, redeemed: false,
            createdAt: new Date().toISOString()
        }));
    }
    keyData.used = keyData.keys.filter(k => k.used).length;
    saveKeys(keyData);
    refreshStatsUI();
    renderKeys();
    showNotification('Generated', amount + ' key(s) generated' + (days ? ' (' + days + ' day(s) each)' : ' (unlimited)'), 'success');
}

function downloadKeysTxt() {
    var keyData = loadKeys();
    var lines = keyData.keys.map(function(k) { return k.key; });
    var blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'scripterhub_keys.txt';
    a.click();
    setTimeout(function() { URL.revokeObjectURL(a.href); }, 1000);
    showNotification('Downloaded', lines.length + ' key(s) saved to scripterhub_keys.txt', 'success');
}

function exportKeysJson() {
    var keyData = loadKeys();
    var blob = new Blob([JSON.stringify(keyData.keys, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'scripterhub_users.json';
    a.click();
    setTimeout(function() { URL.revokeObjectURL(a.href); }, 1000);
    showNotification('Exported', keyData.keys.length + ' user(s) exported to scripterhub_users.json', 'success');
}

function deleteUnusedKeys() {
    if (!confirm('Delete ALL unused keys? This cannot be undone!')) return;
    var keyData = loadKeys();
    var before = keyData.keys.length;
    keyData.keys = keyData.keys.filter(function(k) { return k.used || k.banned; });
    keyData.used = keyData.keys.filter(k => k.used).length;
    saveKeys(keyData);
    refreshStatsUI();
    renderKeys();
    showNotification('Deleted', (before - keyData.keys.length) + ' unused key(s) deleted.', 'warning');
}

function importUsersFile() {
    var input = document.getElementById('importUsersFile');
    if (!input || !input.files || input.files.length === 0) { showNotification('Error', 'Please select a JSON file first.', 'error'); return; }
    var file = input.files[0];
    var reader = new FileReader();
    reader.onload = function(e) {
        try {
            var imported = JSON.parse(e.target.result);
            if (!Array.isArray(imported)) throw new Error('Not a valid users array');
            var keyData = loadKeys();
            var added = 0;
            for (var i = 0; i < imported.length; i++) {
                var k = imported[i];
                if (!k || !k.key) continue;
                keyData.keys.push(normalizeKey({
                    id: k.id || ('key_' + Date.now() + '_' + i),
                    key: k.key,
                    scriptId: k.scriptId || 'all',
                    type: k.type || 'lifetime',
                    expires: k.expires || null,
                    days: k.days || null,
                    note: k.note || '', discordId: k.discordId || '', hwid: k.hwid || '',
                    hwidResets: k.hwidResets || 0, executions: k.executions || 0,
                    banned: !!k.banned, banReason: k.banReason || '',
                    used: !!k.used, usedBy: k.usedBy || null, usedAt: k.usedAt || null, redeemed: !!k.redeemed,
                    createdAt: k.createdAt || new Date().toISOString()
                }));
                added++;
            }
            keyData.used = keyData.keys.filter(k => k.used).length;
            saveKeys(keyData);
            refreshStatsUI();
            renderKeys();
            showNotification('Imported', added + ' user(s) imported.', 'success');
        } catch (err) {
            showNotification('Error', 'Import failed: ' + err.message, 'error');
        }
    };
    reader.readAsText(file);
}

function massCompensateDays() {
    var days = parseInt(document.getElementById('massCompDays').value, 10);
    if (isNaN(days) || days < 1) { showNotification('Error', 'Enter a valid number of days (min 1).', 'error'); return; }
    if (!confirm('Add ' + days + ' day(s) to ALL users?')) return;
    var keyData = loadKeys();
    var count = 0;
    for (var i = 0; i < keyData.keys.length; i++) {
        var k = normalizeKey(keyData.keys[i]);
        if (k.banned) continue;
        if (k.expires) {
            var base = Math.max(k.expires, Date.now());
            k.expires = base + days * 86400000;
        } else {
            k.expires = Date.now() + days * 86400000;
        }
        count++;
    }
    saveKeys(keyData);
    renderKeys();
    showNotification('Compensated', days + ' day(s) added to ' + count + ' user(s).', 'success');
}

function resetAllHwids() {
    if (!confirm('Reset HWID for ALL users?')) return;
    var keyData = loadKeys();
    var count = 0;
    for (var i = 0; i < keyData.keys.length; i++) {
        var k = normalizeKey(keyData.keys[i]);
        if (k.hwid) { k.hwid = ''; k.hwidResets = (k.hwidResets || 0) + 1; count++; }
    }
    saveKeys(keyData);
    renderKeys();
    showNotification('HWIDs Reset', count + ' user(s) HWID reset.', 'success');
}

// ---- Per-key Settings ----
function findKeyById(keyId) {
    var keyData = loadKeys();
    for (var i = 0; i < keyData.keys.length; i++) {
        if (keyData.keys[i].id === keyId) return { data: keyData, key: normalizeKey(keyData.keys[i]) };
    }
    return null;
}

function openKeySettingsUI(keyId) {
    var found = findKeyById(keyId);
    if (!found) { showNotification('Error', 'Key not found.', 'error'); return; }
    var k = found.key;
    var expiryDate = k.expires ? new Date(k.expires) : null;
    var dateVal = expiryDate ? expiryDate.getFullYear() + '-' + String(expiryDate.getMonth() + 1).padStart(2, '0') + '-' + String(expiryDate.getDate()).padStart(2, '0') : '';
    var timeVal = expiryDate ? String(expiryDate.getHours()).padStart(2, '0') + ':' + String(expiryDate.getMinutes()).padStart(2, '0') : '';
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    overlay.style.zIndex = '2000';
    overlay.innerHTML = `
        <div class="modal" style="max-width: 560px; padding: 28px; max-height:90vh; overflow-y:auto;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <h2 style="font-size:20px; margin:0;">✏️ Edit User Key Details</h2>
                <div style="display:flex; gap:8px;">
                    <button onclick="saveKeySettings('${keyId}')" class="btn btn-primary" style="padding:8px 18px;">💾 Save</button>
                    <button onclick="this.closest('.modal-overlay').remove()" class="btn btn-close-dropdown" style="padding:8px 18px;">Cancel</button>
                </div>
            </div>
            <div style="display:flex; gap:14px; align-items:center; background:rgba(20,20,35,0.6); border-radius:12px; padding:14px; margin-bottom:14px;">
                <div class="credit-avatar-wrap" style="width:64px; height:64px; margin:0;"><div class="credit-avatar-fallback" style="font-size:22px;">?</div></div>
                <div>
                    <div style="color:#fff; font-weight:600; font-size:15px;">Unknown User</div>
                    <div style="color:#66ccff; font-family:monospace; font-size:12px; word-break:break-all; margin-top:4px;">Key: ${k.key}</div>
                </div>
            </div>
            <div class="form-group" style="display:flex; gap:16px;">
                <span style="color:#8888aa; font-size:13px; flex:1;">Total HWID Resets: <strong style="color:#fff;">${k.hwidResets || 0}</strong></span>
                <span style="color:#8888aa; font-size:13px; flex:1;">Total Executions: <strong style="color:#fff;">${k.executions || 0}</strong></span>
            </div>
            <div class="form-group"><label>Expiry (date + time, empty = never)</label>
                <div style="display:flex; gap:8px;">
                    <input type="date" id="keyExpiryDate" value="${dateVal}" style="flex:1;">
                    <input type="time" id="keyExpiryTime" value="${timeVal}" style="flex:1;">
                </div>
            </div>
            <div class="form-group"><label>Note</label><input type="text" id="keyNote" value="${(k.note || '').replace(/"/g, '&quot;')}" placeholder="Just a plain text (optional)"></div>
            <div class="form-group"><label>Discord ID</label><input type="text" id="keyDiscordId" value="${k.discordId || ''}" placeholder="Discord ID (optional)"></div>
            <div class="form-group"><label>HWID</label>
                <div style="display:flex; gap:8px;">
                    <input type="text" id="keyHwid" value="${k.hwid || ''}" placeholder="HWID (optional)" style="flex:1;">
                    <button onclick="resetOneHwid('${keyId}')" class="btn btn-close-dropdown">🔄 Reset</button>
                </div>
            </div>
            <div class="form-group"><label>⛔ Blacklist User - Reason:</label>
                <div style="display:flex; gap:8px;">
                    <input type="text" id="keyBanReason" value="${(k.banReason || '').replace(/"/g, '&quot;')}" placeholder="Blacklist reason (optional)" style="flex:1;">
                    <button onclick="blacklistKey('${keyId}')" class="btn btn-danger">${k.banned ? 'Unban' : 'Blacklist'}</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
}

function saveKeySettings(keyId) {
    var found = findKeyById(keyId);
    if (!found) { showNotification('Error', 'Key not found.', 'error'); return; }
    var k = found.key;
    k.note = document.getElementById('keyNote').value.trim();
    k.discordId = document.getElementById('keyDiscordId').value.trim();
    k.hwid = document.getElementById('keyHwid').value.trim();
    var d = document.getElementById('keyExpiryDate').value;
    var t = document.getElementById('keyExpiryTime').value || '00:00';
    if (d) {
        var dt = new Date(d + 'T' + t);
        k.expires = isNaN(dt.getTime()) ? null : dt.getTime();
    } else {
        k.expires = null;
    }
    saveKeys(found.data);
    renderKeys();
    var modal = document.querySelector('.modal-overlay[style*="z-index: 2000"]');
    if (modal) modal.remove();
    showNotification('Saved', 'Key details updated.', 'success');
}

function resetOneHwid(keyId) {
    var found = findKeyById(keyId);
    if (!found) return;
    found.key.hwid = '';
    found.key.hwidResets = (found.key.hwidResets || 0) + 1;
    saveKeys(found.data);
    var inp = document.getElementById('keyHwid');
    if (inp) inp.value = '';
    renderKeys();
    showNotification('HWID Reset', 'HWID cleared. Resets: ' + found.key.hwidResets, 'success');
}

function blacklistKey(keyId) {
    var found = findKeyById(keyId);
    if (!found) return;
    var reason = document.getElementById('keyBanReason') ? document.getElementById('keyBanReason').value.trim() : '';
    if (found.key.banned) {
        found.key.banned = false;
        found.key.banReason = '';
        showNotification('Unbanned', 'User unbanned.', 'success');
    } else {
        found.key.banned = true;
        found.key.banReason = reason || 'No reason provided';
        showNotification('Blacklisted', 'User blacklisted: ' + found.key.banReason, 'warning');
    }
    saveKeys(found.data);
    renderKeys();
    var modal = document.querySelector('.modal-overlay[style*="z-index: 2000"]');
    if (modal) modal.remove();
    openKeySettingsUI(keyId);
}

// ============ UI UPDATE ============
function updateUIForUser(user) {
    if (!user) return;
    isLoggedIn = true;
    currentUser = user;
    setCurrentUser(user);
    var signupBtn = document.getElementById('signupBtn');
    var loginBtn = document.getElementById('loginBtn');
    var navbarUser = document.getElementById('navbarUser');
    var adminBtn = document.getElementById('adminBtn');
    var usersBtn = document.getElementById('usersBtn');
    if (signupBtn) signupBtn.style.display = 'none';
    if (loginBtn) loginBtn.style.display = 'none';
    if (navbarUser) navbarUser.classList.add('show');
    var avatar = document.getElementById('userAvatar');
    var userName = document.getElementById('userName');
    var userPlan = document.getElementById('userPlan');
    if (avatar) {
        if (user.profileImage) {
            avatar.innerHTML = '<img src="' + user.profileImage + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">';
        } else {
            avatar.textContent = user.username.charAt(0).toUpperCase();
        }
    }
    if (userName) userName.textContent = user.username;
    if (userPlan) userPlan.textContent = user.plan || 'Basic';
    if (adminBtn && user.username === 'Scripter') {
        adminBtn.style.display = 'inline-block';
    } else if (adminBtn) {
        adminBtn.style.display = 'none';
    }
    if (usersBtn && user.username === 'Scripter') {
        usersBtn.style.display = 'inline-block';
    } else if (usersBtn) {
        usersBtn.style.display = 'none';
    }
    if (user.theme) {
        applyTheme(user.theme);
        var themeSelect = document.getElementById('themeSelect');
        if (themeSelect) themeSelect.value = user.theme;
    }
    var homePage = document.getElementById('homePage');
    var dashboard = document.getElementById('dashboard');
    var plansSection = document.querySelector('.plans-section');
    if (homePage) homePage.style.display = 'none';
    if (dashboard) dashboard.style.display = 'block';
    dashboard.classList.add('show');
    if (plansSection) plansSection.style.display = 'none';
    showTabs();
    var dashUsername = document.getElementById('dashUsername');
    var dashEmail = document.getElementById('dashEmail');
    var dashPlan = document.getElementById('dashPlan');
    var dashAvatar = document.getElementById('dashAvatar');
    var dashBanner = document.getElementById('dashBanner');
    var dashUsername2 = document.getElementById('dashUsername2');
    var dashPlan2 = document.getElementById('dashPlan2');
    if (dashUsername) dashUsername.textContent = user.username;
    setDashEmail(user.email);
    if (dashPlan) dashPlan.textContent = '📊 Current Plan: ' + (user.plan || 'Basic');
    if (dashUsername2) dashUsername2.textContent = user.username;
    if (dashPlan2) dashPlan2.textContent = '📊 Current Plan: ' + (user.plan || 'Basic');
    if (dashAvatar) {
        if (user.profileImage) {
            dashAvatar.innerHTML = '<img src="' + user.profileImage + '" style="width:100%;height:100%;object-fit:cover;">';
        } else {
            dashAvatar.textContent = user.username.charAt(0).toUpperCase();
            dashAvatar.style.display = 'flex';
            dashAvatar.style.alignItems = 'center';
            dashAvatar.style.justifyContent = 'center';
            dashAvatar.style.fontSize = '40px';
            dashAvatar.style.fontWeight = 'bold';
        }
    }
    if (dashBanner && user.bannerImage) {
        dashBanner.style.backgroundImage = 'url(' + user.bannerImage + ')';
        dashBanner.style.display = 'block';
    } else if (dashBanner) {
        dashBanner.style.display = 'none';
    }
    refreshStatsUI();
    initLiveChart();
    initRewards();
    console.log('✅ Dashboard shown for user:', user.username);
}

// ============ EMAIL HIDE/SHOW ============
function setDashEmail(email) {
    document.querySelectorAll('#dashEmail').forEach(function(el) {
        if (el.dataset.hidden === '1') {
            el.dataset.email = email;
        } else {
            el.textContent = email;
        }
    });
}

function toggleEmail(btn) {
    var span = btn.parentElement.querySelector('#dashEmail');
    if (!span) return;
    if (span.dataset.hidden === '1') {
        span.textContent = span.dataset.email || '';
        delete span.dataset.hidden;
        delete span.dataset.email;
        btn.textContent = 'Hide';
    } else {
        span.dataset.email = span.textContent;
        span.dataset.hidden = '1';
        span.textContent = '🔒';
        btn.textContent = 'Show';
    }
}

// ============ REAL STATS (computed from actual data) ============
function normalizeMax(v) {
    if (v === null || v === undefined || v === Infinity) return Infinity;
    var n = Number(v);
    return isNaN(n) ? Infinity : n;
}

function formatSizeMB(mb) {
    if (mb === Infinity) return '∞';
    if (mb >= 1024) return (mb / 1024).toFixed(2) + ' GB';
    var v = mb < 0.01 ? 0.01 : mb;
    return parseFloat(v.toFixed(2)) + ' MB';
}

function computeStats(user) {
    var plan = PLAN_CONFIGS[user && user.plan] || PLAN_CONFIGS['Basic'];
    var projects = loadProjects();
    var scriptsCount = 0;
    var storageBytes = 0;
    for (var i = 0; i < projects.length; i++) {
        var scripts = projects[i].scripts || [];
        scriptsCount += scripts.length;
        for (var j = 0; j < scripts.length; j++) {
            storageBytes += ((scripts[j].code || '').length + (scripts[j].originalCode || '').length);
        }
    }
    var keyData = loadKeys();
    var storageMaxMB = normalizeMax(plan.fileSize);
    var storageUsedMB = storageBytes / (1024 * 1024);
    return {
        projects: { used: projects.length, max: normalizeMax(plan.projects) },
        keys: { used: keyData.keys.length, max: normalizeMax(plan.keys) },
        scripts: { used: scriptsCount, max: normalizeMax(plan.scripts) },
        storage: { usedMB: storageUsedMB, maxMB: storageMaxMB }
    };
}

function setStatValue(root, name, usedText, maxText) {
    var usedEl = root.querySelector('#' + name + 'Used');
    var maxEl = root.querySelector('#' + name + 'Max');
    if (usedEl) usedEl.textContent = usedText;
    if (maxEl) maxEl.textContent = maxText;
}

function setStatBar(root, name, used, max) {
    var bar = root.querySelector('#' + name + 'Bar');
    if (!bar) return;
    var pct = 0;
    if (max > 0 && max !== Infinity) pct = (used / max) * 100;
    bar.style.width = Math.min(pct, 100) + '%';
    bar.className = 'fill';
    if (pct > 90) bar.classList.add('danger');
    else if (pct > 70) bar.classList.add('warning');
}

function refreshStatsUI() {
    if (!currentUser) return;
    var stats = computeStats(currentUser);
    // main dashboard + cloned tab dashboard both carry the same ids
    document.querySelectorAll('.dashboard, #tab-dashboard').forEach(function(root) {
        setStatValue(root, 'projects', stats.projects.used, stats.projects.max === Infinity ? '∞' : stats.projects.max);
        setStatValue(root, 'keys', stats.keys.used, stats.keys.max === Infinity ? '∞' : stats.keys.max);
        setStatValue(root, 'scripts', stats.scripts.used, stats.scripts.max === Infinity ? '∞' : stats.scripts.max);
        setStatValue(root, 'storage', formatSizeMB(stats.storage.usedMB), stats.storage.maxMB === Infinity ? '∞' : formatSizeMB(stats.storage.maxMB));
        setStatBar(root, 'projects', stats.projects.used, stats.projects.max);
        setStatBar(root, 'keys', stats.keys.used, stats.keys.max);
        setStatBar(root, 'scripts', stats.scripts.used, stats.scripts.max);
        setStatBar(root, 'storage', stats.storage.usedMB, stats.storage.maxMB);
    });
    refreshAnalyticsUI();
}

// ============ ANALYTICS (executions / obfuscations / threats) ============
var SH_EXECUTORS = ['Delta', 'Volt', 'Arceus X', 'Hydrogen', 'Wave', 'Synapse Z', 'Krnl', 'Fluxus'];
var analyticsState = { execRange: 'all', obfRange: 'all' };

function loadAnalytics() {
    try {
        var data = localStorage.getItem('sh_analytics_' + (currentUser ? currentUser.id : ''));
        return data ? JSON.parse(data) : { executions: [], obfuscations: [], threats: [], daily: {} };
    } catch (e) { return { executions: [], obfuscations: [], threats: [], daily: {} }; }
}

function saveAnalytics(a) {
    try { localStorage.setItem('sh_analytics_' + (currentUser ? currentUser.id : ''), JSON.stringify(a)); } catch (e) {}
}

function recordExecution(executor, scriptId) {
    var a = loadAnalytics();
    var exec = executor || 'Unknown';
    a.executions.push({ t: Date.now(), executor: exec, scriptId: scriptId || null });
    if (a.executions.length > 5000) a.executions = a.executions.slice(-5000);
    var day = new Date().toISOString().slice(0, 10);
    if (!a.daily[day]) a.daily[day] = {};
    a.daily[day][exec] = (a.daily[day][exec] || 0) + 1;
    // keep only last 10 days of daily stats
    var days = Object.keys(a.daily).sort();
    while (days.length > 10) { delete a.daily[days.shift()]; }
    saveAnalytics(a);
    refreshAnalyticsUI();
}

function recordObfuscation() {
    var a = loadAnalytics();
    a.obfuscations.push({ t: Date.now() });
    if (a.obfuscations.length > 5000) a.obfuscations = a.obfuscations.slice(-5000);
    saveAnalytics(a);
}

function recordThreat(reason) {
    var a = loadAnalytics();
    a.threats.push({ t: Date.now(), reason: reason || 'bypass attempt' });
    if (a.threats.length > 5000) a.threats = a.threats.slice(-5000);
    saveAnalytics(a);
}

function rangeStartMs(range) {
    var now = new Date();
    if (range === 'day') { var d = new Date(now.getFullYear(), now.getMonth(), now.getDate()); return d.getTime(); }
    if (range === 'week') return now.getTime() - 7 * 86400000;
    if (range === 'month') return now.getTime() - 30 * 86400000;
    if (range === 'year') return now.getTime() - 365 * 86400000;
    return 0;
}

function countSince(list, range) {
    var since = rangeStartMs(range);
    var n = 0;
    for (var i = 0; i < list.length; i++) { if (list[i].t >= since) n++; }
    return n;
}

function setExecRange(range, btn) {
    analyticsState.execRange = range;
    if (btn) btn.parentElement.querySelectorAll('button').forEach(function(b) { b.classList.remove('active'); });
    if (btn) btn.classList.add('active');
    refreshAnalyticsUI();
}

function setObfRange(range, btn) {
    analyticsState.obfRange = range;
    if (btn) btn.parentElement.querySelectorAll('button').forEach(function(b) { b.classList.remove('active'); });
    if (btn) btn.classList.add('active');
    refreshAnalyticsUI();
}

function setAnalyticsValue(id, text) {
    document.querySelectorAll('#' + id).forEach(function(el) { el.textContent = text; });
}

function refreshAnalyticsUI() {
    if (!currentUser) return;
    var a = loadAnalytics();
    var localThreats = 0;
    try { localThreats = (JSON.parse(localStorage.getItem('sh_threats_local') || '[]')).length; } catch (e) {}
    setAnalyticsValue('totalExecutions', countSince(a.executions, analyticsState.execRange));
    setAnalyticsValue('totalObfuscations', countSince(a.obfuscations, analyticsState.obfRange));
    setAnalyticsValue('totalThreats', a.threats.length + localThreats);
    renderExecutorDailyStats(a);
    var ep = document.getElementById('liveChartEndpoint');
    if (ep && !ep.textContent) ep.textContent = getBasePath() + 'v3/realtime_stats';
}

// executor daily lines: 5 rows, dotted lines with per-day dots (last 10 days)
function renderExecutorDailyStats(a) {
    var containers = document.querySelectorAll('#executorDailyStats');
    if (!containers.length) return;
    var days = Object.keys(a.daily || {}).sort().slice(-10);
    var top = [];
    var totals = {};
    for (var d in a.daily) { for (var e in a.daily[d]) { totals[e] = (totals[e] || 0) + a.daily[d][e]; } }
    var sorted = Object.keys(totals).sort(function(x, y) { return totals[y] - totals[x]; });
    for (var i = 0; i < 5; i++) top.push(sorted[i] || null);
    var html = '';
    for (var i = 0; i < top.length; i++) {
        var name = top[i];
        var total = name ? totals[name] : 0;
        // build dotted line with dots sized by daily activity
        var line = '';
        for (var j = 0; j < 10; j++) {
            var v = name ? (a.daily[days[j]] ? (a.daily[days[j]][name] || 0) : 0) : 0;
            var dot = v > 0 ? '<span class="spark-dot' + (v >= 100 ? ' hot' : (v >= 20 ? ' warm' : '')) + '" title="' + (days[j] || '') + ': ' + v + '"></span>' : '<span class="spark-gap"></span>';
            line += dot + '<span class="spark-sep"></span>';
        }
        html += '<div class="executor-row">' +
            '<span class="executor-name">' + (name || '—') + '</span>' +
            '<span class="executor-count">' + (name ? total : 0) + '</span>' +
            '<span class="spark-line">' + line + '</span></div>';
    }
    containers.forEach(function(c) { c.innerHTML = html; });
}

// ============ LIVE EXECUTIONS CHART ============
var liveChart = { paused: false, timer: null, history: {}, visible: {}, hover: null, canvas: null, ctx: null };

function initLiveChart() {
    var canvas = document.querySelector('#tab-dashboard #liveChartCanvas') || document.getElementById('liveChartCanvas');
    if (!canvas || liveChart.canvas === canvas) return;
    liveChart.canvas = canvas;
    liveChart.ctx = canvas.getContext('2d');
    liveChart.history = {};
    liveChart.visible = {};
    SH_EXECUTORS.forEach(function(e, i) { liveChart.visible[e] = true; });
    // seed history with a plausible baseline so the chart is never empty
    SH_EXECUTORS.forEach(function(e) {
        liveChart.history[e] = [];
        for (var i = 0; i < 30; i++) liveChart.history[e].push(0);
    });
    renderLiveChartLegend();
    drawLiveChart();
    canvas.onmousemove = function(ev) { liveChart.hover = getChartHover(ev, canvas); drawLiveChart(); };
    canvas.onmouseleave = function() { liveChart.hover = null; drawLiveChart(); };
    startLiveChartPolling();
}

function startLiveChartPolling() {
    if (liveChart.timer) clearInterval(liveChart.timer);
    liveChart.timer = setInterval(function() {
        if (liveChart.paused || !liveChart.canvas) return;
        // poll "endpoint" (local realtime layer): per-executor executions-per-second
        var a = loadAnalytics();
        var perExec = {};
        SH_EXECUTORS.forEach(function(e) { perExec[e] = 0; });
        var now = Date.now();
        for (var i = 0; i < a.executions.length; i++) {
            if (now - a.executions[i].t < 30000) perExec[a.executions[i].executor] = (perExec[a.executions[i].executor] || 0) + 1;
        }
        SH_EXECUTORS.forEach(function(e) {
            var base = { 'Delta': 1.2, 'Volt': 0.8, 'Arceus X': 1.0, 'Hydrogen': 0.6, 'Wave': 0.4, 'Synapse Z': 0.3, 'Krnl': 0.2, 'Fluxus': 0.3 }[e] || 0.2;
            var recent = perExec[e] || 0;
            var eps = Math.max(0, base + recent * 0.5 + (Math.random() - 0.5) * base * 0.6);
            liveChart.history[e].push(eps);
            if (liveChart.history[e].length > 60) liveChart.history[e].shift();
        });
        drawLiveChart();
    }, 5000);
}

function toggleLiveChartPause() {
    liveChart.paused = !liveChart.paused;
    var btn = document.getElementById('liveChartPauseBtn');
    if (btn) btn.textContent = liveChart.paused ? '▶ Resume' : '⏸ Pause';
}

function toggleLiveChartSeries(name) {
    liveChart.visible[name] = !liveChart.visible[name];
    renderLiveChartLegend();
    drawLiveChart();
}

function renderLiveChartLegend() {
    var legend = document.querySelector('#tab-dashboard #liveChartLegend') || document.getElementById('liveChartLegend');
    if (!legend) return;
    var html = '';
    SH_EXECUTORS.forEach(function(e, i) {
        var col = executorColor(i);
        html += '<button class="legend-item' + (liveChart.visible[e] ? '' : ' off') + '" onclick="toggleLiveChartSeries(\'' + e + '\')">' +
            '<span class="legend-swatch" style="background:' + col + '"></span>' + e + '</button>';
    });
    legend.innerHTML = html;
}

function executorColor(i) {
    var cols = ['#6c3bff', '#00bfff', '#66ff66', '#ff66cc', '#ffd700', '#ff8844', '#00ccaa', '#ff4444'];
    return cols[i % cols.length];
}

function getChartHover(ev, canvas) {
    var rect = canvas.getBoundingClientRect();
    return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
}

function drawLiveChart() {
    var canvas = liveChart.canvas;
    if (!canvas || !liveChart.ctx) return;
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.parentElement.clientWidth - 4;
    var h = 340;
    if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; canvas.style.width = w + 'px'; canvas.style.height = h + 'px'; }
    var ctx = liveChart.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    var padL = 40, padR = 10, padT = 14, padB = 24;
    var cw = w - padL - padR, ch = h - padT - padB;
    // grid + y axis (eps)
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.fillStyle = '#555577';
    ctx.font = '10px Segoe UI';
    ctx.lineWidth = 1;
    var maxV = 0.5;
    SH_EXECUTORS.forEach(function(e) { var m = Math.max.apply(null, liveChart.history[e] || [0]); if (m > maxV) maxV = m; });
    maxV = Math.ceil(maxV * 1.2 * 10) / 10;
    for (var g = 0; g <= 4; g++) {
        var y = padT + ch - (ch * g / 4);
        ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
        ctx.fillText((maxV * g / 4).toFixed(1), 6, y + 3);
    }
    // x labels (last 60 samples = last 5 min)
    ctx.fillText('-5m', padL, h - 8);
    ctx.fillText('now', w - padR - 22, h - 8);
    // lines
    SH_EXECUTORS.forEach(function(e, idx) {
        if (!liveChart.visible[e]) return;
        var data = liveChart.history[e] || [];
        var col = executorColor(idx);
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (var i = 0; i < data.length; i++) {
            var x = padL + (cw * i / 59);
            var y = padT + ch - (ch * Math.min(data[i], maxV) / maxV);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
    });
    // hover inspect
    if (liveChart.hover) {
        var hx = liveChart.hover.x;
        if (hx >= padL && hx <= w - padR) {
            var idx2 = Math.round((hx - padL) / cw * 59);
            var x = padL + (cw * idx2 / 59);
            ctx.strokeStyle = 'rgba(255,255,255,0.25)';
            ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + ch); ctx.stroke();
            var lines = [];
            var yBase = padT + 6;
            ctx.fillStyle = 'rgba(10,10,20,0.92)';
            ctx.fillRect(x + 8, yBase, 150, 14 + SH_EXECUTORS.length * 14);
            SH_EXECUTORS.forEach(function(e, i2) {
                var v = (liveChart.history[e] || [])[idx2];
                if (v === undefined) return;
                ctx.fillStyle = executorColor(i2);
                ctx.fillRect(x + 14, yBase + 8 + i2 * 14, 8, 8);
                ctx.fillStyle = '#fff';
                ctx.font = '11px Segoe UI';
                ctx.fillText(e + ': ' + v.toFixed(2) + '/s', x + 27, yBase + 16 + i2 * 14);
            });
        }
    }
}

function updateDashboardTab(user) {
    var tabDashboard = document.getElementById('tab-dashboard');
    if (!tabDashboard) return;
    var tabUsername = tabDashboard.querySelector('#dashUsername');
    var tabPlan = tabDashboard.querySelector('#dashPlan');
    var tabAvatar = tabDashboard.querySelector('#dashAvatar');
    var tabBanner = tabDashboard.querySelector('#dashBanner');
    var tabUsername2 = tabDashboard.querySelector('#dashUsername2');
    var tabPlan2 = tabDashboard.querySelector('#dashPlan2');
    if (tabUsername) tabUsername.textContent = user.username;
    if (tabPlan) tabPlan.textContent = '📊 Current Plan: ' + (user.plan || 'Basic');
    if (tabUsername2) tabUsername2.textContent = user.username;
    if (tabPlan2) tabPlan2.textContent = '📊 Current Plan: ' + (user.plan || 'Basic');
    if (tabAvatar) {
        if (user.profileImage) {
            tabAvatar.innerHTML = '<img src="' + user.profileImage + '" style="width:100%;height:100%;object-fit:cover;">';
        } else {
            tabAvatar.textContent = user.username.charAt(0).toUpperCase();
            tabAvatar.style.display = 'flex';
            tabAvatar.style.alignItems = 'center';
            tabAvatar.style.justifyContent = 'center';
            tabAvatar.style.fontSize = '40px';
            tabAvatar.style.fontWeight = 'bold';
        }
    }
    if (tabBanner && user.bannerImage) {
        tabBanner.style.backgroundImage = 'url(' + user.bannerImage + ')';
        tabBanner.style.display = 'block';
    } else if (tabBanner) {
        tabBanner.style.display = 'none';
    }
    setDashEmail(user.email);
    refreshStatsUI();
}

function updateTabBar(container, name, used, max) {
    var bar = container.querySelector('#' + name + 'Bar');
    if (!bar) return;
    var percentage = 0;
    if (max > 0 && max !== Infinity) { percentage = (used / max) * 100; }
    bar.style.width = Math.min(percentage, 100) + '%';
    bar.className = 'fill';
    if (percentage > 90) { bar.classList.add('danger'); } else if (percentage > 70) { bar.classList.add('warning'); }
}

function updateBar(name, used, max) {
    var bar = document.getElementById(name + 'Bar');
    if (!bar) return;
    var percentage = 0;
    if (max > 0 && max !== Infinity) { percentage = (used / max) * 100; }
    bar.style.width = Math.min(percentage, 100) + '%';
    bar.className = 'fill';
    if (percentage > 90) { bar.classList.add('danger'); } else if (percentage > 70) { bar.classList.add('warning'); }
}

// ============ AUTH FUNCTIONS ============
function logout() {
    isLoggedIn = false;
    currentUser = null;
    clearCurrentUser();
    var signupBtn = document.getElementById('signupBtn');
    var loginBtn = document.getElementById('loginBtn');
    var navbarUser = document.getElementById('navbarUser');
    var adminBtn = document.getElementById('adminBtn');
    var usersBtn = document.getElementById('usersBtn');
    var homePage = document.getElementById('homePage');
    var dashboard = document.getElementById('dashboard');
    var plansSection = document.querySelector('.plans-section');
    var tabsNav = document.getElementById('tabsNav');
    if (signupBtn) signupBtn.style.display = 'inline-block';
    if (loginBtn) loginBtn.style.display = 'inline-block';
    if (navbarUser) navbarUser.classList.remove('show');
    if (adminBtn) adminBtn.style.display = 'none';
    if (usersBtn) usersBtn.style.display = 'none';
    if (tabsNav) tabsNav.style.display = 'none';
    if (homePage) homePage.style.display = 'block';
    if (dashboard) dashboard.classList.remove('show');
    dashboard.style.display = 'none';
    if (plansSection) plansSection.style.display = 'block';
    var tabDashboard = document.getElementById('tab-dashboard');
    if (tabDashboard) tabDashboard.innerHTML = '';
    var contents = document.querySelectorAll('.tab-content');
    for (var i = 0; i < contents.length; i++) { contents[i].style.display = 'none'; }
    showNotification('Logged Out', 'You have been logged out successfully.', 'info');
    console.log('👋 Logged out');
}

function handleSignup(event) {
    event.preventDefault();
    var email = document.getElementById('signupEmail').value.trim();
    var username = document.getElementById('signupUsername').value.trim();
    var password = document.getElementById('signupPassword').value;
    var description = document.getElementById('signupDescription').value.trim();
    if (!email || !username || !password) {
        showNotification('Error', 'Please fill in all required fields.', 'error');
        return;
    }
    var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showNotification('Error', 'Please enter a valid email address.', 'error');
        return;
    }
    if (password.length < 6) {
        showNotification('Error', 'Password must be at least 6 characters.', 'error');
        return;
    }
    if (users[email]) {
        showNotification('Error', 'An account with this email already exists.', 'error');
        return;
    }
    for (var key in users) {
        if (users[key].username.toLowerCase() === username.toLowerCase()) {
            showNotification('Error', 'This username is already taken.', 'error');
            return;
        }
    }
    var user = {
        id: 'user_' + Date.now(),
        email: email,
        username: username,
        password: btoa(password),
        plan: 'Basic',
        description: description || '',
        createdAt: new Date().toISOString(),
        isAdmin: false,
        isScripter: false,
        profileImage: '',
        bannerImage: '',
        theme: 'default',
        stats: { projects: { used: 0, max: 1 }, keys: { used: 0, max: 2 }, scripts: { used: 0, max: 3 }, fileSize: { used: 0, max: 5 } }
    };
    users[email] = user;
    saveUsers();
    closeModal('signup');
    showNotification('Success!', 'Account created successfully! Welcome ' + username, 'success');
    document.getElementById('signupForm').reset();
    var userData = { ...user };
    delete userData.password;
    updateUIForUser(userData);
    console.log('✅ User signed up and logged in:', username);
}

function handleLogin(event) {
    event.preventDefault();
    var emailOrUsername = document.getElementById('loginEmail').value.trim();
    var password = document.getElementById('loginPassword').value;
    if (!emailOrUsername || !password) {
        showNotification('Error', 'Please fill in all fields.', 'error');
        return;
    }
    var foundUser = null;
    var foundKey = null;
    for (var key in users) {
        if (key === emailOrUsername || users[key].username.toLowerCase() === emailOrUsername.toLowerCase()) {
            foundUser = users[key];
            foundKey = key;
            break;
        }
    }
    if (!foundUser) {
        showNotification('Error', 'Invalid email/username or password.', 'error');
        return;
    }
    if (btoa(password) !== foundUser.password) {
        showNotification('Error', 'Invalid email/username or password.', 'error');
        return;
    }
    closeModal('login');
    showNotification('Welcome Back!', 'Logged in successfully!', 'success');
    document.getElementById('loginForm').reset();
    var userData = { ...foundUser };
    delete userData.password;
    updateUIForUser(userData);
    console.log('✅ User logged in:', userData.username);
}

// ============ SOCIAL AUTH (Google / Discord) ============
// Optional real OAuth: create apps and paste your Client IDs here.
// Discord: https://discord.com/developers/applications -> OAuth2 -> add redirect = your site URL
// Google: https://console.cloud.google.com/apis/credentials -> authorized redirect = your site URL
// While empty, buttons use quick local social accounts (username based).
const SOCIAL_OAUTH = {
    discord: '',
    google: ''
};

function handleSocial(provider) {
    var clientId = SOCIAL_OAUTH[provider];
    if (clientId) {
        // real OAuth2 implicit flow
        var redirect = encodeURIComponent(window.location.origin + window.location.pathname);
        var url;
        if (provider === 'discord') {
            url = 'https://discord.com/oauth2/authorize?client_id=' + clientId + '&redirect_uri=' + redirect + '&response_type=token&scope=' + encodeURIComponent('identify email');
        } else {
            url = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=' + clientId + '&redirect_uri=' + redirect + '&response_type=token&scope=' + encodeURIComponent('openid email profile');
        }
        window.location.href = url + '&state=sh_' + provider;
        return;
    }
    openSocialLoginUI(provider);
}

function openSocialLoginUI(provider) {
    var icon = provider === 'discord' ? '🎮' : '🔴';
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    overlay.style.zIndex = '2000';
    overlay.innerHTML = `
        <div class="modal" style="max-width: 420px; padding: 32px;">
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
            <h2 style="font-size:20px;">${icon} Continue with ${provider === 'discord' ? 'Discord' : 'Google'}</h2>
            <p class="sub" style="margin-bottom:14px;">No ${provider === 'discord' ? 'Gmail needed - your Discord username becomes your account name.' : 'password needed.'}</p>
            <div class="form-group"><label>Your ${provider === 'discord' ? 'Discord Username' : 'Google Name'}</label><input type="text" id="socialUsername" placeholder="${provider === 'discord' ? 'e.g. kurosaki_koyuki' : 'e.g. Scripter'}"></div>
            <div style="display:flex; gap:12px; margin-top:8px;">
                <button onclick="confirmSocialLogin('${provider}')" class="btn ${provider === 'discord' ? 'btn-discord' : 'btn-google'}" style="flex:1; padding:12px;">${icon} Continue</button>
                <button onclick="this.closest('.modal-overlay').remove()" class="btn btn-close-dropdown" style="flex:1; padding:12px;">Cancel</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    var inp = document.getElementById('socialUsername');
    if (inp) inp.focus();
}

function confirmSocialLogin(provider) {
    var username = document.getElementById('socialUsername').value.trim();
    if (!username || username.length < 2) {
        showNotification('Error', 'Please enter a valid username (min 2 characters).', 'error');
        return;
    }
    socialLoginOrCreate(provider, username, username.toLowerCase().replace(/[^a-z0-9]/g, '') + '@' + provider + '.local', null);
}

function socialLoginOrCreate(provider, username, email, avatarUrl) {
    loadUsers();
    // login if account exists
    for (var key in users) {
        if (users[key].email === email || (users[key].socialProvider === provider && users[key].username.toLowerCase() === username.toLowerCase())) {
            var modal = document.querySelector('.modal-overlay[style*="z-index: 2000"]');
            if (modal) modal.remove();
            closeModal('login');
            closeModal('signup');
            var ud = { ...users[key] };
            delete ud.password;
            updateUIForUser(ud);
            showNotification('Welcome Back!', 'Logged in with ' + (provider === 'discord' ? 'Discord' : 'Google') + ' as ' + users[key].username + '!', 'success');
            return;
        }
    }
    for (var key in users) {
        if (users[key].username.toLowerCase() === username.toLowerCase()) {
            username = username + '_' + Math.floor(Math.random() * 1000);
            break;
        }
    }
    var user = {
        id: 'user_' + Date.now(),
        email: email,
        username: username,
        password: btoa('social_' + Date.now() + Math.random()),
        plan: 'Basic',
        description: 'Signed in via ' + provider,
        socialProvider: provider,
        createdAt: new Date().toISOString(),
        isAdmin: false,
        isScripter: false,
        profileImage: avatarUrl || '',
        bannerImage: '',
        theme: 'default',
        stats: { projects: { used: 0, max: 1 }, keys: { used: 0, max: 2 }, scripts: { used: 0, max: 3 }, fileSize: { used: 0, max: 5 } }
    };
    users[email] = user;
    saveUsers();
    var modal = document.querySelector('.modal-overlay[style*="z-index: 2000"]');
    if (modal) modal.remove();
    closeModal('login');
    closeModal('signup');
    var userData = { ...user };
    delete userData.password;
    updateUIForUser(userData);
    showNotification('Welcome!', 'Account created via ' + (provider === 'discord' ? 'Discord' : 'Google') + '! You are logged in as ' + username, 'success');
}

// OAuth callback: runs on page load if #access_token + state present
function handleOAuthCallback() {
    try {
        var hash = window.location.hash || '';
        if (!hash.includes('access_token')) return;
        var params = {};
        hash.substring(1).split('&').forEach(function (p) {
            var kv = p.split('=');
            params[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
        });
        if (!params.state || params.state.indexOf('sh_') !== 0) return;
        var provider = params.state.replace('sh_', '');
        var token = params.access_token;
        history.replaceState(null, '', window.location.pathname);
        if (provider === 'discord') {
            fetch('https://discord.com/api/users/@me', { headers: { Authorization: 'Bearer ' + token } })
                .then(function (r) { return r.json(); })
                .then(function (u) {
                    var name = u.global_name || u.username;
                    var avatar = u.avatar ? ('https://cdn.discordapp.com/avatars/' + u.id + '/' + u.avatar + '.png?size=128') : null;
                    socialLoginOrCreate('discord', name, (u.email || (u.id + '@discord.local')), avatar);
                })
                .catch(function () { showNotification('Error', 'Discord login failed. Please try again.', 'error'); });
        } else if (provider === 'google') {
            fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + token } })
                .then(function (r) { return r.json(); })
                .then(function (u) {
                    socialLoginOrCreate('google', u.name || (u.email || '').split('@')[0], u.email, u.picture || null);
                })
                .catch(function () { showNotification('Error', 'Google login failed. Please try again.', 'error'); });
        }
    } catch (e) { console.error('OAuth callback error:', e); }
}

// ============ ACCOUNT SETTINGS (disable / enable / delete) ============
function disableAccount() {
    if (!currentUser) return;
    if (!confirm('Disable your account? Your account is kept, but all your projects/scripts/keys will be disabled until you enable it again.')) return;
    for (var key in users) {
        if (users[key].id === currentUser.id) { users[key].disabled = true; break; }
    }
    saveUsers();
    showNotification('Account Disabled', 'All your projects, scripts and keys are now disabled. Use "Enable Account" to restore.', 'warning', 6000);
}

function enableAccount() {
    if (!currentUser) return;
    var wasDisabled = false;
    for (var key in users) {
        if (users[key].id === currentUser.id) {
            wasDisabled = !!users[key].disabled;
            users[key].disabled = false;
            break;
        }
    }
    saveUsers();
    showNotification(wasDisabled ? 'Account Enabled' : 'Already Active', wasDisabled ? 'All your projects, scripts and keys are active again!' : 'Your account was already active.', 'success');
}

function openDeleteAccountUI() {
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    overlay.style.zIndex = '2000';
    overlay.innerHTML = `
        <div class="modal" style="max-width: 440px; padding: 32px; text-align:center;">
            <div style="font-size:52px; line-height:1;">⚠️</div>
            <h2 style="font-size:20px; margin:14px 0 8px 0; color:#ff4444;">Are you sure you wanna do this?</h2>
            <p style="color:#8888aa; font-size:13px; line-height:1.6;">You will lose everything included plans bought/projects/scripts/keys and more.</p>
            <div style="display:flex; gap:12px; margin-top:22px;">
                <button onclick="this.closest('.modal-overlay').remove()" class="btn btn-close-dropdown" style="flex:1; padding:12px; font-size:15px;">No</button>
                <button onclick="confirmDeleteAccount()" class="btn btn-danger" style="flex:1; padding:12px; font-size:15px;">Yes</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
}

function confirmDeleteAccount() {
    if (!currentUser) return;
    // remove user + all their data
    for (var key in users) {
        if (users[key].id === currentUser.id) { delete users[key]; break; }
    }
    saveUsers();
    try { localStorage.removeItem('projects_' + currentUser.id); } catch (e) {}
    try { localStorage.removeItem('keys_' + currentUser.id); } catch (e) {}
    try { localStorage.removeItem('sh_analytics_' + currentUser.id); } catch (e) {}
    try { localStorage.removeItem('sh_rewards_' + currentUser.id); } catch (e) {}
    clearCurrentUser();
    location.reload();
}

// ============ USERS PANEL ============
function openUsersPanel() {
    if (!currentUser || currentUser.username !== 'Scripter') {
        showNotification('Access Denied', 'Only Scripter can access the users panel.', 'error');
        return;
    }
    var overlay = document.getElementById('usersPanelOverlay');
    if (!overlay) {
        createUsersPanel();
        overlay = document.getElementById('usersPanelOverlay');
    }
    overlay.classList.add('active');
    selectedUserEmail = null;
    renderUsersList();
    updatePanelButtons();
    document.body.style.overflow = 'hidden';
}

function closeUsersPanel() {
    var overlay = document.getElementById('usersPanelOverlay');
    if (overlay) {
        overlay.classList.remove('active');
        document.body.style.overflow = '';
    }
    selectedUserEmail = null;
}

function createUsersPanel() {
    var overlay = document.createElement('div');
    overlay.className = 'users-panel-overlay';
    overlay.id = 'usersPanelOverlay';
    overlay.innerHTML = `
        <div class="users-panel">
            <div class="panel-header"><h2>👥 Users List</h2><button class="panel-close" onclick="closeUsersPanel()">✕</button></div>
            <div class="panel-search">
                <select id="panelSearchType" onchange="renderUsersList()">
                    <option value="username">Search by Username</option>
                    <option value="email">Search by Gmail</option>
                </select>
                <input type="text" id="panelSearchQuery" placeholder="Search users..." oninput="renderUsersList()">
            </div>
            <div class="panel-list" id="panelUserList"></div>
            <div class="panel-status" id="panelStatus"></div>
            <div class="panel-actions">
                <button class="btn btn-danger" id="panelDeleteBtn" onclick="panelDeleteUser()" disabled>🗑️ Remove User</button>
                <button class="btn btn-primary" id="panelPlanBtn" onclick="panelChangePlan()" disabled>📊 Change Plan</button>
                <button class="btn btn-close-dropdown" onclick="closeUsersPanel()">Close</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function(e) { if (e.target === this) closeUsersPanel(); });
}

function renderUsersList() {
    var container = document.getElementById('panelUserList');
    var statusEl = document.getElementById('panelStatus');
    if (!container) return;
    var searchType = document.getElementById('panelSearchType') ? document.getElementById('panelSearchType').value : 'username';
    var searchQuery = document.getElementById('panelSearchQuery') ? document.getElementById('panelSearchQuery').value.toLowerCase() : '';
    var html = '';
    var count = 0;
    var filteredUsers = {};
    for (var key in users) {
        var user = users[key];
        var match = false;
        if (searchQuery === '') { match = true; } else if (searchType === 'username' && user.username.toLowerCase().includes(searchQuery)) { match = true; } else if (searchType === 'email' && user.email.toLowerCase().includes(searchQuery)) { match = true; }
        if (match) { filteredUsers[key] = user; }
    }
    for (var key in filteredUsers) {
        count++;
        var user = filteredUsers[key];
        var isAdmin = user.isAdmin ? 'tag-admin' : 'tag-user';
        var isScripter = user.isScripter ? 'tag-creator' : '';
        var roleText = user.isScripter ? '⭐ Creator' : (user.isAdmin ? '👑 Admin' : '👤 User');
        var isSelected = (selectedUserEmail === key) ? 'selected' : '';
        var avatarLetter = user.username.charAt(0).toUpperCase();
        var safeKey = key.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        html += `
            <div class="user-list-item ${isSelected}" onclick="selectUser('${safeKey}')">
                <div class="user-info">
                    <div class="user-avatar">${user.profileImage ? '<img src="' + user.profileImage + '" style="width:100%;height:100%;object-fit:cover;">' : avatarLetter}</div>
                    <div class="user-details"><div class="name">${user.username}</div><div class="email">${user.email}</div></div>
                </div>
                <div class="user-tags">
                    <span class="tag tag-plan">${user.plan}</span>
                    <span class="tag ${isAdmin} ${isScripter}">${roleText}</span>
                </div>
            </div>
        `;
    }
    if (count === 0) { html = '<div style="text-align: center; color: #8888aa; padding: 40px 0;">No users found.</div>'; }
    container.innerHTML = html;
    if (statusEl) { statusEl.textContent = count + ' users found'; }
    updatePanelButtons();
}

function selectUser(email) {
    selectedUserEmail = email;
    renderUsersList();
    updatePanelButtons();
}

function updatePanelButtons() {
    var deleteBtn = document.getElementById('panelDeleteBtn');
    var planBtn = document.getElementById('panelPlanBtn');
    var isSelected = selectedUserEmail !== null;
    var user = isSelected ? users[selectedUserEmail] : null;
    var canDelete = isSelected && user && !user.isScripter;
    if (deleteBtn) { deleteBtn.disabled = !canDelete; deleteBtn.style.opacity = canDelete ? '1' : '0.3'; }
    if (planBtn) { planBtn.disabled = !isSelected; planBtn.style.opacity = isSelected ? '1' : '0.3'; }
}

function panelDeleteUser() {
    if (!selectedUserEmail) { showNotification('Error', 'Please select a user first.', 'error'); return; }
    var user = users[selectedUserEmail];
    if (!user) { showNotification('Error', 'User not found.', 'error'); return; }
    if (user.isScripter) { showNotification('Error', 'Cannot delete the creator account.', 'error'); return; }
    if (confirm('Are you sure you want to delete ' + user.username + '? This cannot be undone!')) {
        delete users[selectedUserEmail];
        saveUsers();
        showNotification('Deleted', user.username + ' has been deleted.', 'success');
        selectedUserEmail = null;
        renderUsersList();
        updatePanelButtons();
        renderAdminUserListFull();
    }
}

function panelChangePlan() {
    if (!selectedUserEmail) { showNotification('Error', 'Please select a user first.', 'error'); return; }
    var user = users[selectedUserEmail];
    if (!user) { showNotification('Error', 'User not found.', 'error'); return; }
    changeUserPlan(selectedUserEmail);
}

// ============ ADMIN FUNCTIONS ============
function openAdminPanel() {
    if (!currentUser || currentUser.username !== 'Scripter') {
        showNotification('Access Denied', 'Only Scripter can access the admin panel.', 'error');
        return;
    }
    openModal('admin');
    renderAdminUserListFull();
}

function renderAdminUserListFull() {
    var container = document.getElementById('userList');
    if (!container) return;
    var html = '';
    var count = 0;
    for (var key in users) {
        count++;
        var user = users[key];
        var createdDate = new Date(user.createdAt).toLocaleDateString();
        var isAdmin = user.isAdmin ? '👑 Admin' : '👤 User';
        var isScripter = user.isScripter ? '⭐ Creator' : '';
        html += `
            <div class="user-item" style="background: rgba(20,20,35,0.6); border-radius: 10px; padding: 12px 16px; margin-bottom: 8px; border: 1px solid rgba(255,255,255,0.05);">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, #6c3bff, #00bfff); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 16px; color: #fff; overflow: hidden;">
                            ${user.profileImage ? '<img src="' + user.profileImage + '" style="width:100%;height:100%;object-fit:cover;">' : user.username.charAt(0).toUpperCase()}
                        </div>
                        <div><strong style="color: #ffffff;">${user.username}</strong><span style="color: #8888aa; font-size: 13px; margin-left: 8px;">${user.email}</span></div>
                    </div>
                    <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                        ${isScripter ? '<span style="background: rgba(255,215,0,0.2); color: #ffd700; padding: 2px 12px; border-radius: 12px; font-size: 11px;">⭐ Creator</span>' : ''}
                        <span style="background: rgba(108,59,255,0.2); color: #8a6bff; padding: 2px 12px; border-radius: 12px; font-size: 11px;">${user.plan}</span>
                        <span style="background: rgba(255,255,255,0.05); color: #8888aa; padding: 2px 12px; border-radius: 12px; font-size: 11px;">${isAdmin}</span>
                        <span style="color: #555577; font-size: 11px;">Joined: ${createdDate}</span>
                        ${!user.isAdmin && !user.isScripter ? '<button onclick="deleteUser(\'' + key + '\')" style="background: rgba(255,50,50,0.2); color: #ff6b6b; border: none; padding: 4px 12px; border-radius: 6px; cursor: pointer; font-size: 11px;">🗑️</button>' : ''}
                        <button onclick="changeUserPlan(\'' + key + '\')" style="background: rgba(108,59,255,0.2); color: #8a6bff; border: none; padding: 4px 12px; border-radius: 6px; cursor: pointer; font-size: 11px;">📊</button>
                    </div>
                </div>
            </div>
        `;
    }
    if (count === 0) { html = '<p style="color: #8888aa; text-align: center; padding: 40px 0;">No users registered yet.</p>'; } else { html = '<div style="margin-bottom: 12px; color: #8888aa; font-size: 13px;">Total Users: ' + count + '</div>' + html; }
    container.innerHTML = html;
}

function deleteUser(email) {
    if (!currentUser || currentUser.username !== 'Scripter') { showNotification('Access Denied', 'Only Scripter can delete users.', 'error'); return; }
    if (email === 'dubovikstanislav51@gmail.com') { showNotification('Error', 'Cannot delete the creator account.', 'error'); return; }
    if (confirm('Are you sure you want to delete ' + email + '? This cannot be undone!')) {
        delete users[email];
        saveUsers();
        showNotification('Deleted', 'User deleted successfully!', 'success');
        renderUserList();
        renderAdminUserListFull();
    }
}

function deleteAllUsers() {
    if (!currentUser || currentUser.username !== 'Scripter') { showNotification('Access Denied', 'Only Scripter can delete all users.', 'error'); return; }
    if (confirm('⚠️ Are you sure you want to delete ALL users? This cannot be undone!\n\n(Scripter account will be kept)')) {
        var scripterAccount = users['dubovikstanislav51@gmail.com'];
        var adminAccount = users['admin@example.com'];
        users = {};
        if (scripterAccount) { users['dubovikstanislav51@gmail.com'] = scripterAccount; }
        if (adminAccount) { users['admin@example.com'] = adminAccount; }
        saveUsers();
        showNotification('Cleared', 'All users have been deleted.', 'warning');
        renderUserList();
        renderAdminUserListFull();
    }
}

function filterUsers() { renderUserList(); }

// ============ CHANGE USER PLAN ============
function changeUserPlan(email) {
    if (!currentUser || currentUser.username !== 'Scripter') { showNotification('Access Denied', 'Only Scripter can change user plans.', 'error'); return; }
    var user = users[email];
    if (!user) { showNotification('Error', 'User not found.', 'error'); return; }
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    overlay.style.zIndex = '2000';
    var planOptions = '';
    for (var plan in PLAN_CONFIGS) {
        var config = PLAN_CONFIGS[plan];
        var isCurrent = user.plan === plan ? '✅ ' : '';
        var priceDisplay = config.price === 'Custom' ? 'Custom' : '$' + config.price + '/month';
        planOptions += '<option value="' + plan + '" ' + (user.plan === plan ? 'selected' : '') + '>' + isCurrent + plan + ' - ' + priceDisplay + '</option>';
    }
    overlay.innerHTML = `
        <div class="modal" style="max-width: 480px; padding: 32px;">
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
            <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 16px;">
                <div style="width: 50px; height: 50px; border-radius: 50%; background: linear-gradient(135deg, #6c3bff, #00bfff); display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: bold; color: #fff; overflow: hidden; flex-shrink: 0;">
                    ${user.profileImage ? '<img src="' + user.profileImage + '" style="width:100%;height:100%;object-fit:cover;">' : user.username.charAt(0).toUpperCase()}
                </div>
                <div><h2 style="font-size: 22px; margin: 0; color: #ffffff;">Change Plan</h2><p style="color: #8888aa; margin: 2px 0 0; font-size: 14px;">${user.username} · Current: <strong style="color: #8a6bff;">${user.plan}</strong></p></div>
            </div>
            <div class="form-group"><label style="font-size: 14px;">Select New Plan</label><select id="newPlanSelect" style="width:100%; padding: 12px 16px; background: #0a0a15; border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; color: #fff; font-size: 14px; cursor: pointer;">${planOptions}</select></div>
            <div id="planPreviewCard" style="margin-top: 16px; padding: 16px 20px; background: rgba(20,20,35,0.6); border-radius: 12px; border: 1px solid rgba(255,255,255,0.06);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <span style="font-weight: 600; font-size: 16px; color: #ffffff;" id="previewPlanName">Basic</span>
                    <span style="background: rgba(108,59,255,0.2); color: #8a6bff; padding: 2px 14px; border-radius: 12px; font-size: 13px;" id="previewPlanPrice">$0/month</span>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; font-size: 13px; color: #8888aa;">
                    <span>📁 Projects: <strong style="color: #ffffff;" id="previewProjects">0</strong></span>
                    <span>🔑 Keys: <strong style="color: #ffffff;" id="previewKeys">0</strong></span>
                    <span>📜 Scripts: <strong style="color: #ffffff;" id="previewScripts">0</strong></span>
                    <span>💾 Storage: <strong style="color: #ffffff;" id="previewStorage">0</strong> MB</span>
                </div>
            </div>
            <div style="display: flex; gap: 12px; margin-top: 20px;">
                <button onclick="confirmChangePlan('${email}')" class="btn btn-primary" style="flex:1; padding: 12px; font-size: 15px;">✅ Confirm Change</button>
                <button onclick="this.closest('.modal-overlay').remove()" class="btn btn-close-dropdown" style="flex:1; padding: 12px; font-size: 15px;">Cancel</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    var select = overlay.querySelector('#newPlanSelect');
    select.addEventListener('change', function() { updatePlanPreviewGUI(this.value); });
    updatePlanPreviewGUI(select.value);
}

function updatePlanPreviewGUI(planName) {
    var config = PLAN_CONFIGS[planName];
    if (!config) return;
    document.getElementById('previewPlanName').textContent = planName;
    document.getElementById('previewPlanPrice').textContent = config.price === 'Custom' ? 'Custom' : '$' + config.price + '/month';
    document.getElementById('previewProjects').textContent = config.projects === Infinity ? '∞' : config.projects;
    document.getElementById('previewKeys').textContent = config.keys === Infinity ? '∞' : config.keys;
    document.getElementById('previewScripts').textContent = config.scripts === Infinity ? '∞' : config.scripts;
    document.getElementById('previewStorage').textContent = config.fileSize === Infinity ? '∞' : config.fileSize;
}

function confirmChangePlan(email) {
    var select = document.getElementById('newPlanSelect');
    var newPlan = select.value;
    if (!newPlan) { showNotification('Error', 'Please select a plan.', 'error'); return; }
    var user = users[email];
    if (!user) { showNotification('Error', 'User not found.', 'error'); return; }
    var config = PLAN_CONFIGS[newPlan];
    if (!config) { showNotification('Error', 'Invalid plan selected.', 'error'); return; }
    if (user.plan === newPlan) { showNotification('Info', 'User already has this plan.', 'info'); return; }
    if (!confirm('Are you sure you want to change ' + user.username + '\'s plan from ' + user.plan + ' to ' + newPlan + '?')) return;
    user.plan = newPlan;
    user.stats.projects.max = config.projects;
    user.stats.keys.max = config.keys;
    user.stats.scripts.max = config.scripts;
    user.stats.fileSize.max = config.fileSize;
    saveUsers();
    var modal = document.querySelector('.modal-overlay[style*="z-index: 2000"]');
    if (modal) modal.remove();
    showNotification('Plan Updated', user.username + '\'s plan changed to ' + newPlan + '!', 'success');
    renderUserList();
    renderAdminUserListFull();
    if (currentUser && currentUser.id === user.id) {
        var userData = { ...user };
        delete userData.password;
        updateUIForUser(userData);
    }
}

// ============ CHANGE OWN PLAN ============
function changeOwnPlan() {
    if (!currentUser) { showNotification('Error', 'Please login first.', 'error'); return; }
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    overlay.style.zIndex = '2000';
    var planOptions = '';
    for (var plan in PLAN_CONFIGS) {
        var config = PLAN_CONFIGS[plan];
        var isCurrent = currentUser.plan === plan ? '✅ ' : '';
        var priceDisplay = config.price === 'Custom' ? 'Custom' : '$' + config.price + '/month';
        planOptions += '<option value="' + plan + '" ' + (currentUser.plan === plan ? 'selected' : '') + '>' + isCurrent + plan + ' - ' + priceDisplay + '</option>';
    }
    overlay.innerHTML = `
        <div class="modal" style="max-width: 480px; padding: 32px;">
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
            <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 16px;">
                <div style="width: 50px; height: 50px; border-radius: 50%; background: linear-gradient(135deg, #6c3bff, #00bfff); display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: bold; color: #fff; overflow: hidden; flex-shrink: 0;">
                    ${currentUser.profileImage ? '<img src="' + currentUser.profileImage + '" style="width:100%;height:100%;object-fit:cover;">' : currentUser.username.charAt(0).toUpperCase()}
                </div>
                <div><h2 style="font-size: 22px; margin: 0; color: #ffffff;">Change Your Plan</h2><p style="color: #8888aa; margin: 2px 0 0; font-size: 14px;">Current: <strong style="color: #8a6bff;">${currentUser.plan}</strong></p></div>
            </div>
            <div class="form-group"><label style="font-size: 14px;">Select New Plan</label><select id="ownPlanSelect" style="width:100%; padding: 12px 16px; background: #0a0a15; border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; color: #fff; font-size: 14px; cursor: pointer;">${planOptions}</select></div>
            <div id="ownPlanPreviewCard" style="margin-top: 16px; padding: 16px 20px; background: rgba(20,20,35,0.6); border-radius: 12px; border: 1px solid rgba(255,255,255,0.06);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <span style="font-weight: 600; font-size: 16px; color: #ffffff;" id="ownPreviewPlanName">Basic</span>
                    <span style="background: rgba(108,59,255,0.2); color: #8a6bff; padding: 2px 14px; border-radius: 12px; font-size: 13px;" id="ownPreviewPlanPrice">$0/month</span>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; font-size: 13px; color: #8888aa;">
                    <span>📁 Projects: <strong style="color: #ffffff;" id="ownPreviewProjects">0</strong></span>
                    <span>🔑 Keys: <strong style="color: #ffffff;" id="ownPreviewKeys">0</strong></span>
                    <span>📜 Scripts: <strong style="color: #ffffff;" id="ownPreviewScripts">0</strong></span>
                    <span>💾 Storage: <strong style="color: #ffffff;" id="ownPreviewStorage">0</strong> MB</span>
                </div>
            </div>
            <div style="display: flex; gap: 12px; margin-top: 20px;">
                <button onclick="confirmOwnPlanChange()" class="btn btn-primary" style="flex:1; padding: 12px; font-size: 15px;">✅ Confirm Change</button>
                <button onclick="this.closest('.modal-overlay').remove()" class="btn btn-close-dropdown" style="flex:1; padding: 12px; font-size: 15px;">Cancel</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    var select = overlay.querySelector('#ownPlanSelect');
    select.addEventListener('change', function() { updateOwnPlanPreviewGUI(this.value); });
    updateOwnPlanPreviewGUI(select.value);
}

function updateOwnPlanPreviewGUI(planName) {
    var config = PLAN_CONFIGS[planName];
    if (!config) return;
    document.getElementById('ownPreviewPlanName').textContent = planName;
    document.getElementById('ownPreviewPlanPrice').textContent = config.price === 'Custom' ? 'Custom' : '$' + config.price + '/month';
    document.getElementById('ownPreviewProjects').textContent = config.projects === Infinity ? '∞' : config.projects;
    document.getElementById('ownPreviewKeys').textContent = config.keys === Infinity ? '∞' : config.keys;
    document.getElementById('ownPreviewScripts').textContent = config.scripts === Infinity ? '∞' : config.scripts;
    document.getElementById('ownPreviewStorage').textContent = config.fileSize === Infinity ? '∞' : config.fileSize;
}

function confirmOwnPlanChange() {
    var select = document.getElementById('ownPlanSelect');
    var newPlan = select.value;
    if (!newPlan) { showNotification('Error', 'Please select a plan.', 'error'); return; }
    var config = PLAN_CONFIGS[newPlan];
    if (!config) { showNotification('Error', 'Invalid plan selected.', 'error'); return; }
    if (currentUser.plan === newPlan) { showNotification('Info', 'You already have this plan.', 'info'); return; }
    if (!confirm('Are you sure you want to change your plan from ' + currentUser.plan + ' to ' + newPlan + '?')) return;
    for (var key in users) {
        if (users[key].id === currentUser.id) {
            users[key].plan = newPlan;
            users[key].stats.projects.max = config.projects;
            users[key].stats.keys.max = config.keys;
            users[key].stats.scripts.max = config.scripts;
            users[key].stats.fileSize.max = config.fileSize;
            break;
        }
    }
    saveUsers();
    var modal = document.querySelector('.modal-overlay[style*="z-index: 2000"]');
    if (modal) modal.remove();
    showNotification('Plan Updated', 'Your plan changed to ' + newPlan + '!', 'success');
    var userData = { ...currentUser };
    userData.plan = newPlan;
    userData.stats.projects.max = config.projects;
    userData.stats.keys.max = config.keys;
    userData.stats.scripts.max = config.scripts;
    userData.stats.fileSize.max = config.fileSize;
    delete userData.password;
    updateUIForUser(userData);
}

// ============ IMAGE UPLOAD FUNCTIONS ============
function uploadProfileImage() {
    var input = document.getElementById('profileImageInput');
    if (!input || !input.files || input.files.length === 0) { showNotification('Error', 'Please select an image file first.', 'error'); return; }
    var file = input.files[0];
    if (file.size > 2 * 1024 * 1024) { showNotification('Error', 'Profile image size must be less than 2MB.', 'error'); return; }
    var validTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'];
    if (!validTypes.includes(file.type)) { showNotification('Error', 'Please upload a valid image file (PNG, JPG, WEBP, GIF, SVG).', 'error'); return; }
    var reader = new FileReader();
    reader.onload = function(e) {
        try {
            var imageData = e.target.result;
            for (var key in users) {
                if (users[key].id === currentUser.id) {
                    users[key].profileImage = imageData;
                    saveUsers();
                    var userData = { ...users[key] };
                    delete userData.password;
                    updateUIForUser(userData);
                    showNotification('Success', 'Profile image updated successfully!', 'success');
                    input.value = '';
                    break;
                }
            }
        } catch (error) { showNotification('Error', 'Failed to save image: ' + error.message, 'error'); }
    };
    reader.onerror = function() { showNotification('Error', 'Failed to read image file.', 'error'); };
    reader.readAsDataURL(file);
}

function uploadBannerImage() {
    var input = document.getElementById('bannerImageInput');
    if (!input || !input.files || input.files.length === 0) { showNotification('Error', 'Please select an image file first.', 'error'); return; }
    var file = input.files[0];
    if (file.size > 5 * 1024 * 1024) { showNotification('Error', 'Banner image size must be less than 5MB.', 'error'); return; }
    var validTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'];
    if (!validTypes.includes(file.type)) { showNotification('Error', 'Please upload a valid image file (PNG, JPG, WEBP, GIF, SVG).', 'error'); return; }
    var reader = new FileReader();
    reader.onload = function(e) {
        try {
            var imageData = e.target.result;
            for (var key in users) {
                if (users[key].id === currentUser.id) {
                    users[key].bannerImage = imageData;
                    saveUsers();
                    var userData = { ...users[key] };
                    delete userData.password;
                    updateUIForUser(userData);
                    showNotification('Success', 'Banner image updated successfully!', 'success');
                    input.value = '';
                    break;
                }
            }
        } catch (error) { showNotification('Error', 'Failed to save banner: ' + error.message, 'error'); }
    };
    reader.onerror = function() { showNotification('Error', 'Failed to read image file.', 'error'); };
    reader.readAsDataURL(file);
}

function changeTheme(themeName) {
    if (!currentUser) return;
    for (var key in users) {
        if (users[key].id === currentUser.id) {
            users[key].theme = themeName;
            saveUsers();
            applyTheme(themeName);
            showNotification('Theme Changed', 'Theme updated to ' + themeName.charAt(0).toUpperCase() + themeName.slice(1), 'success', 1500);
            break;
        }
    }
}

function exportUsers() {
    if (!currentUser || currentUser.username !== 'Scripter') { showNotification('Access Denied', 'Only Scripter can export users.', 'error'); return; }
    var exportData = {};
    for (var key in users) {
        var user = { ...users[key] };
        delete user.password;
        exportData[key] = user;
    }
    var json = JSON.stringify(exportData, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'users_export_' + new Date().toISOString().slice(0,10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
    showNotification('Exported', 'User data exported successfully!', 'success');
}

// ============ PROJECTS SYSTEM ==========
function loadProjects() {
    try {
        var data = localStorage.getItem('projects_' + (currentUser ? currentUser.id : ''));
        return data ? JSON.parse(data) : [];
    } catch (e) { return []; }
}

function saveProjects(projects) {
    try {
        localStorage.setItem('projects_' + (currentUser ? currentUser.id : ''), JSON.stringify(projects));
    } catch (e) { console.error('Error saving projects:', e); }
}

// ============ SHOW TABS ============
function showTabs() {
    var tabsNav = document.getElementById('tabsNav');
    if (tabsNav) { tabsNav.style.display = 'flex'; }
    var dashboardContent = document.getElementById('dashboard');
    var tabDashboard = document.getElementById('tab-dashboard');
    if (dashboardContent && tabDashboard) {
        if (!tabDashboard.hasChildNodes() || tabDashboard.children.length === 0) {
            var clone = dashboardContent.cloneNode(true);
            clone.style.display = 'block';
            tabDashboard.appendChild(clone);
        }
        dashboardContent.style.display = 'none';
    }
    if (currentUser) { updateDashboardTab(currentUser); }
    switchTab('dashboard');
}

function switchTab(tabName) {
    var btns = document.querySelectorAll('.tab-btn');
    for (var i = 0; i < btns.length; i++) {
        btns[i].classList.remove('active');
        if (btns[i].dataset.tab === tabName) { btns[i].classList.add('active'); }
    }
    var contents = document.querySelectorAll('.tab-content');
    for (var i = 0; i < contents.length; i++) { contents[i].style.display = 'none'; }
    var target = document.getElementById('tab-' + tabName);
    if (target) { target.style.display = 'block'; }
    if (tabName === 'dashboard') { if (currentUser) { refreshStatsUI(); initLiveChart(); } }
    if (tabName === 'scripts') { renderProjects(); }
    if (tabName === 'keys') { renderKeys(); }
    if (tabName === 'rewards') { renderRewardsTab(); }
}

// ============ CREATE PROJECT ==========
function openCreateProject() {
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    overlay.style.zIndex = '2000';
    overlay.innerHTML = `
        <div class="modal" style="max-width: 540px; padding: 32px; max-height:90vh; overflow-y:auto;">
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
            <h2 style="font-size: 22px;">📁 Create Project</h2>
            <p class="sub">Fill in the details to create a new project</p>
            <div class="form-group"><label>Project Name <span class="required">*</span></label><input type="text" id="projectName" placeholder="Enter project name" required></div>
            <div class="form-group"><label>Project Description <span style="color:#555577;">(optional)</span></label><textarea id="projectDescription" placeholder="Describe your project..."></textarea></div>
            <div class="form-group"><label>Logs Webhook <span style="color:#555577;">(optional)</span></label><input type="text" id="projectLogsWebhook" placeholder="https://discord.com/api/webhooks/..."><div class="field-hint">Successful executions will be sent to this webhook</div></div>
            <div class="form-group"><label>Alert Webhook <span style="color:#555577;">(optional)</span></label><input type="text" id="projectAlertWebhook" placeholder="https://discord.com/api/webhooks/..."><div class="field-hint">Crack attempts and bans will be reported to this webhook</div></div>
            <div class="form-group"><label>HWID Cooldown Reset <span style="color:#555577;">(optional)</span></label><input type="number" id="projectHwidCooldown" min="0" placeholder="Days"><div class="field-hint">Number of days user will need to wait before resetting HWID</div></div>
            <div class="form-group"><label>Visibility</label><select id="projectVisibility"><option value="anyone">Anyone</option><option value="friends">Friends (Soon...)</option><option value="private">Private</option></select></div>
            <div class="form-group" style="display:flex; gap:20px; align-items:center; flex-wrap:wrap;">
                <label style="margin:0; cursor:pointer;"><input type="checkbox" id="projectBlockIncognito"> Block Incognito Mode</label>
                <label style="margin:0; cursor:pointer;"><input type="checkbox" id="projectBlockVPN"> Block VPN</label>
            </div>
            <div class="form-group"><label>Type Of Project</label><select id="projectType"><option value="free">Free</option><option value="key">Key Required</option><option value="paid">Paid</option></select></div>
            <div class="form-group" style="display:flex; gap:16px; align-items:center; flex-wrap:wrap;">
                <label style="margin:0; cursor:pointer;"><input type="checkbox" id="projectAllowHwidReset"> Allow HWID Reset</label>
                <label style="margin:0; cursor:pointer;"><input type="checkbox" id="projectAutoDeleteExpired"> Auto Delete Expired Users</label>
                <label style="margin:0; cursor:pointer;"><input type="checkbox" id="projectAllowClonedSharing"> Allow HWID Cloned Key Sharing</label>
            </div>
            <div class="field-hint" style="margin-bottom:8px;">Cloned Key Sharing = one key on different computers with same HWID (useful for server hopping scripts with multi instance on VPSes). Auto Delete runs every 15 minutes.</div>
            <button onclick="confirmCreateProject()" class="btn btn-primary" style="width:100%; margin-top:8px; padding:12px;">✅ Create Project</button>
        </div>
    `;
    document.body.appendChild(overlay);
}

function confirmCreateProject() {
    var name = document.getElementById('projectName').value.trim();
    var description = document.getElementById('projectDescription').value.trim();
    var logsWebhook = document.getElementById('projectLogsWebhook').value.trim();
    var alertWebhook = document.getElementById('projectAlertWebhook').value.trim();
    var hwidCooldown = document.getElementById('projectHwidCooldown').value;
    var visibility = document.getElementById('projectVisibility').value;
    var blockIncognito = document.getElementById('projectBlockIncognito').checked;
    var blockVPN = document.getElementById('projectBlockVPN').checked;
    var type = document.getElementById('projectType').value;
    var allowHwidReset = document.getElementById('projectAllowHwidReset').checked;
    var autoDeleteExpired = document.getElementById('projectAutoDeleteExpired').checked;
    var allowClonedSharing = document.getElementById('projectAllowClonedSharing').checked;
    if (!name) { showNotification('Error', 'Project name is required.', 'error'); return; }
    var projects = loadProjects();
    for (var i = 0; i < projects.length; i++) {
        if (projects[i].name.toLowerCase() === name.toLowerCase()) {
            showNotification('Error', 'A project with this name already exists. Choose a different name.', 'error');
            return;
        }
    }
    var project = { id: 'proj_' + Date.now(), name: name, description: description, logsWebhook: logsWebhook, alertWebhook: alertWebhook, hwidCooldownDays: hwidCooldown ? parseInt(hwidCooldown, 10) : null, visibility: visibility, blockIncognito: blockIncognito, blockVPN: blockVPN, type: type, allowHwidReset: allowHwidReset, autoDeleteExpired: autoDeleteExpired, allowClonedSharing: allowClonedSharing, createdAt: new Date().toISOString(), scripts: [] };
    projects.push(project);
    saveProjects(projects);
    refreshStatsUI();
    var modal = document.querySelector('.modal-overlay[style*="z-index: 2000"]');
    if (modal) modal.remove();
    showNotification('Success', 'Project "' + name + '" created!', 'success');
    renderProjects();
}

function renderProjects() {
    var container = document.getElementById('projectsList');
    if (!container) return;
    var projects = loadProjects();
    if (projects.length === 0) {
        container.innerHTML = '<p style="color:#8888aa; grid-column:1/-1; text-align:center; padding:40px 0;">No projects yet. Create your first project!</p>';
        return;
    }
    var html = '';
    for (var i = 0; i < projects.length; i++) {
        var project = projects[i];
        var scriptCount = project.scripts ? project.scripts.length : 0;
        var visibilityLabel = project.visibility === 'anyone' ? '🌐 Anyone' : (project.visibility === 'friends' ? '👥 Friends' : '🔒 Private');
        html += `
            <div class="project-card">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; flex-wrap:wrap;">
                    <div style="flex:1; min-width:0;">
                        <div class="project-name">${project.name}</div>
                        <div class="project-desc">${project.description || 'No description'}</div>
                        <div class="project-tags">
                            <span class="tag tag-visibility">${visibilityLabel}</span>
                            <span class="tag tag-type">${project.type.toUpperCase()}</span>
                            <span class="tag tag-scripts">📜 ${scriptCount} scripts</span>
                        </div>
                    </div>
                    <div class="project-actions">
                        <button onclick="viewProject('${project.id}')" class="btn-sm btn-sm-primary">📜 View Scripts</button>
                        <button onclick="openCreateScript('${project.id}')" class="btn-sm btn-sm-primary">➕ New Script</button>
                        <button onclick="editProject('${project.id}')" class="btn-sm btn-sm-edit">✏️ Edit</button>
                        <button onclick="deleteProject('${project.id}')" class="btn-sm btn-sm-danger">🗑️ Delete</button>
                    </div>
                </div>
            </div>
        `;
    }
    container.innerHTML = html;
}

// ============ VIEW PROJECT ==========
function viewProject(projectId) {
    var projects = loadProjects();
    var project = null;
    for (var i = 0; i < projects.length; i++) { if (projects[i].id === projectId) { project = projects[i]; break; } }
    if (!project) { showNotification('Error', 'Project not found.', 'error'); return; }
    currentProject = project;
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    overlay.style.zIndex = '2000';
    var scriptsHtml = '';
    if (project.scripts && project.scripts.length > 0) {
        for (var i = 0; i < project.scripts.length; i++) {
            var script = project.scripts[i];
            var obfType = script.obfuscationType || 'custom';
            var obfDisplay = obfType === 'aegis' ? 'Aegis Obfuscator' : (OBFUSCATION_TYPES[obfType] || 'Default Obfuscator');
            var obfBadgeClass = 'obf-badge' + (obfType === 'aegis' ? ' obf-badge-aegis' : ' obf-badge-custom');
            var status = script.freeForEveryone ? '🌐 Free' : (script.requireKey ? '🔑 Key Required' : (project.type === 'paid' ? '💰 Paid' : '🌐 Free'));
            var statusColor = script.requireKey ? '#ffd700' : '#66ff66';
            scriptsHtml += `
                <div class="script-item">
                    <div class="script-info">
                        <div class="name">${script.name} <span style="font-size:11px; color:#555577;">${versionLabel(script)}</span></div>
                        <div class="desc">${script.description || 'No description'}</div>
                        <div style="margin-top:4px; display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
                            <span class="${obfBadgeClass}">🔐 ${obfDisplay}</span>
                            <span style="font-size:11px; color:${statusColor}; background:rgba(255,255,255,0.05); padding:2px 10px; border-radius:10px;">${status}</span>
                            <span style="font-size:11px; color:#8888aa;">🕒 ${timeAgo(script.updatedAt || script.createdAt)}</span>
                        </div>
                    </div>
                    <div class="script-actions">
                        <button onclick="viewScript('${project.id}','${script.id}')" class="btn-sm btn-sm-primary">👁️ View</button>
                        <button onclick="editScript('${project.id}','${script.id}')" class="btn-sm btn-sm-edit">✏️ Edit</button>
                        <button onclick="openScriptSettings('${project.id}','${script.id}')" class="btn-sm btn-sm-edit">⚙️ Settings</button>
                        <button onclick="openScriptRaw('${script.loaderId}')" class="btn-sm btn-sm-edit">📄 Raw</button>
                        <button onclick="deleteScript('${project.id}','${script.id}')" class="btn-sm btn-sm-danger">🗑️ Delete</button>
                    </div>
                </div>
            `;
        }
    } else { scriptsHtml = '<p style="color:#8888aa; text-align:center; padding:20px 0;">No scripts in this project yet.</p>'; }
    overlay.innerHTML = `
        <div class="modal" style="max-width: 650px; padding: 32px;">
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                <div><h2 style="font-size:22px; margin:0; color:#fff;">📜 ${project.name}</h2><p style="color:#8888aa; margin:4px 0 0; font-size:13px;">${project.description || 'No description'}</p></div>
                <button onclick="openCreateScript('${project.id}')" class="btn btn-primary" style="padding:8px 16px;">➕ Create Script</button>
            </div>
            <div style="max-height:400px; overflow-y:auto;">${scriptsHtml}</div>
        </div>
    `;
    document.body.appendChild(overlay);
}

// ============ OBFUSCATION ENGINE ============
const OBFUSCATION_TYPES = {
    'custom': 'Custom Obfuscator [Unreadable Source]',
    'allinone': 'All In One [Recommended]',
    'ironbrew': 'IronBrew',
    'moonveil': 'MoonVeiL',
    'prometheus': 'Prometheus',
    'luaobfuscator': 'LuaObfuscator',
    'moonsec': 'Moonsec',
    'luraph_normal': 'Luraph Normal [Best]',
    'luraph_v15': 'Luraph V15 [Best]'
};

function applyObfuscation(code, type, options) {
    switch(type) {
        case 'custom': return applyCustomObfuscator(code, options || {});
        case 'allinone': return applyAllInOne(code, options);
        case 'ironbrew': return applyIronBrew(code);
        case 'moonveil': return applyMoonVeiL(code);
        case 'prometheus': return applyPrometheus(code);
        case 'luaobfuscator': return applyLuaObfuscator(code);
        case 'moonsec': return applyMoonsec(code);
        case 'luraph_normal': return applyLuraph(code, 'normal');
        case 'luraph_v15': return applyLuraph(code, 'v15');
        default: return code;
    }
}

// All In One now uses the REAL custom engine at maximum power
function applyAllInOne(code, options) {
    var opts = options || {};
    opts.intensity = 10;
    opts.antiTamper = opts.antiTamper !== false;
    opts.antiSkid = opts.antiSkid !== false;
    return applyCustomObfuscator(code, opts);
}

function applyIronBrew(code) {
    var lines = code.split('\n');
    var stringMap = {};
    var stringCounter = 0;
    var varMap = {};
    var varCounter = 0;
    var result = [];
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var strMatches = line.match(/["']([^"']*)["']/g);
        if (strMatches) {
            for (var j = 0; j < strMatches.length; j++) {
                var str = strMatches[j];
                var content = str.substring(1, str.length - 1);
                if (content.length > 1 && !stringMap[content]) {
                    stringMap[content] = '_s' + stringCounter.toString(36) + '_' + Math.random().toString(36).substring(2, 5);
                    stringCounter++;
                }
            }
        }
        var varMatches = line.match(/local\s+(\w+)/g);
        if (varMatches) {
            for (var j = 0; j < varMatches.length; j++) {
                var varName = varMatches[j].replace('local ', '');
                if (!varMap[varName] && varName !== 'function' && varName !== 'if' && varName !== 'then') {
                    varMap[varName] = '_v' + varCounter.toString(36) + '_' + Math.random().toString(36).substring(2, 5);
                    varCounter++;
                }
            }
        }
    }
    result.push('local _strings = {');
    for (var str in stringMap) {
        var encrypted = '';
        for (var k = 0; k < str.length; k++) { encrypted += (str.charCodeAt(k) + 5) + ','; }
        encrypted = encrypted.slice(0, -1);
        result.push('  ["' + str + '"] = {' + encrypted + '},');
    }
    result.push('}');
    result.push('local function _d(t) local s="";for i=1,#t do s=s..string.char(t[i]-5) end;return s end');
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        for (var str in stringMap) {
            var regex = new RegExp('["\']' + str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '["\']', 'g');
            line = line.replace(regex, '_d(_strings["' + str + '"])');
        }
        for (var varName in varMap) {
            var regex = new RegExp('\\b' + varName + '\\b', 'g');
            line = line.replace(regex, varMap[varName]);
        }
        result.push(line);
    }
    return result.join('\n');
}

function applyMoonVeiL(code) {
    var lines = code.split('\n');
    var result = [];
    var junkCounter = 0;
    var junkFunctions = [
        'local function _j' + junkCounter + '() local a=0;for i=1,100 do a=a+i end;return a end',
        'local function _j' + (junkCounter+1) + '() local b=2;local c=3;return b*c end',
        'local function _j' + (junkCounter+2) + '() local d={};for i=1,50 do d[i]=i end;return #d end',
        'local function _j' + (junkCounter+3) + '() local e="";for i=1,20 do e=e..string.char(65+i) end;return e end',
        'local function _j' + (junkCounter+4) + '() local f=0;for i=1,200 do f=f+i/2 end;return math.floor(f) end'
    ];
    result.push(junkFunctions.join('\n'));
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (line.match(/^\s*if\s+.*\s+then/)) {
            var condition = line.replace(/^\s*if\s+/, '').replace(/\s+then$/, '');
            var junkCall = '_j' + (junkCounter % 5) + '()';
            result.push('local _c = ' + condition);
            result.push('if _c then');
            result.push('  ' + junkCall);
        } else if (line.match(/^\s*\w+\(/)) {
            result.push(line);
            result.push('  _j' + ((junkCounter + 1) % 5) + '()');
        } else if (line.match(/^\s*local\s+\w+\s*=/)) {
            result.push(line);
            result.push('  _j' + ((junkCounter + 2) % 5) + '()');
        } else { result.push(line); }
    }
    return result.join('\n');
}

function applyPrometheus(code) {
    var lines = code.split('\n');
    var varMap = {};
    var varCounter = 0;
    var result = [];
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var varMatches = line.match(/\b([a-zA-Z_][a-zA-Z0-9_]*)\s*=/g);
        if (varMatches) {
            for (var j = 0; j < varMatches.length; j++) {
                var varName = varMatches[j].replace(/\s*=$/, '').trim();
                if (!varMap[varName] && varName !== 'local' && varName !== 'function') {
                    varMap[varName] = '_p' + varCounter.toString(36) + '_' + Math.random().toString(36).substring(2, 4);
                    varCounter++;
                }
            }
        }
    }
    result.push('local function _m(a,b) return a+b end');
    result.push('local function _s(a,b) return a-b end');
    result.push('local function _mul(a,b) return a*b end');
    result.push('local function _d(a,b) return a/b end');
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        line = line.replace(/(\w+)\s*\+\s*(\w+)/g, '_m($1, $2)');
        line = line.replace(/(\w+)\s*\-\s*(\w+)/g, '_s($1, $2)');
        line = line.replace(/(\w+)\s*\*\s*(\w+)/g, '_mul($1, $2)');
        line = line.replace(/(\w+)\s*\/\s*(\w+)/g, '_d($1, $2)');
        for (var varName in varMap) {
            var regex = new RegExp('\\b' + varName + '\\b', 'g');
            line = line.replace(regex, varMap[varName]);
        }
        result.push(line);
    }
    return result.join('\n');
}

function applyLuaObfuscator(code) {
    var lines = code.split('\n');
    var result = [];
    var stringMap = {};
    var stringCounter = 0;
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var strMatches = line.match(/["']([^"']*)["']/g);
        if (strMatches) {
            for (var j = 0; j < strMatches.length; j++) {
                var str = strMatches[j];
                var content = str.substring(1, str.length - 1);
                if (content.length > 1 && !stringMap[content]) {
                    stringMap[content] = '_s' + stringCounter.toString(36);
                    stringCounter++;
                }
            }
        }
    }
    result.push('local _s = {');
    for (var str in stringMap) {
        var encoded = '';
        for (var k = 0; k < str.length; k++) { encoded += string.charCodeAt(str, k) + ','; }
        encoded = encoded.slice(0, -1);
        result.push('  ["' + str + '"] = {' + encoded + '},');
    }
    result.push('}');
    result.push('local function _d(t) local s="";for i=1,#t do s=s..string.char(t[i]) end;return s end');
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        line = line.replace(/--.*$/, '');
        for (var str in stringMap) {
            var regex = new RegExp('["\']' + str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '["\']', 'g');
            line = line.replace(regex, '_d(_s["' + str + '"])');
        }
        line = line.trim();
        if (line.length > 0) { result.push(line); }
    }
    return result.join('\n');
}

function applyMoonsec(code) {
    var lines = code.split('\n');
    var result = [];
    var varMap = {};
    var varCounter = 0;
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var varMatches = line.match(/\b([a-zA-Z_][a-zA-Z0-9_]*)\s*=/g);
        if (varMatches) {
            for (var j = 0; j < varMatches.length; j++) {
                var varName = varMatches[j].replace(/\s*=$/, '').trim();
                if (!varMap[varName] && varName !== 'local' && varName !== 'function') {
                    varMap[varName] = '_m' + varCounter.toString(36) + '_' + Math.random().toString(36).substring(2, 4);
                    varCounter++;
                }
            }
        }
    }
    result.push('local function _antiDebug()');
    result.push('  local t = debug and debug.getinfo or nil');
    result.push('  if t then');
    result.push('    error("Debugging detected")');
    result.push('  end');
    result.push('end');
    result.push('_antiDebug()');
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (line.match(/^\s*function\s+/)) {
            result.push('local _s = pcall(function() return debug and debug.getinfo end)');
            result.push('if _s then error("Security violation") end');
            result.push(line);
        } else {
            for (var varName in varMap) {
                var regex = new RegExp('\\b' + varName + '\\b', 'g');
                line = line.replace(regex, varMap[varName]);
            }
            if (line.match(/^\s*local\s+\w+\s*=/)) {
                result.push(line);
                result.push('  _antiDebug()');
            } else { result.push(line); }
        }
    }
    return result.join('\n');
}

function applyLuraph(code, version) {
    var lines = code.split('\n');
    var result = [];
    var stringMap = {};
    var stringCounter = 0;
    var varMap = {};
    var varCounter = 0;
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var strMatches = line.match(/["']([^"']*)["']/g);
        if (strMatches) {
            for (var j = 0; j < strMatches.length; j++) {
                var str = strMatches[j];
                var content = str.substring(1, str.length - 1);
                if (content.length > 2 && !stringMap[content]) {
                    stringMap[content] = '_s' + stringCounter.toString(36) + '_' + Math.random().toString(36).substring(2, 4);
                    stringCounter++;
                }
            }
        }
        var varMatches = line.match(/\b([a-zA-Z_][a-zA-Z0-9_]*)\s*=/g);
        if (varMatches) {
            for (var j = 0; j < varMatches.length; j++) {
                var varName = varMatches[j].replace(/\s*=$/, '').trim();
                if (!varMap[varName] && varName !== 'local' && varName !== 'function') {
                    varMap[varName] = '_l' + varCounter.toString(36) + '_' + Math.random().toString(36).substring(2, 4);
                    varCounter++;
                }
            }
        }
    }
    result.push('local _strings = {');
    for (var str in stringMap) {
        var encrypted = '';
        var key = Math.floor(Math.random() * 255) + 1;
        for (var k = 0; k < str.length; k++) { encrypted += (str.charCodeAt(k) ^ key) + ','; }
        encrypted = encrypted.slice(0, -1);
        result.push('  ["' + str + '"] = {key=' + key + ', data={' + encrypted + '}},');
    }
    result.push('}');
    result.push('local function _d(t) local s="";for i=1,#t.data do s=s..string.char(bit32.bxor(t.data[i], t.key)) end;return s end');
    if (version === 'v15') {
        result.push('-- Luraph V15: Advanced control flow');
        result.push('local function _v15() local a={} for i=1,1000 do a[i]=i end return #a end');
        result.push('local _v15_check = pcall(function() return debug and debug.getinfo end)');
        result.push('if _v15_check then error("Security violation") end');
    } else {
        result.push('-- Luraph Normal: Standard obfuscation');
        result.push('local function _ln() local a=0;for i=1,500 do a=a+i end;return a end');
    }
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        for (var str in stringMap) {
            var regex = new RegExp('["\']' + str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '["\']', 'g');
            line = line.replace(regex, '_d(_strings["' + str + '"])');
        }
        for (var varName in varMap) {
            var regex = new RegExp('\\b' + varName + '\\b', 'g');
            line = line.replace(regex, varMap[varName]);
        }
        result.push(line);
    }
    return result.join('\n');
}

// ============ CREATE SCRIPT ==========
function openCreateScript(projectId) {
    var projects = loadProjects();
    var project = null;
    for (var i = 0; i < projects.length; i++) { if (projects[i].id === projectId) { project = projects[i]; break; } }
    if (!project) { showNotification('Error', 'Project not found.', 'error'); return; }
    editingScript = null;
    currentProject = project;
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    overlay.style.zIndex = '2000';
    overlay.innerHTML = `
        <div class="modal" style="max-width: 600px; padding: 32px; max-height:90vh; overflow-y:auto;">
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
            <h2 style="font-size:22px;">➕ Create Script</h2>
            <p class="sub">Create a new script for "<strong style="color:#8a6bff;">${project.name}</strong>"</p>
            <div class="form-group"><label>Script Name <span class="required">*</span></label><input type="text" id="scriptName" placeholder="Enter script name" required></div>
            <div class="form-group"><label>Script Description <span style="color:#555577;">(optional)</span></label><textarea id="scriptDescription" placeholder="Describe your script..."></textarea></div>
            <div class="form-group" style="display:flex; gap:20px; align-items:center; flex-wrap:wrap;">
                <label style="margin:0; cursor:pointer;"><input type="checkbox" id="scriptAntiTamper" checked> 🛡️ Anti Tampering</label>
                <label style="margin:0; cursor:pointer;"><input type="checkbox" id="scriptAntiSkid" checked> 🔒 Anti Skidding</label>
                <label style="margin:0; cursor:pointer;"><input type="checkbox" id="scriptEnvLogging"> 📡 Environment Logging</label>
                <label style="margin:0; cursor:pointer;${project.type === 'key' ? '' : ' display:none;'}"><input type="checkbox" id="scriptRequireKey"> 🔑 Require Key</label>
            </div>
            <div class="form-group" id="scriptKeyGateInfo" style="display:none;">
                <div style="padding:10px 14px; background:rgba(108,59,255,0.1); border:1px solid rgba(108,59,255,0.25); border-radius:10px; font-size:12px; color:#8888aa;">
                    🔑 <strong style="color:#8a6bff;">Key System:</strong> All your <strong>active keys from the Keys tab</strong> get embedded (hashed, never readable) into the script. Users must enter a valid key (popup key card or <code style="color:#66ccff;">getgenv().ScripterHubKey = "KEY"</code>) before the script runs. Expired/used keys are rejected automatically.
                </div>
            </div>
            <div class="form-group" id="scriptWebhookGroup" style="display:none;">
                <label>📡 Logging Webhook URL <span style="color:#555577;">(Discord webhook or API endpoint)</span></label>
                <input type="text" id="scriptWebhookUrl" placeholder="https://discord.com/api/webhooks/...">
                <div style="margin-top:4px; font-size:11px; color:#8888aa;">Runs, usernames, executor, HWID, place ID etc. of everyone executing your script will be sent to this webhook and saved to their scripterhub/ log file.</div>
            </div>
            <div class="form-group">
                <label>Max Timer Of Keys</label>
                <div style="display:flex; gap:8px;">
                    <input type="number" id="scriptKeyTime" placeholder="Amount" style="flex:1; min-width:0;">
                    <select id="scriptKeyUnit" style="flex:1; min-width:0;">
                        <option value="seconds">Seconds</option><option value="minutes">Minutes</option><option value="hours">Hours</option>
                        <option value="days">Days</option><option value="weeks">Weeks</option><option value="months">Months</option>
                        <option value="years">Years</option><option value="unlimited">Unlimited</option>
                    </select>
                </div>
            </div>
            <div class="form-group"><label>Upload .txt/.lua File <span style="color:#555577;">(optional)</span></label><input type="file" id="scriptFile" accept=".txt,.lua"></div>
            <div class="form-group"><label>Paste .txt/.lua Code <span class="required">*</span></label><textarea id="scriptCode" placeholder="-- Paste your Lua code here..." style="min-height:150px; font-family:monospace; font-size:13px;"></textarea></div>
            <div class="form-group">
                <label>💎 Choose Obfuscator</label>
                <select id="scriptObfuscatorEngine" style="width:100%; padding:12px 16px; background:#0a0a15; border:1px solid rgba(255,255,255,0.08); border-radius:10px; color:#fff; font-size:14px; cursor:pointer;">
                    <option value="default" selected>Default Obfuscator (Recommended)</option>
                    <option value="aegis">Aegis Obfuscator</option>
                </select>
                <div style="margin-top:6px; font-size:12px; color:#8888aa;">💎 <strong style="color:#ff66cc;">Default</strong>: multi-layer encryption + Anti-Tampering / Anti-Skidding / Anti-Logger (detects loggers, spies & hooks → game:Shutdown()). ⚔️ <strong style="color:#00ccaa;">Aegis</strong>: external Aegis engine (custom ISA + polymorphic VM) - your source is sent to the Aegis API to be obfuscated.</div>
            </div>
            <div class="form-group" style="display:flex; gap:14px; align-items:center; flex-wrap:wrap;">
                <label style="margin:0; cursor:pointer;"><input type="checkbox" id="scriptFreeForEveryone" ${project.type === 'free' ? 'checked' : ''}> 🌐 Free For Everyone</label>
                <label style="margin:0; cursor:pointer;"><input type="checkbox" id="scriptSilentMode"> 🔇 Silent Mode</label>
                <label style="margin:0; cursor:pointer;"><input type="checkbox" id="scriptHeartbeat" checked> 💓 Heartbeat</label>
                <label style="margin:0; cursor:pointer;"><input type="checkbox" id="scriptLightningMode"> ⚡ Lightning Mode</label>
                <label style="margin:0; cursor:pointer;"><input type="checkbox" id="scriptSecurityUpdates" checked> 🔄 Enable Security Updates</label>
            </div>
            <div class="field-hint" style="margin-bottom:10px;">🌐 Free For Everyone = anyone can execute. 🔇 Silent = no console outputs (not recommended). 💓 Heartbeat = more secure (recommended). ⚡ Lightning = faster but removes some inline security checks. 🔄 Security Updates = stores your raw script encrypted for automated updates (recommended).</div>
            ${project.type === 'key' ? `
            <div class="form-group">
                <label>🔑 Choose How Key Works</label>
                <select id="scriptKeyMode" style="width:100%; padding:12px 16px; background:#0a0a15; border:1px solid rgba(255,255,255,0.08); border-radius:10px; color:#fff; font-size:14px; cursor:pointer;">
                    <option value="default" selected>Default (Roblox Core Notification)</option>
                    <option value="custom">Custom (You Make It)</option>
                </select>
                <div style="margin-top:6px; font-size:12px; color:#8888aa;" id="scriptKeyModeHint">🔑 <strong style="color:#8a6bff;">Default</strong>: ScripterHub shows Roblox notifications ("Key required!", "Invalid key!", "Key accepted!") and a popup key card. Your users set <code style="color:#66ccff;">getgenv().ScripterHubKey = "KEY"</code>.</div>
            </div>` : ''}
            <div class="form-group"><label style="cursor:pointer;"><input type="checkbox" id="scriptHWIDReset"> 🔄 HWID Reset (Allow device change)</label></div>
            <div class="form-group">
                <label>Game Link/ID <span style="color:#555577;">(optional)</span></label>
                <input type="text" id="scriptGameId" placeholder="e.g. 1234567890 or roblox.com/games/1234567890">
                <div id="gameThumbWrap" style="display:none; margin-top:10px; align-items:center; gap:14px;">
                    <img id="gameThumbImg" style="width:96px; height:96px; border-radius:14px; object-fit:cover; border:2px solid rgba(255,255,255,0.1);" alt="Game icon">
                    <div>
                        <div id="gameThumbName" style="color:#fff; font-weight:600; font-size:14px;"></div>
                        <div id="gameThumbMeta" style="color:#8888aa; font-size:12px; margin-top:4px;"></div>
                    </div>
                </div>
            </div>
            <div style="display:flex; gap:12px; margin-top:12px;">
                <button onclick="confirmCreateScript('${projectId}')" class="btn btn-primary" style="flex:1; padding:12px; font-size:15px;">✅ Create Script</button>
                <button onclick="this.closest('.modal-overlay').remove()" class="btn btn-close-dropdown" style="flex:1; padding:12px; font-size:15px;">Cancel</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    var envLogToggle = document.getElementById('scriptEnvLogging');
    var webhookGroup = document.getElementById('scriptWebhookGroup');
    if (envLogToggle && webhookGroup) {
        envLogToggle.addEventListener('change', function() {
            webhookGroup.style.display = this.checked ? 'block' : 'none';
        });
    }
    var requireKeyToggle = document.getElementById('scriptRequireKey');
    var keyGateInfo = document.getElementById('scriptKeyGateInfo');
    if (requireKeyToggle && keyGateInfo) {
        if (currentProject && currentProject.type === 'key') requireKeyToggle.checked = true;
        keyGateInfo.style.display = requireKeyToggle.checked ? 'block' : 'none';
        requireKeyToggle.addEventListener('change', function() {
            keyGateInfo.style.display = this.checked ? 'block' : 'none';
        });
    }
    var fileInput = document.getElementById('scriptFile');
    if (fileInput) {
        fileInput.addEventListener('change', function(e) {
            var file = this.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function(e) {
                document.getElementById('scriptCode').value = e.target.result;
                showNotification('File Loaded', 'Loaded ' + file.name, 'success', 2000);
            };
            reader.onerror = function() { showNotification('Error', 'Failed to read file.', 'error'); };
            reader.readAsText(file);
        });
    }
    // key mode hint switcher
    var keyModeSel = document.getElementById('scriptKeyMode');
    var keyModeHint = document.getElementById('scriptKeyModeHint');
    if (keyModeSel && keyModeHint) {
        keyModeSel.addEventListener('change', function() {
            keyModeHint.innerHTML = this.value === 'custom'
                ? '🛠️ <strong style="color:#00ccaa;">Custom</strong>: no built-in UI - you make your OWN key GUI! The script waits silently and exposes API globals: <code style="color:#66ff66;">ScripterHubKeyValid</code>, <code style="color:#66ff66;">ScripterHubKeyIncorrect</code>, <code style="color:#66ff66;">ScripterHubKeyExpired</code>, <code style="color:#66ff66;">ScripterHubKeyStatus</code>. Your GUI sets <code style="color:#66ccff;">getgenv().ScripterHubKey = "KEY"</code> when ready (see APIs in the Users Keys tab).'
                : '🔑 <strong style="color:#8a6bff;">Default</strong>: ScripterHub shows Roblox notifications ("Key required!", "Invalid key!", "Key accepted!") and a popup key card. Your users set <code style="color:#66ccff;">getgenv().ScripterHubKey = "KEY"</code>.';
        });
    }
    // Roblox game thumbnail preview from Game Link/ID
    var gameIdInput = document.getElementById('scriptGameId');
    if (gameIdInput) {
        gameIdInput.addEventListener('input', function() { fetchGamePreview(this.value.trim()); });
        gameIdInput.addEventListener('change', function() { fetchGamePreview(this.value.trim()); });
    }
}

// ============ ROBLOX GAME PREVIEW (thumbnail + name from place id/url) ============
function extractPlaceId(input) {
    if (!input) return null;
    var m = input.match(/games\/(\d+)/) || input.match(/placeid[=/](\d+)/i) || input.match(/(\d{6,})/);
    return m ? m[1] : null;
}

var gamePreviewCache = {};
function fetchGamePreview(input) {
    var wrap = document.getElementById('gameThumbWrap');
    if (!wrap) return;
    var placeId = extractPlaceId(input);
    if (!placeId) { wrap.style.display = 'none'; return; }
    if (gamePreviewCache[placeId]) { renderGamePreview(gamePreviewCache[placeId]); return; }
    wrap.style.display = 'flex';
    var img = document.getElementById('gameThumbImg');
    if (img) { img.src = 'https://www.roblox.com/asset-thumbnail/image?assetId=' + placeId + '&width=420&height=420&format=png'; img.style.opacity = '0.5'; }
    var nameEl = document.getElementById('gameThumbName');
    var metaEl = document.getElementById('gameThumbMeta');
    if (nameEl) nameEl.textContent = 'Loading game info...';
    if (metaEl) metaEl.textContent = 'Place ID: ' + placeId;
    fetch('https://games.roblox.com/v1/games/multiget-place-details?placeIds=' + placeId)
        .then(function (r) { return r.json(); })
        .then(function (data) {
            var info = (data && data[0]) || null;
            var cached = { placeId: placeId, name: info && info.name ? info.name : 'Unknown Game', creator: info && info.creatorName ? 'by ' + info.creatorName : '', playing: info && info.playing ? info.playing : null, url: info && info.gameId ? 'https://www.roblox.com/games/' + placeId : null };
            gamePreviewCache[placeId] = cached;
            renderGamePreview(cached);
        })
        .catch(function () {
            var cached = { placeId: placeId, name: 'Game', creator: '', playing: null, url: null };
            gamePreviewCache[placeId] = cached;
            renderGamePreview(cached);
        });
}

function renderGamePreview(info) {
    var wrap = document.getElementById('gameThumbWrap');
    if (!wrap) return;
    wrap.style.display = 'flex';
    var img = document.getElementById('gameThumbImg');
    if (img) {
        img.src = 'https://www.roblox.com/asset-thumbnail/image?assetId=' + info.placeId + '&width=420&height=420&format=png';
        img.style.opacity = '1';
    }
    var nameEl = document.getElementById('gameThumbName');
    var metaEl = document.getElementById('gameThumbMeta');
    if (nameEl) nameEl.textContent = info.name || 'Game';
    if (metaEl) metaEl.textContent = 'Place ID: ' + info.placeId + (info.creator ? ' | ' + info.creator : '') + (info.playing ? ' | 👥 ' + info.playing + ' playing' : '');
}

// ============ CONFIRM CREATE SCRIPT ============
function confirmCreateScript(projectId) {
    var name = document.getElementById('scriptName').value.trim();
    var description = document.getElementById('scriptDescription').value.trim();
    var antiTamper = document.getElementById('scriptAntiTamper').checked;
    var antiSkid = document.getElementById('scriptAntiSkid').checked;
    var envLogging = document.getElementById('scriptEnvLogging') ? document.getElementById('scriptEnvLogging').checked : false;
    var webhookUrl = document.getElementById('scriptWebhookUrl') ? document.getElementById('scriptWebhookUrl').value.trim() : '';
    var requireKey = document.getElementById('scriptRequireKey') ? document.getElementById('scriptRequireKey').checked : false;
    var keyMode = document.getElementById('scriptKeyMode') ? document.getElementById('scriptKeyMode').value : 'default';
    var obfuscatorEngine = document.getElementById('scriptObfuscatorEngine') ? document.getElementById('scriptObfuscatorEngine').value : 'default';
    var freeForEveryone = document.getElementById('scriptFreeForEveryone') ? document.getElementById('scriptFreeForEveryone').checked : false;
    var silentMode = document.getElementById('scriptSilentMode') ? document.getElementById('scriptSilentMode').checked : false;
    var heartbeat = document.getElementById('scriptHeartbeat') ? document.getElementById('scriptHeartbeat').checked : true;
    var lightningMode = document.getElementById('scriptLightningMode') ? document.getElementById('scriptLightningMode').checked : false;
    var securityUpdates = document.getElementById('scriptSecurityUpdates') ? document.getElementById('scriptSecurityUpdates').checked : true;
    var keyTime = document.getElementById('scriptKeyTime').value;
    var keyUnit = document.getElementById('scriptKeyUnit').value;
    var code = document.getElementById('scriptCode').value.trim();
    var obfuscationIntensity = 10; // always max - Custom Obfuscator standard
    var obfuscationType = obfuscatorEngine === 'aegis' ? 'aegis' : 'custom';
    var hwidReset = document.getElementById('scriptHWIDReset').checked;
    var gameId = document.getElementById('scriptGameId').value.trim();
    var placeIdOnly = extractPlaceId(gameId) || gameId;
    if (!name) { showNotification('Error', 'Script name is required.', 'error'); return; }
    if (!code) { showNotification('Error', 'Please paste your Lua code or upload a file.', 'error'); return; }
    var projects = loadProjects();
    var projectIndex = -1;
    for (var i = 0; i < projects.length; i++) { if (projects[i].id === projectId) { projectIndex = i; break; } }
    if (projectIndex === -1) { showNotification('Error', 'Project not found.', 'error'); return; }
    // duplicate name check (within this project)
    var existing = projects[projectIndex].scripts || [];
    for (var si = 0; si < existing.length; si++) {
        if (existing[si].name.toLowerCase() === name.toLowerCase()) {
            showNotification('Error', 'A script with this name already exists in this project. Choose a different name.', 'error');
            return;
        }
    }
    if (envLogging && !webhookUrl) {
        showNotification('Warning', 'Environment Logging enabled without webhook URL - logs will only be saved locally on the executor.', 'warning');
    }
    // collect active keys for the key gate
    var keyGateKeys = [];
    if (requireKey) {
        var kd = loadKeys();
        var units = { seconds: 1, minutes: 60, hours: 3600, days: 86400, weeks: 604800, months: 2592000, years: 31536000 };
        var capSec = 0;
        if (keyTime && keyUnit && keyUnit !== 'unlimited' && units[keyUnit]) {
            capSec = Math.floor(Date.now() / 1000) + parseInt(keyTime) * units[keyUnit];
        }
        for (var ki = 0; ki < kd.keys.length; ki++) {
            var kk = kd.keys[ki];
            if (kk.used) continue;
            if (kk.banned) continue;
            if (kk.expires && kk.expires < Date.now()) continue;
            var expMs = kk.expires || null;
            if (capSec > 0) {
                var capped = Math.min(expMs ? Math.floor(expMs / 1000) : capSec, capSec);
                expMs = capped * 1000;
            }
            keyGateKeys.push({ key: kk.key, expires: expMs });
        }
        if (keyGateKeys.length === 0) {
            showNotification('Warning', 'Require Key is ON but you have no active keys! Generate keys in the Users Keys tab first - the script will reject everyone.', 'warning', 6000);
        }
    }
    var obfOptions = {
        intensity: obfuscationIntensity,
        antiTamper: antiTamper,
        antiSkid: antiSkid,
        envLogging: envLogging,
        webhookUrl: webhookUrl,
        keyGate: requireKey ? { keys: keyGateKeys, mode: keyMode } : null,
        silentMode: silentMode,
        scriptName: name,
        scriptId: 'script_' + Date.now(),
        owner: currentUser ? currentUser.username : 'unknown'
    };
    // async: Aegis needs an API roundtrip
    var btnEl = document.querySelector('.modal-overlay[style*="z-index: 2000"] .btn-primary');
    if (btnEl && obfuscatorEngine === 'aegis') { btnEl.disabled = true; btnEl.textContent = '⚔️ Obfuscating with Aegis...'; }
    obfuscateScriptCode(code, obfuscatorEngine, obfOptions).then(function(obfuscatedCode) {
        var loaderKey = 'loader_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now().toString(36);
        var script = {
            id: 'script_' + Date.now(),
            name: name,
            description: description,
            antiTamper: antiTamper,
            antiSkid: antiSkid,
            envLogging: envLogging,
            webhookUrl: webhookUrl,
            requireKey: requireKey,
            keyMode: requireKey ? keyMode : null,
            obfuscatorEngine: obfuscatorEngine,
            freeForEveryone: freeForEveryone,
            silentMode: silentMode,
            heartbeat: heartbeat,
            lightningMode: lightningMode,
            securityUpdates: securityUpdates,
            keyTime: keyTime || 'unlimited',
            keyUnit: keyUnit || 'unlimited',
            code: obfuscatedCode,
            originalCode: code,
            obfuscationType: obfuscationType,
            obfuscationIntensity: obfuscationIntensity,
            version: 1,
            hwidReset: hwidReset,
            gameId: placeIdOnly,
            visibility: 'anyone',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            loaderId: 'ScripterHubOfficial_' + Math.random().toString(36).substring(2, 15),
            loaderKey: loaderKey
        };
        if (!projects[projectIndex].scripts) { projects[projectIndex].scripts = []; }
        projects[projectIndex].scripts.push(script);
        saveProjects(projects);
        storeScriptForLoader(script.loaderId, obfuscatedCode, script.name, script.loaderKey);
        storeScriptForLoader(script.id, obfuscatedCode, script.name, script.loaderKey);
        storeScriptForRawAccess(script.loaderId, obfuscatedCode, script.name);
        storeScriptForRawAccess(script.id, obfuscatedCode, script.name);
        var modal = document.querySelector('.modal-overlay[style*="z-index: 2000"]');
        if (modal) modal.remove();
        recordObfuscation();
        refreshStatsUI();
        showNotification('Success', 'Script "' + name + '" created with ' + (obfuscatorEngine === 'aegis' ? '⚔️ Aegis Obfuscator' : '💎 Default Obfuscator') + '!', 'success');
        renderProjects();
    }).catch(function(e) {
        if (btnEl) { btnEl.disabled = false; btnEl.textContent = '✅ Create Script'; }
        showNotification('Obfuscation Warning', 'Using original code. Error: ' + e.message, 'warning');
    });
}

// ============ OBFUSCATE (Default engine or Aegis API) ============
function obfuscateScriptCode(code, engine, options) {
    return new Promise(function(resolve, reject) {
        try {
            if (engine === 'aegis') {
                // Aegis obfuscates the wrapped payload (key gate + protections + source)
                var payload = buildWrappedPayload(code, options, null);
                fetch('https://api.aegis-obfuscater.cc.cd/api/obfuscate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ source: payload, name: (options.scriptName || 'script') })
                }).then(function(res) {
                    if (!res.ok) throw new Error('Aegis API error ' + res.status + (res.status === 429 ? ' (rate limited - max 6/min)' : ''));
                    return res.json();
                }).then(function(data) {
                    return fetch('https://api.aegis-obfuscater.cc.cd' + data.url).then(function(f) {
                        if (!f.ok) throw new Error('Aegis download failed (' + f.status + ') - link expires after 5 minutes');
                        return f.text();
                    });
                }).then(function(txt) {
                    resolve('-- Obfuscated with Aegis Obfuscator via ScripterHub | ' + new Date().toISOString() + ' | DO NOT EDIT\n' + txt);
                }).catch(function(err) { reject(err); });
            } else {
                resolve(applyCustomObfuscator(code, options));
            }
        } catch (e) { reject(e); }
    });
}

// ============ OPEN SCRIPT RAW (Owner Raw URL) ============
function openScriptRaw(loaderId) {
    var rawUrl = getBasePath() + 'raw.html?id=' + loaderId + '&key=' + OWNER_KEY + '&format=debug';
    recordExecution('Owner Browser', loaderId);
    window.open(rawUrl, '_blank');
}

// ============ VIEW SCRIPT ============
function viewScript(projectId, scriptId) {
    var projects = loadProjects();
    var project = null;
    var script = null;
    for (var i = 0; i < projects.length; i++) {
        if (projects[i].id === projectId) {
            project = projects[i];
            if (project.scripts) {
                for (var j = 0; j < project.scripts.length; j++) {
                    if (project.scripts[j].id === scriptId) {
                        script = project.scripts[j];
                        break;
                    }
                }
            }
            break;
        }
    }
    if (!script) { showNotification('Error', 'Script not found.', 'error'); return; }
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    overlay.style.zIndex = '2000';
    storeScriptForLoader(script.loaderId, script.code, script.name, script.loaderKey);
    storeScriptForLoader(script.id, script.code, script.name, script.loaderKey);
    storeScriptForRawAccess(script.loaderId, script.code, script.name);
    storeScriptForRawAccess(script.id, script.code, script.name);
    var ownerUrl = getBasePath() + 'raw.html?id=' + script.loaderId + '&key=' + OWNER_KEY + '&format=debug';
    var obfType = script.obfuscationType || 'custom';
    var obfDisplay = OBFUSCATION_TYPES[obfType] || 'Custom Obfuscator';
    var gameThumbHtml = '';
    var placeId = extractPlaceId(script.gameId) || (script.gameId && script.gameId.match(/^\d+$/) ? script.gameId : null);
    if (placeId) {
        gameThumbHtml = '<div style="margin-top:12px; display:flex; align-items:center; gap:14px; background:rgba(10,10,15,0.6); border-radius:10px; padding:12px; border:1px solid rgba(255,255,255,0.05);">'
            + '<a href="https://www.roblox.com/games/' + placeId + '" target="_blank" rel="noopener"><img src="https://www.roblox.com/asset-thumbnail/image?assetId=' + placeId + '&width=150&height=150&format=png" style="width:80px; height:80px; border-radius:12px; object-fit:cover;" alt="Game"></a>'
            + '<div><div style="color:#fff; font-weight:600; font-size:14px;">🎮 Game</div><div style="color:#8888aa; font-size:12px; margin-top:4px;">Place ID: ' + placeId + '</div></div>'
            + '</div>';
    }
    var keyInfoHtml = script.requireKey ? (
        '<div style="margin-top:12px; background:rgba(255,215,0,0.08); border:1px solid rgba(255,215,0,0.3); border-radius:10px; padding:12px;">'
        + '<p style="color:#ffd700; font-size:13px; margin:0 0 6px 0; font-weight:600;">🔑 This script requires a key!</p>'
        + '<p style="color:#8888aa; font-size:12px; margin:0 0 6px 0;">Users must add this line <strong style="color:#66ccff;">before</strong> their loadstring:</p>'
        + '<code style="color:#66ff66; font-size:12px; display:block; padding:8px; background:rgba(0,0,0,0.4); border-radius:6px; word-break:break-all;">getgenv().ScripterHubKey = "YOUR_KEY_HERE"</code>'
        + '<p style="color:#555577; font-size:11px; margin:6px 0 0 0;">Wrong key → Roblox notification "Invalid key!". Correct key → script runs. (A popup key card also appears if no key is set.)</p>'
        + '</div>'
    ) : '';
    overlay.innerHTML = `
        <div class="modal" style="max-width: 650px; padding: 32px; max-height:90vh; overflow-y:auto;">
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div>
                    <h2 style="font-size:22px; margin:0; color:#fff;">${script.name}</h2>
                    <p style="color:#8888aa; margin:4px 0 0; font-size:13px;">${script.description || 'No description'}</p>
                    <div style="display:flex; gap:8px; margin-top:8px; flex-wrap:wrap;">
                        <span style="background:rgba(255,0,204,0.15); color:#ff66cc; padding:2px 12px; border-radius:12px; font-size:11px;">💎 ${obfDisplay}</span>
                        ${script.antiTamper ? '<span style="background:rgba(255,215,0,0.2); color:#ffd700; padding:2px 12px; border-radius:12px; font-size:11px;">🛡️ Anti-Tamper</span>' : ''}
                        ${script.antiSkid ? '<span style="background:rgba(255,215,0,0.2); color:#ffd700; padding:2px 12px; border-radius:12px; font-size:11px;">🔒 Anti-Skid</span>' : ''}
                        ${script.envLogging ? '<span style="background:rgba(0,191,255,0.2); color:#00bfff; padding:2px 12px; border-radius:12px; font-size:11px;">📡 Env Logging</span>' : ''}
                        ${script.requireKey ? '<span style="background:rgba(255,215,0,0.2); color:#ffd700; padding:2px 12px; border-radius:12px; font-size:11px;">🔑 Key Required</span>' : ''}
                    </div>
                </div>
                <div style="display:flex; gap:8px; flex-shrink:0; flex-wrap:wrap;">
                    <button onclick="editScript('${projectId}','${scriptId}')" class="btn btn-close-dropdown" style="padding:4px 12px; font-size:11px;">✏️ Edit</button>
                    <button onclick="openScriptSettings('${projectId}','${scriptId}')" class="btn btn-close-dropdown" style="padding:4px 12px; font-size:11px;">⚙️ Settings</button>
                </div>
            </div>
            ${gameThumbHtml}
            ${keyInfoHtml}
            <div style="margin-top:12px; background:rgba(10,10,15,0.6); border-radius:8px; padding:12px; border:1px solid rgba(255,255,255,0.05); max-height:220px; overflow-y:auto;">
                <p style="color:#8888aa; font-size:12px; margin:0 0 4px 0;">💻 Script Code:</p>
                <pre style="color:#66ccff; font-size:12px; margin:0; white-space:pre-wrap; word-break:break-all;">${script.code.substring(0, 500)}${script.code.length > 500 ? '\n... (truncated - use Owner Raw URL for full code)' : ''}</pre>
            </div>
            <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap; font-size:12px; color:#555577;">
                <span>🆔 ${script.id}</span>
                <span>📅 ${new Date(script.createdAt).toLocaleDateString()}</span>
                ${script.gameId ? '<span>🎮 ' + script.gameId + '</span>' : ''}
                <span>⏱️ ${script.keyTime === 'unlimited' || script.keyUnit === 'unlimited' || !script.keyTime ? '♾️ Unlimited' : script.keyTime + ' ' + script.keyUnit}</span>
            </div>
            <details style="margin-top:12px;">
                <summary style="color:#8888aa; font-size:12px; cursor:pointer;">🔒 Owner Raw URL</summary>
                <div style="margin-top:6px; padding:8px; background:rgba(10,10,15,0.6); border-radius:8px;">
                    <code style="color:#66ccff; font-size:12px; word-break:break-all;">${ownerUrl}</code>
                    <button onclick="copyText('${ownerUrl}')" class="btn btn-primary" style="margin-top:6px; padding:4px 12px; font-size:12px;">📋 Copy</button>
                </div>
            </details>
        </div>
    `;
    document.body.appendChild(overlay);
}

// ============ EDIT PROJECT ============
function editProject(projectId) {
    var projects = loadProjects();
    var project = null;
    var projectIndex = -1;
    for (var i = 0; i < projects.length; i++) { if (projects[i].id === projectId) { project = projects[i]; projectIndex = i; break; } }
    if (!project) { showNotification('Error', 'Project not found.', 'error'); return; }
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    overlay.style.zIndex = '2000';
    overlay.innerHTML = `
        <div class="modal" style="max-width: 500px; padding: 32px;">
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
            <h2 style="font-size:22px;">✏️ Edit Project</h2>
            <div class="form-group"><label>Project Name <span class="required">*</span></label><input type="text" id="editProjectName" value="${project.name}" required></div>
            <div class="form-group"><label>Project Description <span style="color:#555577;">(optional)</span></label><textarea id="editProjectDescription">${project.description || ''}</textarea></div>
            <div class="form-group"><label>Visibility</label><select id="editProjectVisibility"><option value="anyone" ${project.visibility === 'anyone' ? 'selected' : ''}>Anyone</option><option value="friends" ${project.visibility === 'friends' ? 'selected' : ''}>Friends (Soon...)</option><option value="private" ${project.visibility === 'private' ? 'selected' : ''}>Private</option></select></div>
            <div class="form-group" style="display:flex; gap:20px; align-items:center;">
                <label style="margin:0; cursor:pointer;"><input type="checkbox" id="editProjectBlockIncognito" ${project.blockIncognito ? 'checked' : ''}> Block Incognito Mode</label>
                <label style="margin:0; cursor:pointer;"><input type="checkbox" id="editProjectBlockVPN" ${project.blockVPN ? 'checked' : ''}> Block VPN</label>
            </div>
            <div class="form-group"><label>Type Of Project</label><select id="editProjectType"><option value="free" ${project.type === 'free' ? 'selected' : ''}>Free</option><option value="key" ${project.type === 'key' ? 'selected' : ''}>Key Required</option><option value="paid" ${project.type === 'paid' ? 'selected' : ''}>Paid</option></select></div>
            <button onclick="confirmEditProject('${projectId}')" class="btn btn-primary" style="width:100%; margin-top:8px; padding:12px;">💾 Update Project</button>
        </div>
    `;
    document.body.appendChild(overlay);
}

function confirmEditProject(projectId) {
    var name = document.getElementById('editProjectName').value.trim();
    var description = document.getElementById('editProjectDescription').value.trim();
    var visibility = document.getElementById('editProjectVisibility').value;
    var blockIncognito = document.getElementById('editProjectBlockIncognito').checked;
    var blockVPN = document.getElementById('editProjectBlockVPN').checked;
    var type = document.getElementById('editProjectType').value;
    if (!name) { showNotification('Error', 'Project name is required.', 'error'); return; }
    var projects = loadProjects();
    for (var i = 0; i < projects.length; i++) {
        if (projects[i].id !== projectId && projects[i].name.toLowerCase() === name.toLowerCase()) {
            showNotification('Error', 'Another project with this name already exists.', 'error');
            return;
        }
        if (projects[i].id === projectId) {
            projects[i].name = name;
            projects[i].description = description;
            projects[i].visibility = visibility;
            projects[i].blockIncognito = blockIncognito;
            projects[i].blockVPN = blockVPN;
            projects[i].type = type;
            break;
        }
    }
    saveProjects(projects);
    var modal = document.querySelector('.modal-overlay[style*="z-index: 2000"]');
    if (modal) modal.remove();
    showNotification('Success', 'Project updated!', 'success');
    renderProjects();
}

// ============ DELETE PROJECT ==========
function deleteProject(projectId) {
    if (!confirm('Are you sure you want to delete this project and all its scripts?')) return;
    var projects = loadProjects();
    for (var i = 0; i < projects.length; i++) { if (projects[i].id === projectId) { projects.splice(i, 1); break; } }
    saveProjects(projects);
    refreshStatsUI();
    showNotification('Deleted', 'Project deleted.', 'warning');
    renderProjects();
}

// ============ EDIT SCRIPT ==========
function editScript(projectId, scriptId) {
    var projects = loadProjects();
    var project = null;
    var script = null;
    var projectIndex = -1;
    var scriptIndex = -1;
    for (var i = 0; i < projects.length; i++) {
        if (projects[i].id === projectId) {
            project = projects[i];
            projectIndex = i;
            if (project.scripts) {
                for (var j = 0; j < project.scripts.length; j++) {
                    if (project.scripts[j].id === scriptId) {
                        script = project.scripts[j];
                        scriptIndex = j;
                        break;
                    }
                }
            }
            break;
        }
    }
    if (!script) { showNotification('Error', 'Script not found.', 'error'); return; }
    editingScript = { projectId: projectId, scriptId: scriptId, projectIndex: projectIndex, scriptIndex: scriptIndex };
    currentProject = project;
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    overlay.style.zIndex = '2000';
    var keyTime = script.keyTime === 'unlimited' || script.keyUnit === 'unlimited' ? '' : script.keyTime;
    var keyUnit = script.keyUnit === 'unlimited' || script.keyUnit === 'unlimited' ? 'unlimited' : (script.keyUnit || 'hours');
    var isKeyProject = project && project.type === 'key';
    overlay.innerHTML = `
        <div class="modal" style="max-width: 600px; padding: 32px; max-height:90vh; overflow-y:auto;">
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
            <h2 style="font-size:22px;">✏️ Edit Script</h2>
            <p class="sub">Update script details</p>
            <div class="form-group"><label>Script Name <span class="required">*</span></label><input type="text" id="editScriptName" value="${script.name}" required></div>
            <div class="form-group"><label>Script Description <span style="color:#555577;">(optional)</span></label><textarea id="editScriptDescription">${script.description || ''}</textarea></div>
            <div class="form-group" style="display:flex; gap:20px; align-items:center; flex-wrap:wrap;">
                <label style="margin:0; cursor:pointer;"><input type="checkbox" id="editScriptAntiTamper" ${script.antiTamper ? 'checked' : ''}> 🛡️ Anti Tampering</label>
                <label style="margin:0; cursor:pointer;"><input type="checkbox" id="editScriptAntiSkid" ${script.antiSkid ? 'checked' : ''}> 🔒 Anti Skidding</label>
                <label style="margin:0; cursor:pointer;"><input type="checkbox" id="editScriptEnvLogging" ${script.envLogging ? 'checked' : ''}> 📡 Environment Logging</label>
                <label style="margin:0; cursor:pointer;${isKeyProject ? '' : ' display:none;'}"><input type="checkbox" id="editScriptRequireKey" ${script.requireKey ? 'checked' : ''}> 🔑 Require Key</label>
            </div>
            <div class="form-group" id="editScriptKeyGateInfo" style="display:${script.requireKey && isKeyProject ? 'block' : 'none'};">
                <div style="padding:10px 14px; background:rgba(108,59,255,0.1); border:1px solid rgba(108,59,255,0.25); border-radius:10px; font-size:12px; color:#8888aa;">
                    🔑 <strong style="color:#8a6bff;">Key System:</strong> All active keys from the Keys tab get re-embedded (hashed) when you save.
                </div>
            </div>
            <div class="form-group" id="editScriptWebhookGroup" style="display:${script.envLogging ? 'block' : 'none'};">
                <label>📡 Logging Webhook URL <span style="color:#555577;">(Discord webhook or API endpoint)</span></label>
                <input type="text" id="editScriptWebhookUrl" value="${script.webhookUrl || ''}" placeholder="https://discord.com/api/webhooks/...">
            </div>
            <div class="form-group">
                <label>Max Timer Of Keys</label>
                <div style="display:flex; gap:8px;">
                    <input type="number" id="editScriptKeyTime" placeholder="Amount" value="${keyTime}" style="flex:1; min-width:0;">
                    <select id="editScriptKeyUnit" style="flex:1; min-width:0;">
                        <option value="seconds" ${keyUnit === 'seconds' ? 'selected' : ''}>Seconds</option>
                        <option value="minutes" ${keyUnit === 'minutes' ? 'selected' : ''}>Minutes</option>
                        <option value="hours" ${keyUnit === 'hours' ? 'selected' : ''}>Hours</option>
                        <option value="days" ${keyUnit === 'days' ? 'selected' : ''}>Days</option>
                        <option value="weeks" ${keyUnit === 'weeks' ? 'selected' : ''}>Weeks</option>
                        <option value="months" ${keyUnit === 'months' ? 'selected' : ''}>Months</option>
                        <option value="years" ${keyUnit === 'years' ? 'selected' : ''}>Years</option>
                        <option value="unlimited" ${keyUnit === 'unlimited' ? 'selected' : ''}>Unlimited</option>
                    </select>
                </div>
            </div>
            <div class="form-group">
                <label>💎 Choose Obfuscator</label>
                <select id="editScriptObfuscatorEngine" style="width:100%; padding:12px 16px; background:#0a0a15; border:1px solid rgba(255,255,255,0.08); border-radius:10px; color:#fff; font-size:14px; cursor:pointer;">
                    <option value="default" ${script.obfuscatorEngine !== 'aegis' ? 'selected' : ''}>Default Obfuscator (Recommended)</option>
                    <option value="aegis" ${script.obfuscatorEngine === 'aegis' ? 'selected' : ''}>Aegis Obfuscator</option>
                </select>
                <div style="margin-top:6px; font-size:12px; color:#8888aa;">⚔️ Aegis sends your source to the external Aegis API to obfuscate (max 6 requests/min).</div>
            </div>
            <div class="form-group" style="display:flex; gap:14px; align-items:center; flex-wrap:wrap;">
                <label style="margin:0; cursor:pointer;"><input type="checkbox" id="editScriptFreeForEveryone" ${script.freeForEveryone ? 'checked' : ''}> 🌐 Free For Everyone</label>
                <label style="margin:0; cursor:pointer;"><input type="checkbox" id="editScriptSilentMode" ${script.silentMode ? 'checked' : ''}> 🔇 Silent Mode</label>
                <label style="margin:0; cursor:pointer;"><input type="checkbox" id="editScriptHeartbeat" ${script.heartbeat !== false ? 'checked' : ''}> 💓 Heartbeat</label>
                <label style="margin:0; cursor:pointer;"><input type="checkbox" id="editScriptLightningMode" ${script.lightningMode ? 'checked' : ''}> ⚡ Lightning Mode</label>
                <label style="margin:0; cursor:pointer;"><input type="checkbox" id="editScriptSecurityUpdates" ${script.securityUpdates !== false ? 'checked' : ''}> 🔄 Enable Security Updates</label>
            </div>
            ${isKeyProject ? `
            <div class="form-group">
                <label>🔑 Choose How Key Works</label>
                <select id="editScriptKeyMode" style="width:100%; padding:12px 16px; background:#0a0a15; border:1px solid rgba(255,255,255,0.08); border-radius:10px; color:#fff; font-size:14px; cursor:pointer;">
                    <option value="default" ${script.keyMode !== 'custom' ? 'selected' : ''}>Default (Roblox Core Notification)</option>
                    <option value="custom" ${script.keyMode === 'custom' ? 'selected' : ''}>Custom (You Make It)</option>
                </select>
                <div style="margin-top:6px; font-size:12px; color:#8888aa;">🛠️ Custom = build your own key GUI with ScripterHubKeyValid / ScripterHubKeyStatus APIs (see Users Keys tab).</div>
            </div>` : ''}
            <div class="form-group"><label>Paste .txt/.lua Code</label><textarea id="editScriptCode" style="min-height:150px; font-family:monospace; font-size:13px;">${script.originalCode || script.code || ''}</textarea></div>
            <div class="form-group"><label style="cursor:pointer;"><input type="checkbox" id="editScriptHWIDReset" ${script.hwidReset ? 'checked' : ''}> 🔄 HWID Reset</label></div>
            <div class="form-group">
                <label>Game Link/ID <span style="color:#555577;">(optional)</span></label>
                <input type="text" id="editScriptGameId" value="${script.gameId || ''}" placeholder="e.g. 1234567890">
                <div id="gameThumbWrap" style="display:none; margin-top:10px; align-items:center; gap:14px;">
                    <img id="gameThumbImg" style="width:96px; height:96px; border-radius:14px; object-fit:cover; border:2px solid rgba(255,255,255,0.1);" alt="Game icon">
                    <div>
                        <div id="gameThumbName" style="color:#fff; font-weight:600; font-size:14px;"></div>
                        <div id="gameThumbMeta" style="color:#8888aa; font-size:12px; margin-top:4px;"></div>
                    </div>
                </div>
            </div>
            <div style="display:flex; gap:12px; margin-top:12px;">
                <button onclick="confirmEditScript('${projectId}','${scriptId}')" class="btn btn-primary" style="flex:1; padding:12px; font-size:15px;">💾 Update Script</button>
                <button onclick="this.closest('.modal-overlay').remove()" class="btn btn-close-dropdown" style="flex:1; padding:12px; font-size:15px;">Cancel</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    var editEnvLogToggle = document.getElementById('editScriptEnvLogging');
    var editWebhookGroup = document.getElementById('editScriptWebhookGroup');
    if (editEnvLogToggle && editWebhookGroup) {
        editEnvLogToggle.addEventListener('change', function() {
            editWebhookGroup.style.display = this.checked ? 'block' : 'none';
        });
    }
    var editRequireKeyToggle = document.getElementById('editScriptRequireKey');
    var editKeyGateInfo = document.getElementById('editScriptKeyGateInfo');
    if (editRequireKeyToggle && editKeyGateInfo) {
        editRequireKeyToggle.addEventListener('change', function() {
            editKeyGateInfo.style.display = this.checked ? 'block' : 'none';
        });
    }
    var editGameIdInput = document.getElementById('editScriptGameId');
    if (editGameIdInput) {
        if (editGameIdInput.value.trim()) fetchGamePreview(editGameIdInput.value.trim());
        editGameIdInput.addEventListener('input', function() { fetchGamePreview(this.value.trim()); });
        editGameIdInput.addEventListener('change', function() { fetchGamePreview(this.value.trim()); });
    }
}

// ============ CONFIRM EDIT SCRIPT ============
function confirmEditScript(projectId, scriptId) {
    var name = document.getElementById('editScriptName').value.trim();
    var description = document.getElementById('editScriptDescription').value.trim();
    var antiTamper = document.getElementById('editScriptAntiTamper').checked;
    var antiSkid = document.getElementById('editScriptAntiSkid').checked;
    var envLogging = document.getElementById('editScriptEnvLogging') ? document.getElementById('editScriptEnvLogging').checked : false;
    var webhookUrl = document.getElementById('editScriptWebhookUrl') ? document.getElementById('editScriptWebhookUrl').value.trim() : '';
    var requireKey = document.getElementById('editScriptRequireKey') ? document.getElementById('editScriptRequireKey').checked : false;
    var keyMode = document.getElementById('editScriptKeyMode') ? document.getElementById('editScriptKeyMode').value : 'default';
    var obfuscatorEngine = document.getElementById('editScriptObfuscatorEngine') ? document.getElementById('editScriptObfuscatorEngine').value : 'default';
    var freeForEveryone = document.getElementById('editScriptFreeForEveryone') ? document.getElementById('editScriptFreeForEveryone').checked : false;
    var silentMode = document.getElementById('editScriptSilentMode') ? document.getElementById('editScriptSilentMode').checked : false;
    var heartbeat = document.getElementById('editScriptHeartbeat') ? document.getElementById('editScriptHeartbeat').checked : true;
    var lightningMode = document.getElementById('editScriptLightningMode') ? document.getElementById('editScriptLightningMode').checked : false;
    var securityUpdates = document.getElementById('editScriptSecurityUpdates') ? document.getElementById('editScriptSecurityUpdates').checked : true;
    var keyTime = document.getElementById('editScriptKeyTime').value;
    var keyUnit = document.getElementById('editScriptKeyUnit').value;
    var code = document.getElementById('editScriptCode').value.trim();
    var obfuscationIntensity = 10; // always max - Custom Obfuscator standard
    var obfuscationType = obfuscatorEngine === 'aegis' ? 'aegis' : 'custom';
    var hwidReset = document.getElementById('editScriptHWIDReset').checked;
    var gameId = document.getElementById('editScriptGameId').value.trim();
    var placeIdOnly = extractPlaceId(gameId) || gameId;
    if (!name) { showNotification('Error', 'Script name is required.', 'error'); return; }
    if (!code) { showNotification('Error', 'Please paste your Lua code.', 'error'); return; }
    var projects = loadProjects();
    // duplicate name check (within project, excluding this script)
    for (var pi = 0; pi < projects.length; pi++) {
        if (projects[pi].id === projectId && projects[pi].scripts) {
            for (var pj = 0; pj < projects[pi].scripts.length; pj++) {
                if (projects[pi].scripts[pj].id !== scriptId && projects[pi].scripts[pj].name.toLowerCase() === name.toLowerCase()) {
                    showNotification('Error', 'Another script with this name already exists in this project.', 'error');
                    return;
                }
            }
        }
    }
    // find current script (for version increment)
    var prevScript = null;
    for (var i = 0; i < projects.length; i++) {
        if (projects[i].id === projectId && projects[i].scripts) {
            for (var j = 0; j < projects[i].scripts.length; j++) {
                if (projects[i].scripts[j].id === scriptId) { prevScript = projects[i].scripts[j]; break; }
            }
        }
    }
    var keyGateKeys = [];
    if (requireKey) {
        var kd = loadKeys();
        for (var ki = 0; ki < kd.keys.length; ki++) {
            var kk = kd.keys[ki];
            if (kk.used) continue;
            if (kk.banned) continue;
            if (kk.expires && kk.expires < Date.now()) continue;
            keyGateKeys.push({ key: kk.key, expires: kk.expires || null });
        }
        if (keyGateKeys.length === 0) {
            showNotification('Warning', 'Require Key is ON but you have no active keys! Generate keys in the Users Keys tab first.', 'warning', 6000);
        }
    }
    var obfOptions = {
        intensity: obfuscationIntensity,
        antiTamper: antiTamper,
        antiSkid: antiSkid,
        envLogging: envLogging,
        webhookUrl: webhookUrl,
        keyGate: requireKey ? { keys: keyGateKeys, mode: keyMode } : null,
        silentMode: silentMode,
        scriptName: name,
        scriptId: scriptId,
        owner: currentUser ? currentUser.username : 'unknown'
    };
    var btnEl = document.querySelector('.modal-overlay[style*="z-index: 2000"] .btn-primary');
    if (btnEl && obfuscatorEngine === 'aegis') { btnEl.disabled = true; btnEl.textContent = '⚔️ Obfuscating with Aegis...'; }
    obfuscateScriptCode(code, obfuscatorEngine, obfOptions).then(function(obfuscatedCode) {
        for (var i = 0; i < projects.length; i++) {
            if (projects[i].id === projectId) {
                if (projects[i].scripts) {
                    for (var j = 0; j < projects[i].scripts.length; j++) {
                        if (projects[i].scripts[j].id === scriptId) {
                            projects[i].scripts[j].name = name;
                            projects[i].scripts[j].description = description;
                            projects[i].scripts[j].antiTamper = antiTamper;
                            projects[i].scripts[j].antiSkid = antiSkid;
                            projects[i].scripts[j].envLogging = envLogging;
                            projects[i].scripts[j].webhookUrl = webhookUrl;
                            projects[i].scripts[j].requireKey = requireKey;
                            projects[i].scripts[j].keyMode = requireKey ? keyMode : null;
                            projects[i].scripts[j].obfuscatorEngine = obfuscatorEngine;
                            projects[i].scripts[j].freeForEveryone = freeForEveryone;
                            projects[i].scripts[j].silentMode = silentMode;
                            projects[i].scripts[j].heartbeat = heartbeat;
                            projects[i].scripts[j].lightningMode = lightningMode;
                            projects[i].scripts[j].securityUpdates = securityUpdates;
                            projects[i].scripts[j].keyTime = keyTime || 'unlimited';
                            projects[i].scripts[j].keyUnit = keyUnit || 'unlimited';
                            projects[i].scripts[j].code = obfuscatedCode;
                            projects[i].scripts[j].originalCode = code;
                            projects[i].scripts[j].obfuscationType = obfuscationType;
                            projects[i].scripts[j].obfuscationIntensity = obfuscationIntensity;
                            projects[i].scripts[j].version = (prevScript && prevScript.version ? prevScript.version : 1) + 1;
                            projects[i].scripts[j].hwidReset = hwidReset;
                            projects[i].scripts[j].gameId = placeIdOnly;
                            projects[i].scripts[j].updatedAt = new Date().toISOString();
                            break;
                        }
                    }
                }
                break;
            }
        }
        saveProjects(projects);
        for (var i = 0; i < projects.length; i++) {
            if (projects[i].id === projectId) {
                if (projects[i].scripts) {
                    for (var j = 0; j < projects[i].scripts.length; j++) {
                        if (projects[i].scripts[j].id === scriptId) {
                            var script = projects[i].scripts[j];
                            storeScriptForLoader(script.loaderId, script.code, script.name, script.loaderKey);
                            storeScriptForLoader(script.id, script.code, script.name, script.loaderKey);
                            storeScriptForRawAccess(script.loaderId, script.code, script.name);
                            storeScriptForRawAccess(script.id, script.code, script.name);
                            break;
                        }
                    }
                }
                break;
            }
        }
        var modal = document.querySelector('.modal-overlay[style*="z-index: 2000"]');
        if (modal) modal.remove();
        recordObfuscation();
        refreshStatsUI();
        showNotification('Success', 'Script "' + name + '" updated to ' + versionLabel({ version: (prevScript && prevScript.version ? prevScript.version : 1) + 1 }) + ' with ' + (obfuscatorEngine === 'aegis' ? '⚔️ Aegis' : '💎 Default') + ' Obfuscator!', 'success');
        renderProjects();
    }).catch(function(e) {
        if (btnEl) { btnEl.disabled = false; btnEl.textContent = '💾 Update Script'; }
        showNotification('Obfuscation Warning', 'Using original code. Error: ' + e.message, 'warning');
    });
}

// ============ DELETE SCRIPT ==========
function deleteScript(projectId, scriptId) {
    if (!confirm('Are you sure you want to delete this script?')) return;
    var projects = loadProjects();
    for (var i = 0; i < projects.length; i++) {
        if (projects[i].id === projectId) {
            if (projects[i].scripts) {
                for (var j = 0; j < projects[i].scripts.length; j++) {
                    if (projects[i].scripts[j].id === scriptId) {
                        projects[i].scripts.splice(j, 1);
                        break;
                    }
                }
            }
            break;
        }
    }
    saveProjects(projects);
    refreshStatsUI();
    showNotification('Deleted', 'Script deleted.', 'warning');
    renderProjects();
}

// ============ SCRIPT SETTINGS ==========
function toggleCreditMore(btn) {
    var el = btn.parentElement.querySelector('.credit-more');
    if (!el) return;
    el.classList.toggle('open');
    btn.textContent = el.classList.contains('open') ? '- Less' : '+ More';
}

// ============ TIME AGO HELPER ============
function timeAgo(dateStr) {
    if (!dateStr) return 'Unknown';
    try {
        var then = new Date(dateStr).getTime();
        if (isNaN(then)) return 'Unknown';
        var s = Math.floor((Date.now() - then) / 1000);
        if (s < 5) return 'Right Now';
        if (s < 60) return s + (s === 1 ? ' Second' : ' Seconds') + ' ago';
        var m = Math.floor(s / 60);
        if (m < 60) return m + (m === 1 ? ' Minute' : ' Minutes') + ' ago';
        var h = Math.floor(m / 60);
        if (h < 24) return h + (h === 1 ? ' Hour' : ' Hours') + ' ago';
        var d = Math.floor(h / 24);
        if (d < 7) return d + (d === 1 ? ' Day' : ' Days') + ' ago';
        var w = Math.floor(d / 7);
        if (w < 5) return w + (w === 1 ? ' Week' : ' Weeks') + ' ago';
        var mo = Math.floor(d / 30);
        if (mo < 12) return mo + (mo === 1 ? ' Month' : ' Months') + ' ago';
        var y = Math.floor(d / 365);
        return y + (y === 1 ? ' Year' : ' Years') + ' ago';
    } catch (e) { return 'Unknown'; }
}

function versionLabel(script) {
    var v = script.version || 1;
    return 'V. 0.0.0.' + v;
}

// ============ SCRIPT SETTINGS ==========
function openScriptSettings(projectId, scriptId) {
    var projects = loadProjects();
    var script = null;
    for (var i = 0; i < projects.length; i++) {
        if (projects[i].id === projectId) {
            if (projects[i].scripts) {
                for (var j = 0; j < projects[i].scripts.length; j++) {
                    if (projects[i].scripts[j].id === scriptId) {
                        script = projects[i].scripts[j];
                        break;
                    }
                }
            }
            break;
        }
    }
    if (!script) { showNotification('Error', 'Script not found.', 'error'); return; }
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    overlay.style.zIndex = '2000';
    overlay.innerHTML = `
        <div class="modal" style="max-width: 450px; padding: 32px;">
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
            <h2 style="font-size:22px;">⚙️ Script Settings</h2>
            <p class="sub">Manage "${script.name}"</p>
            <div class="form-group"><label>Visibility</label><select id="scriptVisibility"><option value="anyone" ${script.visibility === 'anyone' ? 'selected' : ''}>Anyone</option><option value="friends" ${script.visibility === 'friends' ? 'selected' : ''}>Friends (Soon...)</option><option value="private" ${script.visibility === 'private' ? 'selected' : ''}>Private</option></select></div>
            <div style="display:flex; gap:12px; margin-top:16px;">
                <button onclick="updateScriptVisibility('${projectId}','${scriptId}')" class="btn btn-primary" style="flex:1;">💾 Update Visibility</button>
                <button onclick="deleteScript('${projectId}','${scriptId}')" class="btn btn-danger" style="flex:1;">🗑️ Delete Script</button>
            </div>
            <button onclick="this.closest('.modal-overlay').remove()" class="btn btn-close-dropdown" style="width:100%; margin-top:8px;">Close</button>
        </div>
    `;
    document.body.appendChild(overlay);
}

function updateScriptVisibility(projectId, scriptId) {
    var visibility = document.getElementById('scriptVisibility').value;
    var projects = loadProjects();
    for (var i = 0; i < projects.length; i++) {
        if (projects[i].id === projectId) {
            if (projects[i].scripts) {
                for (var j = 0; j < projects[i].scripts.length; j++) {
                    if (projects[i].scripts[j].id === scriptId) {
                        projects[i].scripts[j].visibility = visibility;
                        break;
                    }
                }
            }
            break;
        }
    }
    saveProjects(projects);
    var modal = document.querySelector('.modal-overlay[style*="z-index: 2000"]');
    if (modal) modal.remove();
    showNotification('Success', 'Visibility updated!', 'success');
    renderProjects();
}

// ============ AUTO-LOGIN CHECK ============
function checkAuth() {
    loadUsers();
    var savedUser = null;
    try {
        var sessionData = sessionStorage.getItem('session_user');
        if (sessionData) { savedUser = JSON.parse(sessionData); }
    } catch (e) {}
    if (!savedUser) {
        try {
            var localData = localStorage.getItem('currentUser');
            if (localData) { savedUser = JSON.parse(localData); }
        } catch (e) {}
    }
    if (savedUser) {
        var userExists = false;
        for (var key in users) {
            if (users[key].id === savedUser.id) {
                userExists = true;
                var userData = { ...users[key] };
                delete userData.password;
                updateUIForUser(userData);
                break;
            }
        }
        if (!userExists) {
            clearCurrentUser();
            showHomePage();
        }
    } else {
        showHomePage();
    }
}

function showHomePage() {
    var homePage = document.getElementById('homePage');
    var dashboard = document.getElementById('dashboard');
    var plansSection = document.querySelector('.plans-section');
    if (homePage) homePage.style.display = 'block';
    if (dashboard) dashboard.classList.remove('show');
    dashboard.style.display = 'none';
    if (plansSection) plansSection.style.display = 'block';
}

// ============ EVENT LISTENERS ============
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Streaming Obfuscation System loaded');
    handleOAuthCallback();
    checkAuth();
    var signupForm = document.getElementById('signupForm');
    if (signupForm) { signupForm.addEventListener('submit', handleSignup); }
    var loginForm = document.getElementById('loginForm');
    if (loginForm) { loginForm.addEventListener('submit', handleLogin); }
    var adminBtn = document.getElementById('adminBtn');
    if (adminBtn) { adminBtn.addEventListener('click', openAdminPanel); }
    var usersBtn = document.getElementById('usersBtn');
    if (usersBtn) { usersBtn.addEventListener('click', openUsersPanel); }
    console.log('📊 Users loaded:', Object.keys(users).length);
});

(function() {
    var savedUser = getCurrentUser();
    if (savedUser) { console.log('🔄 Session found, restoring...'); }
})();

// ============ EXPOSE FUNCTIONS TO GLOBAL ============
window.handleSignup = handleSignup;
window.handleLogin = handleLogin;
window.handleSocial = handleSocial;
window.logout = logout;
window.openModal = openModal;
window.closeModal = closeModal;
window.openAdminPanel = openAdminPanel;
window.openUsersPanel = openUsersPanel;
window.closeUsersPanel = closeUsersPanel;
window.renderUsersList = renderUsersList;
window.selectUser = selectUser;
window.panelDeleteUser = panelDeleteUser;
window.panelChangePlan = panelChangePlan;
window.renderAdminUserListFull = renderAdminUserListFull;
window.deleteUser = deleteUser;
window.deleteAllUsers = deleteAllUsers;
window.filterUsers = filterUsers;
window.uploadProfileImage = uploadProfileImage;
window.uploadBannerImage = uploadBannerImage;
window.changeTheme = changeTheme;
window.exportUsers = exportUsers;
window.changeUserPlan = changeUserPlan;
window.changeOwnPlan = changeOwnPlan;
window.confirmChangePlan = confirmChangePlan;
window.confirmOwnPlanChange = confirmOwnPlanChange;
window.loadProjects = loadProjects;
window.saveProjects = saveProjects;
window.switchTab = switchTab;
window.showTabs = showTabs;
window.openCreateProject = openCreateProject;
window.confirmCreateProject = confirmCreateProject;
window.renderProjects = renderProjects;
window.viewProject = viewProject;
window.openCreateScript = openCreateScript;
window.confirmCreateScript = confirmCreateScript;
window.viewScript = viewScript;
window.editProject = editProject;
window.confirmEditProject = confirmEditProject;
window.deleteProject = deleteProject;
window.editScript = editScript;
window.confirmEditScript = confirmEditScript;
window.deleteScript = deleteScript;
window.openScriptSettings = openScriptSettings;
window.updateScriptVisibility = updateScriptVisibility;
window.copyText = copyText;
window.storeScriptForLoader = storeScriptForLoader;
window.storeScriptForRawAccess = storeScriptForRawAccess;
window.getScriptForLoader = getScriptForLoader;
window.getScriptForRawAccess = getScriptForRawAccess;
window.createKey = createKey;
window.deleteKey = deleteKey;
window.generateKey = generateKey;
window.renderKeys = renderKeys;
window.verifyKey = verifyKey;
window.useKey = useKey;
window.loadKeys = loadKeys;
window.saveKeys = saveKeys;
window.openCreateKeyUI = openCreateKeyUI;
window.confirmCreateKeyUI = confirmCreateKeyUI;
window.toggleEmail = toggleEmail;
window.toggleCreditMore = toggleCreditMore;
window.confirmSocialLogin = confirmSocialLogin;
window.refreshStatsUI = refreshStatsUI;
window.setExecRange = setExecRange;
window.setObfRange = setObfRange;
window.toggleLiveChartPause = toggleLiveChartPause;
window.toggleLiveChartSeries = toggleLiveChartSeries;
window.userKeysDoSearch = userKeysDoSearch;
window.userKeysPage = userKeysPage;
window.toggleUserKeysList = toggleUserKeysList;
window.openAddUserUI = openAddUserUI;
window.confirmAddUserUI = confirmAddUserUI;
window.openUserKeysSettingsUI = openUserKeysSettingsUI;
window.massGenerateKeys = massGenerateKeys;
window.downloadKeysTxt = downloadKeysTxt;
window.exportKeysJson = exportKeysJson;
window.deleteUnusedKeys = deleteUnusedKeys;
window.importUsersFile = importUsersFile;
window.massCompensateDays = massCompensateDays;
window.resetAllHwids = resetAllHwids;
window.openKeySettingsUI = openKeySettingsUI;
window.saveKeySettings = saveKeySettings;
window.resetOneHwid = resetOneHwid;
window.blacklistKey = blacklistKey;
window.disableAccount = disableAccount;
window.enableAccount = enableAccount;
window.openDeleteAccountUI = openDeleteAccountUI;
window.confirmDeleteAccount = confirmDeleteAccount;
window.openScriptRaw = openScriptRaw;
window.recordExecution = recordExecution;
window.recordThreat = recordThreat;
