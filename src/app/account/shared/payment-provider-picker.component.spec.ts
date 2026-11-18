import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AccountPaymentOptionsService } from '@core/account/account-payment-options.service';
import { AccountSubscriptionStore } from '@core/account/account-subscription.store';
import { PaymentProviderPickerComponent } from './payment-provider-picker.component';

const card = { provider: 'Stripe', method: 'Card', displayName: 'Card', enabled: true, priority: 10, disabledReason: null };
const payPal = { provider: 'PayPal', method: 'Wallet', displayName: 'PayPal', enabled: true, priority: 20, disabledReason: null };

// El botón final dice qué va a pasar con el método elegido: "Pay $X" con tarjeta, "Pay with PayPal" con PayPal.
describe('PaymentProviderPickerComponent', () => {
  function open(amount: string | null) {
    TestBed.configureTestingModule({
      imports: [PaymentProviderPickerComponent],
      providers: [
        { provide: AccountPaymentOptionsService, useValue: { getEnabled: () => of([card, payPal]) } },
        { provide: AccountSubscriptionStore, useValue: { preference: signal(null) } },
      ],
    });
    const fixture = TestBed.createComponent(PaymentProviderPickerComponent);
    fixture.componentInstance.open = () => true;
    fixture.componentInstance.amount = amount;
    fixture.detectChanges();
    fixture.detectChanges();
    return fixture;
  }

  const text = (el: HTMLElement) => el.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const confirmButton = (el: HTMLElement) => [...el.querySelectorAll('button')].at(-1) as HTMLButtonElement;

  it('says Pay with the amount for a card, and never names the processor', () => {
    const fixture = open('$49.00');
    const el = fixture.nativeElement as HTMLElement;

    expect(text(confirmButton(el))).toBe('Pay $49.00');
    expect(text(el)).toContain('Credit or debit card');
    expect(text(el)).not.toContain('Stripe');
  });

  it('says Pay with PayPal once PayPal is chosen', () => {
    const fixture = open('$49.00');
    const el = fixture.nativeElement as HTMLElement;
    const payPalOption = [...el.querySelectorAll('[role="radio"]')].find(b => text(b as HTMLElement).includes('PayPal')) as HTMLButtonElement;

    payPalOption.click();
    fixture.detectChanges();

    expect(text(confirmButton(el))).toBe('Pay with PayPal');
  });
});
