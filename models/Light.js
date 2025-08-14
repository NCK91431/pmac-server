const pool = require("../config/db");

class Light {
    static async create(record) {
        const {
            user_id,
            uploadFilePath,
            uploadDateRange,
            storage_cost,
            pv_cost,
            PV_cap_kw,
            ESS_cap_kwh,
            P_max_charge_kw,
            daily_operation_cost,
            annual_savings,
            investment_cost,
        } = record;
        const [result] = await pool.execute(
            `INSERT INTO light_records 
         (user_id, upload_file_path, upload_date_range, storage_cost, pv_cost, 
          pv_cap_kw, ess_cap_kwh, p_max_charge_kw, daily_operation_cost, annual_savings, investment_cost, 
          created_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
                user_id,
                uploadFilePath,
                JSON.stringify(uploadDateRange),
                storage_cost,
                pv_cost,
                PV_cap_kw,
                ESS_cap_kwh,
                P_max_charge_kw,
                daily_operation_cost,
                annual_savings,
                investment_cost,
            ]
        );
        return result.insertId;
    }

    static async updateResult(id, resultData) {
        const query = `
            UPDATE light_records 
            SET 
                pv_cap_kw = ?,
                ess_cap_kwh = ?,
                p_max_charge_kw = ?,
                daily_operation_cost = ?,
                annual_savings = ?,
                investment_cost = ?,
                updated_at = NOW()
            WHERE id = ?
        `;

        const values = [
            resultData.PV_cap_kw,
            resultData.ESS_cap_kwh,
            resultData.P_max_charge_kw,
            resultData.daily_operation_cost,
            resultData.annual_savings,
            resultData.investment_cost,
            id,
        ];

        const [result] = await pool.execute(query, values);
        return result.affectedRows;
    }

    static async deleteById(id) {
        const [result] = await pool.execute(
            `DELETE FROM light_records WHERE id = ?`,
            [id]
        );
        return result.affectedRows;
    }

    static async findByUserId(userId) {
        const [rows] = await pool.execute(
            `SELECT * FROM light_records 
             WHERE user_id = ?
             ORDER BY created_at DESC`,
            [userId]
        );
        return rows;
    }
    static async findById(id) {
        const [rows] = await pool.execute(
            `SELECT * FROM light_records WHERE id = ?`,
            [id]
        );
        return rows[0];
    }
}

module.exports = Light;
