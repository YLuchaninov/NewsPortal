export function dispatchAdminSubmitEvent(form: Pick<HTMLFormElement, "dispatchEvent">): boolean {
  return form.dispatchEvent(
    new Event("submit", {
      bubbles: true,
      cancelable: true,
    })
  );
}

export function submitAdminForm(form: HTMLFormElement): void {
  if (typeof form.requestSubmit === "function") {
    form.requestSubmit();
    return;
  }
  if (!dispatchAdminSubmitEvent(form)) {
    return;
  }
  form.submit();
}
