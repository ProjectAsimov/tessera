import { Sheet } from '../components/Sheet';
import { Button, LinkButton } from '../components/Button';
import { Terms } from '../components/Terms';
import { joinPreview, joinPending, skipPendingJoin } from '../model/groups';

/** The Join sheet: shown when a pending invite is picked up while signed in. */
export function Join({ open }: { open: boolean }) {
  const jp = joinPreview.value;
  return (
    <Sheet open={open} onClose={skipPendingJoin} center labelledBy="joinTitle">
      <h2 id="joinTitle">{jp?.name ?? 'Join group'}</h2>
      <p class="acct">hosted by {jp?.hostName}</p>
      <p class="acct">{jp?.members} of {jp?.memberLimit} members</p>
      <p class="acct">You'll get your own {jp?.name} task and appear on the group leaderboard.</p>
      <Terms />
      <Button primary onClick={() => void joinPending()}>Join</Button>
      <LinkButton onClick={skipPendingJoin}>Not now</LinkButton>
    </Sheet>
  );
}
