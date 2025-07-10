/* 历史记录控制器  */
const Record = require("../models/Record");
const path = require("path");
const fs = require("fs");

class HistoryController {
    static async listRecords(req, res) {
        try {
            const records = await Record.findByUserId(req.user.id); // 只返回当前用户的记录
            res.json(records);
        } catch (error) {
            console.error("获取历史记录失败:", error);
            res.status(500).json({ error: "获取历史记录失败" });
        }
    }

    static async getRecordDetail(req, res) {
        try {
            const { id } = req.params;
            const record = await Record.findByIdAndUserId(id, req.user.id); // 验证记录是否属于当前用户
            if (!record) {
                return res.status(404).json({ error: "记录不存在或无权访问" });
            }

            if (typeof record.prediction_data === "string") {
                record.predictionData = JSON.parse(record.prediction_data); // 解析预测数据
            } else {
                record.predictionData = record.prediction_data; // 直接赋值
            }

            res.json(record);
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
