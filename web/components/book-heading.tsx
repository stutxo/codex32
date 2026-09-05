import Image from 'next/image';
import { publicAsset } from '@/lib/public-asset';
export default function BookHeading({
  text,
  level = 2,
}: {
  text: string;
  level?: 1 | 2;
}) {
  const Tag = level === 1 ? 'h1' : 'h2';
  return (
    <Tag className={level === 1 ? 'illuminated-title' : 'book-chapter-title'}>
      <span className="illuminated-initial">
        <span className="sr-only">{text[0]}</span>
        <Image
          unoptimized
          src={publicAsset(`/art/illuminated-${text[0].toLowerCase()}.png`)}
          width={level === 1 ? 72 : 48}
          height={level === 1 ? 72 : 48}
          alt=""
        />
      </span>
      <span>{text.slice(1)}</span>
    </Tag>
  );
}
