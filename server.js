const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const bodyParser = require('body-parser');
const cors = require('cors');
const { chromium } = require('playwright');
const axios = require('axios');

// Render may use a dashboard-level start command and skip package lifecycle
// scripts. Ensure the Chromium binary exists before any execution is started.
try {
    if (!fs.existsSync(chromium.executablePath())) {
        execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['playwright', 'install', 'chromium', 'chromium-headless-shell'], { stdio: 'inherit' });
    }
} catch (err) {
    console.warn('Playwright browser install skipped:', err.message);
}

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static(__dirname));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Simple in-memory run tracking
const runs = {};

function generatePlaywrightFiles(testCases) {
    const outDir = path.join(__dirname, 'generated_tests');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

    // Create package.json for the tests
    const pkg = {
        name: 'generated-playwright-tests',
        version: '1.0.0',
        scripts: {
            test: 'node runner.js'
        },
        dependencies: {
            playwright: '^1.40.0'
        }
    };
    fs.writeFileSync(path.join(outDir, 'package.json'), JSON.stringify(pkg, null, 2));

    // Create a simple Page Object for Sauce Demo
    const pagesDir = path.join(outDir, 'pages');
    if (!fs.existsSync(pagesDir)) fs.mkdirSync(pagesDir);

    const loginPage = `class LoginPage {
    constructor(page) { this.page = page; }
    async goto() { await this.page.goto('https://www.saucedemo.com/'); }
    async username(val) { await this.page.fill('#user-name', val); }
    async password(val) { await this.page.fill('#password', val); }
    async submit() { await this.page.click('#login-button'); }
}
module.exports = LoginPage;
`;
    fs.writeFileSync(path.join(pagesDir, 'loginPage.js'), loginPage);

    const productsPage = `class ProductsPage {
    constructor(page) { this.page = page; }
    async isLoaded() { return this.page.url().includes('inventory.html'); }
    async addToCartByName(name) { const btn = await this.page.locator('text='+name).locator('..').locator('button'); await btn.click(); }
    async cartCount() { const badge = await this.page.$('.shopping_cart_badge'); return badge ? await badge.innerText() : '0'; }
}
module.exports = ProductsPage;
`;
    fs.writeFileSync(path.join(pagesDir, 'productsPage.js'), productsPage);

    // Create runner that executes testCases sequentially using Playwright
    const runner = `const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const LoginPage = require('./pages/loginPage');
const ProductsPage = require('./pages/productsPage');

(async () => {
    const raw = fs.readFileSync(path.join(__dirname, 'testcases.json'), 'utf8');
    const testCases = JSON.parse(raw);
    const results = [];
    const resultsFile = path.join(__dirname, 'results.json');
    const writeResults = () => fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
    writeResults();

    if (!testCases.length) {
        console.log('=== RUN COMPLETE ===');
        return;
    }

    // One browser is reused, but every test gets a fresh context. This keeps the
    // execution strictly sequential while avoiding a new browser process per case.
    let browser;
    try {
        browser = await chromium.launch({ headless: process.env.HEADLESS !== 'false' });
    } catch (err) {
        for (let index = 0; index < testCases.length; index++) {
            results.push({ id: testCases[index].id, title: testCases[index].title, module: testCases[index].module, status: 'failed', error: 'Unable to start Playwright browser: ' + err.message, duration: 0, index: index + 1, total: testCases.length });
            console.log('=== FAIL TC: ' + testCases[index].title + ' => Unable to start Playwright browser: ' + err.message + ' ===');
        }
        writeResults();
        process.exitCode = 1;
        return;
    }

    const validUsers = new Set(['standard_user', 'problem_user', 'performance_glitch_user', 'visual_user', 'error_user']);
    const stepDelay = 250;
    async function loginAs(page, username = 'standard_user', password = 'secret_sauce', showActions = true) {
        await page.goto('https://www.saucedemo.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
        if (showActions) console.log('=== ACTION: Navigate to SauceDemo login page ===');
        await page.waitForTimeout(stepDelay);
        await page.fill('#user-name', username);
        if (showActions) console.log('=== ACTION: Enter username: ' + (username || '[empty]') + ' ===');
        await page.waitForTimeout(stepDelay);
        await page.fill('#password', password);
        if (showActions) console.log('=== ACTION: Enter password: ' + (password || '[empty]') + ' ===');
        await page.waitForTimeout(stepDelay);
        await page.click('#login-button');
        if (showActions) console.log('=== ACTION: Click Login ===');
        await page.waitForTimeout(stepDelay);
        const loginError = page.locator('[data-test="error"]');
        if (showActions && await loginError.isVisible().catch(() => false)) {
            console.log('=== ACTION: Display login error: ' + (await loginError.innerText()) + ' ===');
        }
        await page.waitForLoadState('domcontentloaded').catch(() => {});
        await page.waitForTimeout(500);
    }
    async function assertLoginCase(page, tc) {
        const username = (tc.testData && tc.testData.username) || '';
        const password = (tc.testData && tc.testData.password) || '';
        await loginAs(page, username, password);
        const error = page.locator('[data-test="error"]');
        const expectedSuccess = validUsers.has(username) && password === 'secret_sauce';
        if (expectedSuccess) {
            if (!page.url().includes('/inventory.html')) throw new Error('Successful login did not navigate to the products page');
            if (await page.locator('.inventory_item').count() !== 6) throw new Error('Products page did not show all 6 products');
        } else if (!(await error.isVisible().catch(() => false))) {
            throw new Error('Expected a login validation error for ' + (username || 'empty username'));
        }
    }
    async function loginStandard(page, showActions = true) {
        await loginAs(page, 'standard_user', 'secret_sauce', showActions);
        if (!page.url().includes('/inventory.html')) throw new Error('Standard user login did not reach products page');
    }
    async function addProduct(page, name) {
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        await page.locator('[data-test="add-to-cart-' + slug + '"]').click();
        console.log('=== ACTION: Add product: ' + name + ' ===');
        await page.waitForTimeout(stepDelay);
    }
    async function completeEndToEnd(page) {
        await loginStandard(page, true);
        await addProduct(page, 'Sauce Labs Backpack');
        await addProduct(page, 'Sauce Labs Bike Light');
        await addProduct(page, 'Sauce Labs Bolt T-Shirt');
        if (await page.locator('.shopping_cart_badge').innerText() !== '3') throw new Error('Expected 3 products in cart');
        await page.locator('.shopping_cart_link').click();
        console.log('=== ACTION: Open cart ===');
        await page.waitForTimeout(stepDelay);
        if (await page.locator('.cart_item').count() !== 3) throw new Error('Cart does not contain 3 products');
        await page.locator('[data-test="checkout"]').click();
        console.log('=== ACTION: Open checkout ===');
        await page.waitForTimeout(stepDelay);
        await page.fill('#first-name', 'John');
        await page.fill('#last-name', 'Doe');
        await page.fill('#postal-code', '12345');
        console.log('=== ACTION: Enter first name: John ===');
        await page.waitForTimeout(stepDelay);
        console.log('=== ACTION: Enter last name: Doe ===');
        await page.waitForTimeout(stepDelay);
        console.log('=== ACTION: Enter postal code: 12345 ===');
        await page.waitForTimeout(stepDelay);
        await page.locator('[data-test="continue"]').click();
        console.log('=== ACTION: Submit checkout information ===');
        await page.waitForTimeout(stepDelay);
        if (!page.url().includes('/checkout-step-two.html')) throw new Error('Checkout did not reach order overview');
        await page.locator('[data-test="finish"]').click();
        console.log('=== ACTION: Complete purchase ===');
        await page.waitForTimeout(stepDelay);
        if (!(await page.locator('[data-test="complete-header"]').isVisible())) throw new Error('Order confirmation was not displayed');
        await page.locator('#react-burger-menu-btn').click();
        await page.locator('#logout_sidebar_link').click();
        console.log('=== ACTION: Logout ===');
        await page.waitForTimeout(stepDelay);
        if (!page.url().endsWith('/') || !(await page.locator('#login-button').isVisible())) throw new Error('Logout did not return to the login page');
    }
    async function runModuleCase(page, tc) {
        const title = tc.title;
        // Every module test starts with a visible, verified standard-user login.
        // The test context is isolated, but logout is reserved for the E2E flow.
        await loginStandard(page, true);
        if (tc.module === 'Products') {
            if (title.includes('6 Products')) {
                if (await page.locator('.inventory_item').count() !== 6) throw new Error('Expected 6 products');
            } else if (title.includes('Add Single')) {
                await addProduct(page, 'Sauce Labs Backpack');
                if (await page.locator('.shopping_cart_badge').innerText() !== '1') throw new Error('Single product was not added');
            } else if (title.includes('Add Multiple')) {
                for (const name of ['Sauce Labs Backpack', 'Sauce Labs Bike Light', 'Sauce Labs Bolt T-Shirt']) await addProduct(page, name);
                if (await page.locator('.shopping_cart_badge').innerText() !== '3') throw new Error('Three products were not added');
            } else if (title.includes('Remove Product')) {
                await addProduct(page, 'Sauce Labs Backpack');
                await page.locator('[data-test="remove-sauce-labs-backpack"]').click();
                console.log('=== ACTION: Remove product: Sauce Labs Backpack ===');
                await page.waitForTimeout(stepDelay);
                if (await page.locator('.shopping_cart_badge').count()) throw new Error('Product was not removed');
            } else if (title.includes('Sort')) {
                const option = title.includes('Z-A') ? 'za' : title.includes('Price (Low') ? 'lohi' : title.includes('Price (High') ? 'hilo' : 'az';
                await page.selectOption('[data-test="product-sort-container"]', option);
                console.log('=== ACTION: Sort products: ' + option + ' ===');
                await page.waitForTimeout(stepDelay);
                if (await page.locator('.inventory_item').count() !== 6) throw new Error('Product list changed unexpectedly after sorting');
            }
        } else if (tc.module === 'Cart') {
            await addProduct(page, 'Sauce Labs Backpack');
            await page.locator('.shopping_cart_link').click();
            console.log('=== ACTION: Navigate to cart page ===');
            await page.waitForTimeout(stepDelay);
            if (title.includes('Navigate') && !page.url().includes('/cart.html')) throw new Error('Cart page did not open');
            if (title.includes('Complete Details') && (!(await page.locator('.cart_item').count()) || !(await page.locator('.inventory_item_price').count()))) throw new Error('Cart details are missing');
            if (title.includes('Continue Shopping')) {
                await page.locator('[data-test="continue-shopping"]').click();
                console.log('=== ACTION: Continue shopping ===');
                await page.waitForTimeout(stepDelay);
                if (!page.url().includes('/inventory.html')) throw new Error('Continue shopping did not return to products');
            } else if (title.includes('Remove Single')) {
                await page.locator('[data-test="remove-sauce-labs-backpack"]').click();
                console.log('=== ACTION: Remove product from cart ===');
                await page.waitForTimeout(stepDelay);
                if (await page.locator('.cart_item').count() !== 0) throw new Error('Cart item was not removed');
            } else if (title.includes('Proceed')) {
                await page.locator('[data-test="checkout"]').click();
                console.log('=== ACTION: Proceed to checkout ===');
                await page.waitForTimeout(stepDelay);
                if (!page.url().includes('/checkout-step-one.html')) throw new Error('Checkout page did not open');
            }
        } else if (tc.module === 'Checkout') {
            await addProduct(page, 'Sauce Labs Backpack');
            await page.locator('.shopping_cart_link').click();
            console.log('=== ACTION: Navigate to cart page ===');
            await page.waitForTimeout(stepDelay);
            await page.locator('[data-test="checkout"]').click();
            console.log('=== ACTION: Open checkout ===');
            await page.waitForTimeout(stepDelay);
            const emptyField = title.includes('First Name') ? '#first-name' : title.includes('Last Name') ? '#last-name' : title.includes('Postal') ? '#postal-code' : null;
            if (emptyField) {
                await page.fill('#first-name', emptyField === '#first-name' ? '' : 'John');
                await page.fill('#last-name', emptyField === '#last-name' ? '' : 'Doe');
                await page.fill('#postal-code', emptyField === '#postal-code' ? '' : '12345');
                console.log('=== ACTION: Enter first name: ' + (emptyField === '#first-name' ? '[empty]' : 'John') + ' ===');
                await page.waitForTimeout(stepDelay);
                console.log('=== ACTION: Enter last name: ' + (emptyField === '#last-name' ? '[empty]' : 'Doe') + ' ===');
                await page.waitForTimeout(stepDelay);
                console.log('=== ACTION: Enter postal code: ' + (emptyField === '#postal-code' ? '[empty]' : '12345') + ' ===');
                await page.waitForTimeout(stepDelay);
                await page.locator('[data-test="continue"]').click();
                console.log('=== ACTION: Validate checkout information ===');
                await page.waitForTimeout(stepDelay);
                if (!(await page.locator('[data-test="error"]').isVisible())) throw new Error('Expected checkout validation error');
            } else if (title.includes('Cancel Order from Checkout Info')) {
                await page.locator('[data-test="cancel"]').click();
                console.log('=== ACTION: Cancel order from checkout information ===');
                await page.waitForTimeout(stepDelay);
                if (!page.url().includes('/inventory.html')) throw new Error('Cancel from checkout information did not return to products');
            } else {
                await page.fill('#first-name', 'John'); await page.fill('#last-name', 'Doe'); await page.fill('#postal-code', '12345');
                console.log('=== ACTION: Enter first name: John ===');
                await page.waitForTimeout(stepDelay);
                console.log('=== ACTION: Enter last name: Doe ===');
                await page.waitForTimeout(stepDelay);
                console.log('=== ACTION: Enter postal code: 12345 ===');
                await page.waitForTimeout(stepDelay);
                await page.locator('[data-test="continue"]').click();
                console.log('=== ACTION: Submit checkout information ===');
                await page.waitForTimeout(stepDelay);
                if (!page.url().includes('/checkout-step-two.html')) throw new Error('Order overview did not open');
                if (title.includes('Order Summary')) {
                    if (!(await page.locator('.cart_item').count())) throw new Error('Order summary is empty');
                } else if (title.includes('Complete Purchase')) {
                    await page.locator('[data-test="finish"]').click();
                    console.log('=== ACTION: Complete purchase ===');
                    await page.waitForTimeout(stepDelay);
                    if (!(await page.locator('[data-test="complete-header"]').isVisible())) throw new Error('Purchase confirmation missing');
                } else if (title.includes('Cancel')) {
                    await page.locator('[data-test="cancel"]').click();
                    console.log('=== ACTION: Cancel order from checkout overview ===');
                    await page.waitForTimeout(stepDelay);
                    if (!page.url().includes('/inventory.html')) throw new Error('Cancel did not return to products');
                }
            }
        }
    }

    for (let index = 0; index < testCases.length; index++) {
        const tc = testCases[index];
        const startedAt = Date.now();
        const result = { id: tc.id, title: tc.title, module: tc.module, status: 'running', error: null, duration: 0, index: index + 1, total: testCases.length };
        console.log('=== START TC: ' + tc.title + ' (' + tc.id + ') ===');
        const context = await browser.newContext();
        const page = await context.newPage();
        const login = new LoginPage(page);
        const products = new ProductsPage(page);
        try {
            if (tc.module === 'Login') {
                await assertLoginCase(page, tc);
            } else if (tc.module === 'E2E' || tc.title.includes('End-to-End')) {
                await completeEndToEnd(page);
            } else if (tc.module === 'Logout') {
                await loginStandard(page);
                await page.locator('#react-burger-menu-btn').click();
                await page.locator('#logout_sidebar_link').click();
                if (!(await page.locator('#login-button').isVisible())) throw new Error('Logout did not return to the login page');
            } else {
                await runModuleCase(page, tc);
            }

            // If reached here, mark passed
            result.status = 'passed';
            result.duration = Date.now() - startedAt;
            console.log('=== PASS TC: ' + tc.title + ' ===');
        } catch (err) {
            result.status = 'failed';
            result.error = err.message;
            result.duration = Date.now() - startedAt;
            console.error('=== FAIL TC: ' + tc.title + ' => ' + err.message + ' ===');
            const ss = path.join(__dirname, 'screenshots');
            if (!fs.existsSync(ss)) fs.mkdirSync(ss);
            const fname = path.join(ss, tc.id + '.png');
            try { await page.screenshot({ path: fname, fullPage: true }); } catch(e){ }
        } finally {
            results.push(result);
            writeResults();
            await new Promise(r => setTimeout(r, 500));
            await context.close();
        }
    }

    await browser.close();
    writeResults();
    console.log('=== RUN COMPLETE ===');
})();
`;
    fs.writeFileSync(path.join(outDir, 'runner.js'), runner);

    // Save testcases.json for runner to consume
    fs.writeFileSync(path.join(outDir, 'testcases.json'), JSON.stringify(testCases, null, 2));

    return { outDir };
}

