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
                    stats: {
                        projects: { used: 0, max: Infinity },
                        keys: { used: 0, max: Infinity },
                        scripts: { used: 0, max: Infinity },
                        fileSize: { used: 0, max: Infinity }
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

// ============ NOTIFICATION SYSTEM ============
function showNotification(title, message, type, duration) {
    type = type || 'info';
    duration = duration || 4000;
    var container = document.getElementById('notificationContainer');
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

// ============ PAGE NAVIGATION ============
function showPage(page) {
    if (page === 'home' && isLoggedIn) {
        var homePage = document.getElementById('homePage');
        var dashboard = document.getElementById('dashboard');
        if (homePage) homePage.style.display = 'block';
        if (dashboard) dashboard.classList.remove('show');
    }
}

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
    
    if (signupBtn) signupBtn.style.display = 'none';
    if (loginBtn) loginBtn.style.display = 'none';
    if (navbarUser) navbarUser.classList.add('show');
    
    var avatar = document.getElementById('userAvatar');
    var userName = document.getElementById('userName');
    var userPlan = document.getElementById('userPlan');
    
    if (avatar) avatar.textContent = user.username.charAt(0).toUpperCase();
    if (userName) userName.textContent = user.username;
    if (userPlan) userPlan.textContent = user.plan || 'Basic';
    
    // Show admin button if user is admin
    if (adminBtn && user.isAdmin) {
        adminBtn.style.display = 'inline-block';
    } else if (adminBtn) {
        adminBtn.style.display = 'none';
    }
    
    // Show dashboard
    var homePage = document.getElementById('homePage');
    var dashboard = document.getElementById('dashboard');
    if (homePage) homePage.style.display = 'none';
    if (dashboard) dashboard.classList.add('show');
    
    // Update dashboard header
    var dashUsername = document.getElementById('dashUsername');
    var dashEmail = document.getElementById('dashEmail');
    var dashPlan = document.getElementById('dashPlan');
    
    if (dashUsername) dashUsername.textContent = user.username;
    if (dashEmail) dashEmail.textContent = user.email;
    if (dashPlan) dashPlan.textContent = '📊 Current Plan: ' + (user.plan || 'Basic');
    
    // Update stats
    if (user.stats) {
        var stats = user.stats;
        updateStat('projects', stats.projects.used, stats.projects.max);
        updateStat('keys', stats.keys.used, stats.keys.max);
        updateStat('scripts', stats.scripts.used, stats.scripts.max);
        updateStat('storage', stats.fileSize.used, stats.fileSize.max);
    }
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
    
    if (signupBtn) signupBtn.style.display = 'inline-block';
    if (loginBtn) loginBtn.style.display = 'inline-block';
    if (navbarUser) navbarUser.classList.remove('show');
    if (adminBtn) adminBtn.style.display = 'none';
    
    var homePage = document.getElementById('homePage');
    var dashboard = document.getElementById('dashboard');
    if (homePage) homePage.style.display = 'block';
    if (dashboard) dashboard.classList.remove('show');
    
    showNotification('Logged Out', 'You have been logged out successfully.', 'info');
}

// ============ SIGNUP HANDLER ============
function handleSignup(event) {
    event.preventDefault();
    
    var email = document.getElementById('signupEmail').value.trim();
    var username = document.getElementById('signupUsername').value.trim();
    var password = document.getElementById('signupPassword').value;
    var description = document.getElementById('signupDescription').value.trim();
    
    // Validation
    if (!email || !username || !password) {
        showNotification('Error', 'Please fill in all required fields.', 'error');
        return;
    }
    
    // Email validation
    var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showNotification('Error', 'Please enter a valid email address.', 'error');
        return;
    }
    
    if (password.length < 6) {
        showNotification('Error', 'Password must be at least 6 characters.', 'error');
        return;
    }
    
    // Check if user exists
    if (users[email]) {
        showNotification('Error', 'An account with this email already exists.', 'error');
        return;
    }
    
    // Check if username is taken
    for (var key in users) {
        if (users[key].username.toLowerCase() === username.toLowerCase()) {
            showNotification('Error', 'This username is already taken.', 'error');
            return;
        }
    }
    
    // Create user
    var user = {
        id: 'user_' + Date.now(),
        email: email,
        username: username,
        password: btoa(password),
        plan: 'Basic',
        description: description || '',
        createdAt: new Date().toISOString(),
        isAdmin: false,
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
    
    // Auto-login
    var userData = { ...user };
    delete userData.password;
    updateUIForUser(userData);
}

// ============ LOGIN HANDLER ============
function handleLogin(event) {
    event.preventDefault();
    
    var emailOrUsername = document.getElementById('loginEmail').value.trim();
    var password = document.getElementById('loginPassword').value;
    
    if (!emailOrUsername || !password) {
        showNotification('Error', 'Please fill in all fields.', 'error');
        return;
    }
    
    // Find user by email or username
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
    
    // Check password (decode from base64)
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
}

// ============ SOCIAL AUTH (Demo) ============
function handleSocial(provider) {
    showNotification('Coming Soon', provider + ' authentication will be available soon.', 'info');
}

// ============ ADMIN FUNCTIONS ============
function openAdminPanel() {
    if (!currentUser || !currentUser.isAdmin) {
        showNotification('Access Denied', 'You do not have admin permissions.', 'error');
        return;
    }
    
    openModal('admin');
    renderUserList();
}

function renderUserList() {
    var container = document.getElementById('userList');
    if (!container) return;
    
    var html = '';
    var count = 0;
    
    for (var key in users) {
        count++;
        var user = users[key];
        var createdDate = new Date(user.createdAt).toLocaleDateString();
        var isAdmin = user.isAdmin ? '👑 Admin' : '👤 User';
        
        html += `
            <div style="background: rgba(20,20,35,0.6); border-radius: 10px; padding: 12px 16px; margin-bottom: 8px; border: 1px solid rgba(255,255,255,0.05);">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                    <div>
                        <strong style="color: #ffffff;">${user.username}</strong>
                        <span style="color: #8888aa; font-size: 13px; margin-left: 8px;">${user.email}</span>
                    </div>
                    <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                        <span style="background: rgba(108,59,255,0.2); color: #8a6bff; padding: 2px 12px; border-radius: 12px; font-size: 11px;">${user.plan}</span>
                        <span style="background: rgba(255,255,255,0.05); color: #8888aa; padding: 2px 12px; border-radius: 12px; font-size: 11px;">${isAdmin}</span>
                        <span style="color: #555577; font-size: 11px;">Joined: ${createdDate}</span>
                    </div>
                </div>
            </div>
        `;
    }
    
    if (count === 0) {
        html = '<p style="color: #8888aa; text-align: center; padding: 40px 0;">No users registered yet.</p>';
    } else {
        html = `<div style="margin-bottom: 12px; color: #8888aa; font-size: 13px;">Total Users: ${count}</div>` + html;
    }
    
    container.innerHTML = html;
}

function exportUsers() {
    if (!currentUser || !currentUser.isAdmin) {
        showNotification('Access Denied', 'You do not have admin permissions.', 'error');
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

function clearAllUsers() {
    if (!currentUser || !currentUser.isAdmin) {
        showNotification('Access Denied', 'You do not have admin permissions.', 'error');
        return;
    }
    
    if (confirm('⚠️ Are you sure you want to delete ALL users? This cannot be undone!')) {
        // Keep admin account
        var adminUser = users['admin@example.com'];
        users = {};
        if (adminUser) {
            users['admin@example.com'] = adminUser;
        }
        saveUsers();
        renderUserList();
        showNotification('Cleared', 'All users have been deleted.', 'warning');
    }
}

// ============ AUTO-LOGIN CHECK ============
function checkAuth() {
    loadUsers();
    var savedUser = getCurrentUser();
    
    if (savedUser) {
        // Verify user still exists in database
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
            var homePage = document.getElementById('homePage');
            if (homePage) homePage.style.display = 'block';
        }
    } else {
        var homePage = document.getElementById('homePage');
        if (homePage) homePage.style.display = 'block';
    }
}

// ============ PLAN UPGRADE (Optional) ============
function upgradePlan(planName) {
    if (!currentUser) {
        showNotification('Error', 'Please login first.', 'error');
        return;
    }
    
    var planLimits = {
        'Basic': { projects: 1, keys: 2, scripts: 3, fileSize: 5 },
        'Advanced': { projects: 10, keys: 50, scripts: 20, fileSize: 50 },
        'Pro': { projects: 50, keys: 200, scripts: 100, fileSize: 200 },
        'God': { projects: Infinity, keys: Infinity, scripts: Infinity, fileSize: 1024 },
        'Custom': { projects: Infinity, keys: Infinity, scripts: Infinity, fileSize: Infinity }
    };
    
    var limits = planLimits[planName];
    if (!limits) {
        showNotification('Error', 'Invalid plan selected.', 'error');
        return;
    }
    
    // Update user in database
    for (var key in users) {
        if (users[key].id === currentUser.id) {
            users[key].plan = planName;
            users[key].stats.projects.max = limits.projects;
            users[key].stats.keys.max = limits.keys;
            users[key].stats.scripts.max = limits.scripts;
            users[key].stats.fileSize.max = limits.fileSize;
            saveUsers();
            
            // Update UI
            var userData = { ...users[key] };
            delete userData.password;
            updateUIForUser(userData);
            
            showNotification('Plan Updated!', 'Your plan has been upgraded to ' + planName, 'success');
            break;
        }
    }
}

// ============ EVENT LISTENERS ============
document.addEventListener('DOMContentLoaded', function() {
    checkAuth();
    
    // Signup form
    var signupForm = document.getElementById('signupForm');
    if (signupForm) {
        signupForm.addEventListener('submit', handleSignup);
    }
    
    // Login form
    var loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    // Admin button
    var adminBtn = document.getElementById('adminBtn');
    if (adminBtn) {
        adminBtn.addEventListener('click', openAdminPanel);
    }
});

// ============ EXPOSE FUNCTIONS TO GLOBAL ============
window.handleSignup = handleSignup;
window.handleLogin = handleLogin;
window.handleSocial = handleSocial;
window.logout = logout;
window.openModal = openModal;
window.closeModal = closeModal;
window.showPage = showPage;
window.upgradePlan = upgradePlan;
window.openAdminPanel = openAdminPanel;
window.renderUserList = renderUserList;
window.exportUsers = exportUsers;
window.clearAllUsers = clearAllUsers;
