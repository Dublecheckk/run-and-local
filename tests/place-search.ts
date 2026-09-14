import assert from 'node:assert/strict';
import { handlePlaceSearchEnter } from '../lib/place-search.ts';

// The DOM boundary is tiny: only the visible ARIA list's enabled option is clicked.
function press({
  key = 'Enter',
  active = false,
  composing = false,
  expanded = true,
  hasResult = true,
} = {}) {
  const actual = { clicked: false, prevented: false, basePrevented: false };
  const event = {
    key,
    nativeEvent: { isComposing: composing },
    preventDefault: () => {
      actual.prevented = true;
    },
    preventBaseUIHandler: () => {
      actual.basePrevented = true;
    },
    currentTarget: {
      getAttribute: (name: string) =>
        ({
          'aria-activedescendant': active ? 'second-option' : null,
          'aria-controls': 'visible-results',
          'aria-expanded': String(expanded),
        })[name],
      ownerDocument: {
        getElementById: (id: string) => {
          assert.equal(id, 'visible-results');
          return {
            querySelector: (selector: string) => {
              assert.equal(
                selector,
                '[role="option"]:not([aria-disabled="true"])',
              );
              return hasResult
                ? {
                    click: () => {
                      actual.clicked = true;
                    },
                  }
                : null;
            },
          };
        },
      },
    },
  };
  handlePlaceSearchEnter(
    event as unknown as Parameters<typeof handlePlaceSearchEnter>[0],
  );
  return actual;
}
assert.deepEqual(press(), {
  clicked: true,
  prevented: true,
  basePrevented: true,
});
assert.deepEqual(press({ hasResult: false }), {
  clicked: false,
  prevented: true,
  basePrevented: true,
});
assert.equal(press({ expanded: false }).clicked, false);
assert.deepEqual(press({ active: true }), {
  clicked: false,
  prevented: false,
  basePrevented: false,
});
assert.deepEqual(press({ key: 'ArrowDown' }), {
  clicked: false,
  prevented: false,
  basePrevented: false,
});
for (const ime of [{ composing: true }])
  assert.deepEqual(press(ime), {
    clicked: false,
    prevented: false,
    basePrevented: true,
  });
console.log(
  'Place search Enter: async result, loading, closed popup, arrow selection and IME checks passed.',
);
