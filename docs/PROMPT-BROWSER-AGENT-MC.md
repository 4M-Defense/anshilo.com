# Prompt for the browser Claude agent — Shopify admin tasks

Copy everything between the horizontal rules into the browser agent.

Written in English by request, with exact values inline. Four tasks, all inside
`admin.shopify.com` for store `3007b3-4` (א.נ. שילו בע"מ, anshilo.com). Nothing
here needs the Google Merchant Center console.

---

You are working in the Shopify admin for the store `3007b3-4` (א.נ. שילו בע"מ,
anshilo.com). Four separate tasks. Do them in order. Do not change anything that
is not listed. After each task, note what you saw before and after.

## Task 1 — add three missing clauses to the refund policy

Go to **Settings → Policies → Refund policy** and click Edit. The policy is in
Hebrew and is already long and mostly correct. **Do not rewrite or reorder it.**
You are inserting three pieces of text.

**1a.** Find the section headed `מועד ואופן ההחזר הכספי`. At the END of that
section, after the existing paragraphs, add this as a new paragraph:

```
בעסקה שנעשתה בחנות, ההחזר יינתן במועד הביטול ולא יאוחר משבעה ימי עסקים ממועד מסירת הודעת הביטול.
```

**1b.** Find the list under the heading `מוצרים שלא ניתן לבטל את רכישתם`. Add
these two items to the END of that list, as two separate bullet points:

```
מידע דיגיטלי, לרבות תוכנה, קוד הפעלה או מוצר שהורד או הופעל.
```

```
מוצר הניתן להקלטה, לשעתוק או לשכפול, שאריזתו המקורית נפתחה.
```

**1c.** Near the end of the document there is a section headed `שאלות`. Insert a
new section immediately BEFORE it, with this heading and body:

Heading: `איך נספרים הימים`

Body:
```
תקופת הביטול נמנית מהיום שלמחרת המועד הקובע, וכוללת ימי מנוחה, שבתות וחגים. אם היום האחרון של התקופה הוא יום מנוחה, שבת או חג, התקופה מסתיימת ביום העסקים שאחריו.
```

Save. Then open https://anshilo.com/policies/refund-policy and confirm all three
appear on the live page.

## Task 2 — decide and set the restocking fee

Go to **Settings → Policies → Default rules → Return rules**.

Current state: `Charge restocking fee` is ON at **5%**, and Shopify offers no
field for a maximum amount.

The problem: Israeli law caps a cancellation fee at 5% **or 100 ₪, whichever is
lower**. 5% reaches 100 ₪ at an order of 2,000 ₪, so on any return above 2,000 ₪
this setting charges more than the law allows. The written policy already says
"whichever is lower" — it is only the automated flow that cannot express it.

**Turn `Charge restocking fee` OFF.** The fee is stated in the policy and will be
applied manually by the store team, which is the only way to honour the cap.

Do **not** touch `Cancellation rules` — it is deliberately off.
Do **not** change the 14-day window, the `Flat rate ₪39.00` return shipping, or
`Starting from: Delivery of item`.

Report the exact state of the Return rules section before and after.

## Task 3 — add a cancellation-notice link to the site footer

Go to **Online Store → Themes**. The live theme is `shilov8theme`. Open
**Customize**, then edit the **footer** section.

There is already a menu containing `מדיניות החזרים וביטולים`, `תקנון האתר`,
`מדיניות פרטיות` and similar. Add one more link to that same menu:

```
Link text:  הודעה על ביטול עסקה
URL:        /pages/contact
```

Place it immediately after `מדיניות החזרים וביטולים`.

Why: Israeli law requires a dedicated link on the site for sending a cancellation
notice on transactions made through the site. The store owner does not want a
self-service cancellation form, and this satisfies the requirement without one —
it points at the existing contact page, where there is a phone number, WhatsApp
and a message form.

Save and publish. Then open https://anshilo.com and confirm the link appears in
the footer and opens the contact page.

## Task 4 — install the Google Customer Reviews opt-in pixel

Merchant Center reports "Google Customer Reviews hasn't collected data from your
website". The agreement is signed; the code was never installed. There is no
`Additional scripts` field because the store uses Checkout Extensibility, so this
goes in as a custom pixel.

Go to **Settings → Customer events → Add custom pixel**. Name it exactly:

```
Google Customer Reviews
```

Set **Permission** to `Not required` and **Data sale** to `Data collected does not
qualify as data sale`, then paste this as the pixel code, replacing anything
already in the editor:

```js
analytics.subscribe('checkout_completed', (event) => {
  const c = event.data.checkout;
  if (!c) return;

  const est = new Date();
  est.setDate(est.getDate() + 7);
  const deliveryDate = est.toISOString().slice(0, 10);

  window.renderOptIn = function () {
    window.gapi.load('surveyoptin', function () {
      window.gapi.surveyoptin.render({
        merchant_id: 5328155131,
        order_id: String(c.order?.id ?? c.token ?? ''),
        email: c.email ?? '',
        delivery_country: c.shippingAddress?.countryCode ?? 'IL',
        estimated_delivery_date: deliveryDate,
        opt_in_style: 'CENTER_DIALOG',
      });
    });
  };

  const s = document.createElement('script');
  s.src = 'https://apis.google.com/js/platform.js?onload=renderOptIn';
  s.async = true;
  document.head.appendChild(s);
});
```

Save, then **Connect** the pixel so it becomes active. There are already three
pixels connected — Facebook & Instagram, Google & YouTube, Judge.me Reviews — and
this is a fourth. Do not modify the existing three.

Note: the merchant id `5328155131` and the 7-day estimated delivery window are
both deliberate. Do not change them.

## Report back

Reply with exactly this structure:

```
TASK 1 — refund policy
  1a inserted:        yes / no
  1b inserted:        yes / no  (how many bullets in the list now)
  1c inserted:        yes / no
  live page confirms: yes / no
  anything unexpected:

TASK 2 — restocking fee
  before:  Charge restocking fee = ___ , percentage = ___
  after:   Charge restocking fee = ___
  cancellation rules still off: yes / no
  anything unexpected:

TASK 3 — footer link
  theme edited:       (name)
  link added:         yes / no
  published:          yes / no
  live site confirms: yes / no
  anything unexpected:

TASK 4 — Google Customer Reviews pixel
  pixel created:      yes / no
  connected:          yes / no
  existing 3 pixels untouched: yes / no
  any error shown when saving:
  anything unexpected:
```

If a task cannot be completed, say which one and what blocked it. Do not attempt a
workaround without saying so.

---

## Not for the agent — one open question for the owner

Product `שקע CLICK דו פיני 1 מודול מתח/זרם 10A בצבע לבן FETAYA`, SKU **9431**.

Its title in the store was `מפסק יחיד + יחיד 1 מודול 2x16A סדרת Click` — which is
the title of a **different** product, SKU 9461. The title has been corrected. But
its price is still **₪30**, which is 9461's price; Fetaya lists SKU 9431 at
**₪10.36**.

So the price was probably copied from the wrong product along with the title. It
was not changed, because a two-thirds price cut on a live product is the owner's
call and not a data fix.
