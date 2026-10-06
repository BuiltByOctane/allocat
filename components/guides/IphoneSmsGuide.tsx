import Link from "next/link";
import {
  IOS_GUIDE_PATH,
  IOS_KEYWORDS,
  IOS_SHORTCUT_NAME,
  IOS_SHORTCUT_URL,
} from "@/lib/shortcut/config";

/**
 * Public, step-by-step guide for iPhone SMS auto-capture via a Shortcuts
 * "Message" automation. Read on the phone while doing the setup, so it is a
 * single narrow column. Each step carries a "what you should see" panel — a
 * drawn stand-in for the iOS screen until real screenshots are added.
 */

const SETUP_HREF = "/sms?setup=ios";

/* ── Building blocks ─────────────────────────────────────────────────────── */

function StepHeading({ n, title }: { n: number; title: string }) {
  return (
    <h2 className="flex items-center gap-3 font-display text-xl font-bold tracking-[-0.02em] text-foreground">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-[var(--accent-ink)]">
        {n}
      </span>
      {title}
    </h2>
  );
}

function Callout({
  tone = "info",
  children,
}: {
  tone?: "info" | "warn";
  children: React.ReactNode;
}) {
  return (
    <div
      className={[
        "rounded-xl border px-4 py-3 text-sm leading-relaxed",
        tone === "warn"
          ? "border-neg/30 bg-neg/10 text-foreground"
          : "border-border bg-tile text-foreground",
      ].join(" ")}
    >
      {children}
    </div>
  );
}

