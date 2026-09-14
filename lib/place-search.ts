import type { Combobox } from '@base-ui/react';

// Async results may arrive without Base UI highlighting an item. Reuse the
// option's click handler so keyboard and pointer selection update the same state.
export const handlePlaceSearchEnter: NonNullable<
  Combobox.Input.Props['onKeyDown']
> = (event) => {
  if (event.key !== 'Enter') return;
  if (event.nativeEvent.isComposing) {
    event.preventBaseUIHandler();
    return;
  }
  const input = event.currentTarget;
  if (input.getAttribute('aria-activedescendant')) return;
  // Keep the query and popup while loading or when no result can be selected.
  event.preventDefault();
  event.preventBaseUIHandler();
  const listId = input.getAttribute('aria-controls');
  if (input.getAttribute('aria-expanded') !== 'true' || !listId) return;
  input.ownerDocument
    .getElementById(listId)
    ?.querySelector<HTMLElement>('[role="option"]:not([aria-disabled="true"])')
    ?.click();
};
