const pool = require("../config/db");

class User {
    static async findByPhone(phone) {
        const [rows] = await pool.execute(
            `SELECT * FROM users WHERE phone = ?`,
            [phone]
        );
        return rows[0];
    }

    static async createOrUpdate(userData) {
        const { name, phone, company } = userData;

        // 检查用户是否存在
        const existingUser = await this.findByPhone(phone);

        if (existingUser) {
            // 更新现有用户
            await pool.execute(
                `UPDATE users SET name = ?, company = ? WHERE phone = ?`,
                [name, company, phone]
            );
            return existingUser;
        }

        // 创建新用户
        const [result] = await pool.execute(
            `INSERT INTO users (name, phone, company) VALUES (?, ?, ?)`,
            [name, phone, company]
        );

        return {
            id: result.insertId,
            name,
            phone,
            company,
        };
    }

    static async findById(id) {
        const [rows] = await pool.execute(`SELECT * FROM users WHERE id = ?`, [
            id,
        ]);
        return rows[0];
    }
}

module.exports = User;
