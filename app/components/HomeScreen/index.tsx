'use client';

/**
 * The whole session, as §6 draws it: `idle` until a video resolves, then the
 * practice loop. Leaving goes back to an empty form; how far you got in the
 * video is kept by the practice screen itself, per video.
 */

import { useState, type ReactNode } from 'react';
import { EntryScreen, type StartRequest } from '@/app/components/EntryScreen';
import { PracticeScreen } from '@/app/components/PracticeScreen';

export function HomeScreen({ library }: { library: ReactNode }) {
  const [session, setSession] = useState<StartRequest | null>(null);

  if (session === null) return <EntryScreen library={library} onStart={setSession} />;

  return (
    <PracticeScreen
      videoId={session.videoId}
      segments={session.segments}
      cues={session.cues}
      captionKind={session.captionKind}
      startIndex={session.startIndex}
      onLeave={() => setSession(null)}
      libraryCues={session.cues}
    />
  );
}
