import { RunningStatus } from '@/constants/knowledge';

type DocumentRunState = {
  id: string;
  run?: RunningStatus | string;
};

const activeStatuses = new Set<string>([
  RunningStatus.RUNNING,
  RunningStatus.SCHEDULE,
]);

const settledStatuses = new Set<string>([
  RunningStatus.DONE,
  RunningStatus.FAIL,
  RunningStatus.CANCEL,
]);

export function isDocumentParsingStatus(run?: RunningStatus | string): boolean {
  return Boolean(run && activeStatuses.has(run));
}

export function shouldInvalidateChunkListForDocumentTransition(
  previousDocs: DocumentRunState[],
  nextDocs: DocumentRunState[],
): boolean {
  const previousById = new Map(previousDocs.map((doc) => [doc.id, doc.run]));

  return nextDocs.some((doc) => {
    const previousRun = previousById.get(doc.id);
    return Boolean(
      isDocumentParsingStatus(previousRun) &&
      doc.run &&
      settledStatuses.has(doc.run),
    );
  });
}
