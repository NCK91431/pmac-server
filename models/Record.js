/* 数据库模型 */
const pool = require("../config/db");

class Record {
    static async create(record) {
        const {
            customerType,
            pvConfig,
            province,
            city,
            district,
            forecastRange,
            uploadFilePath,
            resultFilePath,
            predictionData,
        } = record;

        const [result] = await pool.execute(
            `INSERT INTO forecast_records 
      (customer_type, pv_config, province, city, district, forecast_range, 
       upload_file_path, result_file_path, prediction_data, created_at) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
                customerType,
                pvConfig,
                province,
                city,
                district,
                forecastRange,
                uploadFilePath,
                resultFilePath,
                JSON.stringify(predictionData), // 确保predictionData是JSON字符串
            ]
        );

        return result.insertId;
    }

    static async findAll() {
        const [rows] = await pool.query(`
      SELECT id, customer_type, pv_config, province, city, district, 
             forecast_range, created_at 
      FROM forecast_records 
      ORDER BY created_at DESC
    `);
        return rows;
    }

    static async findById(id) {
        const [rows] = await pool.execute(
            `SELECT * FROM forecast_records WHERE id = ?`,
            [id]
        );
        return rows[0];
    }

    static async delete(id) {
        // 先获取记录以获取文件路径
        const record = await this.findById(id);

        if (!record) {
            return null;
        }

        // 删除数据库记录
        const [result] = await pool.execute(
            `DELETE FROM forecast_records WHERE id = ?`,
            [id]
        );

        return {
            affectedRows: result.affectedRows,
            record, // 返回被删除的记录以便删除文件
        };
    }
}

module.exports = Record;
