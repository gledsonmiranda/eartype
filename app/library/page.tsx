/** The library lives on the home page now; old links still land there. */

import { redirect } from 'next/navigation';

export default function LibraryPage() {
  redirect('/');
}
