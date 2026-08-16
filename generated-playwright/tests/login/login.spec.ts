import { test, expect } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage';
import { ProductsPage } from '../../pages/ProductsPage';

test.describe('Login Module Tests', () => {
  let loginPage: LoginPage;
  let productsPage: ProductsPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    productsPage = new ProductsPage(page);
    await loginPage.navigate();
  });

  // After each test, attempt logout so the next test starts from the login page
  test.afterEach(async ({ page }) => {
    try {
      await page.click('#react-burger-menu-btn');
      await page.waitForSelector('#logout_sidebar_link', { state: 'visible', timeout: 2000 });
      await page.click('#logout_sidebar_link');
      await expect(page.locator('#user-name')).toBeVisible();
    } catch (e) {
      await expect(page.locator('#user-name')).toBeVisible();
    }
  });

  test('TC_LOGIN_001: Valid login with standard_user', async ({ page }) => {
    await loginPage.login('standard_user', 'secret_sauce');
    await expect(page).toHaveURL(/.*inventory.html/);
    await expect(productsPage.getPageTitle()).toBeVisible();
    await expect(productsPage.getProductsCount()).toBe(6);
  });

  test('TC_LOGIN_002: Valid login with problem_user', async ({ page }) => {
    await loginPage.login('problem_user', 'secret_sauce');
    await expect(page).toHaveURL(/.*inventory.html/);
  });

  test('TC_LOGIN_003: Valid login with performance_glitch_user', async ({ page }) => {
    const startTime = Date.now();
    await loginPage.login('performance_glitch_user', 'secret_sauce');
    const endTime = Date.now();
    await expect(page).toHaveURL(/.*inventory.html/);
    console.log(`Login response time: ${endTime - startTime}ms`);
  });

  test('TC_LOGIN_004: Invalid password test', async ({ page }) => {
    await loginPage.login('standard_user', 'wrong_password');
    await expect(loginPage.getErrorMessage()).toBeVisible();
    await expect(loginPage.getErrorMessage()).toContainText('Username and password do not match');
  });

  test('TC_LOGIN_005: Invalid username test', async ({ page }) => {
    await loginPage.login('invalid_user', 'secret_sauce');
    await expect(loginPage.getErrorMessage()).toBeVisible();
    await expect(loginPage.getErrorMessage()).toContainText('Username and password do not match');
  });

  test('TC_LOGIN_006: Empty username validation', async ({ page }) => {
    await loginPage.login('', 'secret_sauce');
    await expect(loginPage.getErrorMessage()).toBeVisible();
    await expect(loginPage.getErrorMessage()).toContainText('Username is required');
  });

  test('TC_LOGIN_007: Empty password validation', async ({ page }) => {
    await loginPage.login('standard_user', '');
    await expect(loginPage.getErrorMessage()).toBeVisible();
    await expect(loginPage.getErrorMessage()).toContainText('Password is required');
  });

  test('TC_LOGIN_008: Both fields empty validation', async ({ page }) => {
    await loginPage.login('', '');
    await expect(loginPage.getErrorMessage()).toBeVisible();
    await expect(loginPage.getErrorMessage()).toContainText('Username is required');
  });

  test('TC_LOGIN_009: Locked user test', async ({ page }) => {
    await loginPage.login('locked_out_user', 'secret_sauce');
    await expect(loginPage.getErrorMessage()).toBeVisible();
    await expect(loginPage.getErrorMessage()).toContainText('locked out');
  });
});
