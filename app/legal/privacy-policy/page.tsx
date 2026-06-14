import Link from "next/link";

export const metadata = {
  title: "Privacy Policy | AlloCat",
  description:
    "How AlloCat handles your data, including on-device parsing of transaction SMS.",
  alternates: { canonical: "https://allocat.xyz/legal/privacy-policy" },
};

const UPDATED = "5 June 2026";

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-[720px] bg-background px-6 py-12 text-foreground">
      <Link
        href="/"
        className="text-xs font-bold uppercase tracking-widest text-muted-foreground underline"
      >
        ← AlloCat
      </Link>

      <h1 className="mt-6 text-2xl font-bold uppercase tracking-widest">
        Privacy Policy
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: {UPDATED}</p>

      <Section title="Summary">
        <p>
          AlloCat is a personal-finance app. Your financial data is yours. We
          collect the minimum needed to run the app, we never sell your data, and
          we never share it with third-party advertisers or data brokers. The raw
          content of your SMS messages never leaves your device.
        </p>
      </Section>

      <Section title="SMS transaction tracking (Android)">
        <p>
          AlloCat&rsquo;s core feature is automatic spend tracking from your
          bank/UPI <strong>transaction</strong> SMS (&ldquo;SMS-based money
          management&rdquo;). To support this on Android, the app uses the{" "}
          <code>RECEIVE_SMS</code> permission. We handle this data as follows:
        </p>
        <ul className="ml-5 list-disc space-y-2">
          <li>
            <strong>On-device parsing.</strong> When a new SMS arrives, it is
            examined <strong>on your device</strong>. Only messages that look like
            a financial transaction (a debit/credit with an amount) are processed.
            One-time passwords (OTPs), personal messages, and promotional texts are
            filtered out and discarded immediately.
          </li>
          <li>
            <strong>The raw SMS never leaves your device.</strong> The full message
            text and the sender are stored only in local storage on your phone (for
            display and de-duplication). They are <strong>not</strong> uploaded to
            our servers.
          </li>
          <li>
            <strong>No third parties.</strong> SMS content is never sent to any
            third-party service, advertiser, or AI provider. All parsing is local.
          </li>
          <li>
            <strong>We do not read your SMS inbox.</strong> AlloCat only inspects
            messages as they arrive; it does not request the <code>READ_SMS</code>{" "}
            permission and never reads your existing stored messages.
          </li>
          <li>
            <strong>What syncs to your account.</strong> Only the fields extracted
            from a transaction SMS — the amount, currency, a normalized merchant
            name, the direction (spend/credit), and a date — together with a
            one-way hashed de-duplication key, are synced to your account so your
            budgets stay consistent across devices.
          </li>
        </ul>
      </Section>

      <Section title="Data we store for your account">
        <p>
          When you sign in, we store the data you create in the app — budgets,
          categories, goals, debts, assets, net-worth snapshots, and the extracted
          transaction fields described above. This is kept in our managed database
          (Supabase) and is associated with your account so it can sync across your
          devices. It is transmitted over encrypted connections.
        </p>
      </Section>

      <Section title="Authentication">
        <p>
          We support email and Google sign-in. We store your email address and an
          account identifier to operate your account. We do not access your Google
          contacts, email, or other Google data beyond basic profile/email needed
          for sign-in.
        </p>
      </Section>

      <Section title="How we use your data">
        <p>
          Your data is used solely to provide the app&rsquo;s features: tracking
          budgets and spending, syncing across your devices, and sending you
          notifications you have enabled (for example, a budget-limit alert). We do
          not use it for advertising or marketing, and we do not sell it.
        </p>
      </Section>

      <Section title="Notifications">
        <p>
          With your permission, AlloCat sends local and push notifications — for
          example, when a new transaction needs categorizing or a budget nears its
          limit. You can disable these in your device settings at any time.
        </p>
      </Section>

      <Section title="Your choices and data deletion">
        <p>
          You can withdraw SMS or notification permission at any time in Android
          settings; the related features simply stop. You may permanently delete
          your account and all associated data in-app under{" "}
          <strong>Profile → Delete account</strong>, or by following the steps on
          our{" "}
          <Link className="underline" href="/legal/delete-account">
            account-deletion page
          </Link>
          . Deleting the app also removes all locally stored data, including any
          raw SMS text.
        </p>
      </Section>

      <Section title="Children">
        <p>AlloCat is not directed to children under 13.</p>
      </Section>

      <Section title="Changes">
        <p>
          We may update this policy; material changes will be reflected by the
          &ldquo;Last updated&rdquo; date above.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions about this policy or your data? Email{" "}
          <a className="underline" href="mailto:innovationsoctane@gmail.com">
            innovationsoctane@gmail.com
          </a>
          .
        </p>
      </Section>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-bold uppercase tracking-widest">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}
