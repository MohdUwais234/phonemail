import {
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { Mail, LoaderCircle, X, AlertCircle, Inbox } from "lucide-react";
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand">
      <span className="brand-icon">
        <Mail size={23} />
        <span />
      </span>
      {!compact && (
        <span>
          Phone<span className="brand-light">Mail</span>
          <span className="brand-dot">.</span>
        </span>
      )}
    </div>
  );
}
export function Button({
  children,
  className = "",
  busy = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || busy}
      className={`button ${className}`}
    >
      {busy ? <LoaderCircle size={18} className="spin" /> : null}
      {children}
    </button>
  );
}
export function LoadingSpinner() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={24} />
      <span>Getting things ready…</span>
    </div>
  );
}
export function ErrorState({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div className="error" role="alert">
      <AlertCircle size={18} />
      <span>{message}</span>
      {retry && <button onClick={retry}>Try again</button>}
    </div>
  );
}
export function Avatar({
  name,
  large = false,
}: {
  name: string;
  large?: boolean;
}) {
  const colors = ["purple", "blue", "green", "orange"];
  return (
    <span
      className={`avatar ${colors[name.charCodeAt(0) % 4]} ${large ? "large" : ""}`}
    >
      {name
        .replace(/[^a-zA-Z0-9]/g, "")
        .slice(0, 2)
        .toUpperCase() || "PM"}
    </span>
  );
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Inbox size={32} strokeWidth={1.4} />
      </div>
      <span className="eyebrow">A LITTLE ROOM TO BREATHE</span>
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
