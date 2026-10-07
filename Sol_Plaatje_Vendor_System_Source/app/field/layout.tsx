import type {Metadata} from 'next';

export const metadata: Metadata = {
  title: 'Field visits moved',
  description: 'LED field visits are recorded in the Android field officer app.',
};

export default function FieldMovedLayout({children}: {children: React.ReactNode}) {
  return children;
}
