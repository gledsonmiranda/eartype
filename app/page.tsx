'use client';

/**
 * The whole session, as §6 draws it: `idle` until a video resolves, then the
 * practice loop. Phase 1 keeps nothing — leaving goes back to an empty form,
 * which is also the fastest way to start over.
 */

import { useState } from 'react';
import { EntryScreen, type StartRequest } from '@/app/components/EntryScreen';
import { PracticeScreen } from '@/app/components/PracticeScreen';

export default function Home() {
  const [session, setSession] = useState<StartRequest | null>(null);

  if (session === null) return <EntryScreen onStart={setSession} />;

  return (
    <PracticeScreen
      videoId={session.videoId}
      segments={session.segments}
      captionKind={session.captionKind}
      startIndex={session.startIndex}
      onLeave={() => setSession(null)}
    />
  );
}
