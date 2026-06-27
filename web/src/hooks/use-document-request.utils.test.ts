import { RunningStatus } from '@/constants/knowledge';
import {
  isDocumentParsingStatus,
  shouldInvalidateChunkListForDocumentTransition,
} from './use-document-request.utils';

describe('isDocumentParsingStatus', () => {
  it('returns true for active parsing states', () => {
    expect(isDocumentParsingStatus(RunningStatus.RUNNING)).toBe(true);
    expect(isDocumentParsingStatus(RunningStatus.SCHEDULE)).toBe(true);
  });

  it('returns false for settled parsing states', () => {
    expect(isDocumentParsingStatus(RunningStatus.DONE)).toBe(false);
    expect(isDocumentParsingStatus(RunningStatus.FAIL)).toBe(false);
    expect(isDocumentParsingStatus(RunningStatus.CANCEL)).toBe(false);
  });
});

describe('shouldInvalidateChunkListForDocumentTransition', () => {
  it('returns true when a parsing document settles', () => {
    expect(
      shouldInvalidateChunkListForDocumentTransition(
        [{ id: 'doc-1', run: RunningStatus.RUNNING }],
        [{ id: 'doc-1', run: RunningStatus.DONE }],
      ),
    ).toBe(true);
  });

  it('returns true when a scheduled document settles', () => {
    expect(
      shouldInvalidateChunkListForDocumentTransition(
        [{ id: 'doc-1', run: RunningStatus.SCHEDULE }],
        [{ id: 'doc-1', run: RunningStatus.FAIL }],
      ),
    ).toBe(true);
  });

  it('returns false while a document is still parsing', () => {
    expect(
      shouldInvalidateChunkListForDocumentTransition(
        [{ id: 'doc-1', run: RunningStatus.RUNNING }],
        [{ id: 'doc-1', run: RunningStatus.RUNNING }],
      ),
    ).toBe(false);
  });
});
