/* controller 历史记录-光伏发电预测 */
const Elec = require("../models/Elec");
const path = require("path");
const fs = require("fs");

class ElecHistoryController {
    static async listRecords(req, res) {
        try {
            // 获取所有记录
            const records = await Elec.findByUserId(req.user.id);
            debugger;
            // 构建树状结构
            const tree = ElecHistoryController.buildRecordTree(records);

            res.json(tree);
        } catch (error) {
            console.error("获取光伏记录失败:", error.message);
            res.status(500).json({
                error: `获取光伏记录失败:" ${error.message}`,
            });
        }
    }

    /* 构建树状结构 */
    static buildRecordTree(records) {
        const recordMap = {};
        records.forEach((record) => {
            recordMap[record.id] = {
                id: record.id,
                // location: record.location,
                pv_capacity: record.pv_capacity,
                created_at: record.created_at,
                upload_date_range: record.upload_info.date_range,
                forecast_date: record.forecast_result?.date || null,
                previous_record_id: record.previous_record_id,
                children: [],
            };
        });

        const tree = [];
        records.forEach((record) => {
            const node = recordMap[record.id];

            if (record.previous_record_id) {
                const parent = recordMap[record.previous_record_id];
                if (parent) parent.children.push(node);
            } else {
                tree.push(node);
            }
        });

        return tree;
    }

    static async getRecordDetail(req, res) {
        try {
            const { id } = req.params;
            const record = await Elec.findByIdAndUserId(id, req.user.id);

            if (!record) {
                return res.status(404).json({ error: "记录不存在或无权访问" });
            }

            res.json({
                id: record.id,
                user_id: record.user_id,
                location: record.location,
                pv_capacity: record.pv_capacity,
                created_at: record.created_at,
                upload_info: record.upload_info,
                forecast_result: record.forecast_result,
                previous_record_id: record.previous_record_id,
            });
        } catch (error) {
            console.error("获取光伏记录详情失败:", error);
            res.status(500).json({ error: "获取光伏记录详情失败" });
        }
    }

    static async downloadFile(req, res) {
        try {
            const { id, type } = req.params;
            const record = await Elec.findById(id);

            if (!record) {
                return res.status(404).json({ error: "记录不存在" });
            }

            let filePath;
            if (type === "upload") {
                filePath = record.upload_info.file_path;
            } else if (type === "result") {
                filePath = record.forecast_result.file_path;
            } else {
                return res.status(400).json({ error: "无效的文件类型" });
            }

            if (!fs.existsSync(filePath)) {
                return res.status(404).json({ error: "文件不存在" });
            }

            const fileName = path.basename(filePath);
            res.download(filePath, fileName);
        } catch (error) {
            console.error("下载光伏文件失败:", error);
            res.status(500).json({ error: "下载文件失败" });
        }
    }

    static async deleteRecord(req, res) {
        try {
            const { id } = req.params;
            const record = await Elec.findByIdAndUserId(id, req.user.id);

            if (!record) {
                return res.status(404).json({ error: "记录不存在或无权访问" });
            }

            // 删除记录
            await Elec.delete(id);

            // 异步删除文件
            const deleteFiles = async () => {
                try {
                    // 删除上传文件
                    if (record.upload_info && record.upload_info.file_path) {
                        fs.unlinkSync(record.upload_info.file_path);
                    }

                    // 删除结果文件
                    if (
                        record.forecast_result &&
                        record.forecast_result.file_path
                    ) {
                        fs.unlinkSync(record.forecast_result.file_path);
                    }
                } catch (fileError) {
                    console.error("删除光伏发电预测记录失败:", fileError);
                }
            };

            deleteFiles();

            res.json({ success: true, message: "光伏发电预测记录删除成功" });
        } catch (error) {
            console.error("删除光伏发电预测记录失败:", error);
            res.status(500).json({ error: "删除记录失败" });
        }
    }
}

module.exports = ElecHistoryController;
