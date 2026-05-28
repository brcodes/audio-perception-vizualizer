const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests/smoke',
    timeout: 30000,
    fullyParallel: false,
    retries: 1,
    use: {
        baseURL: 'http://127.0.0.1:4173',
        headless: true,
        trace: 'on-first-retry',
    },
    webServer: {
        command: 'python3 -m http.server 4173',
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: true,
        timeout: 120000,
    },
});
