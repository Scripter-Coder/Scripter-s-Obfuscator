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
    
    document.getElementById('currentDate').textContent = dateStr;
    document.getElementById('currentTime').textContent = timeStr;
}

updateDateTime();
setInterval(updateDateTime, 1000);

// ============ MODAL CONTROLS ============
function openModal(type) {
    document.getElementById(type + 'Modal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal(type) {
    document.getElementById(type + 'Modal').classList.remove('active');
    document.body.style.overflow = '';
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
        document.getElementById('homePage').style.display = 'block';
        document.getElementById('dashboard').classList.remove('show');
    }
}

// ============ UI UPDATE ============
function updateUIForUser(user) {
    isLoggedIn = true;
    currentUser = user;
    setCurrentUser(user);
    
    // Show user info in navbar
    document.getElementById('signupBtn').style.display = 'none';
    document.getElementById('loginBtn').style.display = 'none';
    document.getElementById('navbarUser').classList.add('show');
    
    document.getElementById('userAvatar').textContent = user.username.charAt(0).toUpperCase();
    document.getElementById('userName').textContent = user.username;
    document.getElementById('userPlan').textContent = user.plan || 'Basic';
    
    // Show dashboard
    document.getElementById('homePage').style.display = 'none';
    document.getElementById('dashboard').classList.add('show');
    
    // Update dashboard header
    document.getElementById('dashUsername').textContent = user.username;
    document.getElementById('dashEmail').textContent = user.email;
    document.getElementById('dashPlan').textContent = '📊 Current Plan: ' + (user.plan || 'Basic');
    
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
    document.getElementById(name + 'Used').textContent = used;
    document.getElementById(name + 'Max').textContent = max;
    
    var percentage = max > 0 ? (used / max) * 100 : 0;
    var bar = document.getElementById(name + 'Bar');
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
    
    document.getElementById('signupBtn').style.display = 'inline-block';
    document.getElementById('loginBtn').style.display = 'inline-block';
    document.getElementById('navbarUser').classList.remove('show');
    
    document.getElementById('homePage').style.display = 'block';
    document.getElementById('dashboard').classList.remove('show');
    
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
        password: btoa(password), // Simple encoding (not secure, but works for demo)
        plan: 'Basic',
        description: description || '',
        createdAt: new Date().toISOString(),
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
            document.getElementById('homePage').style.display = 'block';
        }
    } else {
        document.getElementById('homePage').style.display = 'block';
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

// ============ INIT ============
document.addEventListener('DOMContentLoaded', function() {
    checkAuth();
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
