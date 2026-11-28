import { FileOpenerUnavailableError, openFile, safeFileName, setFileOpener } from '../file-opener';

describe('safeFileName', () => {
  it('keeps ordinary names', () => {
    expect(safeFileName('report.pdf')).toBe('report.pdf');
    expect(safeFileName('Pump Ops (v2).docx')).toBe('Pump Ops (v2).docx');
  });

  it('drops path parts and replaces characters a file system refuses', () => {
    expect(safeFileName('../../etc/passwd')).toBe('passwd');
    expect(safeFileName('C:\\temp\\a:b*c.txt')).toBe('a_b_c.txt');
  });

  it('never leaves a hidden or dot-only name, even behind leading whitespace', () => {
    expect(safeFileName(' ..')).toBe('file');
    expect(safeFileName(' .. ')).toBe('file');
    expect(safeFileName('. . .')).toBe('file');
    expect(safeFileName('  .env')).toBe('env');
    expect(safeFileName('...hidden.txt ')).toBe('hidden.txt');
  });

  it('uses the fallback for empty names and cleans the fallback too', () => {
    expect(safeFileName(null)).toBe('file');
    expect(safeFileName('', 'attachment.pdf')).toBe('attachment.pdf');
    expect(safeFileName('..', ' ..')).toBe('file');
    expect(safeFileName(undefined, '../x/.doc')).toBe('doc');
  });

  it('limits the length', () => {
    expect(safeFileName(`${'a'.repeat(200)}.pdf`)).toHaveLength(120);
  });
});

describe('openFile', () => {
  afterEach(() => setFileOpener(null));

  it('throws when no opener is registered', async () => {
    await expect(openFile({ data: new ArrayBuffer(0), fileName: 'a.pdf', contentType: null })).rejects.toBeInstanceOf(FileOpenerUnavailableError);
  });

  it('hands the file to the registered opener', async () => {
    const mockOpener = jest.fn(async () => undefined);
    setFileOpener(mockOpener);
    const file = { data: new ArrayBuffer(1), fileName: 'a.pdf', contentType: 'application/pdf' };
    await openFile(file);
    expect(mockOpener).toHaveBeenCalledWith(file);
  });
});
