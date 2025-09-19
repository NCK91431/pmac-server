const express = require("express");
const router = express.Router();

/* 上传文件并返回信息 */
router.post("/", async (req, res) => {
    try {
        const response = {
            success: true,
            result: {
                cityWeatherForecast: [
                    {
                        irradiationForecast: [
                            0, 0, 0, 0, 0, 0, 36, 164, 295, 450, 573, 690, 769,
                            681, 568, 552, 391, 223, 57, 0, 0, 0, 0, 0,
                        ],
                        location: "广东省珠海市香洲区",
                        temperatureForecast: [
                            28.1, 27.9, 27.8, 27.9, 27.8, 27.6, 27.3, 27.3,
                            28.2, 28.6, 29, 29.5, 30.3, 31.1, 31.9, 31.6, 31.5,
                            31.3, 31.1, 30.1, 29.6, 29.1, 28.8, 28.6,
                        ],
                        weatherInfo: {
                            cloud_summary:
                                "凌晨:53%, 上午:77%, 下午:78%, 晚上:45%",
                            temp_max: 31.9,
                            temp_min: 27.3,
                            weather_summary: "局部有云",
                            wind_direction: "东南风(多变)",
                            wind_summary: "轻风(0.7-8.4km/h)",
                        },
                    },
                ],
                customerType: "商超",
                dailyMetrics: {
                    MAE: 0.004,
                    MAPE: 6,
                    RMSE: 0.006,
                    WMAPE: 2.82,
                },
                date: "2025-08-10",
                modelMetrics: {
                    MAE: 0.006,
                    MAPE: 6.96,
                    RMSE: 0.008,
                    WMAPE: 4.23,
                },
                predictionData: [
                    0.04, 0.04, 0.04, 0.03, 0.03, 0.03, 0.03, 0.06, 0.07, 0.2,
                    0.24, 0.25, 0.25, 0.25, 0.24, 0.25, 0.24, 0.24, 0.24, 0.25,
                    0.25, 0.18, 0.06, 0.05,
                ],
                sourseData: [
                    0.04, 0.04, 0.03, 0.04, 0.03, 0.03, 0.04, 0.05, 0.07, 0.2,
                    0.23, 0.25, 0.25, 0.25, 0.24, 0.25, 0.24, 0.25, 0.23, 0.26,
                    0.24, 0.18, 0.05, 0.05,
                ],
                success: true,
            },
        };
        res.json(response);
    } catch (error) {}
});

module.exports = router;
