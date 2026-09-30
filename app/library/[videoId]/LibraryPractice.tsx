'use client';

import { useRouter } from 'next/navigation';
import { PracticeScreen } from '@/app/components/PracticeScreen';
import type { CaptionKind, Segment } from '@/types';

export function LibraryPractice({
  videoId,
  segments,
  captionKind,
}: {
  videoId: string;
  segments: Segment[];
  captionKind: CaptionKind;
}) {
  const router = useRouter();

  return (
    <PracticeScreen
      videoId={videoId}
      segments={segments}
      captionKind={captionKind}
      onLeave={() => router.push('/library')}
    />
  );
}
