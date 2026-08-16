import { Page, Locator } from '@playwright/test';

export class CartPage {
  readonly page: Page;
  readonly cartItems: Locator;
  readonly checkoutButton: Locator;
  readonly continueShoppingButton: Locator;
  readonly pageTitle: Locator;

  constructor(page: Page) {
    this.page = page;
    this.cartItems = page.locator('.cart_item');
    this.checkoutButton = page.locator('[data-test="checkout"]');
    this.continueShoppingButton = page.locator('[data-test="continue-shopping"]');
    this.pageTitle = page.locator('.title');
  }

  getPageTitle() {
    return this.pageTitle;
  }

  getCartItem(itemName: string) {
    return this.page.locator('.cart_item').filter({ hasText: itemName });
  }

  async getCartItemCount() {
    return await this.cartItems.count();
  }

  async removeItem(itemName: string) {
    const item = this.getCartItem(itemName);
    await item.locator('button').click();
  }

  async clickCheckout() {
    await this.checkoutButton.click();
  }

  async clickContinueShopping() {
    await this.continueShoppingButton.click();
  }
}
