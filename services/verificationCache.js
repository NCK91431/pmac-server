/* 创建验证码缓存工具  */
class VerificationCache {
    constructor() {
        this.cache = new Map();
    }

    storeCode(phone, code) {
        // 5分钟有效期
        const expiresAt = Date.now() + 300000;
        this.cache.set(phone, { code, expiresAt });
    }

    verifyCode(phone, code) {
        const record = this.cache.get(phone);

        if (!record) return false;
        if (Date.now() > record.expiresAt) {
            this.cache.delete(phone);
            return false;
        }

        const isValid = record.code === code;
        if (isValid) this.cache.delete(phone);
        return isValid;
    }
}

module.exports = new VerificationCache();
