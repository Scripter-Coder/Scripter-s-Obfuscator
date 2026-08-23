const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_key_change_this';
const USERS_FILE = './users.json';

// ============ MIDDLEWARE ============
app.use(cors());
app.use(express.json());

// ============ DATABASE FUNCTIONS ============
// Read users from file
function readUsers() {
    try {
        if (fs.existsSync(USERS_FILE)) {
            const data = fs.readFileSync(USERS_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Error reading users file:', error);
    }
    return {};
}

// Write users to file
function writeUsers(users) {
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    } catch (error) {
        console.error('Error writing users file:', error);
    }
}

// ============ PLAN CONFIGURATIONS ============
const PLANS = {
    'Basic': {
        fileSize: 5,
        keys: 2,
        projects: 1,
        scripts: 3,
        price: 0
    },
    'Advanced': {
        fileSize: 50,
        keys: 50,
        projects: 10,
        scripts: 20,
        price: 5
    },
    'Pro': {
        fileSize: 200,
        keys: 200,
        projects: 50,
        scripts: 100,
        price: 10
    },
    'God': {
        fileSize: 1024,
        keys: Infinity,
        projects: Infinity,
        scripts: Infinity,
        price: 20
    },
    'Custom': {
        fileSize: Infinity,
        keys: Infinity,
        projects: Infinity,
        scripts: Infinity,
        price: 'Custom'
    }
};

// ============ AUTH MIDDLEWARE ============
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, message: 'Access token required' });
    }

    try {
        const user = jwt.verify(token, JWT_SECRET);
        req.user = user;
        next();
    } catch (error) {
        return res.status(403).json({ success: false, message: 'Invalid or expired token' });
    }
}

// ============ API ROUTES ============

// ===== SIGNUP =====
app.post('/api/signup', async (req, res) => {
    try {
        const { email, username, password, description, plan } = req.body;

        // Validate required fields
        if (!email || !username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email, username, and password are required'
            });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid email format'
            });
        }

        // Validate password length
        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 6 characters'
            });
        }

        // Read existing users
        const users = readUsers();

        // Check if user already exists
        if (users[email]) {
            return res.status(409).json({
                success: false,
                message: 'User with this email already exists'
            });
        }

        // Check if username is taken
        for (const key in users) {
            if (users[key].username === username) {
                return res.status(409).json({
                    success: false,
                    message: 'Username is already taken'
                });
            }
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user
        const userPlan = plan || 'Basic';
        const planConfig = PLANS[userPlan] || PLANS['Basic'];

        const user = {
            id: Date.now().toString(),
            email,
            username,
            password: hashedPassword,
            plan: userPlan,
            description: description || '',
            createdAt: new Date().toISOString(),
            stats: {
                projects: { used: 0, max: planConfig.projects },
                keys: { used: 0, max: planConfig.keys },
                scripts: { used: 0, max: planConfig.scripts },
                fileSize: { used: 0, max: planConfig.fileSize }
            }
        };

        // Save user
        users[email] = user;
        writeUsers(users);

        // Generate JWT token
        const token = jwt.sign(
            { id: user.id, email: user.email, username: user.username },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        // Return user data (without password)
        const { password: _, ...userData } = user;

        res.status(201).json({
            success: true,
            message: 'Account created successfully!',
            token,
            user: userData
        });

    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// ===== LOGIN =====
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }

        const users = readUsers();
        const user = users[email];

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Check password
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Generate JWT token
        const token = jwt.sign(
            { id: user.id, email: user.email, username: user.username },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        // Return user data (without password)
        const { password: _, ...userData } = user;

        res.json({
            success: true,
            message: 'Logged in successfully!',
            token,
            user: userData
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// ===== GET USER (Protected) =====
app.get('/api/user', authenticateToken, (req, res) => {
    try {
        const users = readUsers();
        let userData = null;

        // Find user by ID or email
        for (const key in users) {
            if (users[key].id === req.user.id || users[key].email === req.user.email) {
                const { password, ...user } = users[key];
                userData = user;
                break;
            }
        }

        if (!userData) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            user: userData
        });

    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// ===== UPDATE USER PLAN =====
app.put('/api/user/plan', authenticateToken, async (req, res) => {
    try {
        const { plan } = req.body;

        if (!plan || !PLANS[plan]) {
            return res.status(400).json({
                success: false,
                message: 'Invalid plan selected'
            });
        }

        const users = readUsers();
        let userEmail = null;

        // Find user
        for (const key in users) {
            if (users[key].id === req.user.id) {
                userEmail = key;
                break;
            }
        }

        if (!userEmail) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const planConfig = PLANS[plan];
        users[userEmail].plan = plan;
        users[userEmail].stats.projects.max = planConfig.projects;
        users[userEmail].stats.keys.max = planConfig.keys;
        users[userEmail].stats.scripts.max = planConfig.scripts;
        users[userEmail].stats.fileSize.max = planConfig.fileSize;

        writeUsers(users);

        const { password, ...userData } = users[userEmail];

        res.json({
            success: true,
            message: 'Plan updated successfully!',
            user: userData
        });

    } catch (error) {
        console.error('Update plan error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// ===== VERIFY KEY =====
app.post('/api/verify', async (req, res) => {
    try {
        const { key } = req.body;

        if (!key) {
            return res.status(400).json({
                success: false,
                message: 'Key is required'
            });
        }

        // For demo, check if key exists in users or use a key system
        // You can implement your own key generation/verification logic here
        const users = readUsers();
        let foundUser = null;

        for (const email in users) {
            if (users[email].key === key) {
                const { password, ...user } = users[email];
                foundUser = user;
                break;
            }
        }

        if (foundUser) {
            res.json({
                success: true,
                message: 'Key verified successfully!',
                user: foundUser
            });
        } else {
            // For demo, accept any key that's at least 8 characters
            if (key.length >= 8) {
                res.json({
                    success: true,
                    message: 'Key verified successfully! (Demo mode)',
                    user: {
                        id: Date.now().toString(),
                        username: 'PremiumUser',
                        email: 'premium@example.com',
                        plan: 'Advanced',
                        stats: {
                            projects: { used: 3, max: 10 },
                            keys: { used: 12, max: 50 },
                            scripts: { used: 8, max: 20 },
                            fileSize: { used: 25, max: 50 }
                        }
                    }
                });
            } else {
                res.status(400).json({
                    success: false,
                    message: 'Invalid key'
                });
            }
        }

    } catch (error) {
        console.error('Verify key error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// ===== GET PLANS =====
app.get('/api/plans', (req, res) => {
    res.json({
        success: true,
        plans: PLANS
    });
});

// ===== HEALTH CHECK =====
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString()
    });
});

// ===== START SERVER =====
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📁 Users file: ${USERS_FILE}`);
    console.log(`🔑 JWT Secret: ${JWT_SECRET ? '✅ Set' : '❌ Using default (change this!)'}`);
});
