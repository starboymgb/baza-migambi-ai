const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Iki ni ngombwa cyane kuri Render Postgres
    }
});

// Gukora table z'agateganyo mu buryo bwa Auto-Migration
const initDb = async () => {
    try {
        // 1. Table y'Abakinnyi (Users)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE,
                phone VARCHAR(15) UNIQUE,
                wallet_balance DECIMAL(10, 2) DEFAULT 0.00,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 2. Table y'Ama-Transactions (Deposit & Withdraw)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS transactions (
                id SERIAL PRIMARY KEY,
                user_id INT REFERENCES users(id) ON DELETE CASCADE,
                type VARCHAR(10) CHECK (type IN ('deposit', 'withdraw')),
                amount DECIMAL(10, 2) NOT NULL,
                phone VARCHAR(15) NOT NULL,
                status VARCHAR(20) DEFAULT 'completed',
                reference VARCHAR(50) UNIQUE NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log('📦 Database Tables initialized/checked successfully!');
    } catch (err) {
        console.error('❌ Error initializing tables:', err.message);
    }
};

const connectDB = async () => {
    try {
        await pool.query('SELECT NOW()');
        console.log('🔌 PostgreSQL Connected successfully to Render!');
        
        // Guhita dutangiza Tables
        await initDb();
    } catch (err) {
        console.error('❌ Database connection failed:', err.message);
        process.exit(1);
    }
};

module.exports = { pool, connectDB };