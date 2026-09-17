<script lang="ts">
import LegalPage from '$lib/components/legal-page.svelte'
</script>

<LegalPage
  title="Privacy Policy"
  description="What information Morrow collects, why, and who it is shared with."
  path="/privacy-policy"
  updated="September 17, 2026"
>
  {#snippet lead()}
    <p>
      This Privacy Policy explains what information <strong>Morrow</strong> (“Morrow,” “we,” “us,” or
      “our”) collects when you use the Morrow app, this website, or any related services (the “Services”),
      how we use it, and the choices you have.
    </p>
  {/snippet}

  <p>
    It should be read together with our <a href="/terms-conditions">Terms &amp; Conditions</a>.
  </p>

  <h2>1. What we collect</h2>
  <p><strong>Information you give us:</strong></p>
  <ul>
    <li>Your email address, which you use to sign in.</li>
    <li>Your name, Morrow handle, and profile photo, if you add them.</li>
    <li>Your country, and when you accepted our Terms.</li>
    <li>Gift details, such as the recipient’s email address or handle and the note you write.</li>
    <li>Cash-out addresses you enter.</li>
  </ul>
  <p><strong>Information created as you use Morrow:</strong></p>
  <ul>
    <li>Your account address and the gifts, funds, buys, sells, and cash-outs you make.</li>
    <li>Your notification settings, and a notification subscription if you turn them on.</li>
  </ul>

  <h2>2. What we don’t collect</h2>
  <ul>
    <li>We don’t ask for ID documents or selfies.</li>
    <li>We don’t collect bank card numbers.</li>
    <li>We never hold your money or the keys to your account.</li>
  </ul>

  <h2>3. Public records and private transactions</h2>
  <p>
    Morrow runs on a public, decentralized network. Your account address and the actions you
    approve, such as sending a gift or buying shares, are <strong
      >recorded publicly and permanently</strong
    >. We cannot remove them. They do not include your email address or name.
  </p>
  <p>
    <strong>Private transactions.</strong> You can choose to make a gift or transfer private. Private
    transactions use zero-knowledge proofs, which let the network confirm the transaction without publicly
    revealing its details. Privacy is off unless you turn it on for that transaction.
  </p>

  <h2>4. How we use your information</h2>
  <ul>
    <li>To create and secure your account.</li>
    <li>To deliver gifts, run funds, and prepare the actions you approve.</li>
    <li>To show your balances, activity, and gains or losses.</li>
    <li>To send you notifications you have chosen to receive.</li>
    <li>To prevent abuse and to meet our legal obligations.</li>
  </ul>
  <p>We don’t sell your information, and we don’t use it for advertising.</p>

  <h2>5. Who we share it with</h2>
  <p>We share information only with providers that help run the Services:</p>
  <ul>
    <li><strong>Privy</strong>, for sign-in and your account.</li>
    <li><strong>Supabase</strong>, which stores our data.</li>
    <li><strong>Vercel</strong>, which hosts the app and website.</li>
    <li><strong>Helius</strong>, for access to the network.</li>
    <li><strong>Jupiter</strong>, for prices and trades.</li>
  </ul>
  <p>
    When you send a gift, the recipient sees your name and your note. We may also share information
    when the law requires it.
  </p>

  <h2>6. How long we keep it</h2>
  <p>
    We keep your information while your account is active and as long as we need it for the reasons
    above or to meet legal obligations. Public network records stay permanently, as explained in
    section 3.
  </p>

  <h2>7. Your choices</h2>
  <ul>
    <li>You can edit your name, handle, and photo in the app.</li>
    <li>You can turn notifications off at any time.</li>
    <li>You can choose to make a gift or transfer private.</li>
    <li>
      You can ask us for a copy of your information, or ask us to delete it, by contacting us.
    </li>
  </ul>

  <h2>8. Children</h2>
  <p>
    The Services are not for anyone under 18, and we don’t knowingly collect information from them.
  </p>

  <h2>9. Changes</h2>
  <p>
    We may update this Privacy Policy. When we do, we will change the date at the top of this page.
  </p>

  <h2>10. Contact</h2>
  <p>
    Questions about your privacy? Reach us on <a
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
