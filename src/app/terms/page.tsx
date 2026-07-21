import { LegalPage, LegalHeading, LegalList } from "@/components/LegalPage";

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" lastUpdated="July 20, 2026">
      <p>
        Please read these Terms of Service (&ldquo;Terms&rdquo;) carefully before using Orium. By
        creating an account or using Orium, you agree to these Terms.
      </p>

      <LegalHeading>1. Description of Service</LegalHeading>
      <p>
        Orium is a personal cash-flow forecasting tool. You manually enter your account balances,
        recurring bills, income, debts, savings goals, and one-off transactions, and Orium
        projects your future balance based on that information.
      </p>
      <p>
        <strong>Orium is not financial, investment, tax, or legal advice.</strong> Forecasts are
        estimates based solely on the information you provide and are not a guarantee of your
        actual future financial position. You are responsible for verifying your own financial
        decisions and consulting a qualified professional where appropriate.
      </p>

      <LegalHeading>2. Your Account</LegalHeading>
      <p>
        You must provide a valid email address to create an account and are responsible for
        keeping your password secure. You are responsible for all activity that occurs under your
        account. Notify us promptly if you believe your account has been compromised.
      </p>

      <LegalHeading>3. Your Data</LegalHeading>
      <p>
        You retain ownership of the financial data you enter into Orium. You are solely
        responsible for the accuracy of the information you provide. See our{" "}
        <a className="underline" href="/privacy">
          Privacy Policy
        </a>{" "}
        for details on how we handle your data.
      </p>

      <LegalHeading>4. Acceptable Use</LegalHeading>
      <p>You agree not to use Orium to:</p>
      <LegalList>
        <li>Violate any applicable law;</li>
        <li>Attempt to gain unauthorized access to other users&apos; accounts or data;</li>
        <li>Interfere with or disrupt the operation of the service.</li>
      </LegalList>

      <LegalHeading>5. Service Provided &ldquo;As Is&rdquo;</LegalHeading>
      <p>
        Orium is provided &ldquo;as is&rdquo; and &ldquo;as available,&rdquo; without warranties
        of any kind, express or implied, including but not limited to accuracy, reliability, or
        fitness for a particular purpose. We do not guarantee the service will be uninterrupted or
        error-free.
      </p>

      <LegalHeading>6. Limitation of Liability</LegalHeading>
      <p>
        To the fullest extent permitted by law, Orium and its developer shall not be liable for
        any indirect, incidental, or consequential damages, or for any financial decisions made
        based on information from the app.
      </p>

      <LegalHeading>7. Termination</LegalHeading>
      <p>
        You may stop using Orium and delete your account at any time from Settings, which
        permanently removes your data. We may suspend or terminate accounts that violate these
        Terms.
      </p>

      <LegalHeading>8. Changes to These Terms</LegalHeading>
      <p>
        We may update these Terms from time to time. If we make material changes, we will update
        the &ldquo;Last updated&rdquo; date above. Continued use of Orium after changes means you
        accept the updated Terms.
      </p>

      <LegalHeading>9. Governing Law</LegalHeading>
      <p>
        These Terms are governed by the laws of the Republic of the Philippines, without regard
        to conflict of law principles.
      </p>

      <LegalHeading>10. Contact Us</LegalHeading>
      <p>
        Questions about these Terms? Email us at{" "}
        <a className="underline" href="mailto:nate.corpuz1@gmail.com">
          nate.corpuz1@gmail.com
        </a>
        .
      </p>
    </LegalPage>
  );
}
