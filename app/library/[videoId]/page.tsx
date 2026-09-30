/**
 * A library video, ready to practice: captions come from disk and are
 * segmented here on the server, so the client gets exactly what the URL path
 * hands `PracticeScreen` — minus the wait.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { segment } from '@/lib/captions/segmenter';
import { loadLibraryVideo } from '@/lib/library/catalog';
import { LibraryPractice } from './LibraryPractice';

export async function generateMetadata({
  params,
}: PageProps<'/library/[videoId]'>): Promise<Metadata> {
  const { videoId } = await params;
  const video = await loadLibraryVideo(videoId).catch(() => null);
  return { title: video === null ? 'Eartype' : `${video.entry.title} · Eartype` };
}

export default async function LibraryVideoPage({ params }: PageProps<'/library/[videoId]'>) {
  const { videoId } = await params;
  const video = await loadLibraryVideo(videoId);
  if (video === null) notFound();

  const segments = segment(video.cues);
  if (segments.length === 0) notFound();

  return (
    <LibraryPractice videoId={videoId} segments={segments} captionKind={video.entry.kind} />
  );
}
