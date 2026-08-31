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
            const elements = Array.from(document.querySelectorAll(selector));
            const visibleElement = elements.find((element) => element.offsetParent !== null);
            if (visibleElement || elements[0]) return visibleElement || elements[0];
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

function getVisibleExchangeInputs() {
    return Array.from(document.querySelectorAll('input[placeholder*="请选择兑换网点"]'))
        .filter((input) => input.offsetParent !== null);
}

function waitForExchangeInput(index, timeout = 6000) {
    return new Promise((resolve) => {
        const startedAt = Date.now();
        const timer = setInterval(() => {
            const input = getVisibleExchangeInputs()[index];
            if (input) {
                clearInterval(timer);
                resolve(input);
            } else if (Date.now() - startedAt >= timeout) {
                clearInterval(timer);
                resolve(null);
            }
        }, 100);
    });
}

function waitForVisibleDropdown(timeout = 6000) {
    return new Promise((resolve) => {
        const startedAt = Date.now();
        const timer = setInterval(() => {
            const dropdown = Array.from(document.querySelectorAll('.el-select-dropdown'))
                .find((element) => element.offsetParent !== null);
            if (dropdown) {
                clearInterval(timer);
                resolve(dropdown);
            } else if (Date.now() - startedAt >= timeout) {
                clearInterval(timer);
                resolve(null);
            }
        }, 100);
    });
}

async function selectElementUiOption(input, value) {
    if (!input || !value) return false;
    input.click();

    const dropdown = await waitForVisibleDropdown();
    if (!dropdown) return false;

    const normalizedValue = value.trim();
    const option = Array.from(dropdown.querySelectorAll('.el-select-dropdown__item:not(.is-disabled)'))
        .find((candidate) => {
            const text = candidate.textContent.trim();
            return text === normalizedValue || text.includes(normalizedValue) || normalizedValue.includes(text);
        });
    if (!option) return false;

    option.click();
    await new Promise((resolve) => setTimeout(resolve, 250));
    return true;
}

async function fillAgriculturalBankRegion(data) {
    const levels = [
        { value: data.province, label: '省级分行' },
        { value: data.city, label: '市级分行' },
        { value: data.district, label: '支行/区级机构' },
        { value: data.exchangeBranch || data.appointmentBranch, label: '兑换网点' }
    ];

    let filledCount = 0;
    for (const [index, level] of levels.entries()) {
        if (!level.value) break;

        const input = await waitForExchangeInput(index, 6000);
        if (!input) {
            console.warn(`未等到农行${level.label}下拉框`);
            break;
        }
        if (!await selectElementUiOption(input, level.value)) {
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
        if (fillInput(['#name', 'input[name="name"]', '.cell .information-input:nth-of-type(1) .el-input__inner'], data.userName)) filledFields++;
        if (fillInput(['#identNo', 'input[name="identNo"]', '.cell .information-input:nth-of-type(3) .el-input__inner'], data.idCard)) filledFields++;
        if (fillInput(['#mobile', 'input[name="mobile"]', '.cell .information-input:nth-of-type(4) .el-input__inner'], data.phone)) filledFields++;

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
