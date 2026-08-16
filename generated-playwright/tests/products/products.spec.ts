import { test, expect } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage';
import { ProductsPage } from '../../pages/ProductsPage';

test.describe('Products Page Tests', () => {
  let loginPage: LoginPage;
  let productsPage: ProductsPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    productsPage = new ProductsPage(page);
    await loginPage.navigate();
    await loginPage.login('standard_user', 'secret_sauce');
  });

  test('TC_PROD_001: Verify all products displayed', async ({ page }) => {
    await expect(productsPage.getProductsCount()).toBe(6);
    await expect(productsPage.getProductByName('Sauce Labs Backpack')).toBeVisible();
    await expect(productsPage.getProductByName('Sauce Labs Bike Light')).toBeVisible();
    await expect(productsPage.getProductByName('Sauce Labs Bolt T-Shirt')).toBeVisible();
    await expect(productsPage.getProductByName('Sauce Labs Fleece Jacket')).toBeVisible();
    await expect(productsPage.getProductByName('Sauce Labs Onesie')).toBeVisible();
    await expect(productsPage.getProductByName('Test.allTheThings() T-Shirt (Red)')).toBeVisible();
  });

  test('TC_PROD_002: Add single product to cart', async ({ page }) => {
    await productsPage.addToCart('Sauce Labs Backpack');
    await expect(productsPage.getCartBadge()).toHaveText('1');
  });

  test('TC_PROD_003: Add multiple products to cart', async ({ page }) => {
    await productsPage.addToCart('Sauce Labs Backpack');
    await productsPage.addToCart('Sauce Labs Bike Light');
    await productsPage.addToCart('Sauce Labs Bolt T-Shirt');
    await expect(productsPage.getCartBadge()).toHaveText('3');
  });

  test('TC_PROD_004: Remove product from product page', async ({ page }) => {
    await productsPage.addToCart('Sauce Labs Backpack');
    await expect(productsPage.getCartBadge()).toHaveText('1');
    await productsPage.removeFromCart('Sauce Labs Backpack');
    await expect(productsPage.getCartBadge()).not.toBeVisible();
  });

  test('TC_PROD_005: Sort products by name A-Z', async ({ page }) => {
    await productsPage.sortProducts('Name (A to Z)');
    const productNames = await productsPage.getAllProductNames();
    const sortedNames = [...productNames].sort();
    expect(productNames).toEqual(sortedNames);
  });

  test('TC_PROD_006: Sort products by name Z-A', async ({ page }) => {
    await productsPage.sortProducts('Name (Z to A)');
    const productNames = await productsPage.getAllProductNames();
    const sortedNames = [...productNames].sort().reverse();
    expect(productNames).toEqual(sortedNames);
  });

  test('TC_PROD_007: Sort products by price low to high', async ({ page }) => {
    await productsPage.sortProducts('Price (low to high)');
    const prices = await productsPage.getAllProductPrices();
    const sortedPrices = [...prices].sort((a, b) => a - b);
    expect(prices).toEqual(sortedPrices);
  });

  test('TC_PROD_008: Sort products by price high to low', async ({ page }) => {
    await productsPage.sortProducts('Price (high to low)');
    const prices = await productsPage.getAllProductPrices();
    const sortedPrices = [...prices].sort((a, b) => b - a);
    expect(prices).toEqual(sortedPrices);
  });
});
