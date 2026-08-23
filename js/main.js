// ============ STATE ============
let currentUser = null;
let isLoggedIn = false;
let users = {};
let selectedUserEmail = null;

// ============ PLAN CONFIGURATIONS ============
const PLAN_CONFIGS = {
    'Basic': {
        fileSize: 10,
        keys: 1000,
        projects: 10,
        scripts: 20,
        price: 0,
        label: 'Basic'
    },
    'Advanced': {
        fileSize: 100,
        keys: 10000,
        projects: 50,
        scripts: 100,
        price: 10,
        label: 'Advanced'
    },
    'Pro': {
        fileSize: 1024,
        keys: 100000,
        projects: 500,
        scripts: 300,
        price: 30,
        label: 'Pro'
    },
    'God': {
        fileSize: 102400,
        keys: Infinity,
        projects: 10000,
        scripts: 250000,
        price: 50,
        label: 'God'
    },
    'Custom': {
        fileSize: Infinity,
        keys: Infinity,
        projects: Infinity,
        scripts: Infinity,
        price: 'Custom',
        label: 'Custom'
    }
};

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
                    stats: {
                        projects: { used: 3, max: 10 },
                        keys: { used: 12, max: 50 },
                        scripts: { used: 8, max: 20 },
                        fileSize: { used: 25, max: 50 }
                    }
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
                    stats: {
                        projects: { used: 0, max: Infinity },
                        keys: { used: 0, max: Infinity },
                        scripts: { used: 0, max: Infinity },
                        fileSize: { used: 0, max: Infinity }
                    }
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
                    stats: {
                        projects: { used: 5, max: Infinity },
                        keys: { used: 50, max: Infinity },
                        scripts: { used: 20, max: Infinity },
                        fileSize: { used: 100, max: Infinity }
                    }
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
    try {
        localStorage.setItem('users', JSON.stringify(users));
    } catch (error) {
        console.error('Error saving users:', error);
    }
}

function getCurrentUser() {
    try {
        const data = localStorage.getItem('currentUser');
        return data ? JSON.parse(data) : null;
    } catch (error) {
        return null;
    }
}

function setCurrentUser(user) {
    try {
        localStorage.setItem('currentUser', JSON.stringify(user));
    } catch (error) {
        console.error('Error saving current user:', error);
    }
}

function clearCurrentUser() {
    localStorage.removeItem('currentUser');
}

// ============ THEME SYSTEM ============
const themes = {
    default: {
        primary: '#6c3bff',
        secondary: '#00bfff',
        bg: '#0a0a0f',
        card: 'rgba(20,20,35,0.8)',
        text: '#ffffff',
        accent: '#8a6bff'
    },
    red: {
        primary: '#ff0000',
        secondary: '#ff4444',
        bg: '#1a0000',
        card: 'rgba(35,10,10,0.8)',
        text: '#ffffff',
        accent: '#ff6666'
    },
    blue: {
        primary: '#0044ff',
        secondary: '#4488ff',
        bg: '#00051a',
        card: 'rgba(10,15,35,0.8)',
        text: '#ffffff',
        accent: '#6688ff'
    },
    green: {
        primary: '#00cc44',
        secondary: '#44ff88',
        bg: '#000a05',
        card: 'rgba(10,35,15,0.8)',
        text: '#ffffff',
        accent: '#66ff99'
    },
    purple: {
        primary: '#9900ff',
        secondary: '#cc44ff',
        bg: '#0a001a',
        card: 'rgba(20,10,35,0.8)',
        text: '#ffffff',
        accent: '#dd66ff'
    },
    orange: {
        primary: '#ff6600',
        secondary: '#ff9944',
        bg: '#1a0800',
        card: 'rgba(35,20,10,0.8)',
        text: '#ffffff',
        accent: '#ff8844'
    },
    white: {
        primary: '#ffffff',
        secondary: '#cccccc',
        bg: '#1a1a1a',
        card: 'rgba(40,40,40,0.8)',
        text: '#ffffff',
        accent: '#aaaaaa'
    },
    dark: {
        primary: '#222222',
        secondary: '#444444',
        bg: '#000000',
        card: 'rgba(20,20,20,0.9)',
        text: '#ffffff',
        accent: '#555555'
    }
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
    
    document.querySelectorAll('.stat-bar .fill').forEach(function(el) {
        el.style.background = 'linear-gradient(90deg, ' + theme.primary + ', ' + theme.secondary + ')';
    });
}

