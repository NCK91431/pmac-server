/* model 光伏发电预测 */
const pool = require("../config/db");

class Elec {
    static async create(record) {
        const {
            user_id,
            location,
            pv_capacity,
            upload_info,
            previous_record_id,
        } = record;

        const [result] = await pool.execute(
            `INSERT INTO pv_forecast_records 
             (user_id, location, pv_capacity, upload_info, previous_record_id,created_at)
             VALUES (?, ?, ?, ?, ?,NOW())`,
            [
                user_id,
                JSON.stringify(location),
                pv_capacity,
                JSON.stringify(upload_info),
                previous_record_id,
            ]
        );

        return result.insertId;
    }

    static async update(id, fields) {
        const setClauses = [];
        const values = [];

        // 处理更新字段
        if (fields.forecast_result) {
            setClauses.push("forecast_result = ?");
            values.push(JSON.stringify(fields.forecast_result));
        }

        if (setClauses.length === 0) {
            return 0;
        }

        values.push(id);

        const query = `UPDATE pv_forecast_records 
                       SET ${setClauses.join(", ")} 
                       WHERE id = ?`;

        const [result] = await pool.execute(query, values);
        return result.affectedRows;
    }

    static async findByUserId(userId) {
        const [rows] = await pool.execute(
            `SELECT * FROM pv_forecast_records 
             WHERE user_id = ? 
             ORDER BY created_at DESC`,
            [userId]
        );
        // 解析JSON字段
        return rows;
    }

    static async findById(id) {
        const [rows] = await pool.execute(
            `SELECT * FROM pv_forecast_records WHERE id = ?`,
            [id]
        );

        if (rows.length === 0) return null;

        const row = rows[0];
        debugger;
        return row;
    }

    static async findByIdAndUserId(id, userId) {
        const [rows] = await pool.execute(
            `SELECT * FROM pv_forecast_records 
             WHERE id = ? AND user_id = ?`,
            [id, userId]
        );

        if (rows.length === 0) return null;

        const row = rows[0];
        return row;
    }

    static async delete(id) {
        const [result] = await pool.execute(
            `DELETE FROM pv_forecast_records WHERE id = ?`,
            [id]
        );
        return result.affectedRows;
    }

    static async deleteById(id) {
        return this.delete(id);
    }

    /* 递归获取合并数据 */
    static async getMergedData(recordId) {
        // 获取当前记录
        const record = await this.findById(recordId);
        if (!record) throw new Error(`记录 ${recordId} 不存在`);

        // 解析当前记录的上传数据
        let currentData = record.upload_info.data;
        if (!record.previous_record_id) return currentData; // 如果没有父记录，直接返回当前数据

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

    /* 获取记录的最后日期（用于日期连续性检查）*/
    static async getLastDate(recordId) {
        const record = await this.findById(recordId);
        if (!record) throw new Error(`记录 ${recordId} 不存在`);
        return record.upload_info.date_range[1]; // 返回结束日期
    }

    static async getMergedDataWithRange(recordId) {
        // 获取当前记录
        const record = await this.findById(recordId);
        if (!record) {
            throw new Error(`记录 ${recordId} 不存在`);
        }

        // 获取合并数据
        const mergedData = await this.getMergedData(recordId);

        // 获取日期范围
        let dateRange = record.upload_info.date_range;
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

            let currentDateRange = currentRecord.upload_info.date_range;
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
            rootId,
        };
    }
}

module.exports = Elec;
