const axios = require("axios");

class AlgorithmService {
    static async predict(payload, loadData) {
        console.log("AlgorithmService payload:", payload);
        const customer_types_MAP = {
            hospital: "医院",
            mall: "商超",
            discrete: "离散工业",
            continuous: "连续工业",
        };
        let requestData; //先声明
        try {
            // 准备请求数据
            requestData = {
                formData: {
                    userId: payload.userId,
                    recordId: payload.recordId,
                    rootId: payload.rootId,
                    pvConfig: payload.pv_config
                        ? payload.pv_config == "yes"
                            ? "有"
                            : "无"
                        : "不确定",
                    pvCapacity: payload.pv_capacity,
                    location: JSON.parse(payload.location),
                    forecastRange:
                        payload.forecast_range === "4days" ? "D-4" : "D-1",
                    customerType: customer_types_MAP[payload.customer_type],
                },
                loadData,
            };
            // 调用算法部门接口
            const response = await axios.post(
                `http://125.88.36.152:15010/loadForecast/V1`,
                requestData,
                {
                    headers: {
                        "Content-Type": "application/json",
                    },
                }
            );
            console.log("算法接口返回的响应数据", response.data);
            // 转换数据格式
            const result = {
                date: response.data.date,
                values: response.data.predictionData,
            };
            return result;
        } catch (error) {
            console.error("调用算法接口失败:", {
                message: error.message,
                url: `http://125.88.36.152:15010/loadForecast/V1`,
            });
        }
    }

    /* 光伏发电预测 */
    static async elecPredict(payload, loadData) {
        console.log("AlgorithmService.elecPredict payload:", payload);

        let requestData;
        try {
            // 准备请求数据
            requestData = {
                formData: {
                    userId: payload.userId,
                    recordId: payload.recordId,
                    rootId: payload.rootId,
                    capacity: payload.pv_capacity,
                    location: payload.location,
                },
                loadData,
            };
            /*  
            // 调用算法部门接口
            const response = await axios.post(
                `http://10.0.110.169:5011/pvForecast/V1`,
                requestData,
                {
                    headers: {
                        "Content-Type": "application/json",
                    },
                }
            );
            console.log("算法接口返回的响应数据", response.data);
            // 转换数据格式
            const result = {
                date: response.data.date, // 预测的日期
                values: response.data.predictionData, // 预测结果数组
            };
            return result;
			*/

            /* 测试用：生成一个包含96个0-500之间随机数的数组*/
            const generateRandomArray = () => {
                const result = [];
                // 生成96个随机数
                for (let i = 0; i < 96; i++) {
                    // 生成0-500之间的随机整数（包括0和500）
                    const randomNum = Math.floor(Math.random() * 501);
                    result.push(randomNum);
                }
                return result;
            };
            const test_result = {
                date: "2025-08-15",
                values: generateRandomArray(),
            };
            return test_result;
        } catch (error) {
            console.error("调用算法接口失败:", {
                message: error.message,
                url: `http://125.88.36.152:15010/loadForecast/V1`,
            });
        }
    }

    /* 光储定容 */
    static async lightPredict(formData, dayLoadData) {
        // dayLoadData 是24个数值的数组

        try {
            const requestData = {
                storage_cost: Number(formData.storage_cost),
                pv_cost: Number(formData.pv_cost),
                loadData: dayLoadData, // 直接传递24小时负荷数据数组
            };
            console.log("*光储定容算法接口请求参数 ->", requestData);
            const response = await axios.post(
                `http://125.88.36.152:55555/PV_Battery_Sizing/V1.0`,
                requestData,
                {
                    headers: {
                        "Content-Type": "application/json",
                    },
                }
            );
            console.log("*光储定容算法接口返回 ->", response.data);

            // const response = {
            //     data: {
            //         PV_cap_kw: 150.5,
            //         ESS_cap_kwh: 200.0,
            //         P_max_charge_kw: 50.0,
            //         daily_operation_cost: 120.75,
            //         annual_savings: 45000.0,
            //         investment_cost: 180000.0,
            //     },
            // };

            return response.data;
        } catch (error) {
            console.error("调用光储定容算法接口失败:", error.message);
            throw error;
        }
    }
}

module.exports = AlgorithmService;