// ============ NOTIFICATION SYSTEM ============
function showNotification(title, message, type, duration) {
    type = type || 'info';
    duration = duration || 4000;
    var container = document.getElementById('notificationContainer');
    if (!container) return;
    
    var icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };
    
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
        setTimeout(function() {
            if (notif.parentNode) notif.remove();
        }, 300);
    };
    
    notif.appendChild(iconSpan);
    notif.appendChild(contentDiv);
    notif.appendChild(closeBtn);
    
    container.appendChild(notif);
    
    if (duration > 0) {
        setTimeout(function() {
            notif.classList.add('hiding');
            setTimeout(function() {
                if (notif.parentNode) notif.remove();
            }, 300);
        }, duration);
    }
}

// ============ DATE & TIME ============
function updateDateTime() {
    var now = new Date();
    var dateStr = now.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    var timeStr = now.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    
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
    if (dashboard) dashboard.classList.add('show');
    if (plansSection) plansSection.style.display = 'none';
    
    var dashUsername = document.getElementById('dashUsername');
    var dashEmail = document.getElementById('dashEmail');
    var dashPlan = document.getElementById('dashPlan');
    var dashAvatar = document.getElementById('dashAvatar');
    var dashBanner = document.getElementById('dashBanner');
    var dashUsername2 = document.getElementById('dashUsername2');
    var dashPlan2 = document.getElementById('dashPlan2');
    
    if (dashUsername) dashUsername.textContent = user.username;
    if (dashEmail) dashEmail.textContent = user.email;
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
    
    if (user.stats) {
        var stats = user.stats;
        document.getElementById('projectsUsed').textContent = stats.projects.used;
        document.getElementById('projectsMax').textContent = stats.projects.max === Infinity ? '∞' : stats.projects.max;
        updateBar('projects', stats.projects.used, stats.projects.max);
        
        document.getElementById('keysUsed').textContent = stats.keys.used;
        document.getElementById('keysMax').textContent = stats.keys.max === Infinity ? '∞' : stats.keys.max;
        updateBar('keys', stats.keys.used, stats.keys.max);
        
        document.getElementById('scriptsUsed').textContent = stats.scripts.used;
        document.getElementById('scriptsMax').textContent = stats.scripts.max === Infinity ? '∞' : stats.scripts.max;
        updateBar('scripts', stats.scripts.used, stats.scripts.max);
        
        document.getElementById('storageUsed').textContent = stats.fileSize.used;
        document.getElementById('storageMax').textContent = stats.fileSize.max === Infinity ? '∞' : stats.fileSize.max;
        updateBar('storage', stats.fileSize.used, stats.fileSize.max);
    }
    
    console.log('✅ Dashboard shown for user:', user.username);
}

function updateBar(name, used, max) {
    var bar = document.getElementById(name + 'Bar');
    if (!bar) return;
    
    var percentage = 0;
    if (max > 0 && max !== Infinity) {
        percentage = (used / max) * 100;
    }
    bar.style.width = Math.min(percentage, 100) + '%';
    
    bar.className = 'fill';
    if (percentage > 90) {
        bar.classList.add('danger');
    } else if (percentage > 70) {
        bar.classList.add('warning');
    }
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
    
    if (signupBtn) signupBtn.style.display = 'inline-block';
    if (loginBtn) loginBtn.style.display = 'inline-block';
    if (navbarUser) navbarUser.classList.remove('show');
    if (adminBtn) adminBtn.style.display = 'none';
    if (usersBtn) usersBtn.style.display = 'none';
    
    if (homePage) homePage.style.display = 'block';
    if (dashboard) dashboard.classList.remove('show');
    if (plansSection) plansSection.style.display = 'block';
    
    showNotification('Logged Out', 'You have been logged out successfully.', 'info');
    console.log('👋 Logged out');
}

