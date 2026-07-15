const { pool } = require('../config/db');

// 1. GUSHIKANISHA (DEPOSIT) - Sandbox Mock
exports.deposit = async (req, res) => {
    const { phone, amount, userId } = req.body;

    if (!phone || !amount || !userId) {
        return res.status(400).json({ success: false, message: "Uzuza imyanya yose!" });
    }

    try {
        // 1. Gushaka umukinnyi mu muhora wa Postgres
        const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Umukinnyi ntabwo abonetse!" });
        }
        
        const user = userResult.rows[0];
        const reference = "DEP-" + Math.floor(100000 + Math.random() * 900000);
        const newBalance = Number(user.wallet_balance) + Number(amount);

        // Guhita dutangira Transaction (Begin DB Transaction) ngo byose bikorere rimwe
        await pool.query('BEGIN');

        // 2. Kubika Transaction muri database
        await pool.query(
            `INSERT INTO transactions (user_id, type, amount, phone, status, reference) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [userId, 'deposit', amount, phone, 'completed', reference]
        );

        // 3. Guhindura balance y'umukinnyi
        await pool.query('UPDATE users SET wallet_balance = $1 WHERE id = $2', [newBalance, userId]);

        // Gufunga Transaction neza (Commit)
        await pool.query('COMMIT');

        return res.status(200).json({
            success: true,
            message: `Ushyizemo ${amount} RWF neza kuri ${phone}!`,
            balance: newBalance
        });

    } catch (err) {
        await pool.query('ROLLBACK'); // Niba hagize ikanga byose bihite bisubira inyuma
        return res.status(500).json({ success: false, error: err.message });
    }
};

// 2. KUBIKUZA (WITHDRAW) - Sandbox Mock
exports.withdraw = async (req, res) => {
    const { phone, amount, userId } = req.body;

    if (!phone || !amount || !userId) {
        return res.status(400).json({ success: false, message: "Uzuza imyanya yose!" });
    }

    try {
        const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Umukinnyi ntabwo abonetse!" });
        }

        const user = userResult.rows[0];

        // Kureba niba afite amafaranga ahagije
        if (Number(user.wallet_balance) < Number(amount)) {
            return res.status(400).json({ success: false, message: "Amafaranga ufite ntabwo ahagije!" });
        }

        const reference = "WTH-" + Math.floor(100000 + Math.random() * 900000);
        const newBalance = Number(user.wallet_balance) - Number(amount);

        await pool.query('BEGIN');

        // Kubika Transaction
        await pool.query(
            `INSERT INTO transactions (user_id, type, amount, phone, status, reference) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [userId, 'withdraw', amount, phone, 'completed', reference]
        );

        // Kugabanya balance y'umukinnyi
        await pool.query('UPDATE users SET wallet_balance = $1 WHERE id = $2', [newBalance, userId]);

        await pool.query('COMMIT');

        return res.status(200).json({
            success: true,
            message: `Ubikuje ${amount} RWF neza!`,
            balance: newBalance
        });

    } catch (err) {
        await pool.query('ROLLBACK');
        return res.status(500).json({ success: false, error: err.message });
    }
};