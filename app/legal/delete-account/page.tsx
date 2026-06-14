import Link from "next/link";

export const metadata = {
  title: "Delete Your Account | AlloCat",
  description:
    "How to permanently delete your AlloCat account and all associated data.",
  alternates: { canonical: "https://allocat.xyz/legal/delete-account" },
};

export default function DeleteAccountPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-[720px] bg-background px-6 py-12 text-foreground">
      <Link
        href="/"
        className="text-xs font-bold uppercase tracking-widest text-muted-foreground underline"
      >
        ← AlloCat
      </Link>

      <h1 className="mt-6 text-2xl font-bold uppercase tracking-widest">
        Delete your account
      </h1>

      <Section title="In the app (fastest)">
        <p>
          You can delete your account and all of your data directly from the app:
        </p>
        <ol className="ml-5 list-decimal space-y-2">
          <li>Open AlloCat and sign in.</li>
          <li>
            Go to <strong>Profile</strong>.
          </li>
          <li>
            Scroll to the bottom and tap <strong>Delete account</strong>.
          </li>
          <li>
            Confirm <strong>Delete forever</strong>.
          </li>
        </ol>
        <p>
          This is immediate and permanent — there is no recovery period.
        </p>
      </Section>

      <Section title="By email">
        <p>
          If you can&rsquo;t access the app, email{" "}
          <a className="underline" href="mailto:innovationsoctane@gmail.com?subject=Delete%20my%20AlloCat%20account">
            innovationsoctane@gmail.com
          </a>{" "}
          from the address on your account and ask us to delete it. We process
          these requests within 30 days.
        </p>
      </Section>

      <Section title="What gets deleted">
        <p>
          Deleting your account permanently removes everything associated with
          it: your profile, budgets, categories, goals, debts, assets,
          net-worth snapshots, activity history, learned merchant rules, and all
          extracted transaction records. Your authentication record is removed
          too.
        </p>
        <p>
          Any raw SMS text stays only on your device and is removed when you
          uninstall the app — it is never stored on our servers.
        </p>
        <p>
          Deletion is permanent and cannot be undone. We retain no copy after
          deletion except where required by law.
        </p>
      </Section>

      <Section title="Privacy">
        <p>
          For full details on what we collect and how we handle it, see our{" "}
          <Link className="underline" href="/legal/privacy-policy">
            Privacy Policy
          </Link>
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
