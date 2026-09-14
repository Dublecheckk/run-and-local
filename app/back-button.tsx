'use client';

import type { Ref } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function BackButton({
  onClick,
  label = '이전 화면으로 돌아가기',
  ref,
}: {
  onClick: () => void;
  label?: string;
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <Button
      ref={ref}
      type="button"
      variant="outline"
      className="back-button"
      onClick={onClick}
      aria-label={label}
    >
      <ArrowLeft aria-hidden size={20} />
      <span>이전</span>
    </Button>
  );
}
