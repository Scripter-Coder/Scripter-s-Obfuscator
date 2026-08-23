// ============ STATE ============
let currentUser = null;
let isLoggedIn = false;
let users = {};

// ============ DATABASE FUNCTIONS (localStorage) ============
function loadUsers() {
    try {
        const data = localStorage.getItem('users');
        if (data) {
            users = JSON.parse(data);
        } else {
            // Create demo users
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
                // Special Scripter account
                'scripter@example.com': {
                    id: 'user_scripter',
                    email: 'scripter@example.com',
                    username: 'Scripter',
                    password: btoa('scripter123'),
                    plan: 'God',
                    description: 'Creator & Developer',
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
    
    // Apply to body
    document.body.style.background = theme.bg;
    
    // Save theme preference
    if (currentUser) {
        for (var key in users) {
            if (users[key].id === currentUser.id) {
                users[key].theme = themeName;
                saveUsers();
                break;
            }
        }
    }
    
    // Update all cards
    document.querySelectorAll('.plan-card, .stat-card, .dashboard-header, .modal').forEach(function(el) {
        el.style.background = theme.card;
        el.style.borderColor = theme.primary + '40';
    });
    
    // Update buttons
    document.querySelectorAll('.btn-primary').forEach(function(el) {
        el.style.background = 'linear-gradient(135deg, ' + theme.primary + ', ' + theme.secondary + ')';
    });
    
    // Update navbar brand
    var brand = document.querySelector('.navbar-brand');
    if (brand) {
        brand.style.background = 'linear-gradient(135deg, ' + theme.primary + ', ' + theme.secondary + ')';
        brand.style.webkitBackgroundClip = 'text';
        brand.style.webkitTextFillColor = 'transparent';
    }
    
    // Update stat bars
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
    
    // Show user info in navbar
    var signupBtn = document.getElementById('signupBtn');
    var loginBtn = document.getElementById('loginBtn');
    var navbarUser = document.getElementById('navbarUser');
    var adminBtn = document.getElementById('adminBtn');
    var userDropdown = document.getElementById('userDropdown');
    
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
    
    // Show admin button ONLY if username is "Scripter"
    if (adminBtn && user.username === 'Scripter') {
        adminBtn.style.display = 'inline-block';
    } else if (adminBtn) {
        adminBtn.style.display = 'none';
    }
    
    // Show user dropdown for Scripter
    if (userDropdown && user.username === 'Scripter') {
        userDropdown.style.display = 'inline-block';
    } else if (userDropdown) {
        userDropdown.style.display = 'none';
    }
    
    // Apply theme
    if (user.theme) {
        applyTheme(user.theme);
    }
    
    // Show dashboard
    var homePage = document.getElementById('homePage');
    var dashboard = document.getElementById('dashboard');
    var plansSection = document.querySelector('.plans-section');
    
    if (homePage) homePage.style.display = 'none';
    if (dashboard) dashboard.classList.add('show');
    if (plansSection) plansSection.style.display = 'none';
    
    // Update dashboard header
    var dashUsername = document.getElementById('dashUsername');
    var dashEmail = document.getElementById('dashEmail');
    var dashPlan = document.getElementById('dashPlan');
    var dashAvatar = document.getElementById('dashAvatar');
    var dashBanner = document.getElementById('dashBanner');
    
    if (dashUsername) dashUsername.textContent = user.username;
    if (dashEmail) dashEmail.textContent = user.email;
    if (dashPlan) dashPlan.textContent = '📊 Current Plan: ' + (user.plan || 'Basic');
    
    if (dashAvatar && user.profileImage) {
        dashAvatar.innerHTML = '<img src="' + user.profileImage + '" style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:3px solid var(--primary-color);">';
    } else if (dashAvatar) {
        dashAvatar.textContent = user.username.charAt(0).toUpperCase();
        dashAvatar.style.display = 'flex';
        dashAvatar.style.alignItems = 'center';
        dashAvatar.style.justifyContent = 'center';
        dashAvatar.style.fontSize = '32px';
        dashAvatar.style.fontWeight = 'bold';
        dashAvatar.style.background = 'linear-gradient(135deg, var(--primary-color), var(--secondary-color))';
        dashAvatar.style.width = '80px';
        dashAvatar.style.height = '80px';
        dashAvatar.style.borderRadius = '50%';
        dashAvatar.style.color = '#fff';
    }
    
    if (dashBanner && user.bannerImage) {
        dashBanner.style.backgroundImage = 'url(' + user.bannerImage + ')';
        dashBanner.style.backgroundSize = 'cover';
        dashBanner.style.backgroundPosition = 'center';
        dashBanner.style.display = 'block';
    } else if (dashBanner) {
        dashBanner.style.display = 'none';
    }
    
    // Update stats
    if (user.stats) {
        var stats = user.stats;
        updateStat('projects', stats.projects.used, stats.projects.max);
        updateStat('keys', stats.keys.used, stats.keys.max);
        updateStat('scripts', stats.scripts.used, stats.scripts.max);
        updateStat('storage', stats.fileSize.used, stats.fileSize.max);
    }
    
    console.log('✅ Dashboard shown for user:', user.username);
}

function updateStat(name, used, max) {
    var usedEl = document.getElementById(name + 'Used');
    var maxEl = document.getElementById(name + 'Max');
    var bar = document.getElementById(name + 'Bar');
    
    if (usedEl) usedEl.textContent = used;
    if (maxEl) maxEl.textContent = max;
    
    if (bar) {
        var percentage = max > 0 ? (used / max) * 100 : 0;
        bar.style.width = Math.min(percentage, 100) + '%';
        
        bar.className = 'fill';
        if (percentage > 90) {
            bar.classList.add('danger');
        } else if (percentage > 70) {
            bar.classList.add('warning');
        }
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
    var userDropdown = document.getElementById('userDropdown');
    var homePage = document.getElementById('homePage');
    var dashboard = document.getElementById('dashboard');
    var plansSection = document.querySelector('.plans-section');
    
    if (signupBtn) signupBtn.style.display = 'inline-block';
    if (loginBtn) loginBtn.style.display = 'inline-block';
    if (navbarUser) navbarUser.classList.remove('show');
    if (adminBtn) adminBtn.style.display = 'none';
    if (userDropdown) userDropdown.style.display = 'none';
    
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

// ============ ADMIN FUNCTIONS (Only for Scripter) ============
function openAdminPanel() {
    if (!currentUser || currentUser.username !== 'Scripter') {
        showNotification('Access Denied', 'Only Scripter can access the admin panel.', 'error');
        return;
    }
    
    openModal('admin');
    renderUserList();
}

function renderUserList() {
    var container = document.getElementById('userList');
    if (!container) return;
    
    var searchType = document.getElementById('userSearchType') ? document.getElementById('userSearchType').value : 'username';
    var searchQuery = document.getElementById('userSearchQuery') ? document.getElementById('userSearchQuery').value.toLowerCase() : '';
    
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
        var createdDate = new Date(user.createdAt).toLocaleDateString();
        var isAdmin = user.isAdmin ? '👑 Admin' : '👤 User';
        var isScripter = user.isScripter ? '⭐ Creator' : '';
        var avatarLetter = user.username.charAt(0).toUpperCase();
        
        html += `
            <div class="user-item" style="background: rgba(20,20,35,0.6); border-radius: 10px; padding: 12px 16px; margin-bottom: 8px; border: 1px solid rgba(255,255,255,0.05); cursor: pointer;" onclick="showUserDetails('${key}')">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, var(--primary-color), var(--secondary-color)); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 16px; color: #fff;">
                            ${user.profileImage ? '<img src="' + user.profileImage + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">' : avatarLetter}
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
                    </div>
                </div>
            </div>
        `;
    }
    
    if (count === 0) {
        html = '<p style="color: #8888aa; text-align: center; padding: 40px 0;">No users found.</p>';
    } else {
        html = `<div style="margin-bottom: 12px; color: #8888aa; font-size: 13px;">Total Users: ${count}</div>` + html;
    }
    
    container.innerHTML = html;
}

function showUserDetails(email) {
    var user = users[email];
    if (!user) {
        showNotification('Error', 'User not found.', 'error');
        return;
    }
    
    var container = document.getElementById('userList');
    var createdDate = new Date(user.createdAt).toLocaleString();
    
    container.innerHTML = `
        <div style="margin-bottom: 16px;">
            <button onclick="renderUserList()" style="background: none; border: none; color: var(--primary-color); cursor: pointer; font-size: 14px;">← Back to users</button>
        </div>
        <div style="background: rgba(20,20,35,0.6); border-radius: 12px; padding: 20px; border: 1px solid rgba(255,255,255,0.05);">
            <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 16px;">
                <div style="width: 60px; height: 60px; border-radius: 50%; background: linear-gradient(135deg, var(--primary-color), var(--secondary-color)); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 28px; color: #fff;">
                    ${user.profileImage ? '<img src="' + user.profileImage + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">' : user.username.charAt(0).toUpperCase()}
                </div>
                <div>
                    <h3 style="color: #ffffff;">${user.username}</h3>
                    <p style="color: #8888aa; font-size: 14px;">${user.email}</p>
                    <span style="background: rgba(108,59,255,0.2); color: #8a6bff; padding: 2px 12px; border-radius: 12px; font-size: 12px;">${user.plan}</span>
                    ${user.isAdmin ? '<span style="background: rgba(255,215,0,0.2); color: #ffd700; padding: 2px 12px; border-radius: 12px; font-size: 12px; margin-left: 8px;">Admin</span>' : ''}
                    ${user.isScripter ? '<span style="background: rgba(255,215,0,0.3); color: #ffd700; padding: 2px 12px; border-radius: 12px; font-size: 12px; margin-left: 8px;">⭐ Creator</span>' : ''}
                </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 16px 0;">
                <div><span style="color: #8888aa;">Joined:</span> <span style="color: #ffffff;">${createdDate}</span></div>
                <div><span style="color: #8888aa;">Description:</span> <span style="color: #ffffff;">${user.description || 'No description'}</span></div>
            </div>
            <div style="display: flex; gap: 12px; margin-top: 16px; flex-wrap: wrap;">
                ${!user.isAdmin ? `<button onclick="deleteUser('${email}')" style="background: rgba(255,50,50,0.2); color: #ff6b6b; border: 1px solid rgba(255,50,50,0.3); padding: 8px 20px; border-radius: 8px; cursor: pointer; font-size: 13px;">🗑️ Delete User</button>` : ''}
                <button onclick="renderUserList()" style="background: rgba(255,255,255,0.05); color: #8888aa; border: 1px solid rgba(255,255,255,0.1); padding: 8px 20px; border-radius: 8px; cursor: pointer; font-size: 13px;">← Back</button>
            </div>
        </div>
    `;
}

function deleteUser(email) {
    if (!currentUser || currentUser.username !== 'Scripter') {
        showNotification('Access Denied', 'Only Scripter can delete users.', 'error');
        return;
    }
    
    if (email === 'scripter@example.com') {
        showNotification('Error', 'Cannot delete the creator account.', 'error');
        return;
    }
    
    if (confirm('Are you sure you want to delete ' + email + '? This cannot be undone!')) {
        delete users[email];
        saveUsers();
        showNotification('Deleted', 'User deleted successfully!', 'success');
        renderUserList();
    }
}

function deleteAllUsers() {
    if (!currentUser || currentUser.username !== 'Scripter') {
        showNotification('Access Denied', 'Only Scripter can delete all users.', 'error');
        return;
    }
    
    if (confirm('⚠️ Are you sure you want to delete ALL users? This cannot be undone!\n\n(Scripter account will be kept)')) {
        var scripterAccount = users['scripter@example.com'];
        users = {};
        if (scripterAccount) {
            users['scripter@example.com'] = scripterAccount;
        }
        saveUsers();
        showNotification('Cleared', 'All users have been deleted.', 'warning');
        renderUserList();
    }
}

function filterUsers() {
    renderUserList();
}

// ============ IMAGE UPLOAD FUNCTIONS ============
function uploadProfileImage() {
    var input = document.getElementById('profileImageInput');
    if (!input || !input.files || input.files.length === 0) {
        showNotification('Error', 'Please select an image file.', 'error');
        return;
    }
    
    var file = input.files[0];
    var reader = new FileReader();
    
    reader.onload = function(e) {
        var imageData = e.target.result;
        
        // Update user in database
        for (var key in users) {
            if (users[key].id === currentUser.id) {
                users[key].profileImage = imageData;
                saveUsers();
                var userData = { ...users[key] };
                delete userData.password;
                updateUIForUser(userData);
                showNotification('Success', 'Profile image updated!', 'success');
                break;
            }
        }
    };
    
    reader.readAsDataURL(file);
}

function uploadBannerImage() {
    var input = document.getElementById('bannerImageInput');
    if (!input || !input.files || input.files.length === 0) {
        showNotification('Error', 'Please select an image file.', 'error');
        return;
    }
    
    var file = input.files[0];
    var reader = new FileReader();
    
    reader.onload = function(e) {
        var imageData = e.target.result;
        
        for (var key in users) {
            if (users[key].id === currentUser.id) {
                users[key].bannerImage = imageData;
                saveUsers();
                var userData = { ...users[key] };
                delete userData.password;
                updateUIForUser(userData);
                showNotification('Success', 'Banner image updated!', 'success');
                break;
            }
        }
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
window.renderUserList = renderUserList;
window.showUserDetails = showUserDetails;
window.deleteUser = deleteUser;
window.deleteAllUsers = deleteAllUsers;
window.filterUsers = filterUsers;
window.uploadProfileImage = uploadProfileImage;
window.uploadBannerImage = uploadBannerImage;
window.changeTheme = changeTheme;
