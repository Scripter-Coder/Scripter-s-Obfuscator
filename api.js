// ============ API CONFIGURATION ============
const SCRIPT_ID = 'ScripterHub';
const API_URL = 'https://scripter-obfuscator-api.dubovikstanislav51.workers.dev/api';
const MASTER_KEY = 'test';

// ============ API FUNCTIONS ============
async function apiRequest(endpoint, method, data) {
    try {
        const options = {
            method: method || 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        };
        
        if (data && (method === 'POST' || method === 'PUT')) {
            options.body = JSON.stringify(data);
        }
        
        const response = await fetch(API_URL + endpoint, options);
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        return { success: false, message: 'Network error' };
    }
}

// ============ AUTH API ============
async function signup(email, username, password, description) {
    return await apiRequest('/signup', 'POST', {
        email,
        username,
        password,
        description: description || '',
        script: SCRIPT_ID
    });
}

async function login(email, password) {
    return await apiRequest('/login', 'POST', {
        email,
        password,
        script: SCRIPT_ID
    });
}

async function getUser() {
    return await apiRequest('/user', 'GET');
}

async function verifyKey(key) {
    return await apiRequest('/verify', 'POST', {
        key,
        script: SCRIPT_ID
    });
}

// ============ SOCIAL AUTH ============
function getGoogleAuthUrl() {
    return 'https://accounts.google.com/o/oauth2/auth?' + 
        'client_id=YOUR_GOOGLE_CLIENT_ID&' +
        'redirect_uri=' + encodeURIComponent(window.location.origin + '/auth/google/callback') +
        '&response_type=code&' +
        'scope=email%20profile';
}

function getDiscordAuthUrl() {
    return 'https://discord.com/api/oauth2/authorize?' +
        'client_id=YOUR_DISCORD_CLIENT_ID&' +
        'redirect_uri=' + encodeURIComponent(window.location.origin + '/auth/discord/callback') +
        '&response_type=code&' +
        'scope=identify%20email';
}

// ============ INTEGRATION WITH LOCAL STORAGE ============
// This allows the API to be used alongside the localStorage system
// If the API is down, it falls back to localStorage
window.apiSignup = async function(email, username, password, description) {
    try {
        const result = await signup(email, username, password, description);
        if (result.success) {
            showNotification('API Success', 'Account created via API!', 'success');
            return result;
        } else {
            // Fallback to localStorage
            console.log('API failed, using localStorage fallback');
            // Trigger the existing signup handler
            document.getElementById('signupEmail').value = email;
            document.getElementById('signupUsername').value = username;
            document.getElementById('signupPassword').value = password;
            document.getElementById('signupDescription').value = description || '';
            handleSignup(new Event('submit'));
            return { success: true, message: 'Created via localStorage' };
        }
    } catch (e) {
        console.error('API signup error:', e);
        return { success: false, message: 'Error' };
    }
};

window.apiLogin = async function(email, password) {
    try {
        const result = await login(email, password);
        if (result.success) {
            showNotification('API Success', 'Logged in via API!', 'success');
            return result;
        } else {
            // Fallback to localStorage
            console.log('API failed, using localStorage fallback');
            document.getElementById('loginEmail').value = email;
            document.getElementById('loginPassword').value = password;
            handleLogin(new Event('submit'));
            return { success: true, message: 'Logged in via localStorage' };
        }
    } catch (e) {
        console.error('API login error:', e);
        return { success: false, message: 'Error' };
    }
};
