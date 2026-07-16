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
let localUsersDB = {};

if (useDB) {
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
    console.log("🔌 PostgreSQL Mode Active");
}

// Game State
let activeRooms = {};
let onlineQueue = [];

// API: Deposit Money (Gukemura 404 Error)
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
            
            io.sockets.sockets.get(p1.socketId)?.join(roomId);
            io.sockets.sockets.get(p2.socketId)?.join(roomId);

            io.to(p1.socketId).emit('match_found', { 
                roomId, board: activeRooms[roomId].board, turn: p1.socketId, 
                role: 'player1', opponent: p2.username, yourTurn: true 
            });
            io.to(p2.socketId).emit('match_found', { 
                roomId, board: activeRooms[roomId].board, turn: p1.socketId, 
                role: 'player2', opponent: p1.username, yourTurn: false 
            });
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

                if (useDB) {
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