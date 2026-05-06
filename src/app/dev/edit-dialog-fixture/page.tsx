// Dev-only fixture page for Playwright e2e against EditNodeDialog. Returns
// 404 in any non-dev build (defense-in-depth: middleware also gates `/dev`
// to dev-only public routes, so production access would 307 → sign-in
// before ever hitting this handler).
import { notFound } from 'next/navigation';
import { Fixture } from './Fixture';

export default function Page() {
  if (process.env.NODE_ENV !== 'development') {
    notFound();
  }
  return <Fixture />;
}
