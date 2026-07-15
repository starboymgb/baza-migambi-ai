// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { Pool } = require('pg'); 
const { createInitialBoard, hasValidMoves, playMove } = require('./gameLogic');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// 1. DATABASE CONFIGURATION (FALLBACK)
// ==========================================
const useDB = !!process.env.DATABASE_URL;
let pool = null;
let localUsersDB = {}; // Iki ni cyo kigega cy'agateganyo dukoresha kuri Localhost

if (useDB) {
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: {
            rejectUnauthorized: false
        }
    });
    console.log("🔌 PostgreSQL Configured (Production Mode)");
} else {
    console.log("⚠️ WARNING: Nta DATABASE_URL ihari. Turakoresha Local Memory Simulation (Localhost Mode)!");
}

// Gufungura table niba turi kuri Render (Postgres)
const initDb = async () => {
    if (!useDB) return; 
    const queryText = `
        CREATE TABLE IF NOT EXISTS users (
            id VARCHAR(50) PRIMARY KEY,
            username VARCHAR(100) NOT NULL,
            wallet_balance INT DEFAULT 1000
        );
    `;
    try {
        await pool.query(queryText);
        console.log("💾 PostgreSQL Database & Tables initialized successfully!");
    } catch (err) {
        console.error("❌ database initialization failed:", err);
    }
};
initDb();

// ==========================================
// 2. GAME MEMORY STATE
// ==========================================
let activeRooms = {}; 
let onlineQueue = [];

// ==========================================
// 3. API ENDPOINTS
// ==========================================

