'use client';

import { useRouter } from 'next/navigation';
import { PracticeScreen } from '@/app/components/PracticeScreen';
import type { CaptionKind, Segment } from '@/types';

export function LibraryPractice({
  videoId,
  segments,
  captionKind,
  title,
}: {
  videoId: string;
  segments: Segment[];
  captionKind: CaptionKind;
  title?: string;
}) {
  const router = useRouter();

  return (
    <PracticeScreen
      videoId={videoId}
      segments={segments}
      captionKind={captionKind}
      title={title}
      onLeave={() => router.push('/')}
    />
  );
}
