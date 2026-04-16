"use client";

import { Card, CardBody, CardHeader, Button } from "@heroui/react";
import { CaretDown, CaretUp } from "@phosphor-icons/react/dist/ssr";
import { useState, type ReactNode } from "react";

export default function ExpandableHistory({
  title,
  total,
  initialCount = 10,
  children,
}: {
  title: string;
  total: number;
  initialCount?: number;
  children: (limit: number) => ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const limit = expanded ? total : Math.min(initialCount, total);
  const canExpand = total > initialCount;
  return (
    <Card className="border border-default-200" shadow="sm">
      <CardHeader className="justify-between">
        <div className="font-semibold">{title}</div>
        <div className="text-tiny text-default-500 font-normal">
          Showing {limit} of {total}
        </div>
      </CardHeader>
      <CardBody className="p-0">
        {children(limit)}
        {canExpand && (
          <div className="border-t border-default-100 px-3 py-2">
            <Button
              size="sm"
              variant="light"
              fullWidth
              endContent={expanded ? <CaretUp className="w-3 h-3" weight="bold" /> : <CaretDown className="w-3 h-3" weight="bold" />}
              onPress={() => setExpanded((e) => !e)}
              className="text-primary-600"
            >
              {expanded ? "Show less" : `Show all ${total}`}
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
