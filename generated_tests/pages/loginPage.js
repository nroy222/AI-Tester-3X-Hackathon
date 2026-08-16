class LoginPage {
    constructor(page) { this.page = page; }
    async goto() { await this.page.goto('https://www.saucedemo.com/'); }
    async username(val) { await this.page.fill('#user-name', val); }
    async password(val) { await this.page.fill('#password', val); }
    async submit() { await this.page.click('#login-button'); }
}
module.exports = LoginPage;
