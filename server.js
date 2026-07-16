// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { Pool } = require('pg');
const { createInitialBoard, hasValidMoves, playMove } = require('./gamelogic');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database Setup
const useDB = !!process.env.DATABASE_URL;
let pool = null;
let localUsersDB = {}; // Iyi niyo ibika users mu gihe utari kuri PostgreSQL

if (useDB) {
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
    console.log("🔌 PostgreSQL Mode Active");
}

// API: Get or Create User (Iyi ni ngombwa kugira ngo user aboneke)
app.post('/api/user/get-or-create', (req, res) => {
    const { userId, username } = req.body;
    if (!useDB) {
        if (!localUsersDB[userId]) {
            localUsersDB[userId] = { id: userId, username: username, wallet_balance: 1000 };
        }
        res.json(localUsersDB[userId]);
    } else {
        // Hano wakongeramo query yo muri DB niba ari ngombwa
        res.json({ id: userId, username: username, status: "DB_MODE" });
    }
});

// API: Deposit Money
app.post('/api/wallet/deposit', async (req, res) => {
    const { userId, amount } = req.body;
    try {
        if (useDB) {
            await pool.query('UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2', [amount, userId]);
            res.json({ success: true, message: "Amafaranga yongewemo" });
        } else {
            if (localUsersDB[userId]) {
                localUsersDB[userId].wallet_balance += amount;
                res.json({ success: true, message: "Amafaranga yongewemo" });
            } else {
                res.status(404).json({ success: false, message: "User ntiboneka" });
            }
        }
    } catch (err) {
        res.status(500).json({ success: false, error: "Database error" });
    }
});

// API: Withdraw Money
app.post('/api/wallet/withdraw', async (req, res) => {
    const { userId, amount } = req.body;
    try {
        if (useDB) {
            await pool.query('UPDATE users SET wallet_balance = wallet_balance - $1 WHERE id = $2', [amount, userId]);
            res.json({ success: true, message: "Kubikuza byagenze neza" });
        } else {
            if (localUsersDB[userId] && localUsersDB[userId].wallet_balance >= amount) {
                localUsersDB[userId].wallet_balance -= amount;
                res.json({ success: true, message: "Kubikuza byagenze neza" });
            } else {
                res.status(400).json({ success: false, message: "Balance ntihagije" });
            }
        }
    } catch (err) {
        res.status(500).json({ success: false, error: "Database error" });
    }
});

// Socket.IO (Game Logic)
io.on('connection', (socket) => {
    socket.on('join_queue', async (userData) => {
        let user;
        if (!useDB) {
            user = localUsersDB[userData.id] || userData;
        } else {
            const result = await pool.query('SELECT * FROM users WHERE id = $1', [userData.id]);
            user = result.rows[0];
        }

        if (!user || user.wallet_balance < 200) {
            socket.emit('error_message', 'Amafaranga ntahagije (200 RWF).');
            return;
        }
        // ... (Ibisigaye bya Socket logic yawe nkuko byari biri)
    });
    
    // ... (Game Logic izi zindi zose nka make_move nkuko wazituye)
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Baza Migambi Running on ${PORT}`));