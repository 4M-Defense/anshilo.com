/**
 * נוסחת רשת המוצרים — מה שקובע כמה עמודות רואים על כל מכשיר.
 *
 * הבדיקה הזו קיימת כי הקיבוע הקודם לשתי עמודות ניראה תקין בטלפון ונשבר רק
 * על טאבלט, כלומר במקום שאף אחד לא פותח בזמן פיתוח.
 */

import { productGrid, READABLE_MAX_WIDTH } from '@/theme';

/** רוחבי מכשירים אמיתיים, מהקטן לגדול */
const DEVICES: ReadonlyArray<readonly [string, number]> = [
  ['iPhone SE', 320],
  ['iPhone 13 mini', 375],
  ['iPhone 15', 393],
  ['Galaxy S24', 412],
  ['iPhone 15 Pro Max', 430],
  ['מסך מפוצל, חצי', 507],
  ['מכשיר מתקפל פתוח', 673],
  ['iPad mini לאורך', 744],
  ['iPad 10.9 לאורך', 820],
  ['iPad Pro 11 לאורך', 834],
  ['iPad mini לרוחב', 1133],
  ['iPad 10.9 לרוחב', 1180],
  ['iPad Pro 12.9 לרוחב', 1366],
  ['שולחני', 1920],
];

describe('productGrid', () => {
  it('לעולם לא יורד משתי עמודות, גם במסך הצר ביותר', () => {
    for (const width of [240, 280, 320]) {
      expect(productGrid(width).columns).toBeGreaterThanOrEqual(2);
    }
  });

  it('הכרטיס נשאר בטווח קריא בכל מכשיר', () => {
    for (const [name, width] of DEVICES) {
      const { cardWidth } = productGrid(width);
      // 575px היה הרוחב שהתקלה ייצרה על אייפד פרו — התקרה כאן חוסמת חזרה אליו
      expect({ name, cardWidth: Math.round(cardWidth) }).toMatchObject({
        name,
        cardWidth: expect.any(Number),
      });
      expect(cardWidth).toBeGreaterThanOrEqual(120);
      expect(cardWidth).toBeLessThanOrEqual(320);
    }
  });

  it('מוסיף עמודות ככל שהמסך מתרחב, ולעולם לא מוריד', () => {
    let previous = 0;
    for (const [, width] of DEVICES) {
      const { columns } = productGrid(width);
      expect(columns).toBeGreaterThanOrEqual(previous);
      previous = columns;
    }
  });

  it('טלפון מקבל שתי עמודות וטאבלט לרוחב מקבל יותר', () => {
    expect(productGrid(393).columns).toBe(2);
    expect(productGrid(1366).columns).toBeGreaterThan(3);
  });

  it('מספר העמודות מוגבל, כדי שכרטיס לא יהפוך לזעיר במסך רחב מאוד', () => {
    expect(productGrid(3840).columns).toBeLessThanOrEqual(6);
  });

  it('הכרטיסים והרווחים ביניהם ממלאים בדיוק את הרוחב הזמין', () => {
    const GUTTER = 16;
    const GAP = 12;
    for (const [, width] of DEVICES) {
      const { columns, cardWidth } = productGrid(width);
      const used = cardWidth * columns + GAP * (columns - 1) + GUTTER * 2;
      expect(used).toBeCloseTo(width, 5);
    }
  });

  it('רוחב הקריאה המרבי מוגדר ושפוי', () => {
    expect(READABLE_MAX_WIDTH).toBeGreaterThan(400);
    expect(READABLE_MAX_WIDTH).toBeLessThan(1000);
  });
});
