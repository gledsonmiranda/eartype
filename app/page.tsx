/**
 * Home: the library first, then a new video. The library is read from disk
 * here, on the server, and handed to the client screen already rendered.
 */

import { HomeScreen } from '@/app/components/HomeScreen';
import { LibraryGrid } from '@/app/components/LibraryGrid';
import { libraryWritable, listLibrary } from '@/lib/library/catalog';

export default async function Home() {
  const entries = await listLibrary();

  return <HomeScreen library={<LibraryGrid entries={entries} writable={libraryWritable()} />} />;
}
