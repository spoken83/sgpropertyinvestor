"use client";

import { Button } from "@heroui/react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react/dist/ssr";
import { useNav } from "./NavContext";

export default function Pagination({
  currentPage,
  totalPages,
  prevUrl,
  nextUrl,
}: {
  currentPage: number;
  totalPages: number;
  prevUrl: string | null;
  nextUrl: string | null;
}) {
  const { go } = useNav();
  return (
    <nav className="flex items-center justify-between py-2">
      <div className="text-small text-default-600">
        Page <span className="font-medium text-foreground">{currentPage}</span> of {totalPages}
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="bordered"
          startContent={<CaretLeft className="w-4 h-4" />}
          isDisabled={!prevUrl}
          onPress={() => prevUrl && go(prevUrl)}
        >
          Prev
        </Button>
        <Button
          size="sm"
          variant="bordered"
          endContent={<CaretRight className="w-4 h-4" />}
          isDisabled={!nextUrl}
          onPress={() => nextUrl && go(nextUrl)}
        >
          Next
        </Button>
      </div>
    </nav>
  );
}
