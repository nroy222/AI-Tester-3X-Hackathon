import { Page, Locator } from '@playwright/test';

export class CheckoutPage {
  readonly page: Page;
  readonly firstNameInput: Locator;
  readonly lastNameInput: Locator;
  readonly postalCodeInput: Locator;
  readonly continueButton: Locator;
  readonly cancelButton: Locator;
  readonly finishButton: Locator;
  readonly errorMessage: Locator;
  readonly pageTitle: Locator;

  constructor(page: Page) {
    this.page = page;
    this.firstNameInput = page.locator('#first-name');
    this.lastNameInput = page.locator('#last-name');
    this.postalCodeInput = page.locator('#postal-code');
    this.continueButton = page.locator('[data-test="continue"]');
    this.cancelButton = page.locator('[data-test="cancel"]');
    this.finishButton = page.locator('[data-test="finish"]');
    this.errorMessage = page.locator('[data-test="error"]');
    this.pageTitle = page.locator('.title');
  }

  async fillCheckoutInfo(firstName: string, lastName: string, postalCode: string) {
    await this.firstNameInput.fill(firstName);
    await this.lastNameInput.fill(lastName);
    await this.postalCodeInput.fill(postalCode);
  }

  async clickContinue() {
    await this.continueButton.click();
  }

  async clickCancel() {
    await this.cancelButton.click();
  }

  async clickFinish() {
    await this.finishButton.click();
  }

  getErrorMessage() {
    return this.errorMessage;
  }

  getOverviewTitle() {
    return this.page.locator('.title');
  }

  getPaymentInfo() {
    return this.page.locator('.summary_info').locator('.summary_value_label').first();
  }

  getShippingInfo() {
    return this.page.locator('.summary_info').locator('.summary_value_label').nth(1);
  }

  getItemTotal() {
    return this.page.locator('.summary_subtotal_label');
  }

  getTax() {
    return this.page.locator('.summary_tax_label');
  }

  getTotal() {
    return this.page.locator('.summary_total_label');
  }

  getConfirmationMessage() {
    return this.page.locator('.complete-header');
  }
}
