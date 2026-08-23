// ============ STATE ============
let currentUser = null;
let isLoggedIn = false;

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
    
    document.getElementById('signupBtn').style.display = 'inline-block';
    document.getElementById('loginBtn').style.display = 'inline-block';
    document.getElementById('navbarUser').classList.remove('show');
    
    document.getElementById('homePage').style.display = 'block';
    document.getElementById('dashboard').classList.remove('show');
    
    showNotification('Logged Out', 'You have been logged out successfully.', 'info');
}

// ============ SIGNUP HANDLER ============
async function handleSignup(event) {
    event.preventDefault();
    
    var email = document.getElementById('signupEmail').value;
    var username = document.getElementById('signupUsername').value;
    var password = document.getElementById('signupPassword').value;
    var description = document.getElementById('signupDescription').value;
    
    if (password.length < 6) {
        showNotification('Error', 'Password must be at least 6 characters.', 'error');
        return;
    }
    
    try {
        var data = await signup(email, username, password, description);
        
        if (data.success) {
            closeModal('signup');
            showNotification('Welcome!', 'Account created successfully! Welcome ' + data.user.username, 'success');
            updateUIForUser(data.user);
            document.getElementById('signupForm').reset();
        } else {
            showNotification('Error', data.message || 'Signup failed', 'error');
        }
    } catch (error) {
        showNotification('Error', 'An error occurred. Please try again.', 'error');
    }
}

// ============ LOGIN HANDLER ============
async function handleLogin(event) {
    event.preventDefault();
    
    var email = document.getElementById('loginEmail').value;
    var password = document.getElementById('loginPassword').value;
    
    if (!email || !password) {
        showNotification('Error', 'Please fill in all fields.', 'error');
        return;
    }
    
    try {
        var data = await login(email, password);
        
        if (data.success) {
            closeModal('login');
            showNotification('Welcome Back!', 'Logged in successfully!', 'success');
            updateUIForUser(data.user);
            document.getElementById('loginForm').reset();
        } else {
            showNotification('Error', data.message || 'Login failed', 'error');
        }
    } catch (error) {
        showNotification('Error', 'An error occurred. Please try again.', 'error');
    }
}

// ============ SOCIAL AUTH ============
function handleSocialSignup(provider) {
    if (provider === 'google') {
        window.location.href = getGoogleAuthUrl();
    } else if (provider === 'discord') {
        window.location.href = getDiscordAuthUrl();
    }
    showNotification('Redirecting', 'Redirecting to ' + provider + '...', 'info');
}

function handleSocialLogin(provider) {
    if (provider === 'google') {
        window.location.href = getGoogleAuthUrl();
    } else if (provider === 'discord') {
        window.location.href = getDiscordAuthUrl();
    }
    showNotification('Redirecting', 'Redirecting to ' + provider + '...', 'info');
}

// ============ AUTO-LOGIN CHECK ============
async function checkAuth() {
    try {
        var data = await getUser();
        if (data.success && data.user) {
            updateUIForUser(data.user);
            showNotification('Welcome Back!', 'You are already logged in.', 'success', 2000);
        } else {
            document.getElementById('homePage').style.display = 'block';
        }
    } catch (error) {
        document.getElementById('homePage').style.display = 'block';
    }
}

// ============ INIT ============
document.addEventListener('DOMContentLoaded', function() {
    checkAuth();
});

// ============ KEY VERIFICATION ============
async function verifyUserKey(key) {
    try {
        var data = await verifyKey(key);
        if (data.success) {
            showNotification('Key Valid', 'Your key has been verified!', 'success');
            if (data.user) {
                updateUIForUser(data.user);
            }
            return true;
        } else {
            showNotification('Invalid Key', data.message || 'This key is not valid.', 'error');
            return false;
        }
    } catch (error) {
        showNotification('Error', 'Failed to verify key.', 'error');
        return false;
    }
}
