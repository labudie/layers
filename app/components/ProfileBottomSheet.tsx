"use client";

import { GameplayProfileSheet } from "@/app/components/GameplayProfileSheet";

export function ProfileBottomSheet({
  username,
  isOpen,
  onClose,
}: {
  username: string | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  return (
    <GameplayProfileSheet
      open={isOpen}
      onClose={onClose}
      usernameHandle={username}
    />
  );
}

