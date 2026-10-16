"use client";
import { useFormStatus } from "react-dom";

export default function SubmitButton({ children, className = "btn small", pendingText }: { children: React.ReactNode; className?: string; pendingText?: string }) {
  const { pending } = useFormStatus();
  return <button className={className} disabled={pending}>{pending ? pendingText ?? "Saving…" : children}</button>;
}
