/**
 * 中国农业银行纪念币预约填写助手
 * 基于 DYexb 的纪念币信息填写助手修改。
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const AGRICULTURAL_BANK_DOMAIN = 'eapply.abchina.com';

function isAgriculturalBankPage() {
    return window.location.hostname === AGRICULTURAL_BANK_DOMAIN;
}

function validateData(data) {
    if (!data || typeof data !== 'object') return false;

    const requiredFields = ['userName', 'idCard', 'phone'];
    if (requiredFields.some((field) => !data[field] || typeof data[field] !== 'string')) return false;

    const idCardReg = /(^\d{15}$)|(^\d{17}(\d|X|x)$)/;
    const phoneReg = /^1[3-9]\d{9}$/;
    return idCardReg.test(data.idCard) && phoneReg.test(data.phone);
}

function safeQuerySelector(selectors) {
    const selectorList = Array.isArray(selectors) ? selectors : [selectors];
    for (const selector of selectorList) {
        try {
            const element = document.querySelector(selector);
            if (element) return element;
        } catch (error) {
            console.warn('选择器执行失败:', selector, error);
        }
    }
    return null;
}

function triggerEvent(element, eventType) {
    element.dispatchEvent(new Event(eventType, { bubbles: true }));
}

function fillInput(selectors, value) {
    const element = safeQuerySelector(selectors);
    if (!element || !value) return false;

    element.value = value;
    ['input', 'change', 'blur'].forEach((eventType) => triggerEvent(element, eventType));
    return true;
}

function selectOption(select, value) {
    if (!select || !value) return false;

    const normalizedValue = value.trim();
    const option = Array.from(select.options).find((candidate) => {
        const text = candidate.text.trim();
        return text === normalizedValue || candidate.value === normalizedValue ||
            text.includes(normalizedValue) || normalizedValue.includes(text);
    });

    if (!option) return false;
    select.value = option.value;
    ['input', 'change', 'blur'].forEach((eventType) => triggerEvent(select, eventType));
    return true;
}

function waitForSelect(selector, timeout = 6000) {
    return new Promise((resolve) => {
        const startedAt = Date.now();
        const timer = setInterval(() => {
            const element = safeQuerySelector(selector);
            if (element && element.tagName === 'SELECT') {
                clearInterval(timer);
                resolve(element);
            } else if (Date.now() - startedAt >= timeout) {
                clearInterval(timer);
                resolve(null);
            }
        }, 100);
    });
}

async function fillAgriculturalBankRegion(data) {
    const levels = [
        { selector: '#orglevel1', value: data.province, label: '省级分行' },
        { selector: '#orglevel2', value: data.city, label: '市级分行' },
        { selector: '#orglevel3', value: data.district, label: '支行/区级机构' }
    ];

    let filledCount = 0;
    for (const level of levels) {
        if (!level.value) break;

        const select = await waitForSelect(level.selector);
        if (!select) {
            console.warn(`未等到农行${level.label}下拉框: ${level.selector}`);
            break;
        }
        if (!selectOption(select, level.value)) {
            console.warn(`农行${level.label}没有匹配项: ${level.value}`);
            break;
        }
        filledCount++;
    }
    return filledCount;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action !== 'fillPersonalInfo') return false;

    if (!isAgriculturalBankPage()) {
        sendResponse({ success: false, error: '请在中国农业银行纪念币预约页面使用此功能' });
        return false;
    }
    if (!validateData(request.data)) {
        sendResponse({ success: false, error: '数据格式错误' });
        return false;
    }

    (async () => {
        const data = request.data;
        let filledFields = 0;
        if (fillInput(['#name', 'input[name="name"]'], data.userName)) filledFields++;
        if (fillInput(['#identNo', 'input[name="identNo"]'], data.idCard)) filledFields++;
        if (fillInput(['#mobile', 'input[name="mobile"]'], data.phone)) filledFields++;

        const regionFilled = await fillAgriculturalBankRegion(data);
        filledFields += regionFilled;
        sendResponse({
            success: true,
            filledFields,
            regionFilled,
            message: `成功填充 ${filledFields} 个字段`,
            bank: AGRICULTURAL_BANK_DOMAIN
        });
    })().catch((error) => {
        console.error('农业银行信息填写错误:', error);
        sendResponse({ success: false, error: '填写过程发生错误，请刷新页面后重试' });
    });

    return true;
});
