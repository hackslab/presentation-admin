"use client";

import { cn } from "@/lib/utils";

type Avatar = {
  imageUrl: string;
  profileUrl?: string;
  alt?: string;
};

type AvatarCirclesProps = {
  className?: string;
  avatarUrls: Avatar[];
};

export function AvatarCircles({
  className,
  avatarUrls,
}: AvatarCirclesProps) {
  return (
    <div className={cn("z-10 flex -space-x-2 rtl:space-x-reverse", className)}>
      {avatarUrls.map((avatar, index) => {
        const imageElement = (
          <img
            className="h-8 w-8 rounded-full border border-[var(--surface-border)] bg-[var(--surface-2)] object-cover"
            src={avatar.imageUrl}
            width={32}
            height={32}
            alt={avatar.alt ?? `Avatar ${index + 1}`}
            loading="lazy"
          />
        );

        if (!avatar.profileUrl) {
          return <span key={`${avatar.imageUrl}-${index}`}>{imageElement}</span>;
        }

        return (
          <a
            key={`${avatar.imageUrl}-${index}`}
            href={avatar.profileUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {imageElement}
          </a>
        );
      })}
    </div>
  );
}
