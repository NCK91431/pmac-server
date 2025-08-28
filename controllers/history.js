/* 历史记录控制器  */
const Record = require("../models/Record");
const path = require("path");
const fs = require("fs");

class HistoryController {
    static async listRecords(req, res) {
        try {
            const records = await Record.findByUserId(req.user.id); // 获取所有记录
            const tree = HistoryController.buildRecordTree(records); // 构建树状结构
            res.json(tree);
        } catch (error) {
            console.error("获取历史记录失败:", error);
            res.status(500).json({ error: "获取历史记录失败" });
        }
    }

    /**
     * 构建树状记录结构
     * @param {Array} records - 所有记录
     * @returns {Array} - 树状结构
     */
    static buildRecordTree(records) {
        // 创建ID映射
        const recordMap = {};
        records.forEach((record) => {
            recordMap[record.id] = {
                id: record.id,
                mode: record.mode,
                customer_type: record.customer_type,
                location: record.location,
                forecast_range: record.forecast_range,
                created_at: record.created_at,
                upload_date_range: record.upload_date_range
                    ? typeof record.upload_date_range === "string"
                        ? JSON.parse(record.upload_date_range)
                        : record.upload_date_range
                    : [],
                // 获取预测日期（预测数据的第一天）
                prediction_date:
                    record.prediction_data && record.prediction_data.dates
                        ? record.prediction_data.dates[0]
                        : null,
                previous_record_id: record.previous_record_id,
                children: [],
            };
        });

        // 构建树
        const tree = [];
        records.forEach((record) => {
            const node = recordMap[record.id];

            if (record.previous_record_id) {
                // 添加到父节点
                const parent = recordMap[record.previous_record_id];
                if (parent) {
                    parent.children.push(node);
                }
            } else {
                // 根节点
                tree.push(node);
            }
        });

        return tree;
    }
    static async getRecordDetail(req, res) {
        try {
            const { id } = req.params;
            const record = await Record.findByIdAndUserId(id, req.user.id);
            if (!record) {
                return res.status(404).json({ error: "记录不存在或无权访问" });
            }

            // 解析预测数据
            if (typeof record.prediction_data === "string") {
                record.prediction_data = JSON.parse(record.prediction_data);
            }

            // 添加树状结构需要的字段
            const formattedRecord = {
                id: record.id,
                mode: record.mode,
                customer_type: record.customer_type,
                pv_config: record.pv_config,
                pv_capacity: record.pv_capacity,
                location: record.location,
                forecast_range: record.forecast_range,
                created_at: record.created_at,
                upload_date_range: record.upload_date_range
                    ? typeof record.upload_date_range === "string"
                        ? JSON.parse(record.upload_date_range)
                        : record.upload_date_range
                    : [],
                prediction_date: record.prediction_data.dates[0],
                prediction_data: record.prediction_data,
                previous_record_id: record.previous_record_id,
            };

            res.json(formattedRecord);
        } catch (error) {
            console.error("获取记录详情失败:", error);
            res.status(500).json({ error: "获取记录详情失败" });
        }
    }

    static async downloadFile(req, res) {
        try {
            const { id, type } = req.params;
            const record = await Record.findById(id);

            if (!record) {
                return res.status(404).json({ error: "记录不存在" });
            }

            const filePath =
                type === "upload"
                    ? record.upload_file_path
                    : record.result_file_path;

            if (!fs.existsSync(filePath)) {
                return res.status(404).json({ error: "文件不存在" });
            }

            const fileName = path.basename(filePath);
            res.download(filePath, fileName);
        } catch (error) {
            console.error("下载文件失败:", error);
            res.status(500).json({ error: "下载文件失败" });
        }
    }

    static async deleteRecord(req, res) {
        try {
            const { id } = req.params;

            // 验证记录是否属于当前用户
            const record = await Record.findByIdAndUserId(id, req.user.id);
            if (!record) {
                return res.status(404).json({ error: "记录不存在或无权访问" });
            }

            // 删除记录并获取被删除的记录信息
            const deleteResult = await Record.delete(id);

            if (!deleteResult || deleteResult.affectedRows === 0) {
                return res.status(404).json({ error: "记录不存在或已被删除" });
            }

            // 删除相关文件
            // const { record } = deleteResult;

            // 异步删除文件，不阻塞响应
            const deleteFiles = async () => {
                try {
                    // 删除上传文件
                    if (record.upload_file_path) {
                        await fs.unlink(record.upload_file_path);
                    }

                    // 删除结果文件
                    if (record.result_file_path) {
                        await fs.unlink(record.result_file_path);
                    }
                } catch (fileError) {
                    console.error("删除文件失败:", fileError);
                    // 文件删除失败不影响主要操作
                }
            };

            // 启动文件删除任务
            deleteFiles();

            res.json({
                success: true,
                message: "记录删除成功",
            });
        } catch (error) {
            console.error("删除记录失败:", error);
            res.status(500).json({
                error: "删除记录失败",
                details: error.message,
            });
        }
    }
}

module.exports = HistoryController;
// 以上代码定义了一个历史记录控制器，包含以下功能：
// 1. 列出所有历史记录
// 2. 获取单条记录的详细信息，包括预测数据
// 3. 下载上传的文件或预测结果文件
// 使用了Record模型与数据库交互，处理文件下载时使用了Node.js的fs模块和path模块来处理文件路径和下载逻辑。
// 错误处理也进行了相应的处理，确保在发生错误时返回适当的响应。