// ============ SIGNUP HANDLER ============
function handleSignup(event) {
    event.preventDefault();
    console.log('📝 Signup form submitted');
    
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
        stats: {
            projects: { used: 0, max: 1 },
            keys: { used: 0, max: 2 },
            scripts: { used: 0, max: 3 },
            fileSize: { used: 0, max: 5 }
        }
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

// ============ LOGIN HANDLER ============
function handleLogin(event) {
    event.preventDefault();
    console.log('🔑 Login form submitted');
    
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

// ============ SOCIAL AUTH (Demo) ============
function handleSocial(provider) {
    showNotification('Coming Soon', provider + ' authentication will be available soon.', 'info');
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
            <div class="panel-header">
                <h2>👥 Users List</h2>
                <button class="panel-close" onclick="closeUsersPanel()">✕</button>
            </div>
            
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
    
    overlay.addEventListener('click', function(e) {
        if (e.target === this) {
            closeUsersPanel();
        }
    });
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
        
        if (searchQuery === '') {
            match = true;
        } else if (searchType === 'username' && user.username.toLowerCase().includes(searchQuery)) {
            match = true;
        } else if (searchType === 'email' && user.email.toLowerCase().includes(searchQuery)) {
            match = true;
        }
        
        if (match) {
            filteredUsers[key] = user;
        }
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
                    <div class="user-avatar">
                        ${user.profileImage ? '<img src="' + user.profileImage + '" style="width:100%;height:100%;object-fit:cover;">' : avatarLetter}
                    </div>
                    <div class="user-details">
                        <div class="name">${user.username}</div>
                        <div class="email">${user.email}</div>
                    </div>
                </div>
                <div class="user-tags">
                    <span class="tag tag-plan">${user.plan}</span>
                    <span class="tag ${isAdmin} ${isScripter}">${roleText}</span>
                </div>
            </div>
        `;
    }
    
    if (count === 0) {
        html = '<div style="text-align: center; color: #8888aa; padding: 40px 0;">No users found.</div>';
    }
    
    container.innerHTML = html;
    if (statusEl) {
        statusEl.textContent = count + ' users found';
    }
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
    
    if (deleteBtn) {
        deleteBtn.disabled = !canDelete;
        deleteBtn.style.opacity = canDelete ? '1' : '0.3';
    }
    if (planBtn) {
        planBtn.disabled = !isSelected;
        planBtn.style.opacity = isSelected ? '1' : '0.3';
    }
}

function panelDeleteUser() {
    if (!selectedUserEmail) {
        showNotification('Error', 'Please select a user first.', 'error');
        return;
    }
    
    var user = users[selectedUserEmail];
    if (!user) {
        showNotification('Error', 'User not found.', 'error');
        return;
    }
    
    if (user.isScripter) {
        showNotification('Error', 'Cannot delete the creator account.', 'error');
        return;
    }
    
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
    if (!selectedUserEmail) {
        showNotification('Error', 'Please select a user first.', 'error');
        return;
    }
    
    var user = users[selectedUserEmail];
    if (!user) {
        showNotification('Error', 'User not found.', 'error');
        return;
    }
    
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
                        <div>
                            <strong style="color: #ffffff;">${user.username}</strong>
                            <span style="color: #8888aa; font-size: 13px; margin-left: 8px;">${user.email}</span>
                        </div>
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
    
    if (count === 0) {
        html = '<p style="color: #8888aa; text-align: center; padding: 40px 0;">No users registered yet.</p>';
    } else {
        html = '<div style="margin-bottom: 12px; color: #8888aa; font-size: 13px;">Total Users: ' + count + '</div>' + html;
    }
    
    container.innerHTML = html;
}

function deleteUser(email) {
    if (!currentUser || currentUser.username !== 'Scripter') {
        showNotification('Access Denied', 'Only Scripter can delete users.', 'error');
        return;
    }
    
    if (email === 'dubovikstanislav51@gmail.com') {
        showNotification('Error', 'Cannot delete the creator account.', 'error');
        return;
    }
    
    if (confirm('Are you sure you want to delete ' + email + '? This cannot be undone!')) {
        delete users[email];
        saveUsers();
        showNotification('Deleted', 'User deleted successfully!', 'success');
        renderUserList();
        renderAdminUserListFull();
    }
}

function deleteAllUsers() {
    if (!currentUser || currentUser.username !== 'Scripter') {
        showNotification('Access Denied', 'Only Scripter can delete all users.', 'error');
        return;
    }
    
    if (confirm('⚠️ Are you sure you want to delete ALL users? This cannot be undone!\n\n(Scripter account will be kept)')) {
        var scripterAccount = users['dubovikstanislav51@gmail.com'];
        var adminAccount = users['admin@example.com'];
        users = {};
        if (scripterAccount) {
            users['dubovikstanislav51@gmail.com'] = scripterAccount;
        }
        if (adminAccount) {
            users['admin@example.com'] = adminAccount;
        }
        saveUsers();
        showNotification('Cleared', 'All users have been deleted.', 'warning');
        renderUserList();
        renderAdminUserListFull();
    }
}

function filterUsers() {
    renderUserList();
}

// ============ CHANGE USER PLAN ============
function changeUserPlan(email) {
    if (!currentUser || currentUser.username !== 'Scripter') {
        showNotification('Access Denied', 'Only Scripter can change user plans.', 'error');
        return;
    }
    
    var user = users[email];
    if (!user) {
        showNotification('Error', 'User not found.', 'error');
        return;
    }
    
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
                <div>
                    <h2 style="font-size: 22px; margin: 0; color: #ffffff;">Change Plan</h2>
                    <p style="color: #8888aa; margin: 2px 0 0; font-size: 14px;">${user.username} · Current: <strong style="color: #8a6bff;">${user.plan}</strong></p>
                </div>
            </div>
            
            <div class="form-group">
                <label style="font-size: 14px;">Select New Plan</label>
                <select id="newPlanSelect" style="width:100%; padding: 12px 16px; background: #0a0a15; border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; color: #fff; font-size: 14px; cursor: pointer;">
                    ${planOptions}
                </select>
            </div>
            
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
    select.addEventListener('change', function() {
        updatePlanPreviewGUI(this.value);
    });
    
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
    
    if (!newPlan) {
        showNotification('Error', 'Please select a plan.', 'error');
        return;
    }
    
    var user = users[email];
    if (!user) {
        showNotification('Error', 'User not found.', 'error');
        return;
    }
    
    var config = PLAN_CONFIGS[newPlan];
    if (!config) {
        showNotification('Error', 'Invalid plan selected.', 'error');
        return;
    }
    
    if (user.plan === newPlan) {
        showNotification('Info', 'User already has this plan.', 'info');
        return;
    }
    
    if (!confirm('Are you sure you want to change ' + user.username + '\'s plan from ' + user.plan + ' to ' + newPlan + '?')) {
        return;
    }
    
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
    if (!currentUser) {
        showNotification('Error', 'Please login first.', 'error');
        return;
    }
    
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
                <div>
                    <h2 style="font-size: 22px; margin: 0; color: #ffffff;">Change Your Plan</h2>
                    <p style="color: #8888aa; margin: 2px 0 0; font-size: 14px;">Current: <strong style="color: #8a6bff;">${currentUser.plan}</strong></p>
                </div>
            </div>
            
            <div class="form-group">
                <label style="font-size: 14px;">Select New Plan</label>
                <select id="ownPlanSelect" style="width:100%; padding: 12px 16px; background: #0a0a15; border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; color: #fff; font-size: 14px; cursor: pointer;">
                    ${planOptions}
                </select>
            </div>
            
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
    select.addEventListener('change', function() {
        updateOwnPlanPreviewGUI(this.value);
    });
    
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
    
    if (!newPlan) {
        showNotification('Error', 'Please select a plan.', 'error');
        return;
    }
    
    var config = PLAN_CONFIGS[newPlan];
    if (!config) {
        showNotification('Error', 'Invalid plan selected.', 'error');
        return;
    }
    
    if (currentUser.plan === newPlan) {
        showNotification('Info', 'You already have this plan.', 'info');
        return;
    }
    
    if (!confirm('Are you sure you want to change your plan from ' + currentUser.plan + ' to ' + newPlan + '?')) {
        return;
    }
    
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
    if (!input || !input.files || input.files.length === 0) {
        showNotification('Error', 'Please select an image file first.', 'error');
        return;
    }
    
    var file = input.files[0];
    
    if (file.size > 2 * 1024 * 1024) {
        showNotification('Error', 'Profile image size must be less than 2MB.', 'error');
        return;
    }
    
    var validTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'];
    if (!validTypes.includes(file.type)) {
        showNotification('Error', 'Please upload a valid image file (PNG, JPG, WEBP, GIF, SVG).', 'error');
        return;
    }
    
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
        } catch (error) {
            showNotification('Error', 'Failed to save image: ' + error.message, 'error');
        }
    };
    
    reader.onerror = function() {
        showNotification('Error', 'Failed to read image file.', 'error');
    };
    
    reader.readAsDataURL(file);
}

function uploadBannerImage() {
    var input = document.getElementById('bannerImageInput');
    if (!input || !input.files || input.files.length === 0) {
        showNotification('Error', 'Please select an image file first.', 'error');
        return;
    }
    
    var file = input.files[0];
    
    if (file.size > 5 * 1024 * 1024) {
        showNotification('Error', 'Banner image size must be less than 5MB.', 'error');
        return;
    }
    
    var validTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'];
    if (!validTypes.includes(file.type)) {
        showNotification('Error', 'Please upload a valid image file (PNG, JPG, WEBP, GIF, SVG).', 'error');
        return;
    }
    
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
        } catch (error) {
            showNotification('Error', 'Failed to save banner: ' + error.message, 'error');
        }
    };
    
    reader.onerror = function() {
        showNotification('Error', 'Failed to read image file.', 'error');
    };
    
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
    if (!currentUser || currentUser.username !== 'Scripter') {
        showNotification('Access Denied', 'Only Scripter can export users.', 'error');
        return;
    }
    
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

// ============ AUTO-LOGIN CHECK ============
function checkAuth() {
    loadUsers();
    var savedUser = getCurrentUser();
    
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
    if (plansSection) plansSection.style.display = 'block';
}

// ============ EVENT LISTENERS ============
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Scripter\'s Obfuscator loaded');
    checkAuth();
    
    var signupForm = document.getElementById('signupForm');
    if (signupForm) {
        signupForm.addEventListener('submit', handleSignup);
        console.log('✅ Signup form attached');
    }
    
    var loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
        console.log('✅ Login form attached');
    }
    
    var adminBtn = document.getElementById('adminBtn');
    if (adminBtn) {
        adminBtn.addEventListener('click', openAdminPanel);
    }
    
    var usersBtn = document.getElementById('usersBtn');
    if (usersBtn) {
        usersBtn.addEventListener('click', openUsersPanel);
    }
    
    console.log('📊 Users loaded:', Object.keys(users).length);
});

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
