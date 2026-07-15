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

// Database Setup
const useDB = !!process.env.DATABASE_URL;
let pool = null;
let localUsersDB = {}; 

if (useDB) {
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
    console.log("🔌 PostgreSQL Mode Active");
} else {
    console.log("⚠️ Local Memory Mode Active (Fallback)");
}

// Database Initialization
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
    } catch (err) {
        console.error("DB Init Error:", err);
    }
};
initDb();

// Game State
let activeRooms = {}; 
let onlineQueue = [];

// API Endpoints
app.post('/api/user/get-or-create', async (req, res) => {
    let { userId } = req.body;
    if (!useDB) {
        if (!userId || !localUsersDB[userId]) {
            const newId = userId || 'user_' + Math.random().toString(36).substring(2, 9);
            localUsersDB[newId] = { id: newId, username: `Mukinnyi_${Math.random().toString(36).substring(2, 5).toUpperCase()}`, wallet_balance: 1000 };
            userId = newId;
        }
        return res.json({ success: true, user: localUsersDB[userId] });
    }
    try {
        if (userId) {
            const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
            if (userResult.rows.length > 0) return res.json({ success: true, user: userResult.rows[0] });
        }
        const newId = userId || 'user_' + Math.random().toString(36).substring(2, 9);
        const username = `Mukinnyi_${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
        const insertResult = await pool.query('INSERT INTO users (id, username, wallet_balance) VALUES ($1, $2, 1000) RETURNING *', [newId, username]);
        res.json({ success: true, user: insertResult.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: "Database error" });
    }
});

// Socket.IO
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

        onlineQueue = onlineQueue.filter(p => p.userId !== user.id);
        onlineQueue.push({ socketId: socket.id, userId: user.id, username: user.username });

        if (onlineQueue.length >= 2) {
            const p1 = onlineQueue.shift();
            const p2 = onlineQueue.shift();
            const roomId = `room_${p1.userId}_${p2.userId}`;
            activeRooms[roomId] = { board: createInitialBoard(), p1, p2, turn: p1.socketId };
            io.to(p1.socketId).socketsJoin(roomId);
            io.to(p2.socketId).socketsJoin(roomId);
            io.to(roomId).emit('match_found', { roomId, board: activeRooms[roomId].board, turn: p1.socketId });
        }
    });

    socket.on('make_move', async (data) => {
        const { roomId, row, col } = data;
        const game = activeRooms[roomId];
        if (!game || socket.id !== game.turn) return;

        const role = (socket.id === game.p1.socketId) ? 'player1' : 'player2';
        const result = playMove(game.board, role, row, col);

        if (result.valid) {
            game.board = result.board;
            game.turn = (game.turn === game.p1.socketId) ? game.p2.socketId : game.p1.socketId;
            io.to(roomId).emit('update_board', { board: game.board, turn: game.turn, steps: result.steps });

            if (!hasValidMoves(game.board, (game.turn === game.p1.socketId ? 'player1' : 'player2'))) {
                const winner = (game.turn === game.p1.socketId) ? game.p2 : game.p1;
                const loser = (game.turn === game.p1.socketId) ? game.p1 : game.p2;

                if (!useDB) {
                    localUsersDB[winner.userId].wallet_balance += 200;
                    localUsersDB[loser.userId].wallet_balance -= 200;
                } else {
                    await pool.query('UPDATE users SET wallet_balance = wallet_balance + 200 WHERE id = $1', [winner.userId]);
                    await pool.query('UPDATE users SET wallet_balance = wallet_balance - 200 WHERE id = $1', [loser.userId]);
                }
                io.to(roomId).emit('game_over', { winnerUsername: winner.username });
                delete activeRooms[roomId];
            }
        }
    });

    socket.on('disconnect', () => {
        onlineQueue = onlineQueue.filter(p => p.socketId !== socket.id);
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Baza Migambi Running on ${PORT}`));