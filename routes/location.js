const express = require("express");
const router = express.Router();
const division = require("china-division");

// 获取完整的省市区树形结构
router.get("/", (req, res) => {
    try {
        // 创建省份映射表
        const provinceMap = new Map();
        division.provinces.forEach((p) => {
            provinceMap.set(p.code, {
                value: p.code,
                label: p.name,
                children: [],
            });
        });

        // 创建城市映射表
        const cityMap = new Map();
        division.cities.forEach((c) => {
            cityMap.set(c.code, {
                value: c.code,
                label: c.name,
                children: [],
            });
            // 关联城市到省份
            if (provinceMap.has(c.provinceCode)) {
                provinceMap
                    .get(c.provinceCode)
                    .children.push(cityMap.get(c.code));
            }
        });

        // 关联区县到城市
        division.areas.forEach((a) => {
            if (cityMap.has(a.cityCode)) {
                cityMap.get(a.cityCode).children.push({
                    value: a.code,
                    label: a.name,
                });
            }
        });

        // 转换为前端需要的数组格式
        const result = Array.from(provinceMap.values());
        res.json({ code: 200, data: result });
    } catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
});

module.exports = router;
