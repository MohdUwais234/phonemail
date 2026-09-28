import { useState, type FormEvent } from "react";
import { ArrowLeft, Send, Save, Trash2 } from "lucide-react";
import { api } from "./api";
import { Button, ErrorState, Modal } from "./components";
import type { ComposeData, Email, User } from "./types";
export function Composer({
  user,
  draft,
  reply,
  onClose,
  onDone,
}: {
  user: User;
  draft?: Email;
  reply?: Email;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [data, setData] = useState<ComposeData>({
      to:
        draft?.to ||
        (reply
          ? reply.from === user.email_address
            ? reply.to
            : reply.from
          : ""),
      subject:
        draft?.subject ||
        (reply
          ? /^re:/i.test(reply.subject)
            ? reply.subject
            : `Re: ${reply.subject}`
          : ""),
      body: draft?.body || "",
      draftId: draft?.id,
    }),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState(false);
  const changed =
    data.to !== (draft?.to || "") ||
    data.subject !== (draft?.subject || "") ||
    data.body !== (draft?.body || "");
  async function send(e: FormEvent) {
    e.preventDefault();
    setBusy("send");
    setError("");
    try {
      const result = reply
        ? await api.reply(reply.id, data.body)
        : await api.send(data);
      onDone(
        result.delivery === "queued"
          ? "Message queued for email delivery."
          : "Message sent. A little connection, delivered.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function save() {
    setBusy("save");
    setError("");
    try {
      await api.draft(data);
      onDone("Draft saved. Pick up whenever you’re ready.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function discard() {
    setBusy("discard");
    try {
      if (draft) await api.remove(draft.id);
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setConfirm(false);
    } finally {
      setBusy("");
    }
  }
  return (
    <section className="compose-page">
      <div className="view-top">
        <button
          className="icon-button"
          aria-label="Back to mailbox"
          disabled={!!busy}
          onClick={() => (changed ? setConfirm(true) : onClose())}
        >
          <ArrowLeft size={21} />
        </button>
        <h2>
          {reply
            ? "Write a reply"
            : draft
              ? "Finish your draft"
              : "A new conversation"}
        </h2>
        <span className="subtle">{reply ? "REPLY" : "COMPOSE"}</span>
      </div>
      <form onSubmit={send} className="composer">
        <div className="compose-line">
          <label>From</label>
          <span>{user.email_address}</span>
        </div>
        <div className="compose-line">
          <label htmlFor="to">To</label>
          <input
            id="to"
            type="email"
            placeholder="name@example.com"
            value={data.to}
            onChange={(e) => setData({ ...data, to: e.target.value })}
            required
            disabled={!!reply || !!busy}
          />
        </div>
        <div className="compose-line">
          <label htmlFor="subject">Subject</label>
          <input
            id="subject"
            placeholder="Give your message a subject"
            maxLength={998}
            value={data.subject}
            onChange={(e) => setData({ ...data, subject: e.target.value })}
            disabled={!!reply || !!busy}
          />
        </div>
        <label htmlFor="body" className="sr-only">
          Message
        </label>
        <textarea
          id="body"
          autoFocus={!!reply}
          placeholder="A simple hello can go a long way…"
          maxLength={100000}
          value={data.body}
          onChange={(e) => setData({ ...data, body: e.target.value })}
          disabled={!!busy}
          required={!!reply}
        />
        {error && <ErrorState message={error} />}
        <div className="compose-footer">
          <Button
            type="submit"
            className="primary"
            busy={busy === "send"}
            disabled={!!busy}
          >
            <Send size={17} />
            Send message
          </Button>
          {!reply && (
            <Button
              type="button"
              className="secondary"
              onClick={() => void save()}
              busy={busy === "save"}
              disabled={!!busy}
            >
              <Save size={17} />
              Save draft
            </Button>
          )}
          <button
            type="button"
            className="icon-button discard"
            aria-label="Discard message"
            disabled={!!busy}
            onClick={() => setConfirm(true)}
          >
            <Trash2 size={19} />
          </button>
        </div>
      </form>
      {confirm && (
        <Modal title="Discard this message?" onClose={() => setConfirm(false)}>
          <p>
            Your unsaved changes will be lost.
            {draft ? " The saved draft will move to Trash." : ""}
          </p>
          <div className="modal-actions">
            <Button
              className="secondary"
              disabled={!!busy}
              onClick={() => setConfirm(false)}
            >
              Keep writing
            </Button>
            <Button
              className="danger"
              busy={busy === "discard"}
              onClick={() => void discard()}
            >
              Discard
            </Button>
          </div>
        </Modal>
      )}
    </section>
  );
}
