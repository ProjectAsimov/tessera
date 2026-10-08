import { Sheet } from '../components/Sheet';
import { GoogleButton, LinkButton } from '../components/Button';
import { signIn, markWelcomed } from '../model/session';
import { MOCK } from '../model/api';
import { closeSheet } from '../lib/nav';
import { joinPreview, skipPendingJoin } from '../model/groups';

export function Welcome({ open }: { open: boolean }) {
  const jp = joinPreview.value;
  const skip = () => {
    markWelcomed();
    if (jp) skipPendingJoin();
    else closeSheet();
  };
  return (
    <Sheet open={open} onClose={skip} center labelledBy="welcomeTitle">
      <img src={import.meta.env.BASE_URL + 'icon.svg'} alt="" width={56} height={56} />
      <h2 id="welcomeTitle">Tessera</h2>
      {jp ? (
        <>
          <p>Sign in to join {jp.name}.</p>
          <p>You'll get your own {jp.name} task and appear on the group leaderboard.</p>
        </>
      ) : (
        <>
          <p>One square per day, lit on the days you did the thing.</p>
          <p>Sign in so your days follow you to every device. Nothing else is shared.</p>
        </>
      )}
      <GoogleButton onClick={signIn}>{MOCK ? 'Sign in (mock)' : 'Continue with Google'}</GoogleButton>
      <LinkButton onClick={skip}>Not now</LinkButton>
    </Sheet>
  );
}
