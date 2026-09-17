<script lang="ts">
import LegalPage from '$lib/components/legal-page.svelte'
</script>

<LegalPage
  title="Terms & Conditions"
  description="The terms for using Morrow to buy, sell, and gift shares and cash."
  path="/terms-conditions"
  updated="September 17, 2026"
>
  {#snippet lead()}
    <p>
      These Terms &amp; Conditions (“Terms”) are an agreement between you (“you”) and
      <strong>Morrow</strong> (“Morrow,” “we,” “us,” or “our”). By using the Morrow app, this website,
      or any related services (the “Services”), you agree to these Terms. If you do not agree, do not
      use the Services.
    </p>
  {/snippet}

  <p>
    These Terms should be read together with our <a href="/privacy-policy">Privacy Policy</a>, which
    explains how we handle your information.
  </p>

  <h2>1. Eligibility</h2>
  <p>To use the Services, you must:</p>
  <ul>
    <li>Be at least <strong>18 years old</strong>.</li>
    <li>Be allowed to use services like Morrow under the laws where you live.</li>
  </ul>
  <p>
    By creating an account, you confirm that you meet these requirements. We may refuse service or
    restrict access if they are not met.
  </p>

  <h2>2. What Morrow is</h2>
  <p>
    Morrow lets you buy, sell, and gift shares and cash, and start funds for someone’s future. It is
    built on a <strong>decentralized network</strong>, and your account and everything in it stay
    under <strong>your control</strong>. Money only moves when you approve it. Morrow prepares each
    action for you to approve, but cannot move your money on its own, and never holds it for you.
  </p>
  <p>
    Morrow is not a bank, broker, or financial adviser. Nothing in the Services is financial,
    investment, legal, or tax advice.
  </p>

  <h2>3. Shares on Morrow</h2>
  <p>
    Shares on Morrow are digital tokens issued by a third party that track the price of a public
    company’s stock. Holding them is <strong>not the same as owning the stock directly</strong>.
    They may not carry voting rights or other shareholder rights, and the issuer can pause or
    restrict them. Prices move, and you can lose some or all of the money you put in.
  </p>

  <h2>4. Gifts</h2>
  <ul>
    <li>A gift is reserved for one recipient, and only they can open it.</li>
    <li>
      If a gift is not opened within <strong>30 days</strong>, it goes back to the sender. The
      sender can also take back an unopened gift at any time.
    </li>
    <li>
      A gift sent to an email address must be opened by signing in with a code sent to that same
      email address.
    </li>
    <li>You are responsible for sending gifts to the right person.</li>
  </ul>

  <h2>5. Funds</h2>
  <p>
    When you start a fund, you choose who it is for and the date it unlocks. <strong
      >Neither can be changed later.</strong
    >
    Anyone can add to a fund. Only the person it is for can take the money out, and only after the unlock
    date.
  </p>

  <h2>6. Private transactions</h2>
  <p>
    You can choose to make a gift or transfer <strong>private</strong>. Private transactions use
    zero-knowledge proofs, which let the network confirm the transaction is valid without publicly
    revealing its details. Privacy is off unless you turn it on for that transaction.
  </p>
  <p>
    Private transactions must still follow these Terms. Using them to hide unlawful activity is not
    allowed.
  </p>

  <h2>7. Fees</h2>
  <p>
    We show any fee before you confirm an action. Gifts, funds, and cash-outs may include the
    network costs of carrying them out, charged at cost. Buying and selling may include a small
    trading fee.
  </p>

  <h2>8. Your responsibilities</h2>
  <ul>
    <li>Keep access to your email and account secure.</li>
    <li>Check addresses, amounts, and recipients before you approve anything.</li>
    <li>
      Do not use the Services for anything unlawful, including fraud, money laundering, or getting
      around sanctions.
    </li>
  </ul>
  <p>
    Completed actions cannot be reversed by us. We cannot recover money sent to the wrong person or
    address.
  </p>

  <h2>9. Third-party services</h2>
  <p>
    The Services rely on other providers for sign-in, prices, trading, and the network that records
    your activity. We are not responsible for their availability or for how they perform.
  </p>

  <h2>10. No warranty and limits of liability</h2>
  <p>
    The Services are provided “as is” and “as available.” To the fullest extent the law allows, we
    are not liable for losses from price changes, third-party services, network delays, or actions
    you approve.
  </p>

  <h2>11. Changes</h2>
  <p>
    We may update these Terms. When we do, we will change the date at the top of this page. Using
    the Services after an update means you accept the new Terms.
  </p>

  <h2>12. Contact</h2>
  <p>
    Questions about these Terms? Reach us on <a
      href="https://x.com/trymorrow"
      target="_blank"
      rel="noopener noreferrer">X</a
    >
    or
    <a href="https://www.reddit.com/r/TRYMORROW/" target="_blank" rel="noopener noreferrer"
      >Reddit</a
    >.
  </p>
</LegalPage>
