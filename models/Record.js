/* 数据库模型 */
const pool = require("../config/db");

class Record {
    static async create(record) {
        const {
            user_id,
            mode,
            customer_type,
            pv_config,
            pv_capacity,
            location,
            forecast_range,
            uploadFilePath,
            resultFilePath,
            predictionData,
            uploadDateRange, // 新增字段
            uploadData, // 新增字段
            previous_record_id,
        } = record;

        const [result] = await pool.execute(
            `INSERT INTO forecast_records 
      (user_id,mode,customer_type, pv_config, pv_capacity, location, forecast_range, 
       upload_file_path, result_file_path, prediction_data,upload_date_range, upload_data, previous_record_id, created_at) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
                user_id,
                mode,
                customer_type,
                pv_config,
                pv_capacity,
                location,
                forecast_range,
                uploadFilePath,
                resultFilePath,
                JSON.stringify(predictionData), // 确保predictionData是JSON字符串
                JSON.stringify(uploadDateRange), // 序列化JSON
                JSON.stringify(uploadData), // 序列化JSON
                previous_record_id,
            ]
        );

        return result.insertId;
    }

    static async findByUserId(userId) {
        const [rows] = await pool.execute(
            `SELECT id, customer_type, pv_config, pv_capacity, location, 
             forecast_range, created_at,upload_date_range,prediction_data,previous_record_id,mode
      FROM forecast_records 
      WHERE user_id = ?
      ORDER BY created_at DESC`,
            [userId]
        );
        return rows;
    }

    static async findByIdAndUserId(id, userId) {
        const [rows] = await pool.execute(
            `SELECT * FROM forecast_records WHERE id = ? AND user_id = ?`,
            [id, userId]
        );
        return rows[0];
    }

    static async validateUserRecords(ids, userId) {
        if (!ids || ids.length === 0) {
            return [];
        }

        const placeholders = ids.map(() => "?").join(",");

        const [rows] = await pool.execute(
            `SELECT id FROM forecast_records 
       WHERE id IN (${placeholders}) AND user_id = ?`,
            [...ids, userId]
        );

        return rows.map((row) => row.id);
    }

    static async findAll() {
        const [rows] = await pool.query(`
      SELECT id, customer_type, pv_config, pv_capacity, location, 
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

    /**
     * 递归获取记录及其所有祖先记录的合并数据
     * @param {number} recordId - 记录ID
     * @returns {Promise<Array>} - 合并后的数据
     */
    static async getMergedData(recordId) {
        // 获取当前记录
        const record = await this.findById(recordId);
        if (!record) {
            throw new Error(`记录 ${recordId} 不存在`);
        }

        // 解析当前记录的上传数据
        let currentData = record.upload_data;
        if (typeof currentData === "string") {
            currentData = JSON.parse(currentData);
        }

        // 如果没有父记录，直接返回当前数据
        if (!record.previous_record_id) {
            return currentData;
        }

        // 递归获取父记录的合并数据
        const parentMergedData = await this.getMergedData(
            record.previous_record_id
        );

        // 合并数据：父记录全部 + 当前记录的数据体（去掉表头）
        return [
            ...parentMergedData, // 父记录除最后一行外的所有数据
            ...currentData.slice(1), // 当前记录除表头外的所有数据
        ];
    }
    /**
     * 获取记录的最后日期（用于日期连续性检查）
     * @param {number} recordId - 记录ID
     * @returns {Promise<string>} - 最后日期字符串（YYYY-MM-DD）
     */
    static async getLastDate(recordId) {
        const record = await this.findById(recordId);
        if (!record) {
            throw new Error(`记录 ${recordId} 不存在`);
        }

        // 获取上传日期范围
        let dateRange = record.upload_date_range;
        if (typeof dateRange === "string") {
            dateRange = JSON.parse(dateRange);
        }

        return dateRange[1]; // 返回结束日期
    }
    /**
     * 更新预测记录
     * @param {number} id - 记录ID
     * @param {object} fields - 要更新的字段对象
     * @returns {Promise<number>} - 受影响的行数
     */
    static async update(id, fields) {
        // 构建 SET 子句和值数组
        const setClauses = [];
        const values = [];

        // 遍历字段对象
        for (const [key, value] of Object.entries(fields)) {
            switch (key) {
                case "predictionData":
                    setClauses.push("prediction_data = ?");
                    values.push(JSON.stringify(value));
                    break;
                case "resultFilePath":
                    setClauses.push("result_file_path = ?");
                    values.push(value);
                    break;
                default:
                    console.warn(`忽略未知字段: ${key}`);
            }
        }

        // 如果没有可更新的字段，直接返回
        if (setClauses.length === 0) {
            console.warn("没有提供可更新的字段");
            return 0;
        }

        // 添加 WHERE 条件的值
        values.push(id);

        // 构建 SQL 查询
        const query = `
            UPDATE forecast_records 
            SET ${setClauses.join(", ")}
            WHERE id = ?
        `;

        // 执行更新
        const [result] = await pool.execute(query, values);
        return result.affectedRows;
    }

    /**
     * 根据ID删除记录（不返回被删除的记录）
     * @param {number} id - 记录ID
     * @returns {Promise<number>} - 受影响的行数
     */
    static async deleteById(id) {
        const [result] = await pool.execute(
            `DELETE FROM forecast_records WHERE id = ?`,
            [id]
        );
        return result.affectedRows;
    }

    // 在Record.js中添加以下方法
    static async getMergedDataWithRange(recordId) {
        // 获取当前记录
        const record = await this.findById(recordId);
        if (!record) {
            throw new Error(`记录 ${recordId} 不存在`);
        }

        // 获取合并数据
        const mergedData = await this.getMergedData(recordId);

        // 获取日期范围
        let dateRange = record.upload_date_range;
        if (typeof dateRange === "string") {
            dateRange = JSON.parse(dateRange);
        }

        // 递归获取根记录的起始日期和根记录ID
        let currentRecordId = recordId;
        let startDate = null;
        let rootId = recordId; // 初始化为当前记录ID

        while (currentRecordId) {
            const currentRecord = await this.findById(currentRecordId);
            if (!currentRecord) break;

            let currentDateRange = currentRecord.upload_date_range;
            if (typeof currentDateRange === "string") {
                currentDateRange = JSON.parse(currentDateRange);
            }

            startDate = currentDateRange[0]; // 更新为更早的起始日期
            rootId = currentRecordId; // 更新为当前记录ID（可能是根记录）

            // 继续向上追溯
            currentRecordId = currentRecord.previous_record_id;
        }

        return {
            mergeRange: [startDate, dateRange[1]], // [起始日期, 结束日期]
            mergedData: mergedData,
            rootId, // 添加根记录ID
        };
    }
}

module.exports = Record;
