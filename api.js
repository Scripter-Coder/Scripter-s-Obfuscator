// ============ API CONFIGURATION ============
const API_URL = 'https://vietpolua.cc.cd/api/v1'; // Your API URL
const SCRIPT_ID = 'ScripterHub';

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
