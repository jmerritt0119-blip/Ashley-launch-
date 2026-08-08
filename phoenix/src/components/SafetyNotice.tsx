interface Props {
  onAcknowledge: () => void;
}

export default function SafetyNotice({ onAcknowledge }: Props) {
  return (
    <div className="overlay">
      <div className="modal">
        <h2>Before you begin — a word about safety</h2>
        <p className="muted">
          Phoenix keeps everything you record <strong>on this device only</strong>. Nothing is
          uploaded to a server unless you use the AI Advocate, which sends only what you choose to
          share.
        </p>
        <div className="notice">
          <strong>If someone may be monitoring this device, stop.</strong> Abusers sometimes install
          monitoring software on phones and computers. If that's possible, use a safer device — a
          library or work computer, or a trusted friend's phone — and clear your browsing history
          after each visit.
        </div>
        <p>
          <strong>The red "Exit" button</strong> (top right, always visible) instantly replaces this
          page with a weather search. Pressing <kbd>Esc</kbd> twice does the same thing.
        </p>
        <p>
          <strong>If you are in danger right now:</strong> call <strong>911</strong>. To talk with an
          advocate any time: National Domestic Violence Hotline, <strong>1-800-799-7233</strong>, or
          text <strong>START</strong> to <strong>88788</strong>, or chat at thehotline.org.
        </p>
        <p className="muted small">
          Phoenix helps you organize facts and prepare — it is not a law firm and does not give
          legal advice. For decisions about your case, work with a licensed attorney or legal aid.
        </p>
        <button className="btn" onClick={onAcknowledge}>
          I understand — let's get to work
        </button>
      </div>
    </div>
  );
}
