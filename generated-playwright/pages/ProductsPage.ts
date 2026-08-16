import { Page, Locator } from '@playwright/test';

export class ProductsPage {
  readonly page: Page;
  readonly inventoryItems: Locator;
  readonly cartBadge: Locator;
  readonly cartLink: Locator;
  readonly sortDropdown: Locator;

  constructor(page: Page) {
    this.page = page;
    this.inventoryItems = page.locator('.inventory_item');
    this.cartBadge = page.locator('.shopping_cart_badge');
    this.cartLink = page.locator('.shopping_cart_link');
    this.sortDropdown = page.locator('.product_sort_container');
  }

  async navigate() {
    await this.page.goto('/inventory.html');
  }

  async addToCart(productName: string) {
    const productCard = this.page.locator('.inventory_item').filter({ hasText: productName });
    await productCard.locator('button').click();
  }

  async removeFromCart(productName: string) {
    const productCard = this.page.locator('.inventory_item').filter({ hasText: productName });
    await productCard.locator('button').click();
  }

  getProductByName(productName: string) {
    return this.page.locator('.inventory_item').filter({ hasText: productName });
  }

  getCartBadge() {
    return this.cartBadge;
  }

  getPageTitle() {
    return this.page.locator('.title');
  }

  async sortProducts(sortOption: string) {
    await this.sortDropdown.selectOption({ label: sortOption });
  }

  async getProductsCount() {
    return await this.inventoryItems.count();
  }

  async getAllProductNames() {
    const names: string[] = [];
    const items = await this.inventoryItems.all();
    for (const item of items) {
      const name = await item.locator('.inventory_item_name').textContent();
      if (name) names.push(name);
    }
    return names;
  }

  async getAllProductPrices() {
    const prices: number[] = [];
    const items = await this.inventoryItems.all();
    for (const item of items) {
      const priceText = await item.locator('.inventory_item_price').textContent();
      if (priceText) {
        const price = parseFloat(priceText.replace('$', ''));
        prices.push(price);
      }
    }
    return prices;
  }

  async goToCart() {
    await this.cartLink.click();
  }
}
