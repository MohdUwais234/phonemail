import { useState, useEffect, useCallback } from "react";
import {
  Inbox,
  Send,
  FileText,
  Trash2,
  UserRound,
  Plus,
  Search,
  RefreshCw,
  ChevronRight,
  ChevronLeft,
  ArrowLeft,
  Reply,
  Mail,
  MailOpen,
  LogOut,
  Check,
  ShieldCheck,
  X,
} from "lucide-react";
import { useAuth } from "./auth";
import { api } from "./api";
import {
  Logo,
  Avatar,
  Button,
  EmptyState,
  ErrorState,
  LoadingSpinner,
  Modal,
} from "./components";
import { Composer } from "./Composer";
import type { Email, Folder, MailPage } from "./types";
const folders = [
  { id: "INBOX", name: "Inbox", icon: Inbox },
  { id: "SENT", name: "Sent", icon: Send },
  { id: "DRAFTS", name: "Drafts", icon: FileText },
  { id: "TRASH", name: "Trash", icon: Trash2 },
] as const;
const names = {
  INBOX: "Inbox",
  SENT: "Sent",
  DRAFTS: "Drafts",
  TRASH: "Trash",
};
function date(value: string) {
  const d = new Date(value);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
}
export function Mailbox() {
  const { user, logout, setUser } = useAuth();
  const [folder, setFolder] = useState<Folder>("INBOX"),
    [page, setPage] = useState(1),
    [result, setResult] = useState<MailPage | null>(null),
    [unread, setUnread] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [view, setView] = useState<"list" | "detail" | "compose" | "profile">(
      "list",
    ),
    [selected, setSelected] = useState<Email>(),
    [reply, setReply] = useState<Email>(),
    [draft, setDraft] = useState<Email>(),
    [toast, setToast] = useState(""),
    [refresh, setRefresh] = useState(0),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState<"delete" | "logout" | null>(null),
    [displayName, setDisplayName] = useState(user!.display_name || "");
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  const reload = useCallback(() => setRefresh((v) => v + 1), []);
  useEffect(() => {
    let active = true;
    if (view !== "list") return;
    setLoading(true);
    setError("");
    api
      .list(folder, page)
      .then((r) => {
        if (active) {
          setResult(r);
          if (folder === "INBOX") setUnread(r.unread);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [folder, page, refresh, view]);
  function navigate(f: Folder) {
    setFolder(f);
    setPage(1);
    setQuery("");
    setView("list");
    setError("");
  }
  function compose() {
    setDraft(undefined);
    setReply(undefined);
    setView("compose");
    setError("");
  }
  async function open(email: Email) {
    setBusy(true);
    setError("");
    try {
      const fresh = await api.email(email.id);
      if (fresh.folder === "DRAFTS") {
        setDraft(fresh);
        setReply(undefined);
        setView("compose");
      } else {
        if (!fresh.is_read) {
          await api.read(fresh.id, true);
          fresh.is_read = true;
        }
        setSelected(fresh);
        setView("detail");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!selected) return;
    setBusy(true);
    try {
      const r = await api.remove(selected.id);
      setToast(r.message);
      setView("list");
      setConfirm(null);
    } catch (e) {
      setError((e as Error).message);
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  }
  async function mark() {
    if (!selected) return;
    setBusy(true);
    try {
      const r = await api.read(selected.id, !selected.is_read);
      setSelected(r);
      setToast(r.is_read ? "Marked as read." : "Marked as unread.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const messages =
    result?.messages.filter((m) =>
      `${m.from} ${m.fromName} ${m.to} ${m.subject} ${m.body}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    ) || [];
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Logo />
        <div className="workspace-label">YOUR PERSONAL SPACE</div>
        <Button className="primary compose-button" onClick={compose}>
          <Plus size={20} />
          Compose
        </Button>
        <nav className="folder-nav" aria-label="Mailboxes">
          {folders.map((f) => (
            <button
              key={f.id}
              className={folder === f.id && view !== "profile" ? "active" : ""}
              onClick={() => navigate(f.id)}
            >
              <f.icon size={20} />
              <span>{f.name}</span>
              {f.id === "INBOX" && unread > 0 && (
                <span className="count">{unread}</span>
              )}
              {f.id === "DRAFTS" && (
                <span className="nav-hint">Saved for later</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <ShieldCheck size={21} />
            <strong>One number. All you.</strong>
            <p>
              Your connections, together
              <br />
              in one simple inbox.
            </p>
          </div>
          <button
            className={`account-button ${view === "profile" ? "selected" : ""}`}
            onClick={() => {
              setError("");
              setView("profile");
            }}
          >
            <Avatar name={user!.display_name || user!.email_address} />
            <span>
              <strong>{user!.display_name || "Your account"}</strong>
              <small>{user!.email_address}</small>
            </span>
            <ChevronRight size={15} />
          </button>
        </div>
      </aside>
      <div className="mail-workspace">
        <header className="app-header">
          <div className="mobile-logo">
            <Logo />
          </div>
          <span className="desktop-greeting">
            A little less noise. A little more connection.
          </span>
          <div className="header-account">
            <span className="status-dot" />
            <span>Your personal inbox</span>
            <button
              className="icon-button"
              aria-label="Open profile"
              onClick={() => {
                setError("");
                setView("profile");
              }}
            >
              <Avatar name={user!.display_name || user!.email_address} />
            </button>
          </div>
        </header>
        <main className="mail-main">
          {view === "list" && (
            <>
              <div className="mail-title">
                <div>
                  <span className="eyebrow">
                    {folder === "INBOX"
                      ? "GOOD TO HAVE YOU HERE"
                      : "YOUR CONVERSATIONS"}
                  </span>
                  <h1>
                    {names[folder]}
                    <span className="title-dot">.</span>
                  </h1>
                  <p>
                    {folder === "INBOX"
                      ? unread
                        ? `You have ${unread} unread ${unread === 1 ? "message" : "messages"}. Let’s catch up.`
                        : "A fresh space for the conversations that matter."
                      : folder === "SENT"
                        ? "A little connection, sent out into the world."
                        : folder === "DRAFTS"
                          ? "Good thoughts don’t need to be rushed."
                          : "Messages you’ve set aside. Delete again to remove forever."}
                  </p>
                </div>
                <Button
                  className="secondary refresh-button"
                  onClick={reload}
                  disabled={loading || busy}
                >
                  <RefreshCw size={17} className={loading ? "spin" : ""} />
                  <span>Refresh</span>
                </Button>
              </div>
              <div className="mail-panel">
                <div className="mail-toolbar">
                  <div className="mail-tabs">
                    <button className="selected" onClick={() => setQuery("")}>
                      All mail <span>{result?.total || 0}</span>
                    </button>
                    <span className="folder-description">
                      {folder === "INBOX"
                        ? "Made for meaningful messages"
                        : "Every conversation, in its place"}
                    </span>
                  </div>
                  <div className="search">
                    <Search size={17} />
                    <input
                      aria-label="Search this page"
                      placeholder="Search this page"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    {query && (
                      <button
                        className="icon-button"
                        aria-label="Clear search"
                        onClick={() => setQuery("")}
                      >
                        <X size={15} />
                      </button>
                    )}
                  </div>
                </div>
                {error && <ErrorState message={error} retry={reload} />}
                {loading ? (
                  <LoadingSpinner />
                ) : messages.length ? (
                  <div className="email-list">
                    {messages.map((m) => (
                      <button
                        className={`email-item ${!m.is_read ? "unread" : ""}`}
                        key={m.id}
                        onClick={() => void open(m)}
                        disabled={busy}
                      >
                        <span className="unread-dot" />
                        <Avatar
                          name={
                            (folder === "SENT" || folder === "DRAFTS"
                              ? m.to
                              : m.fromName || m.from) || "Draft"
                          }
                        />
                        <div className="email-content">
                          <div className="email-row">
                            <strong>
                              {folder === "SENT" || folder === "DRAFTS"
                                ? `To: ${m.to || "No recipient"}`
                                : m.fromName || m.from}
                              <span className="email-time">
                                {date(m.received_at)}
                              </span>
                            </strong>
                          </div>
                          <span className="email-subject">
                            {m.subject || "(No subject)"}
                          </span>
                          <p>{m.body || "No message preview"}</p>
                        </div>
                        <ChevronRight size={16} className="email-chevron" />
                      </button>
                    ))}
                  </div>
                ) : (
                  !error && (
                    <EmptyState
                      title={
                        query
                          ? "No matches on this page"
                          : folder === "INBOX"
                            ? "Your next hello starts here."
                            : folder === "SENT"
                              ? "Make someone’s day."
                              : folder === "DRAFTS"
                                ? "No unfinished thoughts."
                                : "A clean slate."
                      }
                      description={
                        query
                          ? "Try a different name or subject. Search applies to the current page."
                          : folder === "INBOX"
                            ? "New messages will feel right at home here. Start a conversation, or share your PhoneMail address."
                            : folder === "SENT"
                              ? "Your sent messages will appear here. Why not say hello?"
                              : folder === "DRAFTS"
                                ? "Save a message as a draft and come back to it when you’re ready."
                                : "Messages you move to Trash will appear here."
                      }
                      action={
                        (folder === "INBOX" || folder === "SENT") && !query ? (
                          <Button className="secondary" onClick={compose}>
                            <Plus size={17} />
                            Write your first message
                          </Button>
                        ) : undefined
                      }
                    />
                  )
                )}
                <div className="mail-panel-footer">
                  <span>
                    <ShieldCheck size={14} />
                    Your number. Your inbox. Simply yours.
                  </span>
                  <div className="pagination">
                    <span>
                      {result?.total
                        ? `${(page - 1) * 20 + 1}–${Math.min(page * 20, result.total)} of ${result.total}`
                        : "0 messages"}
                    </span>
                    <button
                      className="icon-button"
                      aria-label="Previous page"
                      disabled={page <= 1 || loading}
                      onClick={() => setPage((v) => v - 1)}
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label="Next page"
                      disabled={!result || page * 20 >= result.total || loading}
                      onClick={() => setPage((v) => v + 1)}
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                </div>
              </div>
              <div className="address-note">
                <Mail size={15} />
                <span>
                  A new way to reach you: <strong>{user!.email_address}</strong>
                </span>
              </div>
            </>
          )}
          {view === "compose" && (
            <Composer
              key={draft?.id || reply?.id || "new"}
              user={user!}
              draft={draft}
              reply={reply}
              onClose={() => setView("list")}
              onDone={(message) => {
                setToast(message);
                setView("list");
                reload();
              }}
            />
          )}
          {view === "detail" && selected && (
            <section className="detail-page">
              <div className="view-top">
                <button
                  className="icon-button"
                  aria-label="Back to mailbox"
                  onClick={() => setView("list")}
                >
                  <ArrowLeft size={21} />
                </button>
                <span>{names[selected.folder]}</span>
                <div className="detail-actions">
                  <button
                    className="icon-button"
                    aria-label={selected.is_read ? "Mark unread" : "Mark read"}
                    disabled={busy}
                    onClick={() => void mark()}
                  >
                    {selected.is_read ? (
                      <Mail size={20} />
                    ) : (
                      <MailOpen size={20} />
                    )}
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Delete message"
                    disabled={busy}
                    onClick={() => setConfirm("delete")}
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              </div>
              {error && <ErrorState message={error} />}
              <article className="message-article">
                <h1>{selected.subject || "(No subject)"}</h1>
                <div className="message-sender">
                  <Avatar name={selected.fromName || selected.from} />
                  <div>
                    <strong>{selected.fromName || selected.from}</strong>
                    {selected.fromName && <small>{selected.from}</small>}
                    <small>To: {selected.to}</small>
                  </div>
                  <time>
                    {new Date(selected.received_at).toLocaleString([], {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </time>
                </div>
                <div className="message-body">
                  {selected.body || "(Empty message)"}
                </div>
                <Button
                  className="secondary"
                  onClick={() => {
                    setDraft(undefined);
                    setReply(selected);
                    setView("compose");
                  }}
                >
                  <Reply size={18} />
                  Reply
                </Button>
              </article>
            </section>
          )}
          {view === "profile" && (
            <section className="profile-page">
              <span className="eyebrow">SIMPLY YOURS</span>
              <h1>
                Your profile<span className="title-dot">.</span>
              </h1>
              <p>The familiar number behind every conversation.</p>
              <div className="profile-card">
                <Avatar
                  name={user!.display_name || user!.email_address}
                  large
                />
                <h2>{user!.display_name || "Make yourself at home."}</h2>
                <span className="verified-pill">
                  <ShieldCheck size={14} />
                  Phone verified
                </span>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setBusy(true);
                    setError("");
                    try {
                      setUser(await api.profile(displayName));
                      setToast("Your profile is up to date.");
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <label htmlFor="display-name">Display name</label>
                  <input
                    id="display-name"
                    placeholder="How should we call you?"
                    value={displayName}
                    maxLength={80}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                  <label>Phone number</label>
                  <div className="read-only">
                    {user!.phone_number}
                    <Check size={16} />
                  </div>
                  <label>PhoneMail address</label>
                  <div className="read-only">
                    {user!.email_address}
                    <Mail size={16} />
                  </div>
                  {error && <ErrorState message={error} />}
                  <Button className="primary full" busy={busy} type="submit">
                    Save changes
                  </Button>
                </form>
                <button
                  className="logout-button"
                  onClick={() => setConfirm("logout")}
                >
                  <LogOut size={17} />
                  Log out of PhoneMail
                </button>
              </div>
            </section>
          )}
        </main>
        <footer className="app-footer">
          <span>Thoughtfully simple. Naturally connected.</span>
          <span>PhoneMail © {new Date().getFullYear()}</span>
        </footer>
      </div>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {folders
          .filter((f) => f.id !== "TRASH")
          .map((f) => (
            <button
              key={f.id}
              className={folder === f.id && view === "list" ? "active" : ""}
              onClick={() => navigate(f.id)}
            >
              <f.icon size={21} />
              <span>{f.name}</span>
            </button>
          ))}
        <button
          className={folder === "TRASH" && view === "list" ? "active" : ""}
          onClick={() => navigate("TRASH")}
        >
          <Trash2 size={21} />
          <span>Trash</span>
        </button>
        <button
          className={view === "profile" ? "active" : ""}
          onClick={() => {
            setView("profile");
            setError("");
          }}
        >
          <UserRound size={21} />
          <span>Profile</span>
        </button>
      </nav>
      {view === "list" && (
        <button
          className="mobile-compose"
          aria-label="Compose message"
          onClick={compose}
        >
          <Plus size={25} />
        </button>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {confirm && (
        <Modal
          title={
            confirm === "logout"
              ? "See you soon?"
              : selected?.folder === "TRASH"
                ? "Delete permanently?"
                : "Move to Trash?"
          }
          onClose={() => setConfirm(null)}
        >
          <p>
            {confirm === "logout"
              ? "You can sign back in anytime with your phone number."
              : selected?.folder === "TRASH"
                ? "This removes the message from your mailbox permanently. This cannot be undone."
                : "You can find this message in Trash until you delete it permanently."}
          </p>
          <div className="modal-actions">
            <Button
              className="secondary"
              disabled={busy}
              onClick={() => setConfirm(null)}
            >
              Cancel
            </Button>
            <Button
              className="danger"
              busy={busy}
              onClick={() =>
                confirm === "logout" ? void logout() : void remove()
              }
            >
              {confirm === "logout"
                ? "Log out"
                : selected?.folder === "TRASH"
                  ? "Delete forever"
                  : "Move to Trash"}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