// Kwandika cyangwa gufata umukinnyi (Get or Create)
app.post('/api/user/get-or-create', async (req, res) => {
    let { userId } = req.body;

    // --- MODO YA LOCALHOST (Nta database ihari) ---
    if (!useDB) {
        if (!userId || !localUsersDB[userId]) {
            const newId = userId || 'user_' + Math.random().toString(36).substring(2, 9);
            localUsersDB[newId] = {
                id: newId,
                username: `Mukinnyi_${Math.random().toString(36).substring(2, 5).toUpperCase()}`,
                wallet_balance: 1000
            };
            userId = newId;
        }
        return res.json({ success: true, user: localUsersDB[userId] });
    }

    // --- MODO YA PRODUCTION (Kuri Render ifite Postgres) ---
    try {
        if (userId) {
            const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
            if (userResult.rows.length > 0) {
                return res.json({ success: true, user: userResult.rows[0] });
            }
        }

        const newId = userId || 'user_' + Math.random().toString(36).substring(2, 9);
        const username = `Mukinnyi_${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
        
        const insertResult = await pool.query(
            'INSERT INTO users (id, username, wallet_balance) VALUES ($1, $2, 1000) RETURNING *',
            [newId, username]
        );
        res.json({ success: true, user: insertResult.rows[0] });
    } catch (err) {
        console.error("Error in get-or-create:", err);
        res.status(500).json({ success: false, error: "Database internal error" });
    }
});

// Gushyiraho Amafaranga (Deposit)
app.post('/api/wallet/deposit', async (req, res) => {
    const { userId, amount } = req.body;

    if (!useDB) {
        if (localUsersDB[userId]) {
            localUsersDB[userId].wallet_balance += Number(amount);
            return res.json({ success: true, balance: localUsersDB[userId].wallet_balance, message: "Deposit yagenze neza!" });
        }
        return res.status(400).json({ success: false, message: "Umukoresha ntabonetse" });
    }

    try {
        const result = await pool.query(
            'UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2 RETURNING wallet_balance',
            [Number(amount), userId]
        );
        if (result.rows.length > 0) {
            return res.json({ success: true, balance: result.rows[0].wallet_balance, message: "Deposit yagenze neza!" });
        }
        res.status(400).json({ success: false, message: "Umukoresha ntabonetse" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Kubikuza (Withdraw)
app.post('/api/wallet/withdraw', async (req, res) => {
    const { userId, amount } = req.body;

    if (!useDB) {
        if (localUsersDB[userId]) {
            if (localUsersDB[userId].wallet_balance >= amount) {
                localUsersDB[userId].wallet_balance -= Number(amount);
                return res.json({ success: true, balance: localUsersDB[userId].wallet_balance, message: "Kubikuza byagenze neza!" });
            }
            return res.json({ success: false, message: "Amafaranga ufite ntabwo ahagije!" });
        }
        return res.status(400).json({ success: false, message: "Umukoresha ntabonetse" });
    }

    try {
        const result = await pool.query(
            'UPDATE users SET wallet_balance = wallet_balance - $1 WHERE id = $2 AND wallet_balance >= $1 RETURNING wallet_balance',
            [Number(amount), userId]
        );
        if (result.rows.length > 0) {
            return res.json({ success: true, balance: result.rows[0].wallet_balance, message: "Kubikuza byagenze neza!" });
        }
        res.json({ success: false, message: "Amafaranga ufite ntabwo ahagije cyangwa umukoresha ntiyabonetse!" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================
// 4. SOCKET.IO REAL-TIME LOGIC
// ==========================================
io.on('connection', (socket) => {
    console.log(`🔌 Umukinnyi mushya yinjiye: ${socket.id}`);

    socket.on('join_queue', async (userData) => {
        try {
            let user = null;

            if (!useDB) {
                user = localUsersDB[userData.id] || userData;
            } else {
                const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [userData.id]);
                if (userResult.rows.length === 0) {
                    socket.emit('error_message', 'Umwirondoro wawe ntiwabonetse mu kigega.');
                    return;
                }
                user = userResult.rows[0];
            }

            if (user.wallet_balance < 200) {
                socket.emit('error_message', 'Amafaranga yawe ntahagije ngo ukine (Ukeneye nibura 200 RWF).');
                return;
            }

            onlineQueue = onlineQueue.filter(p => p.userId !== user.id);
            onlineQueue.push({ socketId: socket.id, userId: user.id, username: user.username });

            console.log(`👥 Umurongo urimo abantu: ${onlineQueue.length}`);

            if (onlineQueue.length >= 2) {
                const player1 = onlineQueue.shift();
                const player2 = onlineQueue.shift();

                const roomId = `room_${player1.userId}_${player2.userId}`;
                
                activeRooms[roomId] = {
                    roomId: roomId,
                    board: createInitialBoard(),
                    p1: player1,
                    p2: player2,
                    turn: player1.socketId
                };

                io.to(player1.socketId).socketsJoin(roomId);
                io.to(player2.socketId).socketsJoin(roomId);

                io.to(player1.socketId).emit('match_found', {
                    roomId: roomId,
                    role: 'player1',
                    opponent: player2.username,
                    yourTurn: true,
                    board: activeRooms[roomId].board
                });

                io.to(player2.socketId).emit('match_found', {
                    roomId: roomId,
                    role: 'player2',
                    opponent: player1.username,
                    yourTurn: false,
                    board: activeRooms[roomId].board
                });
            }
        } catch (err) {
            console.error("Error joining queue:", err);
        }
    });

    socket.on('make_move', async (data) => {
        const { roomId, row, col } = data;
        const game = activeRooms[roomId];

        if (!game) return;
        if (socket.id !== game.turn) return; 

        const playerRole = (socket.id === game.p1.socketId) ? 'player1' : 'player2';

        const result = playMove(game.board, playerRole, row, col);

        if (result.valid) {
            game.board = result.board;
            game.turn = (game.turn === game.p1.socketId) ? game.p2.socketId : game.p1.socketId;

            // Ohereza imiterere mishya n'intambwe z'isandara kuri client
            io.to(roomId).emit('update_board', {
                board: game.board,
                turn: game.turn,
                steps: result.steps 
            });

            const nextPlayerRole = (game.turn === game.p1.socketId) ? 'player1' : 'player2';
            if (!hasValidMoves(game.board, nextPlayerRole)) {
                const winner = (nextPlayerRole === 'player1') ? game.p2 : game.p1;
                const loser = (nextPlayerRole === 'player1') ? game.p1 : game.p2;

                if (!useDB) {
                    if (localUsersDB[winner.userId]) localUsersDB[winner.userId].wallet_balance += 200;
                    if (localUsersDB[loser.userId]) localUsersDB[loser.userId].wallet_balance -= 200;
                } else {
                    try {
                        await pool.query('UPDATE users SET wallet_balance = wallet_balance + 200 WHERE id = $1', [winner.userId]);
                        await pool.query('UPDATE users SET wallet_balance = wallet_balance - 200 WHERE id = $1', [loser.userId]);
                    } catch (dbErr) {
                        console.error("Byanze gushyira intsinzi muri DB:", dbErr);
                    }
                }

                io.to(roomId).emit('game_over', {
                    winnerId: winner.userId,
                    winnerUsername: winner.username
                });

                delete activeRooms[roomId];
            }
        }
    });

    socket.on('disconnect', () => {
        console.log(`🔌 Umukinnyi avuyemo: ${socket.id}`);
        onlineQueue = onlineQueue.filter(p => p.socketId !== socket.id);
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`🚀 Baza Migambi Server is running on port ${PORT}`);
});