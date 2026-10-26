'use client';

import { useRouter } from 'next/navigation';
import { PracticeScreen } from '@/app/components/PracticeScreen';
import type { CaptionKind, Cue, Segment } from '@/types';

export function LibraryPractice({
  videoId,
  segments,
  cues,
  captionKind,
  title,
}: {
  videoId: string;
  segments: Segment[];
  cues: Cue[];
  captionKind: CaptionKind;
  title?: string;
}) {
  const router = useRouter();

  return (
    <PracticeScreen
      videoId={videoId}
      segments={segments}
      cues={cues}
      captionKind={captionKind}
      title={title}
      onLeave={() => router.push('/videos')}
    />
  );
}
