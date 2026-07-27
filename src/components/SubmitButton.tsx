"use client";

import { useFormStatus } from "react-dom";
import { SpinnerIcon } from "./navIcons";

// T133 (user request 2026-07-27): a plain `<form action={...}><button
// type="submit">` gives zero feedback between the click and the page
// updating - on anything slower than instant, that reads as "did this even
// work?" `useFormStatus()` reads the nearest enclosing `<form>`'s pending
// state automatically, so this drops in for a bare submit button with no
// state to wire up at each call site (unlike the `useActionState` + local
// `pending` pattern the app's bigger forms already use, which stays as-is -
// this is specifically for the many small one-button forms that had
// nothing). Disabled and shows a spinner in place of its own children
// exactly while its form is submitting; everything else about the button
// (className, type overrides aside) passes through untouched.
export function SubmitButton({
  children,
  className,
  spinnerClassName = "h-4 w-4",
  disabled,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { spinnerClassName?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || disabled} className={className} {...rest}>
      {pending ? <SpinnerIcon className={`${spinnerClassName} animate-spin`} /> : children}
    </button>
  );
}