/** A drawn iOS settings list — "what you should see" for a step. */
function Screen({
  caption,
  rows,
}: {
  caption: string;
  rows: Array<{ label: string; value?: string; on?: boolean; strong?: boolean }>;
}) {
  return (
    <figure className="flex flex-col gap-2">
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {rows.map((r, i) => (
          <div
            key={i}
            className={`flex items-center justify-between gap-3 px-4 py-3 text-sm ${
              i > 0 ? "border-t border-border" : ""
            }`}
          >
            <span className={r.strong ? "font-bold text-foreground" : "text-foreground"}>
              {r.label}
            </span>
            {r.on !== undefined ? (
              <span
                aria-label={r.on ? "on" : "off"}
                className={`relative h-6 w-10 shrink-0 rounded-full ${r.on ? "bg-pos" : "bg-muted"}`}
              >
                <span
                  className={`absolute top-0.5 size-5 rounded-full bg-white shadow ${
                    r.on ? "right-0.5" : "left-0.5"
                  }`}
                />
              </span>
            ) : r.value ? (
              <span className="truncate font-mono text-xs text-muted-foreground">{r.value}</span>
            ) : null}
          </div>
        ))}
      </div>
      <figcaption className="text-xs text-muted-foreground">{caption}</figcaption>
    </figure>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return <section className="flex flex-col gap-4 border-t border-border pt-8">{children}</section>;
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-xl border border-border bg-card px-4 py-3">
      <summary className="cursor-pointer list-none text-sm font-bold text-foreground marker:hidden">
        <span className="mr-2 inline-block transition-transform group-open:rotate-90">›</span>
        {q}
      </summary>
      <div className="mt-2 flex flex-col gap-2 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </details>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */

export function IphoneSmsGuide() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col gap-8 bg-background px-5 pb-16 pt-[calc(env(safe-area-inset-top)+24px)] text-foreground">
      <Link
        href="/"
        className="text-xs font-bold uppercase tracking-widest text-muted-foreground underline underline-offset-4"
      >
        ← AlloCat
      </Link>

      {/* Header */}
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-[30px] font-bold leading-[1.05] tracking-[-0.03em]">
          Log spends from bank SMS automatically on iPhone
        </h1>
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          iPhone apps aren&apos;t allowed to read your messages, but Apple&apos;s own
          Shortcuts app can. You set up a small automation once: when a bank SMS arrives, it
          hands the text to AlloCat, which picks out the amount and merchant and logs the
          spend. The message itself is not stored.
        </p>
      </header>

      {/* You'll need */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
          You&apos;ll need
        </h2>
        <ul className="flex flex-col gap-2 text-sm">
          <li>✓ An iPhone on iOS 17 or later</li>
          <li>✓ The Shortcuts app (already on your iPhone)</li>
          <li>✓ AlloCat added to your Home Screen and signed in</li>
          <li>✓ One recent bank debit SMS, to check its wording</li>
        </ul>
        <Callout>⏱ About 3 minutes, one time.</Callout>
      </section>

      {/* Step 1 */}
      <Section>
        <StepHeading n={1} title="Get your AlloCat key" />
        <p className="text-sm leading-relaxed">
          Open AlloCat → <b>Profile</b> → <b>SMS Transactions</b> → <b>iPhone auto-capture</b>{" "}
          → <b>Create &amp; copy my key</b>. The key is copied for you.
        </p>
        <Link
          href={SETUP_HREF}
          className="inline-flex min-h-[46px] items-center justify-center rounded-pill bg-accent px-5 text-sm font-bold text-[var(--accent-ink)]"
        >
          Open setup in AlloCat
        </Link>
        <Callout>
          🔑 Your key is like a private mailbox slot: it lets your bank messages <b>into</b>{" "}
          your AlloCat account and can&apos;t read anything. Don&apos;t share it. You can switch
          it off or make a new one any time from the same screen.
        </Callout>
      </Section>

      {/* Step 2 */}
      <Section>
        <StepHeading n={2} title="Add the shortcut and paste your key" />
        {IOS_SHORTCUT_URL ? (
          <a
            href={IOS_SHORTCUT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[46px] items-center justify-center rounded-pill bg-[var(--pill)] px-5 text-sm font-bold text-[var(--pill-foreground)]"
          >
            Get the “{IOS_SHORTCUT_NAME}” shortcut
          </a>
        ) : (
          <Callout>The shortcut link will appear here once it is published.</Callout>
        )}
        <ol className="ml-5 list-decimal space-y-1.5 text-sm leading-relaxed">
          <li>
            Tap <b>Add Shortcut</b>.
          </li>
          <li>
            In Shortcuts → <b>My Shortcuts</b>, tap <b>•••</b> on “{IOS_SHORTCUT_NAME}”.
          </li>
          <li>
            Tap the text <b>PASTE-YOUR-ALLOCAT-KEY-HERE</b>, select all, then <b>Paste</b>.
          </li>
          <li>
            Tap <b>Done</b>.
          </li>
        </ol>
        <Screen
          caption="What you should see: your key in the first action instead of the placeholder."
          rows={[
            { label: "Text", value: "alc_…your key…", strong: true },
            { label: "Get contents of", value: "allocat.xyz/api/shortcut/sms" },
            { label: "If notify has any value", value: "Show notification" },
          ]}
        />
      </Section>

      {/* Step 3 */}
      <Section>
        <StepHeading n={3} title="Test it once" />
        <p className="text-sm leading-relaxed">
          In <b>My Shortcuts</b>, tap “{IOS_SHORTCUT_NAME}” to run it. When iOS asks to let it
          connect to <b>allocat.xyz</b>, tap <b>Always Allow</b>.
        </p>
        <p className="text-sm leading-relaxed">
          You should see <b>“✅ AlloCat is connected”</b>, and the setup card in AlloCat turns
          green. Doing this now stops iOS from pausing your automation later to ask
          permission.
        </p>
      </Section>

      {/* Notifications */}
      <Section>
        <StepHeading n={4} title="Turn on AlloCat notifications" />
        <p className="text-sm leading-relaxed">
          So tapping a spend notification opens AlloCat right at that transaction:
        </p>
        <ol className="ml-5 list-decimal space-y-1.5 text-sm leading-relaxed">
          <li>
            In Safari, open allocat.xyz, tap <b>Share</b> → <b>Add to Home Screen</b>.
          </li>
          <li>Open AlloCat from the Home Screen icon (not from Safari).</li>
          <li>
            Go to <b>Profile</b> → <b>SMS Transactions</b> → <b>iPhone auto-capture</b> → tap{" "}
            <b>Turn on notifications</b> → <b>Allow</b>.
          </li>
        </ol>
        <Callout>
          Skipping this still works: the shortcut shows its own notification instead, but
          tapping that one opens the Shortcuts app, not AlloCat.
        </Callout>
      </Section>

      {/* Step 5 */}
      <Section>
        <StepHeading n={5} title="Create the automation" />
        <ol className="ml-5 list-decimal space-y-1.5 text-sm leading-relaxed">
          <li>
            Open Shortcuts → <b>Automation</b> tab → <b>+</b>.
          </li>
          <li>
            Choose <b>Message</b>.
          </li>
          <li>
            Tap <b>Message Contains</b> and type <b>{IOS_KEYWORDS[0].word}</b>. Leave Sender
            empty.
          </li>
          <li>
            Choose <b>Run Immediately</b>, and turn <b>Notify When Run</b> off.
          </li>
          <li>
            Tap <b>Next</b> and pick “{IOS_SHORTCUT_NAME}”.
          </li>
        </ol>
        <Screen
          caption="What you should see before tapping Next."
          rows={[
            { label: "When I get a message", strong: true },
            { label: "Sender", value: "Any" },
            { label: "Message Contains", value: IOS_KEYWORDS[0].word },
            { label: "Run Immediately", on: true },
            { label: "Notify When Run", on: false },
          ]}
        />
        <Callout tone="warn">
          ⚠️ <b>Don&apos;t use the Sender filter.</b> Banks send from IDs like VM-HDFCBK, and iOS
          often fails to match them, so the automation silently never runs. Use{" "}
          <b>Message Contains</b> only.
        </Callout>
        <Callout>
          “Run Immediately” is what makes it automatic. With “Run After Confirmation” you
          would have to tap a banner for every spend.
        </Callout>
      </Section>

      {/* Step 6 */}
      <Section>
        <StepHeading n={6} title="Add a second keyword" />
        <p className="text-sm leading-relaxed">
          Each automation matches one word. Repeat Step 5 with <b>{IOS_KEYWORDS[1].word}</b> so
          card spends are caught too.
        </p>
        <div className="overflow-hidden rounded-2xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-tile text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Keyword</th>
                <th className="px-4 py-2">Catches</th>
              </tr>
            </thead>
            <tbody>
              {IOS_KEYWORDS.map((k) => (
                <tr key={k.word} className="border-t border-border">
                  <td className="px-4 py-2 font-mono font-bold">{k.word}</td>
                  <td className="px-4 py-2 text-muted-foreground">{k.note}</td>
                </tr>
              ))}
              <tr className="border-t border-border">
                <td className="px-4 py-2 font-mono font-bold">Rs / INR</td>
                <td className="px-4 py-2 text-muted-foreground">
                  Catch-all if your bank uses other words. Runs more often; AlloCat quietly
                  ignores anything that isn&apos;t a spend.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <Callout>
          Tip: open a real debit SMS from your bank and pick a word that is always in it but
          never in your chats.
        </Callout>
      </Section>

      {/* Step 7 */}
      <Section>
        <StepHeading n={7} title="Check it works" />
        <p className="text-sm leading-relaxed">
          On your next payment you&apos;ll get a notification like <b>“🐾 ₹240 at Swiggy”</b>.
          Open AlloCat and it&apos;s waiting under <b>Profile → SMS Transactions → Pending</b>. Once you
          allocate a merchant, AlloCat remembers it and files that merchant&apos;s future spends
          on its own (“🐾 ₹240 at Swiggy → Food”).
        </p>
        <p className="text-sm leading-relaxed">
          The setup card in AlloCat shows when the last spend came in, so you can always tell
          it&apos;s still working.
        </p>
      </Section>

      {/* Troubleshooting */}
      <Section>
        <h2 className="font-display text-xl font-bold tracking-[-0.02em]">Troubleshooting</h2>
        <div className="flex flex-col gap-2">
          <Faq q="Nothing happens when a bank SMS arrives">
            <p>
              Open Shortcuts → Automation and check the automation is there and switched on.
            </p>
            <p>
              Open it and make sure it still says <b>Run Immediately</b> — some iOS updates
              switch automations back to “Run After Confirmation”.
            </p>
            <p>Check the keyword really appears in your bank&apos;s SMS (spelling matters).</p>
          </Faq>
          <Faq q="The shortcut ran but nothing shows in AlloCat">
            <p>
              Run “{IOS_SHORTCUT_NAME}” by hand. If it says your key no longer works, make a
              new key in AlloCat and paste it into the shortcut (Step 2).
            </p>
            <p>If it says to paste your key, the placeholder text is still in the shortcut.</p>
            <p>The phone needs internet when the SMS arrives.</p>
          </Faq>
          <Faq q="It runs for every message">
            <p>
              The keyword is too common. Use a longer phrase copied from a real bank SMS, such
              as “debited from”.
            </p>
          </Faq>
          <Faq q="Some payments are missed">
            <p>
              Low Power Mode and Focus modes can delay automations. Adding the second keyword
              (Step 6) catches banks that word things differently.
            </p>
            <p>You can always add a missed spend by hand in AlloCat.</p>
          </Faq>
          <Faq q={`“${IOS_SHORTCUT_NAME}” isn't in the list when creating the automation`}>
            <p>The shortcut wasn&apos;t added yet — go back to Step 2.</p>
          </Faq>
          <Faq q="I added the shortcut again and it stopped working">
            <p>
              Re-adding the shortcut creates a new copy and your automation keeps pointing at
              the old one (or gets switched off). Open the automation, pick the new copy, and
              switch it on. To change your key, edit the existing shortcut instead of adding it
              again.
            </p>
          </Faq>
          <Faq q="How do I stop it?">
            <p>
              Delete the automations in Shortcuts → Automation, and tap <b>Turn off</b> on the
              iPhone auto-capture card in AlloCat. That switches the key off immediately.
            </p>
          </Faq>
        </div>
      </Section>

      {/* Privacy */}
      <Section>
        <h2 className="font-display text-xl font-bold tracking-[-0.02em]">Your privacy</h2>
        <ul className="ml-5 list-disc space-y-1.5 text-sm leading-relaxed text-muted-foreground">
          <li>
            <b className="text-foreground">Sent:</b> only the text of messages that match your
            keyword.
          </li>
          <li>
            <b className="text-foreground">Kept:</b> the amount, merchant, time, and one-way
            hashes used to avoid duplicates.
          </li>
          <li>
            <b className="text-foreground">Not kept:</b> the message itself. It is read once to
            find the spend and then discarded.
          </li>
        </ul>
        <p className="text-sm">
          Details in our{" "}
          <Link href="/legal/privacy-policy" className="underline underline-offset-4">
            privacy policy
          </Link>
          .
        </p>
      </Section>

      <p className="text-center text-xs text-muted-foreground">
        allocat.xyz{IOS_GUIDE_PATH}
      </p>
    </main>
  );
}
