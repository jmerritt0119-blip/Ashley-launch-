export default function Resources() {
  return (
    <div>
      <h1>Resources & guides</h1>

      <div className="panel">
        <h2>Right now, any hour</h2>
        <ul>
          <li>
            <strong>Emergency:</strong> 911
          </li>
          <li>
            <strong>National Domestic Violence Hotline:</strong> 1-800-799-7233 (SAFE) · text{" "}
            <strong>START</strong> to <strong>88788</strong> · live chat at{" "}
            <a href="https://www.thehotline.org" target="_blank" rel="noreferrer">
              thehotline.org
            </a>{" "}
            — advocates can help with safety planning, shelter, and local referrals.
          </li>
          <li>
            <strong>988</strong> — Suicide & Crisis Lifeline (call or text).
          </li>
          <li>
            <strong>RAINN (sexual assault):</strong> 1-800-656-4673 ·{" "}
            <a href="https://rainn.org" target="_blank" rel="noreferrer">
              rainn.org
            </a>
          </li>
          <li>
            <strong>StrongHearts Native Helpline:</strong> 1-844-762-8483
          </li>
        </ul>
      </div>

      <div className="panel">
        <h2>Legal help</h2>
        <ul>
          <li>
            <a href="https://www.womenslaw.org" target="_blank" rel="noreferrer">
              WomensLaw.org
            </a>{" "}
            — plain-English, <strong>state-by-state</strong> law on protective orders, custody,
            divorce, and evidence rules (including recording-consent laws), plus a free{" "}
            <a href="https://hotline.womenslaw.org" target="_blank" rel="noreferrer">
              email hotline
            </a>{" "}
            answered by legal information specialists. Start here for "what does my state allow?"
          </li>
          <li>
            <a href="https://www.lawhelp.org" target="_blank" rel="noreferrer">
              LawHelp.org
            </a>{" "}
            — find free legal aid in your state (many programs prioritize DV survivors).
          </li>
          <li>
            Your county's <strong>family court self-help center</strong> — most courts have one;
            clerks can't give advice but self-help staff can explain forms, including protective
            order and emergency custody paperwork.
          </li>
          <li>
            Local DV advocacy organizations often provide <strong>free court accompaniment</strong>{" "}
            and help completing protective-order petitions — the Hotline can connect you.
          </li>
        </ul>
      </div>

      <div className="panel">
        <h2>Protecting your child</h2>
        <ul>
          <li>
            Ask about <strong>protective orders that include your child</strong>, emergency
            (<em>ex parte</em>) custody orders, and <strong>supervised visitation</strong> — courts
            can order exchanges and visits to happen through a supervised visitation center.
          </li>
          <li>
            Keep the custody log here religiously: missed visits, exchange incidents, concerning
            statements (her exact words, unprompted), unsafe behavior. Dated, factual entries are
            what family courts act on.
          </li>
          <li>
            Loop in the pediatrician, school counselor, or a child therapist when appropriate —
            their records are independent corroboration, and they are trained reporters.
          </li>
          <li>
            Follow existing court orders precisely while working to change them — violations get
            used against protective parents. Your attorney can move fast to modify a dangerous
            order.
          </li>
        </ul>
      </div>

      <div className="panel">
        <h2>Preserving evidence the right way</h2>
        <ul>
          <li>
            <strong>Texts:</strong> keep originals on the phone. Screenshot full threads including
            the contact name/number and timestamps. Your attorney can subpoena carrier records —
            deletion on your end doesn't destroy his sent messages, but preserve yours anyway.
          </li>
          <li>
            <strong>Photos:</strong> photograph injuries as soon as safe, again over following days
            as bruising develops, with a date reference where possible. Seek medical care — records
            corroborate.
          </li>
          <li>
            <strong>Never</strong> log into his accounts, install tracking on his devices, or record
            where consent laws prohibit it — illegally obtained evidence can be excluded and can
            expose <em>you</em> to liability. Check your state's recording-consent rule on
            WomensLaw before recording calls.
          </li>
          <li>
            <strong>Keep copies off-shared-devices:</strong> a cloud account he can't access, or a
            drive stored with someone you trust. Use the encrypted backup in Settings.
          </li>
          <li>
            <strong>Write things down the day they happen.</strong> Contemporaneous notes are
            credible; reconstructed memories get picked apart.
          </li>
        </ul>
      </div>

      <div className="panel">
        <h2>Money & rebuilding</h2>
        <ul>
          <li>
            <a href="https://www.freefrom.org" target="_blank" rel="noreferrer">
              FreeFrom
            </a>{" "}
            — financial resources built for survivors (cash assistance, credit repair, cost-of-abuse
            compensation).
          </li>
          <li>
            Check your credit reports at{" "}
            <a href="https://www.annualcreditreport.com" target="_blank" rel="noreferrer">
              annualcreditreport.com
            </a>{" "}
            — financial abuse often hides there; flag accounts you didn't open.
          </li>
          <li>
            <a href="https://www.techsafety.org/resources-survivors" target="_blank" rel="noreferrer">
              Safety Net (NNEDV)
            </a>{" "}
            — step-by-step guides to securing your phone, accounts, and location settings against
            monitoring.
          </li>
        </ul>
      </div>

      <p className="muted small">
        Phoenix provides organization tools and general information, not legal advice. Laws differ
        by state — verify anything important with your attorney, legal aid, or WomensLaw.
      </p>
    </div>
  );
}
