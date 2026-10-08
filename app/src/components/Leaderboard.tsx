import { Button } from './Button';
import type { Group, Member } from '../model/types';
import './Leaderboard.css';

interface Props {
  group: Group;
  members: Member[];
  isHost: boolean;
  onInvite: () => void;
  onLeave: () => void;
  onManage: () => void;
  onShout: (userId: string) => void;
}

/** Task screen "Group" card: the leaderboard for a shared task's group. */
export function Leaderboard({ group, members, isHost, onInvite, onLeave, onManage, onShout }: Props) {
  return (
    <div class="group-card">
      <div class="group-head">
        <h2>{group.name}</h2>
        <p>{group.members} of {group.memberLimit} members</p>
      </div>
      <div class="group-cols" aria-hidden="true">
        <span /><span /><span>Streak</span><span>Month</span><span>Total</span><span />
      </div>
      <ol class="group-list">
        {members.map((m, i) => (
          <li key={m.userId} class={m.isMe ? 'me' : undefined}>
            <span class="gpos">{i + 1}</span>
            <span class="gname">
              <span class="gn">{m.name}</span>
              {m.isHost && <span class="gtag">host</span>}
              {m.friend > 0 && <span class="gfriend" title={`${m.friend} days in a row together`} aria-label={`${m.friend} days in a row together`}>{'🤝'} {m.friend}</span>}
            </span>
            <span class="gstat">{m.streak}</span>
            <span class="gstat">{m.month}</span>
            <span class="gstat">{m.total}</span>
            {m.isMe ? (
              <span class="gshout me" title="Shoutouts you got this week" aria-label={`${m.shouts} shoutouts received this week`}>{'🔥'} {m.shouts}</span>
            ) : (
              <button
                type="button"
                class={'gshout' + (m.shoutedToday ? ' sent' : '')}
                disabled={m.shoutedToday}
                onClick={() => onShout(m.userId)}
                aria-label={m.shoutedToday ? `Shoutout sent to ${m.name} today. ${m.shouts} this week` : `Send ${m.name} a shoutout. ${m.shouts} this week`}
              >
                {'🔥'} {m.shouts}
              </button>
            )}
          </li>
        ))}
      </ol>
      <div class="row">
        <Button onClick={onInvite}>Invite</Button>
        {isHost
          ? <Button onClick={onManage}>Manage members</Button>
          : <Button warn onClick={onLeave}>Leave</Button>}
      </div>
    </div>
  );
}
