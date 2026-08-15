/**
 * המקום שבו באג עולה כסף אמיתי.
 *
 * `isUnpriced` הוא השומר שמונע הוספה לעגלה של מוצר שפורסם בלי מחיר. אם הוא
 * יחזיר false על סכום אפס, המוצר יהפוך לניתן לרכישה בחינם — בדיוק התקלה
 * שתוקנה. `formatMoney` הוא מה שהלקוח קורא לפני שהוא מחליט לשלם.
 */

import { formatMoney, isUnpriced } from '@/api/client';

const ils = (amount: string) => ({ amount, currencyCode: 'ILS' });

describe('isUnpriced — השומר מפני רכישה בחינם', () => {
  it('אפס נחשב חסר מחיר', () => {
    expect(isUnpriced(ils('0'))).toBe(true);
    expect(isUnpriced(ils('0.00'))).toBe(true);
    expect(isUnpriced(ils('0.000'))).toBe(true);
  });

  it('סכום שלילי נחשב חסר מחיר', () => {
    expect(isUnpriced(ils('-1'))).toBe(true);
    expect(isUnpriced(ils('-0.01'))).toBe(true);
  });

  it('חסר או לא תקין נחשב חסר מחיר', () => {
    expect(isUnpriced(null)).toBe(true);
    expect(isUnpriced(undefined)).toBe(true);
    expect(isUnpriced(ils(''))).toBe(true);
    expect(isUnpriced(ils('לא מספר'))).toBe(true);
    expect(isUnpriced(ils('NaN'))).toBe(true);
  });

  it('סכום חיובי אמיתי ניתן לרכישה', () => {
    expect(isUnpriced(ils('0.01'))).toBe(false);
    expect(isUnpriced(ils('9'))).toBe(false);
    expect(isUnpriced(ils('1799.00'))).toBe(false);
  });
});

describe('formatMoney', () => {
  it('מציג שקלים בתבנית של החנות', () => {
    expect(formatMoney(ils('9.00'))).toBe('₪9.00');
    expect(formatMoney(ils('1799'))).toBe('₪1,799.00');
  });

  it('מפריד אלפים', () => {
    expect(formatMoney(ils('9000'))).toBe('₪9,000.00');
    expect(formatMoney(ils('1234567.89'))).toBe('₪1,234,567.89');
  });

  it('שומר על הסימן לפני הסכום בסכום שלילי (זיכוי)', () => {
    expect(formatMoney(ils('-50'))).toBe('-₪50.00');
  });

  it('מחזיר מחרוזת ריקה על קלט לא תקין, ולא NaN למסך', () => {
    expect(formatMoney(ils('לא מספר'))).toBe('');
    expect(formatMoney(ils(''))).toBe('');
  });

  it('מטבע אחר מוצג עם קוד ולא עם סימן שקל', () => {
    expect(formatMoney({ amount: '25', currencyCode: 'USD' })).toBe('25.00 USD');
  });
});