app.post('/generate', async (req, res) => {
    try {
        const { testCases } = req.body;
        if (!testCases || !Array.isArray(testCases)) return res.status(400).json({ error: 'testCases array required' });
        const { outDir } = generatePlaywrightFiles(testCases);
        // Never allow a previous run to be reported as the current run.
        const resultsFile = path.join(outDir, 'results.json');
        fs.writeFileSync(resultsFile, '[]');
        res.json({ success: true, outDir });
    } catch (err) {
        console.error('generate error', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/execute', async (req, res) => {
    try {
        // start runner in generated_tests
        const runId = Date.now().toString(36);
        const workDir = path.join(__dirname, 'generated_tests');
        if (!fs.existsSync(workDir)) return res.status(400).json({ error: 'No generated tests found. Run /generate first.' });

        // Spawn node runner in that directory
        const child = spawn(process.execPath, ['runner.js'], {
            cwd: workDir,
            env: { ...process.env, HEADLESS: process.env.HEADLESS || 'true' },
            stdio: ['ignore', 'pipe', 'pipe']
        });
        runs[runId] = { child, logs: [] };

        child.stdout.on('data', chunk => {
            const msg = chunk.toString();
            runs[runId].logs.push({ t: Date.now(), m: msg });
            console.log('[runner]', msg.trim());
        });
        child.stderr.on('data', chunk => {
            const msg = chunk.toString();
            runs[runId].logs.push({ t: Date.now(), m: msg });
            console.error('[runner err]', msg.trim());
        });

        child.on('exit', code => {
            runs[runId].exitCode = code;
            runs[runId].finishedAt = Date.now();
        });

        res.json({ runId });
    } catch (err) {
        console.error('execute error', err);
        res.status(500).json({ error: err.message });
    }
});

// SSE endpoint to stream logs for a run
app.get('/stream/:runId', (req, res) => {
    const runId = req.params.runId;
    if (!runs[runId]) return res.status(404).send('Run not found');

    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.flushHeaders();

    const sendLogs = () => {
        const data = runs[runId].logs.splice(0);
        for (const d of data) {
            res.write(`data: ${JSON.stringify(d)}\n\n`);
        }
    };

    const interval = setInterval(() => {
        sendLogs();
        if (runs[runId].exitCode !== undefined && runs[runId].logs.length === 0) {
            res.write(`event: done\ndata: ${JSON.stringify({ exitCode: runs[runId].exitCode })}\n\n`);
            clearInterval(interval);
            res.end();
        }
    }, 500);

    req.on('close', () => {
        clearInterval(interval);
    });
});

// Simple endpoint to read generated results
app.get('/generated_tests/screenshots', (req, res) => {
    const screenshotDir = path.join(__dirname, 'generated_tests', 'screenshots');
    if (!fs.existsSync(screenshotDir)) return res.json({ screenshots: [] });
    const screenshots = fs.readdirSync(screenshotDir)
        .filter(file => /\.png$/i.test(file))
        .map(file => ({ name: file, url: '/generated_tests/screenshots/' + encodeURIComponent(file) }));
    res.type('html').send(`<!doctype html><html><head><title>Execution screenshots</title></head><body><h1>Execution screenshots</h1>${screenshots.length ? `<ul>${screenshots.map(item => `<li><a href="${item.url}" target="_blank">${item.name}</a></li>`).join('')}</ul>` : '<p>No failure screenshots were generated.</p>'}</body></html>`);
});

app.get('/results', (req, res) => {
    const file = path.join(__dirname, 'generated_tests', 'results.json');
    if (!fs.existsSync(file)) return res.json({ results: [] });
    const raw = fs.readFileSync(file, 'utf8');
    res.json({ results: JSON.parse(raw) });
});

const port = process.env.PORT || 5000;
if (require.main === module) {
    app.listen(port, () => console.log('Server running on port', port));
}

module.exports = app;
