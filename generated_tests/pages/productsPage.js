class ProductsPage {
    constructor(page) { this.page = page; }
    async isLoaded() { return this.page.url().includes('inventory.html'); }
    async addToCartByName(name) { const btn = await this.page.locator('text='+name).locator('..').locator('button'); await btn.click(); }
    async cartCount() { const badge = await this.page.$('.shopping_cart_badge'); return badge ? await badge.innerText() : '0'; }
}
module.exports = ProductsPage;
