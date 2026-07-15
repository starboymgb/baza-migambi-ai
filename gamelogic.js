// gameLogic.js

function createInitialBoard() {
    const board = [];
    for (let r = 0; r < 4; r++) {
        board.push(Array(8).fill(4));
    }
    return board;
}

function hasValidMoves(board, player) {
    const startRow = player === 'player1' ? 0 : 2;
    const endRow = player === 'player1' ? 1 : 3;
    for (let r = startRow; r <= endRow; r++) {
        for (let c = 0; c < 8; c++) {
            if (board[r][c] > 1) return true;
        }
    }
    return false;
}

const PLAYER_PATH = {
    player1: [
        {r: 0, c: 0}, {r: 0, c: 1}, {r: 0, c: 2}, {r: 0, c: 3}, {r: 0, c: 4}, {r: 0, c: 5}, {r: 0, c: 6}, {r: 0, c: 7},
        {r: 1, c: 7}, {r: 1, c: 6}, {r: 1, c: 5}, {r: 1, c: 4}, {r: 1, c: 3}, {r: 1, c: 2}, {r: 1, c: 1}, {r: 1, c: 0}
    ],
    player2: [
        {r: 2, c: 0}, {r: 2, c: 1}, {r: 2, c: 2}, {r: 2, c: 3}, {r: 2, c: 4}, {r: 2, c: 5}, {r: 2, c: 6}, {r: 2, c: 7},
        {r: 3, c: 7}, {r: 3, c: 6}, {r: 3, c: 5}, {r: 3, c: 4}, {r: 3, c: 3}, {r: 3, c: 2}, {r: 3, c: 1}, {r: 3, c: 0}
    ]
};

function getNextPosition(player, r, c) {
    const path = PLAYER_PATH[player];
    const index = path.findIndex(p => p.r === r && p.c === c);
    const nextIndex = (index + 1) % path.length;
    return path[nextIndex];
}

/**
 * Gukina umwobo hamwe no kubika buri snapshot (step) ku buryo bwo gusandaza
 */
function playMove(board, player, startRow, startCol) {
    let seeds = board[startRow][startCol];
    if (seeds <= 1) return { valid: false, board, steps: [] };

    let steps = []; // Aha ni ho tubika buri 'frame' y'umukino kugira ngo tuyisome kuri client
    
    board[startRow][startCol] = 0;
    // Banza ubike step y'uko umwobo watangiye uhawe ubusa
    steps.push({
        board: JSON.parse(JSON.stringify(board)),
        active: { r: startRow, c: startCol }
    });

    let currR = startRow;
    let currC = startCol;

    while (seeds > 0) {
        const next = getNextPosition(player, currR, currC);
        currR = next.r;
        currC = next.c;

        board[currR][currC] += 1;
        seeds--;

        // Bika buri gendo ry'akabuye gasanzwe mu mwobo
        steps.push({
            board: JSON.parse(JSON.stringify(board)),
            active: { r: currR, c: currC }
        });

        // Relay Sowing rules
        if (seeds === 0 && board[currR][currC] > 1) {
            const canCapture = (player === 'player1' && currR === 1) || (player === 'player2' && currR === 2);
            
            if (canCapture) {
                const oppR1 = currR === 1 ? 2 : 1;
                const oppR2 = currR === 1 ? 3 : 0;
                
                if (board[oppR1][currC] > 0 || board[oppR2][currC] > 0) {
                    const captured = board[oppR1][currC] + board[oppR2][currC];
                    board[oppR1][currC] = 0;
                    board[oppR2][currC] = 0;
                    
                    // Snapshot yo kubanza kubona aho imbege ziririwe (zakuwemo)
                    steps.push({
                        board: JSON.parse(JSON.stringify(board)),
                        active: { r: currR, c: currC }
                    });

                    seeds = captured; 
                    continue; 
                }
            }

            // Kwarura umwobo nshya ngo usandaze kandi
            seeds = board[currR][currC];
            board[currR][currC] = 0;
            
            steps.push({
                board: JSON.parse(JSON.stringify(board)),
                active: { r: currR, c: currC }
            });
        }
    }

    return { valid: true, board, steps };
}

module.exports = {
    createInitialBoard,
    hasValidMoves,
    playMove
};