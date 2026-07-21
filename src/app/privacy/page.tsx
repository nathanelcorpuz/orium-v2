import { LegalPage, LegalHeading, LegalList } from "@/components/LegalPage";

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" lastUpdated="July 20, 2026">
      <p>
        Orium (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) provides a personal
        cash-flow forecasting app. This Privacy Policy explains what information we collect, how
        we use it, and the choices you have.
      </p>

      <LegalHeading>Information We Collect</LegalHeading>
      <p>
        <strong>Account information.</strong> When you create an account, we collect your email
        address and a securely hashed password, managed through our authentication provider,
        Supabase.
      </p>
      <p>
        <strong>Financial information you enter.</strong> Orium is a manual-entry budgeting tool.
        Everything else we store is information you choose to enter yourself: account balances,
        recurring bills, income, debt payments, savings goals, one-off transactions, reminders,
        and display preferences (like your currency symbol). We do not connect to your bank or
        pull financial data automatically.
      </p>
      <p>
        <strong>We do not collect:</strong> payment card numbers, government IDs, precise
        location, or any data beyond what you type into the app.
      </p>

      <LegalHeading>How We Use Your Information</LegalHeading>
      <p>
        We use the information above solely to operate Orium for you: to calculate your
        forecast, show your transaction history, and remember your preferences. We do not use
        your data for advertising, and we do not sell or rent it to anyone.
      </p>

      <LegalHeading>Where Your Data Is Stored</LegalHeading>
      <p>
        Your data is stored with Supabase, our database and authentication provider, using
        industry-standard security practices including encryption in transit and row-level
        access controls that restrict your data to your account only.
      </p>

      <LegalHeading>Sharing Your Information</LegalHeading>
      <p>We do not share your personal or financial information with third parties, except:</p>
      <LegalList>
        <li>With Supabase, strictly as our infrastructure provider, to operate the app.</li>
        <li>If required by law, such as in response to a valid legal request.</li>
      </LegalList>
      <p>We do not sell your data.</p>

      <LegalHeading>Your Rights and Choices</LegalHeading>
      <p>
        You can view, edit, or delete any of your data at any time from within the app. From
        Settings, you can permanently delete your account, which removes all of your balances,
        bills, income, debt, savings, extras, history, and reminders from our systems.
      </p>

      <LegalHeading>Children&apos;s Privacy</LegalHeading>
      <p>
        Orium is not directed at children under 13, and we do not knowingly collect information
        from them.
      </p>

      <LegalHeading>Changes to This Policy</LegalHeading>
      <p>
        If we make material changes to this policy, we will update the &ldquo;Last updated&rdquo;
        date above. Continued use of Orium after changes means you accept the updated policy.
      </p>

      <LegalHeading>Contact Us</LegalHeading>
      <p>
        Questions about this policy? Email us at{" "}
        <a className="underline" href="mailto:nate.corpuz1@gmail.com">
          nate.corpuz1@gmail.com
        </a>
        .
      </p>
    </LegalPage>
  );
}
